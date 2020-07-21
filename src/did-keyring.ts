import nacl, { BoxKeyPair } from 'tweetnacl'
import naclutil from 'tweetnacl-util'
import { HDNode } from '@ethersproject/hdnode'
import { Wallet } from '@ethersproject/wallet'
import { SimpleSigner } from 'did-jwt'
import { sha256 } from 'js-sha256'
import { ec as EC } from 'elliptic'

import { naclRandom } from './crypto'

const ec = new EC('secp256k1')

const BASE_PATH = "m/51073068'/0'"
const ROOT_STORE_PATH = "0'/0'/0'/0'/0'/0'/0'/0'"

const AUTH_PATH_WALLET = BASE_PATH + '/' + ROOT_STORE_PATH + '/0'
const AUTH_PATH_ENCRYPTION = BASE_PATH + '/' + ROOT_STORE_PATH + '/3'

const ensure0x = (str: string): string => {
  return (str.startsWith('0x') ? '' : '0x') + str
}

interface KeysSet {
  signingKey: HDNode
  asymEncryptionKey: BoxKeyPair
  symEncryptionKey: Uint8Array
  managementKey: HDNode
}

export class Keyring {
  public static create() {
    const seed = '0x' + Buffer.from(naclRandom(32)).toString('hex')
    return new Keyring(seed)
  }

  private _seed: string
  private _baseNode: HDNode
  private _keys: KeysSet

  constructor(seed: string) {
    this._seed = seed
    this._baseNode = HDNode.fromSeed(seed).derivePath(BASE_PATH)
    const rootNode = this._baseNode.derivePath(ROOT_STORE_PATH)
    this._keys = {
      signingKey: rootNode.derivePath('0'),
      asymEncryptionKey: nacl.box.keyPair.fromSecretKey(
        new Uint8Array(
          Buffer.from(rootNode.derivePath('2').privateKey.slice(2), 'hex'),
        ),
      ),
      symEncryptionKey: Keyring.hexToUint8Array(
        rootNode.derivePath('3').privateKey.slice(2),
      ),
      managementKey: rootNode.derivePath('1'),
    }
  }

  _getKeys() {
    return this._keys
  }

  asymEncrypt(msg, toPublic, { nonce } = {}) {
    nonce = nonce || Keyring.randomNonce()
    toPublic = naclutil.decodeBase64(toPublic)
    if (typeof msg === 'string') {
      msg = naclutil.decodeUTF8(msg)
    }
    const ephemneralKeypair = nacl.box.keyPair()
    const ciphertext = nacl.box(
      msg,
      nonce,
      toPublic,
      ephemneralKeypair.secretKey,
    )
    return {
      nonce: naclutil.encodeBase64(nonce),
      ephemeralFrom: naclutil.encodeBase64(ephemneralKeypair.publicKey),
      ciphertext: naclutil.encodeBase64(ciphertext),
    }
  }

  asymDecrypt(ciphertext, fromPublic, nonce, { space, toBuffer } = {}) {
    fromPublic = naclutil.decodeBase64(fromPublic)
    ciphertext = naclutil.decodeBase64(ciphertext)
    nonce = naclutil.decodeBase64(nonce)
    const cleartext = nacl.box.open(
      ciphertext,
      nonce,
      fromPublic,
      this._keys.asymEncryptionKey.secretKey,
    )
    if (toBuffer) {
      return cleartext ? Buffer.from(cleartext) : null
    }
    return cleartext ? nacl.util.encodeUTF8(cleartext) : null
  }

  symEncrypt(msg, { space, nonce } = {}) {
    return Keyring.symEncryptBase(msg, this._keys.symEncryptionKey, nonce)
  }

  symDecrypt(ciphertext, nonce, { space, toBuffer } = {}) {
    return Keyring.symDecryptBase(
      ciphertext,
      this._keys.symEncryptionKey,
      nonce,
      toBuffer,
    )
  }

  managementPersonalSign(message) {
    const wallet = this.managementWallet()
    return wallet.signMessage(message)
  }

  managementWallet() {
    return new Wallet(this._keys.managementKey.privateKey)
  }

  getJWTSigner() {
    return SimpleSigner(this._keys.signingKey.privateKey.slice(2))
  }

  getDBSalt() {
    return sha256(this._keys.signingKey.derivePath('0').privateKey.slice(2))
  }

  getPublicKeys({ uncompressed }) {
    let signingKey = this._keys.signingKey.publicKey.slice(2)
    const managementKey = this._keys.managementKey.address
    if (uncompressed) {
      signingKey = ec
        .keyFromPublic(Buffer.from(signingKey, 'hex'))
        .getPublic(false, 'hex')
    }
    return {
      signingKey,
      managementKey,
      asymEncryptionKey: naclutil.encodeBase64(
        this._keys.asymEncryptionKey.publicKey,
      ),
    }
  }

  serialize() {
    return this._seed
  }

  static encryptWithAuthSecret(message, authSecret) {
    const node = HDNode.fromSeed(ensure0x(authSecret)).derivePath(
      AUTH_PATH_ENCRYPTION,
    )
    const key = Keyring.hexToUint8Array(node.privateKey.slice(2))
    return Keyring.symEncryptBase(message, key)
  }

  static decryptWithAuthSecret(ciphertext, nonce, authSecret) {
    const node = HDNode.fromSeed(ensure0x(authSecret)).derivePath(
      AUTH_PATH_ENCRYPTION,
    )
    const key = Keyring.hexToUint8Array(node.privateKey.slice(2))
    return Keyring.symDecryptBase(ciphertext, key, nonce)
  }

  static walletForAuthSecret(authSecret) {
    const node = HDNode.fromSeed(ensure0x(authSecret)).derivePath(
      AUTH_PATH_WALLET,
    )
    return new Wallet(node.privateKey)
  }

  static hexToUint8Array(str) {
    return new Uint8Array(Buffer.from(str, 'hex'))
  }

  static symEncryptBase(msg, symKey, nonce) {
    nonce = nonce || Keyring.randomNonce()
    if (typeof msg === 'string') {
      msg = nacl.util.decodeUTF8(msg)
    }
    const ciphertext = nacl.secretbox(msg, nonce, symKey)
    return {
      nonce: nacl.util.encodeBase64(nonce),
      ciphertext: nacl.util.encodeBase64(ciphertext),
    }
  }

  static symDecryptBase(ciphertext, symKey, nonce, toBuffer) {
    ciphertext = nacl.util.decodeBase64(ciphertext)
    nonce = nacl.util.decodeBase64(nonce)
    const cleartext = nacl.secretbox.open(ciphertext, nonce, symKey)
    if (toBuffer) {
      return cleartext ? Buffer.from(cleartext) : null
    }
    return cleartext ? nacl.util.encodeUTF8(cleartext) : null
  }

  static naclRandom(length) {
    return nacl.randomBytes(length)
  }

  static randomNonce() {
    return Keyring.naclRandom(24)
  }
}

module.exports = Keyring
