import * as u8a from 'uint8arrays'
import { randomBytes } from '@stablelib/random'
export { randomBytes }
import {
  createJWE,
  decryptJWE,
  JWE,
  Encrypter,
  Decrypter,
  x25519Encrypter,
  x25519Decrypter
} from 'did-jwt'
import { prepareCleartext, decodeCleartext } from 'dag-jose-utils'

export async function asymEncryptJWE(
  cleartext: Record<string, any>,
  publicKey: Uint8Array,
  encrypter?: Encrypter
): Promise<JWE> {
  if (!encrypter) encrypter = x25519Encrypter(publicKey)
  return createJWE(prepareCleartext(cleartext), [encrypter])
}

export async function asymDecryptJWE(
  jwe: JWE,
  secretKey: Uint8Array,
  decrypter?: Decrypter
): Promise<Record<string, any>> {
  if (!decrypter) decrypter = x25519Decrypter(secretKey)
  return decodeCleartext(await decryptJWE(jwe, decrypter))
}
