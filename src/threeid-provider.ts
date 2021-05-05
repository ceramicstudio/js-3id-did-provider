import type { CeramicApi } from '@ceramicnetwork/common'

import { DidProvider } from './did-provider'
import Keyring from './keyring'
import { ThreeIDX } from './three-idx'
import Permissions, { GetPermissionFn, SELF_ORIGIN } from './permissions'
import { Keychain } from './keychain'

type AuthConfig = { authId: string; authSecret: Uint8Array; seed?: never }
type SeedConfig = { authId?: never; authSecret?: never; seed: Uint8Array }

type IDWConfig = {
  getPermission: GetPermissionFn
  v03ID?: string
  ceramic: CeramicApi
  disableIDX?: boolean
} & (AuthConfig | SeedConfig)

export default class ThreeIdProvider {
  /**
   * Use ThreeIdProvider.create() to create an ThreeIdProvider instance
   */
  constructor(
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
   * @property {string} id                 The DID of the ThreeIdProvider instance
   */
  get id(): string {
    return this._threeIdx.id
  }

  /**
   * Creates an instance of ThreeIdProvider
   *
   * @param     {Object}        config                  The configuration to be used
   * @param     {Function}      config.getPermission    The function that is called to ask the user for permission
   * @param     {CeramicApi}    config.ceramic          The ceramic instance to use
   * @param     {Uint8Array}    config.seed             The seed of the 3ID, 32 bytes
   * @param     {Uint8Array}    config.authSecret       The authSecret to use, 32 bytes
   * @param     {String}        config.authId           The authId is used to identify the authSecret
   * @param     {Boolean}       config.disableIDX       Disable creation of the IDX document
   * @param     {String}        config.v03ID            A v0 3ID, has to be passed if a migration is being preformed
   * @return    {ThreeIdProvider}                       An ThreeIdProvider instance
   */
  static async create(config: IDWConfig): Promise<ThreeIdProvider> {
    if (config.seed && config.authSecret) throw new Error("Can't use both seed and authSecret")
    if (!config.seed && !config.authSecret) throw new Error('Either seed or authSecret is needed')
    if (config.authSecret && !config.authId) {
      throw new Error('AuthId must be given along with authSecret')
    }
    if (config.authId && config.disableIDX) {
      throw new Error('AuthId cannot be used with disableIDX')
    }
    const threeIdx = new ThreeIDX(config.ceramic)
    const permissions = new Permissions(config.getPermission)
    const makeTmpProvider = (keyring: Keyring, forcedDID: string): DidProvider => {
      return new DidProvider({
        keyring,
        permissions,
        threeIdx,
        forcedOrigin: SELF_ORIGIN,
        forcedDID,
      })
    }
    let keychain
    if (config.seed) {
      if (typeof config.seed === 'string') throw new Error('seed needs to be Uint8Array')
      keychain = await Keychain.create(threeIdx, makeTmpProvider, config.seed, config.v03ID)
    } else if (config.authSecret) {
      keychain = await Keychain.load(threeIdx, config.authSecret, makeTmpProvider)
    }
    permissions.setDID(threeIdx.id)
    const idw = new ThreeIdProvider(threeIdx, permissions, keychain as Keychain)
    await idw._threeIdx.setDIDProvider(idw.getDidProvider(SELF_ORIGIN))
    if (config.authId && !(await keychain?.list())?.length) {
      // Add the auth method to the keychain
      await idw.keychain.add(config.authId, config.authSecret)
      await idw.keychain.commit()
    }
    if (idw._threeIdx.docs.idx == null && !config.disableIDX) {
      // Ensure IDX is created and linked to the DID
      await idw._threeIdx.createIDX()
    }
    return idw
  }

  /**
   * Get the DIDProvider
   *
   * @return    {DidProvider}                   The DIDProvider for this ThreeIdProvider instance
   */
  getDidProvider(forcedOrigin?: string): DidProvider {
    return new DidProvider({
      keyring: this.keychain._keyring,
      permissions: this.permissions,
      threeIdx: this._threeIdx,
      forcedOrigin,
    })
  }

  /**
   * Reset the IDX doc structure to a default (mostly empty) state.
   */
  async resetIDX(): Promise<void> {
    await this._threeIdx.resetIDX()
  }
}
