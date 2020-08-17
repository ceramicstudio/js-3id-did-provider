import { createJWT } from 'did-jwt'
import {
  HandlerMethods,
  RequestHandler,
  RPCError,
  RPCRequest,
  RPCResponse,
  createHandler,
} from 'rpc-utils'

import { sha256Multihash, pad, unpad } from './utils'
import { didMethods, ProviderConfig } from './did-provider'
import { PublicKeys } from './keyring'

type Origin = string | null | undefined

type Context = {
  provider: ThreeIdProvider
  origin: Origin
}

const methods: HandlerMethods<Context> = {
  '3id_authenticate': async ({ permissions, keyring, origin }, params) => {
    const spaces = await permissions.request(origin, params.spaces || [])
    return {
      main: keyring.getPublicKeys({ mgmtPub: params.mgmtPub }),
      spaces: spaces.reduce((acc, space) => {
        acc[space] = keyring.getPublicKeys({
          space,
          uncompressed: true,
        })
        return acc
      }, {} as Record<string, PublicKeys>),
    }
  },
  '3id_isAuthenticated': async ({ permissions, origin }, params) => {
    return permissions.has(origin, params.spaces)
  },
  '3id_signClaim': async ({ threeIdx, permissions, keyring, origin }, params) => {
    if (!permissions.has(origin, params.spaces)) {
      throw new RPCError(0, 'Authentication required')
    }
    const settings = {
      signer: keyring.getJWTSigner(params.space, params.useMgmt),
      issuer: threeIdx.DID,
      expiresIn: params.expiresIn,
    }
    return createJWT(params.payload, settings)
  },
  '3id_encrypt': async ({ origin, keyring, permissions }, params) => {
    if (!permissions.has(origin, params.spaces)) {
      throw new RPCError(0, 'Authentication required')
    }
    const { to, blockSize, message, space } = params
    const paddedMsg = typeof message === 'string' ? pad(message, blockSize) : message
    if (to) {
      return keyring.asymEncrypt(paddedMsg, to)
    } else {
      return keyring.symEncrypt(paddedMsg, { space })
    }
  },
  '3id_decrypt': async ({ origin, keyring, permissions }, params) => {
    if (!permissions.has(origin, params.spaces)) {
      throw new RPCError(0, 'Authentication required')
    }
    const { ciphertext, ephemeralFrom, nonce, space } = params
    let paddedMsg
    if (ephemeralFrom) {
      paddedMsg = keyring.asymDecrypt(
        ciphertext,
        ephemeralFrom,
        nonce,
        // @ts-ignore issue: https://github.com/microsoft/TypeScript/issues/14107
        { space }
      )
    } else {
      paddedMsg = keyring.symDecrypt(ciphertext, nonce, { space })
    }
    if (!paddedMsg) throw new RPCError('Could not decrypt message')
    return unpad(paddedMsg)
  },
  '3id_hashEntryKey': async ({ origin, keyring, permissions }, params) => {
    if (!permissions.has(origin, params.spaces)) {
      throw new RPCError(0, 'Authentication required')
    }
    const salt = keyring.getDBSalt(params.space)
    return sha256Multihash(salt + params.key)
  },
  '3id_newAuthMethodPoll': () => [],
  '3id_newLinkPoll': () => [],
}

type Callback = (err: Error | null | undefined, res?: RPCResponse | null) => void

export default class ThreeIdProvider {
  protected _handle: RequestHandler

  constructor({ permissions, threeIdx, keyring, forcedOrigin }: ProviderConfig) {
    this._handle = (origin: string, req: RPCRequest) => {
      return createHandler<Context>(Object.assign(methods, didMethods))({
        origin: forcedOrigin || origin,
        permissions,
        threeIdx,
        keyring
      }, req)
    }
  }

  public get is3idProvider(): boolean {
    return true
  }

  public get isDidProvider(): boolean {
    return true
  }

  async send(
    req: RPCRequest,
    origin: Origin | Callback,
    callback?: Callback
  ): Promise<RPCResponse | null> {
    if (typeof origin === 'function') {
      callback = origin
      origin = null
    }

    const res = await this._handle(origin, req)
    if (res?.error) {
      const error = RPCError.fromObject(res.error)
      if (callback == null) {
        throw error
      } else {
        callback(error)
        return null
      }
    }

    callback?.(null, res)
    return res
  }
}
