import { sha256 } from 'js-sha256'
import Multihash from 'multihashes'
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
