import { CeramicApi } from '@ceramicnetwork/ceramic-common'

import { DidProvider } from './did-provider'
import Keyring from './keyring'
import ThreeIdProvider from './threeIdProvider'
import { ThreeIDX } from './three-idx'
import Permissions, { GetPermissionFn, SELF_ORIGIN } from './permissions'

interface IDWConfig {
  getPermission: GetPermissionFn
  seed?: string
  authSecret?: string
  externalAuth?: (req: any) => Promise<any>
  ceramic: CeramicApi
  useThreeIdProv: boolean
}

export default class IdentityWallet {
  protected _externalAuth: ((req: any) => Promise<any>) | undefined

  public DID: string | undefined

  /**
   * Use IdentityWallet.create() to create an IdentityWallet instance
   */
  constructor(
    protected _keyring: Keyring,
    protected _threeIdx: ThreeIDX,
    public permissions: Permissions
  ) {}

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
  static async create(config: IDWConfig): Promise<IdentityWallet> {
    if (!config.seed) throw new Error('seed required for now')
    const keyring = new Keyring(config.seed)
    const threeIdx = new ThreeIDX(config.ceramic)
    const pubkeys = keyring.getPublicKeys({ mgmtPub: true, useMulticodec: true })
    await threeIdx.create3idDoc(pubkeys)
    const permissions = new Permissions(config.getPermission)
    permissions.setDID(threeIdx.DID)
    // the next two lines will likely change soon
    const idw = new IdentityWallet(keyring, threeIdx, permissions)
    await idw._init()
    return idw
  }

  async _init(): Promise<void> {
    // TODO - change to DID provider when ceramic uses js-did
    await this._threeIdx.setDIDProvider(this.get3idProvider(SELF_ORIGIN))
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
}
