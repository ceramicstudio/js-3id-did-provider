import { EventEmitter } from 'events'
import store from 'store'
import { Signer, createJWT } from 'did-jwt'
import DidDocument from 'ipfs-did-document'
import { LinkProof, createLink } from '3id-blockchain-utils'

import { AsymEncryptedMessage, EncryptedMessage, naclRandom } from './crypto'
import { DidProvider } from './did-provider'
import Keyring, { PublicKeys } from './keyring'
import ThreeIdProvider from './threeIdProvider'
import { sha256Multihash, pad, unpad, fakeIpfs, fakeEthProvider } from './utils'

const DID_METHOD_NAME = '3'

interface ConsentRequest {
  type: string
  spaces: Array<string>
  origin?: string | null
  opts?: Record<string, any>
}
type GetConsentFunc = (req: ConsentRequest) => Promise<boolean>

interface Config {
  seed?: string
  authSecret?: string
  externalAuth?: (req: any) => Promise<any>
}

export default class IdentityWallet {
  protected _getConsent: GetConsentFunc
  protected _seed: string | undefined
  protected _authSecret: string | undefined
  protected _externalAuth: ((req: any) => Promise<any>) | undefined
  protected _keyring: Keyring | undefined

  public DID: string | undefined
  public events = new EventEmitter()

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
  constructor(getConsent: GetConsentFunc, config: Config = {}) {
    if (typeof getConsent !== 'function')
      throw new Error('getConsent parameter has to be a function')
    // TODO - getConsent should remember past consents
    this._getConsent = getConsent
    if (config.seed) {
      this._seed = config.seed
    } else if (config.authSecret) {
      this._authSecret = config.authSecret
    } else if (config.externalAuth) {
      this._externalAuth = config.externalAuth
    } else {
      throw new Error(
        'Either seed, or authSecret has to be passed to create an IdentityWallet instance'
      )
    }
  }

  /**
   * Get the 3IDProvider
   *
   * @return    {ThreeIdProvider}                   The 3IDProvider for this IdentityWallet instance
   */
  get3idProvider() {
    return new ThreeIdProvider(this)
  }

  /**
   * Get the DIDProvider
   *
   * @return    {DidProvider}                   The DIDProvider for this IdentityWallet instance
   */
  getDidProvider() {
    return new DidProvider(this)
  }

  /**
   * Determine if consent has been given for spaces for a given origin
   *
   * @param     {Array<String>}     spaces          The desired spaces
   * @param     {String}            origin          Application domain
   * @param     {String}            opt.address     Optional address (managementKey) if keyring not available yet
   * @return    {Boolean}                           True if consent has already been given
   */
  hasConsent(
    spaces: Array<string> = [],
    origin?: string | null,
    { address }: { address?: string } = {}
  ): boolean {
    const key = address ?? this._keyring!.getPublicKeys().managementKey ?? ''
    const prefix = `3id_consent_${key}_${origin ?? ''}_`
    const consentExists = (space = '') => Boolean(store.get(prefix + space))
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
  async getConsent(
    spaces: Array<string> = [],
    origin?: string | null,
    { address }: { address?: string } = {}
  ) {
    if (!this.hasConsent(spaces, origin, { address })) {
      const consent = await this._getConsent({
        type: 'authenticate',
        origin,
        spaces,
        opts: {
          address,
        },
      })
      if (!consent) return false
      const key = address ?? this._keyring!.getPublicKeys().managementKey ?? ''
      const prefix = `3id_consent_${key}_${origin ?? ''}_`
      const saveConsent = (space = '') => store.set(prefix + space, true)
      saveConsent()
      spaces.map(saveConsent)
    }
    return true
  }

  async getLink(): Promise<string> {
    if (this._seed) {
      this._keyring = new Keyring(this._seed)
      this.DID = await this._get3id()
      delete this._seed
      await this._linkManagementAddress()
    }
    // for external auth keyring will already exist at this point
    return this._keyring
      ? (this._keyring.getPublicKeys().managementKey as string)
      : Keyring.walletForAuthSecret(this._authSecret!).address
  }

  getRootSigner(pubKeyId?: string): Signer {
    if (pubKeyId == null) {
      return this._keyring!.getRootSigner()
    }

    const [did, keyId] = pubKeyId.split('#')
    if (this.DID == null || did !== this.DID) {
      throw new Error('Invalid DID')
    }
    return this._keyring!.getRootSigner(keyId)
  }

  async _linkManagementAddress() {
    const managementWallet = this._keyring!.managementWallet()
    this.events.emit(
      'new-link-proof',
      await createLink(this.DID!, managementWallet.address, fakeEthProvider(managementWallet))
    )
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
  async linkAddress(address: string, provider: any): Promise<LinkProof> {
    if (!this._keyring)
      throw new Error('This method can only be called after authenticate has been called')
    const proof = await createLink(this.DID!, address, provider)
    this.events.emit('new-link-proof', proof)
    return proof
  }

  async linkManagementKey() {
    if (this._externalAuth) return null
    const timestamp = Math.floor(new Date().getTime() / 1000)
    const msg = `Create a new 3Box profile\n\n- \nYour unique profile ID is ${this
      .DID!} \nTimestamp: ${timestamp}`
    return {
      msg,
      timestamp,
      sig: await this._keyring!.managementPersonalSign(msg),
    }
  }

  async _initKeyring(authData?: Array<EncryptedMessage>, address?: string, spaces?: Array<string>) {
    if (this._seed) {
      await this.getLink()
    } else if (authData && authData.length > 0) {
      let seed
      authData.find(({ ciphertext, nonce }) => {
        seed = Keyring.decryptWithAuthSecret(ciphertext, nonce, this._authSecret as string)
        return Boolean(seed)
      })
      if (!seed) throw new Error('No valid auth-secret for this identity')
      this._keyring = new Keyring(seed)
      this.DID = await this._get3id()
    } else if (this._externalAuth) {
      if (!address) throw new Error('External authentication requires an address')
      const migratedKeys = await this._externalAuth({
        address,
        spaces,
        type: '3id_migration',
      })
      this._keyring = new Keyring(null, migratedKeys)
      this.DID = await this._get3id()
      const proof = await this._externalAuth({
        address,
        type: '3id_createLink',
        did: this.DID,
      })
      if (proof) this.events.emit('new-link-proof', proof)
    } else {
      // no authData available so we create a new identity
      const seed = '0x' + Buffer.from(naclRandom(32)).toString('hex')
      this._keyring = new Keyring(seed)
      this.DID = await this._get3id()
      await this.addAuthMethod(this._authSecret!)
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
  async authenticate(
    spaces: Array<string> = [],
    {
      authData,
      address,
      mgmtPub,
    }: {
      authData?: Array<EncryptedMessage>
      address?: string
      mgmtPub?: string
    } = {},
    origin?: string | null
  ): Promise<{ main: PublicKeys; spaces: Record<string, PublicKeys> }> {
    let consent
    // if external auth and address, get consent first, pass address since keyring not avaiable, otherwise call after keyring
    if (address) consent = await this.getConsent(spaces, origin, { address })
    if (!this._keyring || this._externalAuth) await this._initKeyring(authData, address, spaces)
    if (!address) consent = this.getConsent(spaces, origin)
    if (!consent) throw new Error('Authentication not authorized by user')

    return {
      main: this._keyring!.getPublicKeys({ mgmtPub }),
      spaces: spaces.reduce((acc, space) => {
        acc[space] = this._keyring!.getPublicKeys({
          space,
          uncompressed: true,
        })
        return acc
      }, {} as Record<string, PublicKeys>),
    }
  }

  /**
   * Check if authenticated to given spaces
   *
   * @param     {Array<String>}     spaces          The desired spaces
   * @param     {String}            origin          Application domain
   * @param     {String}            opt.address     Optional address (managementKey) if keyring not available yet
   * @return    {Boolean}                           True if authenticated
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async isAuthenticated(
    spaces: Array<string> = [],
    origin?: string | null,
    { address }: { address?: string } = {}
  ): Promise<boolean> {
    return Boolean(this._keyring) && this.hasConsent(spaces, origin, { address })
  }

  /**
   * Add a new authentication method for this identity
   *
   * @param     {String}    authSecret              A 32 byte hex string used as authentication secret
   */
  async addAuthMethod(authSecret: string): Promise<void> {
    if (!this._keyring)
      throw new Error('This method can only be called after authenticate has been called')

    const message = this._keyring.serialize() as string
    const encAuthData = Keyring.encryptWithAuthSecret(message, authSecret)
    this.events.emit('new-auth-method', encAuthData)

    // A link from the authSecret is created in order to find
    // the DID if we don't know the seed
    const authWallet = Keyring.walletForAuthSecret(authSecret)
    this.events.emit(
      'new-link-proof',
      await createLink(this.DID!, authWallet.address, fakeEthProvider(authWallet))
    )
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
  async signClaim(
    payload: any,
    {
      DID,
      space,
      expiresIn,
      useMgmt,
    }: {
      DID?: string
      space?: string
      expiresIn?: number
      useMgmt?: boolean
    } = {}
  ): Promise<string> {
    if (!this._keyring) {
      throw new Error('This method can only be called after authenticate has been called')
    }

    const issuer = DID || (await this._get3id(space))
    const settings = {
      signer: this._keyring.getJWTSigner(space, useMgmt),
      issuer,
      expiresIn,
    }
    return createJWT(payload, settings)
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
  // eslint-disable-next-line @typescript-eslint/require-await
  async encrypt(
    message: string | Uint8Array,
    space?: string,
    { nonce, blockSize, to }: { nonce?: Uint8Array; blockSize?: number; to?: string } = {}
  ) {
    if (!this._keyring)
      throw new Error('This method can only be called after authenticate has been called')

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
  // @ts-ignore issue: https://github.com/microsoft/TypeScript/issues/14107
  decrypt(
    encObj: EncryptedMessage | AsymEncryptedMessage,
    space: string | undefined,
    toBuffer: true
  ): Promise<Buffer | null>
  decrypt(
    encObj: EncryptedMessage | AsymEncryptedMessage,
    space?: string,
    toBuffer?: false
  ): Promise<string | null>
  // eslint-disable-next-line @typescript-eslint/require-await
  async decrypt(
    encObj: EncryptedMessage | AsymEncryptedMessage,
    space?: string,
    toBuffer?: boolean
  ) {
    if (!this._keyring)
      throw new Error('This method can only be called after authenticate has been called')

    let paddedMsg
    if ((encObj as AsymEncryptedMessage).ephemeralFrom) {
      paddedMsg = this._keyring.asymDecrypt(
        encObj.ciphertext,
        (encObj as AsymEncryptedMessage).ephemeralFrom,
        encObj.nonce,
        // @ts-ignore issue: https://github.com/microsoft/TypeScript/issues/14107
        { space, toBuffer }
      )
    } else {
      paddedMsg = this._keyring.symDecrypt(encObj.ciphertext, encObj.nonce, {
        space,
        toBuffer,
      })
    }
    if (!paddedMsg) throw new Error('IdentityWallet: Could not decrypt message')
    return toBuffer ? paddedMsg : unpad(paddedMsg)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async hashDBKey(key: string, space?: string): Promise<string> {
    const salt = this._keyring!.getDBSalt(space)
    return sha256Multihash(salt + key)
  }

  async _get3id(space?: string): Promise<string> {
    const pubkeys = this._keyring!.getPublicKeys({ space, uncompressed: true })
    const doc = new DidDocument(fakeIpfs, DID_METHOD_NAME)
    if (!space) {
      if (this.DID) return this.DID
      doc.addPublicKey(
        'signingKey',
        'Secp256k1VerificationKey2018',
        'publicKeyHex',
        pubkeys.signingKey
      )
      doc.addPublicKey(
        'encryptionKey',
        'Curve25519EncryptionPublicKey',
        'publicKeyBase64',
        pubkeys.asymEncryptionKey
      )
      doc.addPublicKey(
        'managementKey',
        'Secp256k1VerificationKey2018',
        'ethereumAddress',
        pubkeys.managementKey!
      )
      doc.addAuthentication('Secp256k1SignatureAuthentication2018', 'signingKey')
    } else {
      doc.addPublicKey(
        'subSigningKey',
        'Secp256k1VerificationKey2018',
        'publicKeyHex',
        pubkeys.signingKey
      )
      doc.addPublicKey(
        'subEncryptionKey',
        'Curve25519EncryptionPublicKey',
        'publicKeyBase64',
        pubkeys.asymEncryptionKey
      )
      doc.addAuthentication('Secp256k1SignatureAuthentication2018', 'subSigningKey')
      doc.addCustomProperty('space', space)
      doc.addCustomProperty('root', this.DID)
      const payload = {
        subSigningKey: pubkeys.signingKey,
        subEncryptionKey: pubkeys.asymEncryptionKey,
        space: space,
        iat: null,
      }
      const signature = (await this.signClaim(payload)).split('.')[2]
      doc.addCustomProperty('proof', { alg: 'ES256K', signature })
    }
    await doc.commit({ noTimestamp: true })
    return doc.DID
  }
}
