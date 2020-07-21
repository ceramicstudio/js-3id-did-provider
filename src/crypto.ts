import nacl from 'tweetnacl'
import naclutil from 'tweetnacl-util'

export interface EncryptedMessage {
  ciphertext: string
  nonce: string
}

export function naclRandom(length: number): Uint8Array {
  return nacl.randomBytes(length)
}

export function randomNonce(): Uint8Array {
  return naclRandom(24)
}

export function symEncryptBase(
  message: Uint8Array | string,
  symKey: Uint8Array,
  providedNonce?: Uint8Array,
): EncryptedMessage {
  const nonce = providedNonce ?? randomNonce()
  const msg =
    typeof message === 'string' ? naclutil.decodeUTF8(message) : message
  const ciphertext = nacl.secretbox(msg, nonce, symKey)
  return {
    nonce: naclutil.encodeBase64(nonce),
    ciphertext: naclutil.encodeBase64(ciphertext),
  }
}

export function symDecryptBase(
  ciphertext: string,
  symKey: Uint8Array,
  nonce: string,
  toBuffer?: false,
): string
export function symDecryptBase(
  ciphertext: string,
  symKey: Uint8Array,
  nonce: string,
  toBuffer?: true,
): Buffer
export function symDecryptBase(
  ciphertext: string,
  symKey: Uint8Array,
  nonce: string,
  toBuffer = false,
) {
  const cleartext = nacl.secretbox.open(
    naclutil.decodeBase64(ciphertext),
    naclutil.decodeBase64(nonce),
    symKey,
  )
  if (cleartext == null) {
    return null
  }
  return toBuffer ? Buffer.from(cleartext) : naclutil.encodeUTF8(cleartext)
}
