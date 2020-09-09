import { createJWS } from 'did-jwt'
import {
  HandlerMethods,
  RequestHandler,
  RPCConnection,
  RPCError,
  RPCRequest,
  RPCResponse,
  createHandler,
} from 'rpc-utils'

import Keyring from './keyring'
import { ThreeIDX } from './three-idx'
import Permissions from './permissions'
import { toStableObject } from './utils'

type Origin = string | null | undefined

export type Context = {
  permissions: Permissions
  threeIdx: ThreeIDX
  keyring: Keyring
  origin: Origin
}

interface CreateJWSParams {
  payload: Record<string, any>
  protected?: Record<string, any>
  did: string
}

interface AuthParams {
  paths: Array<string>
}

export const didMethods: HandlerMethods<Context> = {
  did_authenticate: async ({ permissions, threeIdx, origin }, params: AuthParams) => {
    const paths = await permissions.request(origin, params.paths || [])
    // paths should be an array if permission granted
    // may be a subset or requested paths or empty array
    if (paths === null) throw new RPCError(4001, 'User Rejected Request')
    return { did: threeIdx.DID, paths }
  },
  did_createJWS: async ({ permissions, keyring, threeIdx, origin }, params: CreateJWSParams) => {
    if (!permissions.has(origin)) {
      throw new RPCError(4100, 'Unauthorized')
    }
    // TODO - if the requesting DID is our management key
    // (did:key) we should request explicit permission.
    const keyName = threeIdx.parseKeyName(params.did)
    const kid = await threeIdx.encodeKidWithVersion(keyName)
    const signer = keyring.getSigner(keyName)
    const header = toStableObject(Object.assign(params.protected || {}, { kid }))
    const jws = await createJWS(toStableObject(params.payload), signer, header)
    return { jws }
  },
}

export interface ProviderConfig {
  permissions: Permissions
  threeIdx: ThreeIDX
  keyring: Keyring
  forcedOrigin?: string
}

export class DidProvider implements RPCConnection {
  protected _handle: RequestHandler

  constructor({ permissions, threeIdx, keyring, forcedOrigin }: ProviderConfig) {
    const handler = createHandler<Context>(didMethods)
    this._handle = (origin: string, msg: RPCRequest) => {
      return handler(
        {
          origin: forcedOrigin || origin,
          permissions,
          threeIdx,
          keyring,
        },
        msg
      )
    }
  }

  public get isDidProvider(): boolean {
    return true
  }

  public async send(msg: RPCRequest, origin?: Origin): Promise<RPCResponse | null> {
    return await this._handle(origin, msg)
  }
}
