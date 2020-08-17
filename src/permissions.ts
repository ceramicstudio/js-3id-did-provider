import store from 'store'

interface PermissionRequest {
  type: string
  origin?: string | null
  payload: Record<string, any>
}

export type GetPermissionFn = (req: PermissionRequest) => Promise<Array<string>> | null

export const SELF_ORIGIN = '__IDW_ORIGIN'

const storageKey = (origin: string, did: string) => `3id_permission_${did}_${origin}`

export default class Permissions {
  constructor(protected getPermission: GetPermissionFn) {
    if (typeof this.getPermission !== 'function') {
      throw new Error('getPermission parameter has to be a function')
    }
  }

  setDID(did: string): void {
    this._did = did
  }

  /**
   * Request permission for given paths for a given origin.
   *
   * @param     {String}            origin          Application domain
   * @param     {Array<String>}     paths           The desired paths
   * @return    {Array<String>}                     The paths that where granted permission for
   */
  async request(origin: string, paths: Array<string> = []): Promise<Array<string> | null> {
    if (this.has(origin, paths)) {
      return paths
    } else {
      const given = await this.getPermission({
        type: 'authenticate',
        origin,
        payload: { paths },
      })
      this.set(origin, given)
      return given
    }
  }

  /**
   * Determine if permission has been given for paths for a given origin.
   *
   * @param     {String}            origin          Application domain
   * @param     {Array<String>}     paths           The desired paths
   * @return    {Boolean}                           True if permission has previously been given
   */
  has(origin: string, paths: Array<string> = []): boolean {
    if (origin === SELF_ORIGIN) return true
    const currentPaths = this.get(origin)
    return paths.reduce((acc: boolean, path: string) => {
      return acc && currentPaths.includes(path)
    }, Boolean(currentPaths))
  }

  /**
   * Get the paths which the given origin has permission for.
   *
   * @param     {String}            origin          Application domain
   * @return    {Array<String>}                     The permissioned paths
   */
  get(origin: string): Array<string> {
    if (!this._did) throw new Error('DID not set')
    return store.get(storageKey(origin, this._did))
  }

  /**
   * Set the paths which the given origin should have permission for.
   *
   * @param     {String}            origin          Application domain
   * @param     {Array<String>}     paths           The desired paths
   */
  set(origin: string, paths: Array<string> | null): void {
    if (!this._did) throw new Error('DID not set')
    return store.set(storageKey(origin, this._did), paths)
  }
}
