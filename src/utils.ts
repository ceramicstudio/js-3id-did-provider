import { Wallet } from '@ethersproject/wallet'
import stringify from 'fast-json-stable-stringify'
import * as u8a from 'uint8arrays'

const B16 = 'base16'
const B64 = 'base64pad'

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
        message = u8a.toString(hexToU8A(message.slice(2)))
      }
      callback(null, { result: wallet.signMessage(message) })
    }
  },
})

export function hexToU8A(s: string): Uint8Array {
  return u8a.fromString(s, B16)
}

export function u8aToHex(b: Uint8Array): string {
  return u8a.toString(b, B16)
}

export function encodeBase64(b: Uint8Array): string {
  return u8a.toString(b, B64)
}

export function decodeBase64(s: string): Uint8Array {
  return u8a.fromString(s, B64)
}

export function toStableObject(obj: Record<string, any>): Record<string, any> {
  return JSON.parse(stringify(obj)) as Record<string, any>
}
