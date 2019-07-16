import EventEmitter from 'events'
import Keyring from './keyring'
import didJWT from 'did-jwt'

const ENC_BLOCK_SIZE = 24

const pad = (val, blockSize = ENC_BLOCK_SIZE) => {
  const blockDiff = (blockSize - (val.length % blockSize)) % blockSize
  return `${val}${'\0'.repeat(blockDiff)}`
}

const unpad = padded => padded.replace(/\0+$/, '')


class IdentityWallet {

  constructor (config = {}) {
    this.events = new EventEmitter()
    if (config.seed) {
      this._keyring = new Keyring(config.seed)
    }
    if (config.authSecret) {
      if (!config.ethereumAddress) throw new Error('Ethereum address needs to be defined when authSecret given')
      this._authSecret = config.authSecret
      this._ethereumAddress = config.ethereumAddress
    }
  }

  async getAddress () {
    return this._ethereumAddress
  }

  _initKeyring (authData) {
    let seed
    if (authData) {
      authData.find(({ ciphertext, nonce }) => {
        const key = Keyring.hexToUint8Array(this._authSecret)
        seed = Keyring.symDecryptBase(ciphertext, key, nonce)
        return Boolean(seed)
      })
      if (!seed) throw new Error('No valid auth-secret for this identity')
    } else {
      // no authData available so we create a new identity
      seed = '0x' + Buffer.from(Keyring.naclRandom(32)).toString('hex')
      this.addAuthMethod(this._authSecret, seed)
    }
    this._keyring = new Keyring(seed)
  }

  async authenticate (spaces = [], { authData } = {}) {
    if (!this._keyring) this._initKeyring(authData)
    const result = {
      main: this._keyring.getPublicKeys(),
      spaces: {}
    }
    if (this._ethereumAddress) result.main.managementKey = this._ethereumAddress
    spaces.map(space => {
      result.spaces[space] = this._keyring.getPublicKeys(space)
    })
    return result
  }

  async addAuthMethod (authSecret, seed) {
    if (!seed && !this._keyring) throw new Error('This method can only be called after authenticate has been called')

    const message = seed || this._keyring._seed
    const key = Keyring.hexToUint8Array(authSecret)
    const encAuthData = Keyring.symEncryptBase(message, key)

    this.events.emit('new-auth-method', encAuthData)
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
