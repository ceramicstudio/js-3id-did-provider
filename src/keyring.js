import nacl from 'tweetnacl'
import naclutil from 'tweetnacl-util'
import { HDNode } from '@ethersproject/hdnode'
import { Wallet } from '@ethersproject/wallet'
import { SimpleSigner } from 'did-jwt'
import { sha256 } from './utils'
import { ec as EC } from 'elliptic'
nacl.util = naclutil
const ec = new EC('secp256k1')

const BASE_PATH = "m/51073068'/0'"
const ROOT_STORE_PATH = "0'/0'/0'/0'/0'/0'/0'/0'"
const BASE_PATH_LEGACY = "m/7696500'/0'/0'"

const AUTH_PATH_WALLET = BASE_PATH + '/' + ROOT_STORE_PATH + '/0'
const AUTH_PATH_ENCRYPTION = BASE_PATH + '/' + ROOT_STORE_PATH + '/3'

const ensure0x = str => (str.startsWith('0x') ? '' : '0x') + str

class Keyring {
  constructor (seed, migratedKeys) {
    // TODO for full migration handle two sets of 'root keys' seed and migrated
    this._spaceKeys = {}

    if (seed) {
      this._seed = seed
      this._baseNode = HDNode.fromSeed(this._seed).derivePath(BASE_PATH)
      const rootNode = this._baseNode.derivePath(ROOT_STORE_PATH)
      this._rootKeys = this._deriveKeySet(rootNode, true)
    }

    if (migratedKeys) {
      this._migratedKeys = true
      this._importMigratedKeys(migratedKeys)
    }

    if (!(seed || migratedKeys)) throw new Error('One or both of seed or migratedKeys required')
  }

  //  Import and load legacy keys
  _importMigratedKeys (migratedKeys) {
    migratedKeys = JSON.parse(migratedKeys)

    const getHDNode = (seed) => {
      const seedNode = HDNode.fromSeed(seed)
      return seedNode.derivePath(BASE_PATH_LEGACY)
    }

    const rootNode = getHDNode(migratedKeys.seed)

    this._rootKeys = this._deriveKeySet(rootNode)
    this._rootKeys.managementAddress = migratedKeys.managementAddress
    this._rootKeys.managementKey = { address: migratedKeys.managementAddress }

    Object.keys(migratedKeys.spaceSeeds).map(name => {
      const spaceNode = getHDNode(migratedKeys.spaceSeeds[name])
      this._spaceKeys[name] = this._deriveKeySet(spaceNode)
    })
  }

  _deriveKeySet (hdNode, deriveManagementKey) {
    const keys = {
      signingKey: hdNode.derivePath('0'),
      asymEncryptionKey: nacl.box.keyPair.fromSecretKey(new Uint8Array(
        Buffer.from(hdNode.derivePath('2').privateKey.slice(2), 'hex')
      )),
      symEncryptionKey: Keyring.hexToUint8Array(hdNode.derivePath('3').privateKey.slice(2))
    }
    if (deriveManagementKey) keys.managementKey = hdNode.derivePath('1')
    return keys
  }

  _deriveSpaceKeys (space) {
    const spaceHash = sha256(`${space}.3box`)
    // convert hash to path
    const spacePath = spaceHash.match(/.{1,12}/g) // chunk hex string
      .map(n => parseInt(n, 16).toString(2)) // convert to binary
      .map(n => (n.length === 47 ? '0' : '') + n) // make sure that binary strings have the right length
      .join('').match(/.{1,31}/g) // chunk binary string for path encoding
      .map(n => parseInt(n, 2)).join("'/") + "'" // convert to uints and create path
    const spaceNode = this._baseNode.derivePath(spacePath)
    this._spaceKeys[space] = this._deriveKeySet(spaceNode)
  }

  _getKeys (space) {
    if (!space) {
      return this._rootKeys
    } else if (!this._spaceKeys[space]) {
      // only hold during partial migration, otherwise will derive on demand
      if (this._migratedKeys) throw new Error('Can not derive space keys, not given in migrated keys')
      this._deriveSpaceKeys(space)
    }
    return this._spaceKeys[space]
  }

  asymEncrypt (msg, toPublic, { nonce } = {}) {
    nonce = nonce || Keyring.randomNonce()
    toPublic = nacl.util.decodeBase64(toPublic)
    if (typeof msg === 'string') {
      msg = nacl.util.decodeUTF8(msg)
    }
    const ephemneralKeypair = nacl.box.keyPair()
    const ciphertext = nacl.box(msg, nonce, toPublic, ephemneralKeypair.secretKey)
    return {
      nonce: nacl.util.encodeBase64(nonce),
      ephemeralFrom: nacl.util.encodeBase64(ephemneralKeypair.publicKey),
      ciphertext: nacl.util.encodeBase64(ciphertext)
    }
  }

  asymDecrypt (ciphertext, fromPublic, nonce, { space, toBuffer } = {}) {
    fromPublic = nacl.util.decodeBase64(fromPublic)
    ciphertext = nacl.util.decodeBase64(ciphertext)
    nonce = nacl.util.decodeBase64(nonce)
    const cleartext = nacl.box.open(ciphertext, nonce, fromPublic, this._getKeys(space).asymEncryptionKey.secretKey)
    if (toBuffer) {
      return cleartext ? Buffer.from(cleartext) : null
    }
    return cleartext ? nacl.util.encodeUTF8(cleartext) : null
  }

  symEncrypt (msg, { space, nonce } = {}) {
    return Keyring.symEncryptBase(msg, this._getKeys(space).symEncryptionKey, nonce)
  }

  symDecrypt (ciphertext, nonce, { space, toBuffer } = {}) {
    return Keyring.symDecryptBase(ciphertext, this._getKeys(space).symEncryptionKey, nonce, toBuffer)
  }

  managementPersonalSign (message) {
    const wallet = this.managementWallet()
    return wallet.signMessage(message)
  }

  managementWallet () {
    return new Wallet(this._rootKeys.managementKey.privateKey)
  }

  getJWTSigner (space) {
    return SimpleSigner(this._getKeys(space).signingKey.privateKey.slice(2))
  }

  getDBSalt (space) {
    return sha256(this._getKeys(space).signingKey.derivePath('0').privateKey.slice(2))
  }

  getPublicKeys ({ space, uncompressed, mgmtPub } = {}) {
    const keys = this._getKeys(space)
    let signingKey = keys.signingKey.publicKey.slice(2)
    const managementKey = space ? null : (mgmtPub && keys.managementKey.publicKey ? keys.managementKey.publicKey.slice(2) : keys.managementKey.address)
    if (uncompressed) {
      signingKey = ec.keyFromPublic(Buffer.from(signingKey, 'hex')).getPublic(false, 'hex')
    }
    return {
      signingKey,
      managementKey,
      asymEncryptionKey: nacl.util.encodeBase64(keys.asymEncryptionKey.publicKey)
    }
  }

  serialize () {
    return this._seed
  }

  static encryptWithAuthSecret (message, authSecret) {
    const node = HDNode.fromSeed(ensure0x(authSecret)).derivePath(AUTH_PATH_ENCRYPTION)
    const key = Keyring.hexToUint8Array(node.privateKey.slice(2))
    return Keyring.symEncryptBase(message, key)
  }

  static decryptWithAuthSecret (ciphertext, nonce, authSecret) {
    const node = HDNode.fromSeed(ensure0x(authSecret)).derivePath(AUTH_PATH_ENCRYPTION)
    const key = Keyring.hexToUint8Array(node.privateKey.slice(2))
    return Keyring.symDecryptBase(ciphertext, key, nonce)
  }

  static walletForAuthSecret (authSecret) {
    const node = HDNode.fromSeed(ensure0x(authSecret)).derivePath(AUTH_PATH_WALLET)
    return new Wallet(node.privateKey)
  }

  static hexToUint8Array (str) {
    return new Uint8Array(Buffer.from(str, 'hex'))
  }

  static symEncryptBase (msg, symKey, nonce) {
    nonce = nonce || Keyring.randomNonce()
    if (typeof msg === 'string') {
      msg = nacl.util.decodeUTF8(msg)
    }
    const ciphertext = nacl.secretbox(msg, nonce, symKey)
    return {
      nonce: nacl.util.encodeBase64(nonce),
      ciphertext: nacl.util.encodeBase64(ciphertext)
    }
  }

  static symDecryptBase (ciphertext, symKey, nonce, toBuffer) {
    ciphertext = nacl.util.decodeBase64(ciphertext)
    nonce = nacl.util.decodeBase64(nonce)
    const cleartext = nacl.secretbox.open(ciphertext, nonce, symKey)
    if (toBuffer) {
      return cleartext ? Buffer.from(cleartext) : null
    }
    return cleartext ? nacl.util.encodeUTF8(cleartext) : null
  }

  static naclRandom (length) {
    return nacl.randomBytes(length)
  }

  static randomNonce () {
    return Keyring.naclRandom(24)
  }
}

module.exports = Keyring
