import crypto from 'crypto'
import Multihash from 'multihashes'

const ENC_BLOCK_SIZE = 24

const pad = (val, blockSize = ENC_BLOCK_SIZE) => {
  const blockDiff = (blockSize - (val.length % blockSize)) % blockSize
  return `${val}${'\0'.repeat(blockDiff)}`
}

const unpad = padded => padded.replace(/\0+$/, '')

const sha256 = msg => crypto.createHash('sha256').update(msg).digest('hex')

const sha256Multihash = str => Multihash.encode(Buffer.from(sha256(str)), 'sha2-256').toString('hex')

module.exports = {
  pad,
  unpad,
  sha256,
  sha256Multihash
}
