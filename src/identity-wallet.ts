import DidDocument from 'ipfs-did-document'
import { LinkProof, createLink } from '3id-blockchain-utils'
import { CeramicApi } from '@ceramicnetwork/ceramic-common'

import { AsymEncryptedMessage, EncryptedMessage, naclRandom } from './crypto'
import { DidProvider } from './did-provider'
import Keyring, { PublicKeys } from './keyring'
import ThreeIdProvider from './threeIdProvider'
import { ThreeIDX } from './three-idx'
import { sha256Multihash, pad, unpad, fakeIpfs, fakeEthProvider } from './utils'

import Permissions, { GetPermissionFn, SELF_ORIGIN } from './permissions'

const DID_METHOD_NAME = '3'

interface IDWConfig {
  getPermission: GetPermissionFn
  seed?: string
  authSecret?: string
  externalAuth?: (req: any) => Promise<any>
  ceramic: CeramicApi
  useThreeIdProv: boolean
}

export default class IdentityWallet {
  protected _seed: string | undefined
  protected _authSecret: string | undefined
  protected _externalAuth: ((req: any) => Promise<any>) | undefined
  protected _keyring: Keyring | undefined

  public DID: string | undefined

  constructor(config: IDWConfig) {
    this.permissions = new Permissions(config.getPermission)
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
   * Creates an instance of IdentityWallet
   *
   * @param     {Object}    config                  The configuration to be used
   * @param     {Function}  config.getPermission    The function that is called to ask the user for permission
   * @param     {String}    config.seed             The seed of the identity, 32 hex string
   * @param     {String}    config.authSecret       The authSecret to use, 32 hex string
   * @param     {String}    config.externalAuth     External auth function, directly returns key material, used to migrate legacy 3box accounts
   * @return    {IdentityWallet}                    An IdentityWallet instance
   */
  static async create(config: IDWConfig) {
    // the next two lines will likely change soon
    const idw = new IdentityWallet(config)
    idw._init(config.ceramic)
  }

  /**
   * Temporary option for use with ceramic js-did migration
   */
  async _init(ceramic) {
    if (!this._seed) throw new Error('seed required for now')
    this._keyring = new Keyring(this._seed)
    this.threeIdx = new ThreeIDX(ceramic)
    const pubkeys = this._keyring.getPublicKeys({ mgmtPub: true })
    await this.threeIdx.create3idDoc(pubkeys)
    // TODO - change to DID provider when ceramic uses js-did
    await this.threeIdx.setDIDProvider(this.get3idProvider(SELF_ORIGIN))
  }

  /**
   * Get the 3IDProvider
   *
   * @return    {ThreeIdProvider}                   The 3IDProvider for this IdentityWallet instance
   */
  get3idProvider(forcedOrigin?: string) {
    return new ThreeIdProvider(this)
  }

  /**
   * Get the DIDProvider
   *
   * @return    {DidProvider}                   The DIDProvider for this IdentityWallet instance
   */
  getDidProvider(forcedOrigin?: string) {
    return new DidProvider({
      keyring: this._keyring,
      permissions: this.permissions,
      threeIdx: this.threeIdx,
      forcedOrigin
    })
  }
}
