const methods = {
  GET_LINK: '3id_getLink',
  LINK_MANAGEMENT_KEY: '3id_linkManagementKey',
  AUTHENTICATE: '3id_authenticate',
  IS_AUTHENTICATED: '3id_isAuthenticated',
  SIGN_CLAIM: '3id_signClaim',
  ENCRYPT: '3id_encrypt',
  DECRYPT: '3id_decrypt',
  HASH_ENTRY_KEY: '3id_hashEntryKey',
  NEW_AUTH_METHOD_POLL: '3id_newAuthMethodPoll',
  NEW_LINK_POLL: '3id_newLinkPoll'
}

const callbackOrThrow = (callback, errMsg) => {
  if (callback) {
    callback(errMsg)
  } else {
    throw errMsg instanceof Error ? errMsg : new Error(errMsg)
  }
}

class ThreeIdProvider {
  constructor (idWallet) {
    this.is3idProvider = true
    this._idWallet = idWallet
    this._newAuthMethods = []
    this._newLinks = []
    this._idWallet.events.on('new-auth-method', authBlob => {
      this._newAuthMethods.push(authBlob)
    })
    this._idWallet.events.on('new-link-proof', linkProof => {
      this._newLinks.push(linkProof)
    })
  }

  async send (req, origin, callback) {
    if (typeof origin === 'function') {
      callback = origin
      origin = null
    }
    let result
    try {
      switch (req.method) {
        case methods.GET_LINK:
          result = (await this._idWallet.getLink()).toLowerCase()
          break
        case methods.LINK_MANAGEMENT_KEY:
          result = await this._idWallet.linkManagementKey()
          break
        case methods.AUTHENTICATE:
          result = await this._idWallet.authenticate(req.params.spaces, { authData: req.params.authData, address: req.params.address }, origin)
          break
        case methods.IS_AUTHENTICATED:
          result = await this._idWallet.isAuthenticated(req.params.spaces, origin)
          break
        case methods.SIGN_CLAIM:
          result = await this._idWallet.signClaim(req.params.payload, {
            DID: req.params.did,
            space: req.params.space,
            expiresIn: req.params.expiresIn
          })
          break
        case methods.ENCRYPT:
          result = await this._idWallet.encrypt(req.params.message, req.params.space, {
            blockSize: req.params.blockSize,
            to: req.params.to
          })
          break
        case methods.DECRYPT:
          result = await this._idWallet.decrypt({
            ciphertext: req.params.ciphertext,
            ephemeralFrom: req.params.ephemeralFrom,
            nonce: req.params.nonce
          }, req.params.space, req.params.buffer)
          break
        case methods.HASH_ENTRY_KEY:
          result = await this._idWallet.hashDBKey(req.params.key, req.params.space)
          break
        case methods.NEW_AUTH_METHOD_POLL:
          result = [...this._newAuthMethods]
          this._newAuthMethods = []
          break
        case methods.NEW_LINK_POLL:
          result = [...this._newLinks]
          this._newLinks = []
          break
        default:
          callbackOrThrow(callback, `Unsupported method: ${req.method}`)
          return
      }
    } catch (err) {
      callbackOrThrow(callback, err)
      return
    }
    const response = {
      'id': req.id,
      'json-rpc': '2.0',
      result
    }
    if (callback) callback(null, response)
    return response
  }
}

module.exports = ThreeIdProvider
