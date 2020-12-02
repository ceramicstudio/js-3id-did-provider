import { createJWS, decryptJWE, JWE } from 'did-jwt'
import { decodeCleartext } from 'dag-jose-utils'
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
import { parseJWEKids } from './crypto'
import { toStableObject, encodeBase64 } from './utils'

type Origin = string | null | undefined

export type Context = {
  permissions: Permissions
  threeIdx: ThreeIDX
  keyring: Keyring
  origin: Origin
  forcedDID?: string
}

interface CreateJWSParams {
  payload: Record<string, any>
  protected?: Record<string, any>
  revocable?: boolean
  did: string
}

interface DecryptJWEParams {
  jwe: JWE
  did?: string
}

interface AuthParams {
  paths: Array<string>
  nonce: string
  aud?: string
}

interface JWSSignature {
  protected: string
  signature: string
}

interface GeneralJWS {
  payload: string
  signatures: Array<JWSSignature>
}

function toGeneralJWS(jws: string): GeneralJWS {
  const [protectedHeader, payload, signature] = jws.split('.')
  return {
    payload,
    signatures: [{ protected: protectedHeader, signature }],
  }
}

async function sign(
  payload: Record<string, any>,
  didWithFragment: string,
  keyring: Keyring,
  threeIdx: ThreeIDX,
  protectedHeader: Record<string, any> = {},
  revocable?: boolean
): Promise<GeneralJWS> {
  let [did, keyFragment] = didWithFragment.split('#') // eslint-disable-line prefer-const
  let kid, signer
  if (did.startsWith('did:key:')) {
    const pubkey = did.split(':')[2]
    kid = `${did}#${pubkey}`
    signer = keyring.getMgmtSigner(pubkey)
  } else {
    if (did !== threeIdx.id) throw new Error(`Unknown DID: ${did}`)
    const version = threeIdx.get3idVersion()
    if (!keyFragment) keyFragment = keyring.getKeyFragment(version)
    kid = `${did}${revocable ? '' : `?version-id=${version}`}#${keyFragment}`
    signer = keyring.getSigner(version)
  }
  const header = toStableObject(Object.assign(protectedHeader, { kid }))
  const jws = await createJWS(toStableObject(payload), signer, header)
  return toGeneralJWS(jws)
}

export const didMethods: HandlerMethods<Context> = {
  did_authenticate: async (
    { permissions, keyring, threeIdx, origin, forcedDID },
    params: AuthParams
  ) => {
    const paths = await permissions.request(origin, params.paths || [])
    // paths should be an array if permission granted
    // may be a subset or requested paths or empty array
    if (paths === null) throw new RPCError(4001, 'User Rejected Request')
    return sign(
      {
        did: forcedDID || threeIdx.id,
        aud: params.aud,
        nonce: params.nonce,
        paths,
        exp: Math.floor(Date.now() / 1000) + 600, // expires 10 min from now
      },
      forcedDID || threeIdx.id,
      keyring,
      threeIdx
    )
  },
  did_createJWS: async ({ permissions, keyring, threeIdx, origin }, params: CreateJWSParams) => {
    if (!permissions.has(origin)) throw new RPCError(4100, 'Unauthorized')
    // TODO - if the requesting DID is our management key
    // (did:key) we should request explicit permission.
    const jws = await sign(
      params.payload,
      params.did,
      keyring,
      threeIdx,
      params.protected,
      params.revocable
    )
    return { jws }
  },
  did_decryptJWE: async ({ permissions, keyring, origin }, params: DecryptJWEParams) => {
    if (!permissions.has(origin)) throw new RPCError(4100, 'Unauthorized')
    const parsedKids = parseJWEKids(params.jwe)
    const decrypter = keyring.getAsymDecrypter(parsedKids)
    const bytes = await decryptJWE(params.jwe, decrypter)
    let obj
    try {
      obj = decodeCleartext(bytes)
    } catch (e) {
      // There was an error decoding, which means that this is not a cleartext encoded as a CID
      // TODO - We should explicitly ask for permission.
    }
    if (obj && !permissions.has(origin, obj.paths)) throw new RPCError(4100, 'Unauthorized')
    return { cleartext: encodeBase64(bytes) }
  },
}

export interface ProviderConfig {
  permissions: Permissions
  threeIdx: ThreeIDX
  keyring: Keyring
  forcedOrigin?: string
  forcedDID?: string
}

export class DidProvider implements RPCConnection {
  protected _handle: RequestHandler

  constructor({ permissions, threeIdx, keyring, forcedOrigin, forcedDID }: ProviderConfig) {
    const handler = createHandler<Context>(didMethods)
    this._handle = (origin: string, msg: RPCRequest) => {
      return handler(
        {
          origin: forcedOrigin || origin,
          permissions,
          threeIdx,
          keyring,
          forcedDID,
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
