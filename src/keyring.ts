import { generateKeyPairFromSeed, KeyPair } from '@stablelib/x25519'
import { HDNode } from '@ethersproject/hdnode'
import { Wallet } from '@ethersproject/wallet'
import { EllipticSigner, Signer, Decrypter, x25519Decrypter, JWE } from 'did-jwt'

import { asymDecryptJWE, randomBytes } from './crypto'
import { PublicKeys, encodeKey, encodeBase64, hexToU8A, u8aToHex } from './utils'

const BASE_PATH = "m/51073068'/0'"
const ROOT_STORE_PATH = "0'/0'/0'/0'/0'/0'/0'/0'"
const BASE_PATH_LEGACY = "m/7696500'/0'/0'"

// Using the long paths with base and rootstore is extremely slow.
// For auth simple paths are used instead.
const AUTH_PATH_WALLET = '0'
const AUTH_PATH_ASYM_ENCRYPTION = '2'

export interface KeySet {
  signing: Uint8Array
  management: Uint8Array
  encryption: Uint8Array
}

interface FullKeySet {
  seed: Uint8Array
  publicKeys: KeySet
  secretKeys: KeySet
}

function deriveKeySet(seed: Uint8Array): FullKeySet {
  const hdNode = HDNode.fromSeed(seed).derivePath(BASE_PATH).derivePath(ROOT_STORE_PATH)
  const signing = hdNode.derivePath('0')
  const management = hdNode.derivePath('1')
  const encryption = generateKeyPairFromSeed(hexToU8A(hdNode.derivePath('2').privateKey.slice(2)))
  return {
    seed,
    publicKeys: {
      signing: hexToU8A(signing.publicKey.slice(2)),
      management: hexToU8A(management.publicKey.slice(2)),
      encryption: encryption.publicKey,
    },
    secretKeys: {
      signing: hexToU8A(signing.privateKey.slice(2)),
      management: hexToU8A(management.privateKey.slice(2)),
      encryption: encryption.secretKey,
    }
  }
}


export default class Keyring {
  // map from 3ID version to key set
  protected _keySets: Record<string, FullKeySet> = {}
  // map from kid to encryption key
  protected _encryptionMap: Record<string, string> = {}

  constructor(seed?: Uint8Array) {
    if (!seed) {
      seed = randomBytes(32)
    }
    this._keySets['latest'] = deriveKeySet(seed)
    this._encryptionMap[this._keySets['latest'].publicKeys.encryption] = 'latest'
  }

  getAsymDecrypter(id?: string): Decrypter {
    const key = this._keySets[id ? this._encryptionMap[id] : 'latest'].secretKeys.encryption
    return x25519Decrypter(key)
  }

  getSigner(keyId?: string): Signer {
    const v = 'latest'
    const key = keyId === 'management' ? this._keySets[v].secretKeys.management : this._keySets[v].secretKeys.signing
    if (key == null) {
      throw new Error('Invalid key')
    }
    return EllipticSigner(u8aToHex(key))
  }

  getEncryptionPublicKey(): Uint8Array {
    return this._keySets['latest'].publicKeys.encryption
  }

  get3idState(genesis?: boolean): Record<string, any> {
    const keys = this._keySets['latest'].publicKeys
    const signing = encodeKey(keys.signing, 'secp256k1')
    const encryption = encodeKey(keys.encryption, 'secp256k1')
    // use the last 12 chars as key id
    const state = {
      metadata: { owners: [`did:key:${encodeKey(keys.management, 'secp256k1')}`] },
      content: {
        publicKeys: {
          [signing.slice(-12)]: signing,
          [encryption.slice(-12)]: encryption
        },
      },
    }
    if (genesis) state.metadata.tags = ['3id']
    return state
  }

  serialize(): Record<string, Uint8Array> {
    return Object.keys(this._keySets).reduce((acc, version) => {
      acc[version] = this._keySets[version].seed
      return acc
    }, {})
  }

  static authSecretToKeyPair(authSecret: Uint8Array): KeyPair {
    const node = HDNode.fromSeed(authSecret).derivePath(AUTH_PATH_ASYM_ENCRYPTION)
    return generateKeyPairFromSeed(hexToU8A(node.privateKey.slice(2)))
  }

  static authSecretToWallet(authSecret: Uint8Array): Wallet {
    const node = HDNode.fromSeed(authSecret).derivePath(AUTH_PATH_WALLET)
    return new Wallet(node.privateKey)
  }
}
