import EventEmitter from 'events'
import store from 'store'
import Keyring from './keyring'
import ThreeIdProvider from './threeIdProvider'
import didJWT from 'did-jwt'
import DidDocument from 'ipfs-did-document'
import { createLink } from '3id-blockchain-utils'
import { sha256Multihash, pad, unpad, fakeIpfs, fakeEthProvider } from './utils'

const DID_METHOD_NAME = '3'

class IdentityWallet {
  /**
   * Creates an instance of IdentityWallet
   *
   * @param     {Function}  getConsent              The function that is called to ask the user for consent
   * @param     {Object}    config                  The configuration to be used
   * @param     {String}    config.seed             The seed of the identity, 32 hex string
   * @param     {String}    config.authSecret       The authSecret to use, 32 hex string
   * @param     {String}    config.externalAuth     External auth function, directly returns key material, used to migrate legacy 3box accounts
   * @return    {this}                              An IdentityWallet instance
   */
  constructor (getConsent, config = {}) {
    if (typeof getConsent !== 'function') throw new Error('getConsent parameter has to be a function')
    // TODO - getConsent should remember past consents
    this._getConsent = getConsent
    this.events = new EventEmitter()
    if (config.seed) {
      this._seed = config.seed
    } else if (config.authSecret) {
      this._authSecret = config.authSecret
    } else if (config.externalAuth) {
      this._externalAuth = config.externalAuth
    } else {
      throw new Error('Either seed, or authSecret has to be passed to create an IdentityWallet instance')
    }
  }

  /**
   * Get the 3IDProvider
   *
   * @return    {ThreeIdProvider}                   The 3IDProvider for this IdentityWallet instance
   */
  get3idProvider () {
    return new ThreeIdProvider(this)
  }

  /**
   * Determine if consent has been given for spaces for a given origin
   *
   * @param     {Array<String>}     spaces          The desired spaces
   * @param     {String}            origin          Application domain
   * @param     {String}            opt.address     Optional address (managementKey) if keyring not available yet
   * @return    {Boolean}                           True if consent has already been given
   */
  hasConsent (spaces = [], origin, { address } = {}) {
    const key = address || this._keyring.getPublicKeys().managementKey
    const prefix = `3id_consent_${key}_${origin}_`
    const consentExists = space => Boolean(store.get(prefix + space))
    return spaces.reduce((acc, space) => acc && consentExists(space), consentExists())
  }

  /**
  *  Get consent for given spaces for a given origin
  *
  * @param     {Array<String>}     spaces          The desired spaces
  * @param     {String}            origin          Application domain
  * @param     {String}            opt.address     Optional address (managementKey) if keyring not available yet
  * @return    {Boolean}                           True consent was given
  */
  async getConsent (spaces = [], origin, { address } = {}) {
    if (!this.hasConsent(spaces, origin, { address })) {
      const consent = await this._getConsent({
        type: 'authenticate',
        origin,
        spaces,
        opts: {
          address
        }
      })
      if (!consent) return false
      const key = address || this._keyring.getPublicKeys().managementKey
      const prefix = `3id_consent_${key}_${origin}_`
      const saveConsent = space => store.set(prefix + space, true)
      saveConsent()
      spaces.map(saveConsent)
    }
    return true
  }

  async getLink () {
    if (this._seed) {
      this._keyring = new Keyring(this._seed)
      this.DID = await this._get3id()
      delete this._seed
      this._linkManagementAddress()
    }
    // for external auth keyring will already exist at this point
    return this._keyring ? this._keyring.getPublicKeys().managementKey : Keyring.walletForAuthSecret(this._authSecret).address
  }

  async _linkManagementAddress () {
    const managementWallet = this._keyring.managementWallet()
    this.events.emit('new-link-proof', await createLink(this.DID, managementWallet.address, fakeEthProvider(managementWallet)))
  }

  /**
   * Link a blockchain address to the identity. Usually the address
   * would be an ethereum address (EOA or EIP1271 compatible contract)
   * and the provider is an JSON-RPC provider that can sign a message
   * with this address using personal_sign.
   *
   * @param     {String}        address          The address to link
   * @param     {Object}        provider         The provider that can sign a message for the given address
   * @return    {Object}                         The link proof object
   */
  async linkAddress (address, provider) {
    if (!this._keyring) throw new Error('This method can only be called after authenticate has been called')
    const proof = await createLink(this.DID, address, provider)
    this.events.emit('new-link-proof', proof)
    return proof
  }

  async linkManagementKey () {
    // TODO - this method should be deprecated
    if (this._externalAuth) {
      return this._externalAuth({ address: this._keyring._rootKeys.managementAddress, spaces: [], type: '3id_createLink' })
    }

    const timestamp = Math.floor(new Date().getTime() / 1000)
    const msg = `Create a new 3Box profile\n\n- \nYour unique profile ID is ${this.DID} \nTimestamp: ${timestamp}`
    return {
      msg,
      timestamp,
      sig: await this._keyring.managementPersonalSign(msg)
    }
  }

  async _initKeyring (authData, address, spaces) {
    if (this._seed) {
      await this.getLink()
    } else if (authData && authData.length > 0) {
      let seed
      authData.find(({ ciphertext, nonce }) => {
        seed = Keyring.decryptWithAuthSecret(ciphertext, nonce, this._authSecret)
        return Boolean(seed)
      })
      if (!seed) throw new Error('No valid auth-secret for this identity')
      this._keyring = new Keyring(seed)
      this.DID = await this._get3id()
    } else if (this._externalAuth) {
      if (!address) throw new Error('External authentication requires an address')
      const migratedKeys = await this._externalAuth({ address, spaces, type: '3id_migration' })
      this._keyring = new Keyring(null, migratedKeys)
      this.DID = await this._get3id()
    } else {
      // no authData available so we create a new identity
      const seed = '0x' + Buffer.from(Keyring.naclRandom(32)).toString('hex')
      this._keyring = new Keyring(seed)
      this.DID = await this._get3id()
      this.addAuthMethod(this._authSecret)
    }
  }

  /**
   * Authenticate to given spaces
   *
   * @param     {Array<String>}     spaces          The desired spaces
   * @param     {Object}    opts                    Optional parameters
   * @param     {Array<Object>}     opts.authData   The authData for this identity
   * @return    {Object}                            The public keys for the requested spaces of this identity
   */
  async authenticate (spaces = [], { authData, address } = {}, origin) {
    let consent
    // if external auth and address, get consent first, pass address since keyring not avaiable, otherwise call after keyring
    if (address) consent = await this.getConsent(spaces, origin, { address })
    if (!this._keyring || this._externalAuth) await this._initKeyring(authData, address, spaces)
    if (!address) consent = this.getConsent(spaces, origin)
    if (!consent) throw new Error('Authentication not authorized by user')

    const result = {
      main: this._keyring.getPublicKeys(),
      spaces: {}
    }
    spaces.map(space => {
      result.spaces[space] = this._keyring.getPublicKeys({ space, uncompressed: true })
    })
    return result
  }

  /**
   * Check if authenticated to given spaces
   *
   * @param     {Array<String>}     spaces          The desired spaces
   * @param     {String}            origin          Application domain
   * @param     {String}            opt.address     Optional address (managementKey) if keyring not available yet
   * @return    {Boolean}                           True if authenticated
   */
  async isAuthenticated (spaces = [], origin, { address } = {}) {
    return Boolean(this._keyring) && this.hasConsent(spaces, origin, { address })
  }

  /**
   * Add a new authentication method for this identity
   *
   * @param     {String}    authSecret              A 32 byte hex string used as authentication secret
   */
  async addAuthMethod (authSecret) {
    if (!this._keyring) throw new Error('This method can only be called after authenticate has been called')

    const message = this._keyring._seed
    const encAuthData = Keyring.encryptWithAuthSecret(message, authSecret)
    this.events.emit('new-auth-method', encAuthData)

    // A link from the authSecret is created in order to find
    // the DID if we don't know the seed
    const authWallet = Keyring.walletForAuthSecret(authSecret)
    this.events.emit('new-link-proof', await createLink(this.DID, authWallet.address, fakeEthProvider(authWallet)))
  }

  /**
   * Sign a verifiable credential. The format of the credential is [did-jwt](https://github.com/uport-project/did-jwt).
   *
   * @param     {Object}    payload                 The payload of the claim
   * @param     {Object}    opts                    Optional parameters
   * @param     {String}    opts.space              The space used to sign the claim
   * @param     {String}    opts.expiresIn          Set an expiry date for the claim as unix timestamp
   * @return    {String}                            The signed claim encoded as a JWT
   */
  async signClaim (payload, { DID, space, expiresIn } = {}) {
    if (!this._keyring) throw new Error('This method can only be called after authenticate has been called')

    const issuer = DID || await this._get3id(space)
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
   * @param     {String}    opts.to                 The public key to encrypt the message to
   * @param     {String}    opts.nonce              The nonce used to encrypt the message
   * @param     {String}    opts.blockSize          The blockSize used for padding (default 24)
   * @return    {Object}                            The encrypted object (ciphertext and nonce)
   */
  async encrypt (message, space, { nonce, blockSize, to } = {}) {
    if (!this._keyring) throw new Error('This method can only be called after authenticate has been called')

    const paddedMsg = typeof message === 'string' ? pad(message, blockSize) : message
    if (to) {
      return this._keyring.asymEncrypt(paddedMsg, to, { nonce })
    } else {
      return this._keyring.symEncrypt(paddedMsg, { space, nonce })
    }
  }

  /**
   * Decrypt a message
   *
   * @param     {Object}    encryptedObject         The encrypted object (ciphertext, nonce, and ephemeralFrom for asymmetric encrypted objects)
   * @param     {String}    space                   The space used for encryption
   * @return    {String}                            The decrypted message
   */
  async decrypt (encObj, space, toBuffer) {
    if (!this._keyring) throw new Error('This method can only be called after authenticate has been called')

    let paddedMsg
    if (encObj.ephemeralFrom) {
      paddedMsg = this._keyring.asymDecrypt(encObj.ciphertext, encObj.ephemeralFrom, encObj.nonce, { space, toBuffer })
    } else {
      paddedMsg = this._keyring.symDecrypt(encObj.ciphertext, encObj.nonce, { space, toBuffer })
    }
    if (!paddedMsg) throw new Error('IdentityWallet: Could not decrypt message')
    return toBuffer ? paddedMsg : unpad(paddedMsg)
  }

  async hashDBKey (key, space) {
    const salt = this._keyring.getDBSalt(space)
    return sha256Multihash(salt + key)
  }

  async _get3id (space) {
    const pubkeys = this._keyring.getPublicKeys({ space, uncompressed: true })
    const doc = new DidDocument(fakeIpfs, DID_METHOD_NAME)
    if (!space) {
      if (this.DID) return this.DID
      doc.addPublicKey('signingKey', 'Secp256k1VerificationKey2018', 'publicKeyHex', pubkeys.signingKey)
      doc.addPublicKey('encryptionKey', 'Curve25519EncryptionPublicKey', 'publicKeyBase64', pubkeys.asymEncryptionKey)
      doc.addPublicKey('managementKey', 'Secp256k1VerificationKey2018', 'ethereumAddress', pubkeys.managementKey)
      doc.addAuthentication('Secp256k1SignatureAuthentication2018', 'signingKey')
    } else {
      doc.addPublicKey('subSigningKey', 'Secp256k1VerificationKey2018', 'publicKeyHex', pubkeys.signingKey)
      doc.addPublicKey('subEncryptionKey', 'Curve25519EncryptionPublicKey', 'publicKeyBase64', pubkeys.asymEncryptionKey)
      doc.addAuthentication('Secp256k1SignatureAuthentication2018', 'subSigningKey')
      doc.addCustomProperty('space', space)
      doc.addCustomProperty('root', this.DID)
      const payload = {
        subSigningKey: pubkeys.signingKey,
        subEncryptionKey: pubkeys.asymEncryptionKey,
        space: space,
        iat: null
      }
      const signature = (await this.signClaim(payload)).split('.')[2]
      doc.addCustomProperty('proof', { alg: 'ES256K', signature })
    }
    await doc.commit({ noTimestamp: true })
    return doc.DID
  }
}

module.exports = IdentityWallet
