import { encodeBase64, decodeBase64 } from './utils'
import * as u8a from 'uint8arrays'
import { box, openBox, secretBox, openSecretBox, generateKeyPair } from '@stablelib/nacl'
import { randomBytes } from '@stablelib/random'
export { randomBytes }

export interface EncryptedMessage {
  ciphertext: string
  nonce: string
}

export interface AsymEncryptedMessage extends EncryptedMessage {
  ephemeralFrom: string
}

export function randomNonce(): Uint8Array {
  return randomBytes(24)
}

export function symEncryptBase(
  message: Uint8Array | string,
  symKey: Uint8Array,
  providedNonce?: Uint8Array
): EncryptedMessage {
  const nonce = providedNonce ?? randomNonce()
  const msg = typeof message === 'string' ? u8a.fromString(message) : message
  const ciphertext = secretBox(symKey, nonce, msg)
  return {
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext),
  }
}

export function symDecryptBase(
  ciphertext: string,
  symKey: Uint8Array,
  nonce: string
): string | null {
  const cleartext = openSecretBox(symKey, decodeBase64(nonce), decodeBase64(ciphertext))
  if (cleartext == null) {
    return null
  }
  return u8a.toString(cleartext)
}

export function asymEncrypt(
  message: Uint8Array | string,
  toPublic: Uint8Array | string,
  providedNonce?: Uint8Array
): AsymEncryptedMessage {
  const nonce = providedNonce ?? randomNonce()
  const msg = typeof message === 'string' ? u8a.fromString(message) : message
  const ephemneralKeypair = generateKeyPair()
  const ciphertext = box(
    typeof toPublic === 'string' ? decodeBase64(toPublic) : toPublic,
    ephemneralKeypair.secretKey,
    nonce,
    msg
  )
  return {
    nonce: encodeBase64(nonce),
    ephemeralFrom: encodeBase64(ephemneralKeypair.publicKey),
    ciphertext: encodeBase64(ciphertext),
  }
}

export function asymDecrypt(
  ciphertext: string,
  fromPublic: string,
  toSecret: Uint8Array,
  nonce: string
): string | null {
  const cleartext = openBox(
    decodeBase64(fromPublic),
    toSecret,
    decodeBase64(nonce),
    decodeBase64(ciphertext)
  )
  if (cleartext == null) {
    return null
  }
  return u8a.toString(cleartext)
}
