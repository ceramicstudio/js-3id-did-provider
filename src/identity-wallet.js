import EventEmitter from 'events'
import Keyring from './keyring'
import didJWT from 'did-jwt'
import { sha256Multihash, pad, unpad } from './utils'


class IdentityWallet {

  /**
   * Creates an instance of IdentityWallet
   *
   * @param     {Object}    config                  The configuration to be used
   * @param     {String}    config.seed             The seed of the identity, 32 hex string
   * @param     {String}    config.authSecret       The authSecret to use, 32 hex string
   * @param     {String}    config.ethereumAddress  The ethereumAddress of the identity
   * @return    {this}                            An IdentityWallet instance
   */
  constructor (config = {}) {
    this.events = new EventEmitter()
    if (config.seed) {
      this._keyring = new Keyring(config.seed)
    }
    if (config.authSecret) {
      if (!config.ethereumAddress) throw new Error('Ethereum address needs to be defined when authSecret given')
      this._authSecret = config.authSecret
      this._ethereumAddress = config.ethereumAddress
    }
  }

  async getAddress () {
    return this._ethereumAddress
  }

  _initKeyring (authData) {
    let seed
    if (authData) {
      authData.find(({ ciphertext, nonce }) => {
        const key = Keyring.hexToUint8Array(this._authSecret)
        seed = Keyring.symDecryptBase(ciphertext, key, nonce)
        return Boolean(seed)
      })
      if (!seed) throw new Error('No valid auth-secret for this identity')
    } else {
      // no authData available so we create a new identity
      seed = '0x' + Buffer.from(Keyring.naclRandom(32)).toString('hex')
      this.addAuthMethod(this._authSecret, seed)
    }
    this._keyring = new Keyring(seed)
  }

  /**
   * Authenticate to given spaces
   *
   * @param     {Array<String>}     spaces          The desired spaces
   * @param     {Object}    opts                    Optional parameters
   * @param     {Array<Object>}     opts.authData   The authData for this identity
   * @return    {Object}                            The public keys for the requested spaces of this identity
   */
  async authenticate (spaces = [], { authData } = {}) {
    if (!this._keyring) this._initKeyring(authData)
    const result = {
      main: this._keyring.getPublicKeys(),
      spaces: {}
    }
    if (this._ethereumAddress) result.main.managementKey = this._ethereumAddress
    spaces.map(space => {
      result.spaces[space] = this._keyring.getPublicKeys({ space, uncompressed: true })
    })
    return result
  }

  /**
   * Check if authenticated to given spaces
   *
   * @param     {Array<String>}     spaces          The desired spaces
   * @return    {Boolean}                           True if authenticated
   */
  async isAuthenticated (spaces = []) {
    return Boolean(this._keyring)
  }

  /**
   * Add a new authentication method for this identity
   *
   * @param     {String}    authSecret              A 32 byte hex string used as authentication secret
   */
  async addAuthMethod (authSecret, seed) {
    if (!seed && !this._keyring) throw new Error('This method can only be called after authenticate has been called')

    const message = seed || this._keyring._seed
    const key = Keyring.hexToUint8Array(authSecret)
    const encAuthData = Keyring.symEncryptBase(message, key)

    this.events.emit('new-auth-method', encAuthData)
  }

  /**
   * Sign a verifiable credential. The format of the credential is [did-jwt](https://github.com/uport-project/did-jwt).
   *
   * @param     {Object}    payload                 The payload of the claim
   * @param     {Object}    opts                    Optional parameters
   * @param     {String}    opts.DID                The DID used as the issuer of this claim
   * @param     {String}    opts.space              The space used to sign the claim
   * @param     {String}    opts.expiresIn          Set an expiry date for the claim as unix timestamp
   * @return    {String}                            The signed claim encoded as a JWT
   */
  async signClaim (payload, { DID, space, expiresIn } = {}) {
    if (!this._keyring) throw new Error('This method can only be called after authenticate has been called')

    const issuer = DID
    const settings = {
      signer: this._keyring.getJWTSigner(space),
      issuer,
      expiresIn
    }
    return didJWT.createJWT(payload, settings)
  }

  /**
   * Encrypt a message
   *
   * @param     {String}    message                 The message to be encrypted
   * @param     {String}    space                   The space used for encryption
   * @param     {Object}    opts                    Optional parameters
   * @param     {String}    opts.nonce              The nonce used to encrypt the message
   * @param     {String}    opts.blockSize          The blockSize used for padding (default 24)
   * @return    {Object}                            The encrypted object (ciphertext and nonce)
   */
  async encrypt (message, space, { nonce, blockSize } = {}) {
    if (!this._keyring) throw new Error('This method can only be called after authenticate has been called')

    const paddedMsg = pad(message, blockSize)
    return this._keyring.symEncrypt(paddedMsg, { space, nonce })
  }

  /**
   * Decrypt a message
   *
   * @param     {Object}    encryptedObject         The encrypted object (ciphertext and nonce)
   * @param     {String}    space                   The space used for encryption
   * @return    {String}                            The decrypted message
   */
  async decrypt (encObj, space) {
    if (!this._keyring) throw new Error('This method can only be called after authenticate has been called')

    const paddedMsg = this._keyring.symDecrypt(encObj.ciphertext, encObj.nonce, { space })
    if (!paddedMsg) throw new Error('IdentityWallet: Could not decrypt message')
    return unpad(paddedMsg)
  }

  async hashDBKey(key, space) {
    const salt = this._keyring.getDBSalt(space)
    return sha256Multihash(salt + key)
  }
}


module.exports = IdentityWallet
