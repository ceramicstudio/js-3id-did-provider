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

import IdentityWallet from './identity-wallet'

type Origin = string | null | undefined

type Context = {
  wallet: IdentityWallet
  origin: Origin
}

interface CreateJWSParams {
  payload: Record<string, any>
  protected?: Record<string, any>
  pubKeyId?: string
}

const methods: HandlerMethods<Context> = {
  did_authenticate: async ({ wallet, origin }) => {
    await wallet.authenticate([], {}, origin)
    return { did: wallet.DID }
  },
  did_createJWS: async ({ wallet, origin }, params: CreateJWSParams) => {
    if (!(await wallet.isAuthenticated([], origin))) {
      throw new RPCError(0, 'Authentication required')
    }
    const signer = wallet.getRootSigner(params.pubKeyId)
    const jws = await createJWS(params.payload, signer, params.protected)
    return { jws }
  },
}

export class DidProvider implements RPCConnection {
  protected _handle: RequestHandler
  protected _wallet: IdentityWallet

  constructor(wallet: IdentityWallet) {
    this._handle = createHandler<Context>(methods)
    this._wallet = wallet
  }

  public get isDidProvider(): boolean {
    return true
  }

  public async send(msg: RPCRequest, origin?: Origin): Promise<RPCResponse | null> {
    return await this._handle({ origin, wallet: this._wallet }, msg)
  }
}
