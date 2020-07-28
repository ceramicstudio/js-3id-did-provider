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

interface CreateJWSParams {
  payload: Record<string, any>
  protected?: Record<string, any>
  pubKeyId?: string
}

const methods: HandlerMethods<IdentityWallet> = {
  did_authenticate: async (wallet) => {
    await wallet.authenticate([], {})
    return { did: wallet.DID }
  },
  did_createJWS: async (wallet, params: CreateJWSParams) => {
    if (!(await wallet.isAuthenticated())) {
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
    this._handle = createHandler<IdentityWallet>(methods)
    this._wallet = wallet
  }

  public get isDidProvider(): boolean {
    return true
  }

  public async send(msg: RPCRequest): Promise<RPCResponse | null> {
    return await this._handle(this._wallet, msg)
  }
}
