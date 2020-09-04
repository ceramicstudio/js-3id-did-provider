import { CeramicApi } from '@ceramicnetwork/ceramic-common'

import { DidProvider } from './did-provider'
import Keyring from './keyring'
import ThreeIdProvider from './threeIdProvider'
import { ThreeIDX } from './three-idx'
import Permissions, { GetPermissionFn, SELF_ORIGIN } from './permissions'
import { Keychain } from './keychain'

interface IDWConfig {
  getPermission: GetPermissionFn
  seed?: string
  authSecret?: Uint8Array
  authId?: string
  externalAuth?: (req: any) => Promise<any>
  ceramic: CeramicApi
  useThreeIdProv: boolean
}

export default class IdentityWallet {
  protected _externalAuth: ((req: any) => Promise<any>) | undefined

  /**
   * Use IdentityWallet.create() to create an IdentityWallet instance
   */
  constructor(
    protected _keyring: Keyring,
    protected _threeIdx: ThreeIDX,
    protected _permissions: Permissions,
    protected _keychain: Keychain
  ) {}
  /**
   * @property {Keychain} keychain          Edit the keychain
   */
  get keychain(): Keychain {
    return this._keychain
  }

  /**
   * @property {Permissions} permissions    Edit permissions
   */
  get permissions(): Permissions {
    return this._permissions
  }

  /**
   * @property {string} DID                 The 3ID of the IdentityWallet instance
   */
  get DID(): string {
    return this._threeIdx.DID
  }

  /**
   * Creates an instance of IdentityWallet
   *
   * @param     {Object}        config                  The configuration to be used
   * @param     {Function}      config.getPermission    The function that is called to ask the user for permission
   * @param     {String}        config.seed             The seed of the identity, 32 bytes hex string
   * @param     {Uint8Array}    config.authSecret       The authSecret to use, 32 bytes
   * @param     {String}        config.authId           The authId is used to identify the authSecret
   * @param     {String}        config.externalAuth     External auth function, directly returns key material, used to migrate legacy 3box accounts
   * @return    {IdentityWallet}                        An IdentityWallet instance
   */
  static async create(config: IDWConfig): Promise<IdentityWallet> {
    if (config.seed && config.authSecret) throw new Error("Can't use both seed and authSecret")
    if (!config.seed && !config.authSecret) throw new Error('Either seed or authSecret is needed')
    if (config.authSecret && !config.authId) {
      throw new Error('AuthId must be given along with authSecret')
    }
    const threeIdx = new ThreeIDX(config.ceramic)
    const permissions = new Permissions(config.getPermission)
    let keyring, keychain
    if (config.seed) {
      keyring = new Keyring(config.seed)
      keychain = new Keychain(keyring, threeIdx)
      const pubkeys = keyring.getPublicKeys({ mgmtPub: true, useMulticodec: true })
      await threeIdx.create3idDoc(pubkeys)
    } else if (config.authSecret) {
      keychain = await Keychain.load(threeIdx, config.authSecret)
      keyring = keychain._keyring
    }
    permissions.setDID(threeIdx.DID)
    const idw = new IdentityWallet(keyring as Keyring, threeIdx, permissions, keychain as Keychain)
    await idw._threeIdx.setDIDProvider(idw.getDidProvider(SELF_ORIGIN))
    if (config.authId && !keychain?.list().length) {
      // Add the auth method to the keychain
      await idw.keychain.add(config.authId, config.authSecret as Uint8Array)
      await idw.keychain.commit()
    }
    return idw
  }

  /**
   * Get the DIDProvider
   *
   * @return    {DidProvider}                   The DIDProvider for this IdentityWallet instance
   */
  getDidProvider(forcedOrigin?: string): DidProvider {
    return new DidProvider({
      keyring: this._keyring,
      permissions: this.permissions,
      threeIdx: this._threeIdx,
      forcedOrigin,
    })
  }

  /**
   * Get the 3IDProvider
   *
   * @return    {ThreeIdProvider}                   The 3IDProvider for this IdentityWallet instance
   */
  get3idProvider(forcedOrigin?: string): ThreeIdProvider {
    return new ThreeIdProvider({
      keyring: this._keyring,
      permissions: this.permissions,
      threeIdx: this._threeIdx,
      forcedOrigin,
    })
  }
}
