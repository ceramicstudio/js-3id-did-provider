import { sha256 } from 'js-sha256'
import Multihash from 'multihashes'
import naclutil from 'tweetnacl-util'
import bs58 from 'bs58'
import dagCBOR from 'ipld-dag-cbor'
import { Wallet } from '@ethersproject/wallet'
import stringify from 'fast-json-stable-stringify'

const ENC_BLOCK_SIZE = 24

export const pad = (val: string, blockSize = ENC_BLOCK_SIZE): string => {
  const blockDiff = (blockSize - (val.length % blockSize)) % blockSize
  return `${val}${'\0'.repeat(blockDiff)}`
}

export const unpad = (padded: string): string => padded.replace(/\0+$/, '')

export const sha256Multihash = (str: string): string => {
  return Multihash.encode(Buffer.from(sha256(str)), 'sha2-256').toString('hex')
}

const multicodecPubkeyTable = {
  'secp256k1': 0xe7,
  'x25519': 0xec,
  'ed25519': 0xed
}

function encodeKey(key: Uint8Array, keyType: string) {
  const buf = new Uint8Array(key.length + 2)
  if (!multicodecPubkeyTable[keyType]) {
    throw new Error(`Key type "${keyType}" not supported.`)
  }
  buf[0] = multicodecPubkeyTable[keyType]
  // The multicodec is encoded as a varint so we need to add this.
  // See js-multicodec for a general implementation
  buf[1] = 0x01
  buf.set(key, 2)
  return `z${bs58.encode(buf)}`
}

export const gen3IDgenesis = (pubkeys: any): any => {
  return {
    metadata: {
      owners: [encodeKey(hexToUint8Array(pubkeys.managementKey), 'secp256k1')],
    },
    content: {
      publicKeys: {
        signing: encodeKey(hexToUint8Array(pubkeys.signingKey), 'secp256k1'),
        encryption: encodeKey(naclutil.decodeBase64(pubkeys.asymEncryptionKey), 'x25519')
      }
    }
  }
}

let tmpData: any
export const fakeIpfs = {
  dag: {
    put: (data: any, opts: dagCBOR.UserOptions) => {
      tmpData = data
      return dagCBOR.util.cid(dagCBOR.util.serialize(data), opts)
    },
    get: () => ({ value: tmpData }),
  },
  add: () => 'empty', // used in _initMuport in 3box-js 3id, but muport fingerprint not needed here
}

export const fakeEthProvider = (wallet: Wallet) => ({
  send: (
    request: { method: string; params: Array<any> },
    callback: (err: Error | null | undefined, res?: any) => void
  ) => {
    if (request.method !== 'personal_sign') {
      callback(new Error('only supports personal_sign'))
    } else {
      let message = request.params[0]
      if (message.startsWith('0x')) {
        message = Buffer.from(message.slice(2), 'hex').toString('utf8')
      }
      callback(null, { result: wallet.signMessage(message) })
    }
  },
})

export function hexToUint8Array(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, 'hex'))
}

export function toStableObject(obj: any): any {
  return JSON.parse(stringify(obj))
}
