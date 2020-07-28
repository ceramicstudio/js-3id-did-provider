import { LinkProof } from '3id-blockchain-utils'
import {
  HandlerMethods,
  RequestHandler,
  RPCError,
  RPCRequest,
  RPCResponse,
  createHandler,
} from 'rpc-utils'

import { EncryptedMessage } from './crypto'
import IdentityWallet from './identity-wallet'

type Origin = string | null | undefined

type Context = {
  provider: ThreeIdProvider
  origin: Origin
}

const methods: HandlerMethods<Context> = {
  '3id_getLink': async (ctx) => {
    return (await ctx.provider.wallet.getLink()).toLowerCase()
  },
  '3id_linkManagementKey': async (ctx) => {
    return await ctx.provider.wallet.linkManagementKey()
  },
  '3id_authenticate': async (ctx, params) => {
    return await ctx.provider.wallet.authenticate(
      params.spaces,
      {
        authData: params.authData,
        address: params.address,
        mgmtPub: params.mgmtPub,
      },
      ctx.origin
    )
  },
  '3id_isAuthenticated': async (ctx, params) => {
    return await ctx.provider.wallet.isAuthenticated(params.spaces, ctx.origin)
  },
  '3id_signClaim': async (ctx, params) => {
    return await ctx.provider.wallet.signClaim(params.payload, {
      DID: params.did,
      space: params.space,
      expiresIn: params.expiresIn,
      useMgmt: params.useMgmt,
    })
  },
  '3id_encrypt': async (ctx, params) => {
    return await ctx.provider.wallet.encrypt(params.message, params.space, {
      blockSize: params.blockSize,
      to: params.to,
    })
  },
  '3id_decrypt': async (ctx, params) => {
    return await ctx.provider.wallet.decrypt(
      {
        ciphertext: params.ciphertext,
        ephemeralFrom: params.ephemeralFrom,
        nonce: params.nonce,
      },
      params.space,
      params.buffer
    )
  },
  '3id_hashEntryKey': async (ctx, params) => {
    return await ctx.provider.wallet.hashDBKey(params.key, params.space)
  },
  '3id_newAuthMethodPoll': (ctx) => ctx.provider.pollAuthMethods(),
  '3id_newLinkPoll': (ctx) => ctx.provider.pollLinks(),
}

type Callback = (
  err: Error | null | undefined,
  res?: RPCResponse | null
) => void

export default class ThreeIdProvider {
  private _newAuthMethods: Array<EncryptedMessage> = []
  private _newLinks: Array<LinkProof> = []

  protected _handle: RequestHandler

  public wallet: IdentityWallet

  constructor(wallet: IdentityWallet) {
    this._handle = createHandler<Context>(methods)
    this.wallet = wallet

    wallet.events.on('new-auth-method', (authBlob: EncryptedMessage) => {
      this._newAuthMethods.push(authBlob)
    })
    wallet.events.on('new-link-proof', (linkProof: LinkProof) => {
      this._newLinks.push(linkProof)
    })
  }

  public get is3idProvider(): boolean {
    return true
  }

  public pollAuthMethods(): Array<EncryptedMessage> {
    const methods = [...this._newAuthMethods]
    this._newAuthMethods = []
    return methods
  }

  public pollLinks(): Array<LinkProof> {
    const links = [...this._newLinks]
    this._newLinks = []
    return links
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

    const res = await this._handle({ provider: this, origin }, req)
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
