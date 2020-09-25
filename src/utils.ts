import { hash } from '@stablelib/sha256'
import Multihash from 'multihashes'
import { Wallet } from '@ethersproject/wallet'
import stringify from 'fast-json-stable-stringify'
import * as u8a from 'uint8arrays'
import dagCBOR from 'ipld-dag-cbor'
import multihashes from 'multihashes'
import CID from 'cids'

const ENC_BLOCK_SIZE = 24
const PAD_FIRST_BYTE = 128
const DAG_CBOR_CODE = 133
const ID_MULTIHASH = 0

export interface PublicKeys {
  signingKey: string
  managementKey: string | null
  asymEncryptionKey: string
}

export const pad = (val: string, blockSize = ENC_BLOCK_SIZE): string => {
  const blockDiff = (blockSize - (val.length % blockSize)) % blockSize
  return `${val}${'\0'.repeat(blockDiff)}`
}

export const unpad = (padded: string): string => padded.replace(/\0+$/, '')

export const sha256Multihash = (s: string): string => {
  return u8a.toString(Multihash.encode(hash(u8a.fromString(s)), 'sha2-256'), 'base16')
}

const multicodecPubkeyTable: Record<string, number> = {
  secp256k1: 0xe7,
  x25519: 0xec,
  ed25519: 0xed,
}

export function encodeKey(key: Uint8Array, keyType: string): string {
  const bytes = new Uint8Array(key.length + 2)
  if (!multicodecPubkeyTable[keyType]) {
    throw new Error(`Key type "${keyType}" not supported.`)
  }
  bytes[0] = multicodecPubkeyTable[keyType]
  // The multicodec is encoded as a varint so we need to add this.
  // See js-multicodec for a general implementation
  bytes[1] = 0x01
  bytes.set(key, 2)
  return `z${u8a.toString(bytes, 'base58btc')}`
}

export const fakeEthProvider = (wallet: Wallet): any => ({
  send: (
    request: { method: string; params: Array<any> },
    callback: (err: Error | null | undefined, res?: any) => void
  ) => {
    if (request.method !== 'personal_sign') {
      callback(new Error('only supports personal_sign'))
    } else {
      let message = request.params[0] as string
      if (message.startsWith('0x')) {
        message = Buffer.from(message.slice(2), 'hex').toString('utf8')
      }
      callback(null, { result: wallet.signMessage(message) })
    }
  },
})

export function decodeJWEData(bytes: Uint8Array): Record<string, any> {
  bytes = bytes.slice(0, bytes.lastIndexOf(PAD_FIRST_BYTE))
  const cid = new CID(bytes)
  CID.validateCID(cid)
  if (cid.code !== DAG_CBOR_CODE) throw new Error('Cleartext codec must be dag-cbor')
  const { code, digest } = multihashes.decode(cid.multihash)
  if (code !== ID_MULTIHASH) throw new Error('Cleartext must be identity multihash')
  return dagCBOR.util.deserialize(digest)
}

export function hexToU8A(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, 'hex'))
}

export function encodeBase64(b: Uint8Array): string {
  return u8a.toString(b, 'base64pad')
}

export function toStableObject(obj: Record<string, any>): Record<string, any> {
  return JSON.parse(stringify(obj)) as Record<string, any>
}
