import EventEmitter from 'events'
import Keyring from './keyring'
import didJWT from 'did-jwt'

const ENC_BLOCK_SIZE = 24

const pad = (val, blockSize = ENC_BLOCK_SIZE) => {
  const blockDiff = (blockSize - (val.length % blockSize)) % blockSize
  return `${val}${'\0'.repeat(blockDiff)}`
}

const unpad = padded => padded.replace(/\0+$/, '')


class IdentityWallet extends EventEmitter {

  constructor (config = {}) {
    super()
    if (config.seed) {
      this._keyring = new Keyring(config.seed)
    }
  }

  async getAddress () {
    return null
  }

  async authenticate (spaces = [], { authData } = {}) {
    const result = {
      main: this._keyring.getPublicKeys(),
      spaces: {}
    }
    spaces.map(space => {
      result.spaces[space] = this._keyring.getPublicKeys(space)
    })
    return result
  }

  async addAuthMethod (authSecret) {
  }

  async signClaim (payload, { DID, space, expiresIn } = {}) {
    const issuer = DID
    const settings = {
      signer: this._keyring.getJWTSigner(space),
      issuer,
      expiresIn
    }
    return didJWT.createJWT(payload, settings)
  }

  async encrypt (message, space, { nonce, blockSize } = {}) {
    const paddedMsg = pad(message, blockSize)
    return this._keyring.symEncrypt(paddedMsg, { space, nonce })
  }

  async decrypt (encObj, space) {
    const paddedMsg = this._keyring.symDecrypt(encObj.ciphertext, encObj.nonce, { space })
    if (!paddedMsg) throw new Error('IdentityWallet: Could not decrypt message')
    return unpad(paddedMsg)
  }
}


module.exports = IdentityWallet
