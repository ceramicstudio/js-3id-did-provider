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

const methods: HandlerMethods<IdentityWallet> = {
  did_authenticate: async (wallet) => {
    await wallet.authenticate([], {}, null)
    return { accounts: [wallet.DID] }
  },
  did_createJWS: () => {
    throw new RPCError(0, 'Not implemented')
  },
}

export class DidProvider implements RPCConnection {
  protected _handle: RequestHandler
  protected _wallet: IdentityWallet

  constructor(wallet: IdentityWallet) {
    this._handle = createHandler<IdentityWallet>(methods, {
      onHandlerError: this._onHandlerError.bind(this),
    })
    this._wallet = wallet
  }

  protected _onHandlerError() {}

  public get isDidProvider(): boolean {
    return true
  }

  public async send(msg: RPCRequest): Promise<RPCResponse | null> {
    return await this._handle(this._wallet, msg)
  }
}
