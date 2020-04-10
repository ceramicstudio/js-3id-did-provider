import sha256 from 'js-sha256'
import Multihash from 'multihashes'
import dagCBOR from 'ipld-dag-cbor'

const ENC_BLOCK_SIZE = 24

const pad = (val, blockSize = ENC_BLOCK_SIZE) => {
  const blockDiff = (blockSize - (val.length % blockSize)) % blockSize
  return `${val}${'\0'.repeat(blockDiff)}`
}

const unpad = padded => padded.replace(/\0+$/, '')

const sha256Multihash = str => Multihash.encode(Buffer.from(sha256(str)), 'sha2-256').toString('hex')

let tmpData
const fakeIpfs = {
  dag: {
    put: (data, opts) => {
      tmpData = data
      return dagCBOR.util.cid(dagCBOR.util.serialize(data, opts))
    },
    get: () => ({ value: tmpData })
  },
  add: () => "empty" //used in _initMuport in 3box-js 3id, but muport fingerprint not needed here
}

const fakeEthProvider = wallet => ({
  send: (request, callback) => {
    if (request.method !== 'personal_sign') {
      callback(new Error('only supports personal_sign'))
    } else {
      let message = request.params[0]
      if (message.startsWith('0x')) {
        message = Buffer.from(message.slice(2), 'hex').toString('utf8')
      }
      callback(null, { result: wallet.signMessage(message) })
    }
  }
})

module.exports = {
  pad,
  unpad,
  sha256,
  sha256Multihash,
  fakeIpfs,
  fakeEthProvider
}
