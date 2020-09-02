import nacl, { BoxKeyPair } from 'tweetnacl'
import naclutil from 'tweetnacl-util'
import { HDNode } from '@ethersproject/hdnode'
import { Wallet } from '@ethersproject/wallet'
import { EllipticSigner, Signer } from 'did-jwt'
import { sha256 } from 'js-sha256'
import { ec as EC } from 'elliptic'

import {
  AsymEncryptedMessage,
  EncryptedMessage,
  asymDecrypt,
  asymEncrypt,
  symDecryptBase,
  symEncryptBase,
} from './crypto'
import { PublicKeys, encodeKey, hexToU8A } from './utils'

const ec = new EC('secp256k1')

const BASE_PATH = "m/51073068'/0'"
const ROOT_STORE_PATH = "0'/0'/0'/0'/0'/0'/0'/0'"
const BASE_PATH_LEGACY = "m/7696500'/0'/0'"

const AUTH_PATH_WALLET = BASE_PATH + '/' + ROOT_STORE_PATH + '/0'
const AUTH_PATH_ASYM_ENCRYPTION = BASE_PATH + '/' + ROOT_STORE_PATH + '/2'
const AUTH_PATH_ENCRYPTION = BASE_PATH + '/' + ROOT_STORE_PATH + '/3'

const ensure0x = (str: string): string => {
  return (str.startsWith('0x') ? '' : '0x') + str
}

interface DecryptOptions {
  space?: string
}

interface MigratedKeys {
  managementAddress: string
  seed: string
  spaceSeeds: Record<string, string>
}

export interface KeySet {
  signingKey: HDNode
  asymEncryptionKey: BoxKeyPair
  symEncryptionKey: Uint8Array
}

export interface RootKeySet extends KeySet {
  managementKey: HDNode | { address: string; publicKey?: string }
  managementAddress?: string
}

export type Signature = { r: string; s: string; recoveryParam: number }

export default class Keyring {
  protected _seed: string | undefined
  protected _baseNode: HDNode | undefined
  protected _rootKeys: RootKeySet | undefined
  protected _spaceKeys: Record<string, KeySet> = {}
  protected _migratedKeys = false

  constructor(seed?: string | null, migratedKeys?: string) {
    // TODO for full migration handle two sets of 'root keys' seed and migrated
    if (seed) {
      this._seed = seed
      this._baseNode = HDNode.fromSeed(this._seed).derivePath(BASE_PATH)
      const rootNode = this._baseNode.derivePath(ROOT_STORE_PATH)
      this._rootKeys = this._deriveRootKeySet(rootNode)
    }

    if (migratedKeys) {
      this._migratedKeys = true
      this._importMigratedKeys(migratedKeys)
    }

    if (!(seed || migratedKeys)) throw new Error('One or both of seed or migratedKeys required')
  }

  //  Import and load legacy keys
  _importMigratedKeys(migratedKeysString: string): void {
    const migratedKeys: MigratedKeys = JSON.parse(migratedKeysString) as MigratedKeys

    const getHDNode = (seed: string): HDNode => {
      const seedNode = HDNode.fromSeed(seed)
      return seedNode.derivePath(BASE_PATH_LEGACY)
    }

    const rootNode = getHDNode(migratedKeys.seed)
    this._rootKeys = this._deriveRootKeySet(rootNode)
    this._rootKeys.managementAddress = migratedKeys.managementAddress
    this._rootKeys.managementKey = { address: migratedKeys.managementAddress }

    Object.keys(migratedKeys.spaceSeeds).map((name) => {
      const spaceNode = getHDNode(migratedKeys.spaceSeeds[name])
      this._spaceKeys[name] = this._deriveKeySet(spaceNode)
    })
  }

  _deriveKeySet(hdNode: HDNode): KeySet {
    return {
      signingKey: hdNode.derivePath('0'),
      asymEncryptionKey: nacl.box.keyPair.fromSecretKey(
        new Uint8Array(Buffer.from(hdNode.derivePath('2').privateKey.slice(2), 'hex'))
      ),
      symEncryptionKey: hexToU8A(hdNode.derivePath('3').privateKey.slice(2)),
    }
  }

  _deriveRootKeySet(hdNode: HDNode): RootKeySet {
    return {
      ...this._deriveKeySet(hdNode),
      managementKey: hdNode.derivePath('1'),
    }
  }

  _deriveSpaceKeys(space: string): void {
    const spaceHash = sha256(`${space}.3box`)
    // convert hash to path
    const spacePath = spaceHash
      .match(/.{1,12}/g) // chunk hex string
      ?.map((n) => parseInt(n, 16).toString(2)) // convert to binary
      .map((n) => `${n.length === 47 ? '0' : ''}${n}`) // make sure that binary strings have the right length
      .join('')
      .match(/.{1,31}/g) // chunk binary string for path encoding
      ?.map((n) => parseInt(n, 2))
      .join("'/") // convert to uints and create path
    const spaceNode = this._baseNode!.derivePath(`${spacePath!}'`)
    this._spaceKeys[space] = this._deriveKeySet(spaceNode)
  }

  _getKeys(space?: string): KeySet {
    if (!space) {
      return this._rootKeys as KeySet
    } else if (!this._spaceKeys[space]) {
      // only hold during partial migration, otherwise will derive on demand
      if (this._migratedKeys)
        throw new Error('Can not derive space keys, not given in migrated keys')
      this._deriveSpaceKeys(space)
    }
    return this._spaceKeys[space]
  }

  asymEncrypt(
    msg: string | Uint8Array,
    toPublic: string,
    { nonce }: { nonce?: Uint8Array } = {}
  ): AsymEncryptedMessage {
    return asymEncrypt(msg, toPublic, nonce)
  }

  asymDecrypt(
    ciphertext: string,
    fromPublic: string,
    nonce: string,
    { space }: DecryptOptions = {}
  ): string | null {
    const key = this._getKeys(space).asymEncryptionKey.secretKey
    return asymDecrypt(ciphertext, fromPublic, key, nonce)
  }

  symEncrypt(
    msg: string | Uint8Array,
    { space, nonce }: { space?: string; nonce?: Uint8Array } = {}
  ): EncryptedMessage {
    return symEncryptBase(msg, this._getKeys(space).symEncryptionKey, nonce)
  }

  symDecrypt(ciphertext: string, nonce: string, { space }: DecryptOptions = {}): string | null {
    return symDecryptBase(ciphertext, this._getKeys(space).symEncryptionKey, nonce)
  }

  async managementPersonalSign(message: ArrayLike<number> | string): Promise<string> {
    const wallet = this.managementWallet()
    return await wallet.signMessage(message)
  }

  managementWallet(): Wallet {
    const node = this._rootKeys!.managementKey as HDNode
    return new Wallet(node.privateKey)
  }

  getJWTSigner(space?: string, useMgmt?: boolean): Signer {
    const pubkeys = this._getKeys(space)
    const key = useMgmt ? (pubkeys as RootKeySet).managementKey : pubkeys.signingKey
    return EllipticSigner((key as HDNode).privateKey.slice(2))
  }

  getSigner(keyId?: string): Signer {
    const key = keyId === 'management' ? this._rootKeys?.managementKey : this._rootKeys?.signingKey
    if (key == null || !(key instanceof HDNode)) {
      throw new Error('Invalid key')
    }
    return EllipticSigner(key.privateKey.slice(2))
  }

  getDBSalt(space?: string): string {
    return sha256(this._getKeys(space).signingKey.derivePath('0').privateKey.slice(2))
  }

  getPublicKeys({
    space,
    uncompressed,
    mgmtPub,
    useMulticodec,
  }: {
    space?: string
    uncompressed?: boolean
    mgmtPub?: boolean
    useMulticodec?: boolean
  } = {}): PublicKeys {
    const keys = this._getKeys(space)
    let signingKey = keys.signingKey.publicKey.slice(2)
    const managementKey = space
      ? null
      : mgmtPub && (keys as RootKeySet).managementKey.publicKey
      ? (keys as RootKeySet).managementKey.publicKey!.slice(2)
      : (keys as RootKeySet).managementKey.address
    if (uncompressed) {
      signingKey = ec.keyFromPublic(Buffer.from(signingKey, 'hex')).getPublic(false, 'hex')
    }
    return {
      signingKey: useMulticodec ? encodeKey(hexToU8A(signingKey), 'secp256k1') : signingKey,
      managementKey: useMulticodec
        ? encodeKey(hexToU8A(managementKey as string), 'secp256k1')
        : managementKey,
      asymEncryptionKey: useMulticodec
        ? encodeKey(keys.asymEncryptionKey.publicKey, 'x25519')
        : naclutil.encodeBase64(keys.asymEncryptionKey.publicKey),
    }
  }

  serialize(): string | undefined {
    return this._seed
  }

  static authSecretToKeyPair(authSecret: Uint8Array): BoxKeyPair {
    const node = HDNode.fromSeed(authSecret).derivePath(AUTH_PATH_ASYM_ENCRYPTION)
    return nacl.box.keyPair.fromSecretKey(hexToU8A(node.privateKey.slice(2)))
  }

  static authSecretToWallet(authSecret: Uint8Array): Wallet {
    const node = HDNode.fromSeed(authSecret).derivePath(AUTH_PATH_WALLET)
    return new Wallet(node.privateKey)
  }

  static symDecryptWithAuthSecret(
    ciphertext: string,
    nonce: string,
    authSecret: string
  ): string | null {
    const node = HDNode.fromSeed(ensure0x(authSecret)).derivePath(AUTH_PATH_ENCRYPTION)
    const key = hexToU8A(node.privateKey.slice(2))
    return symDecryptBase(ciphertext, key, nonce)
  }

  static symEncryptWithAuthSecret(message: string | Uint8Array, authSecret: string): EncryptedMessage {
    const node = HDNode.fromSeed(ensure0x(authSecret)).derivePath(AUTH_PATH_ENCRYPTION)
    const key = hexToU8A(node.privateKey.slice(2))
    return symEncryptBase(message, key)
  }
}
