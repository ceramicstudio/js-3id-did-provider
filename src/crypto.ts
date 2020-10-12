import { randomBytes } from '@stablelib/random'
export { randomBytes }
import {
  createJWE,
  decryptJWE,
  JWE,
  Encrypter,
  Decrypter,
  x25519Encrypter,
  x25519Decrypter,
} from 'did-jwt'
import { prepareCleartext, decodeCleartext } from 'dag-jose-utils'

interface EncryptOpts {
  publicKey?: Uint8Array
  encrypter?: Encrypter
  kid?: string
}

function isU8a(b: Uint8Array | undefined): b is Uint8Array {
  return b instanceof Uint8Array
}

export async function asymEncryptJWE(
  cleartext: Record<string, any>,
  { publicKey, encrypter, kid }: EncryptOpts
): Promise<JWE> {
  if (!encrypter) {
    if (!isU8a(publicKey)) throw new Error('publicKey or encrypter has to be defined')
    encrypter = x25519Encrypter(publicKey, kid)
  }
  return createJWE(prepareCleartext(cleartext), [encrypter])
}

interface DecryptOpts {
  secretKey?: Uint8Array
  decrypter?: Decrypter
}

export async function asymDecryptJWE(
  jwe: JWE,
  { secretKey, decrypter }: DecryptOpts
): Promise<Record<string, any>> {
  if (!decrypter) {
    if (!isU8a(secretKey)) throw new Error('secretKey or decrypter has to be defined')
    decrypter = x25519Decrypter(secretKey)
  }
  return decodeCleartext(await decryptJWE(jwe, decrypter))
}

interface Recipient {
  header: Record<string, string>
}

export function parseJWEKids(jwe: JWE): Array<string> {
  return (jwe.recipients || []).reduce((kids: Array<string>, recipient: Recipient) => {
    if (recipient.header?.kid) kids.push(recipient.header.kid.split('#')[1])
    return kids
  }, [])
}
