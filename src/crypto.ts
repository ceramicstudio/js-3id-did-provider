import nacl from 'tweetnacl'
import naclutil from 'tweetnacl-util'

export interface EncryptedMessage {
  ciphertext: string
  nonce: string
}

export interface AsymEncryptedMessage extends EncryptedMessage {
  ephemeralFrom: string
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
): string | null
export function symDecryptBase(
  ciphertext: string,
  symKey: Uint8Array,
  nonce: string,
  toBuffer?: true,
): Buffer | null
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

export function asymEncrypt(
  message: Uint8Array | string,
  toPublic: string,
  providedNonce?: Uint8Array,
): AsymEncryptedMessage {
  const nonce = providedNonce ?? randomNonce()
  const msg =
    typeof message === 'string' ? naclutil.decodeUTF8(message) : message
  const ephemneralKeypair = nacl.box.keyPair()
  const ciphertext = nacl.box(
    msg,
    nonce,
    naclutil.decodeBase64(toPublic),
    ephemneralKeypair.secretKey,
  )
  return {
    nonce: naclutil.encodeBase64(nonce),
    ephemeralFrom: naclutil.encodeBase64(ephemneralKeypair.publicKey),
    ciphertext: naclutil.encodeBase64(ciphertext),
  }
}

export function asymDecrypt(
  ciphertext: string,
  fromPublic: string,
  toSecret: Uint8Array,
  nonce: string,
  toBuffer?: false,
): string | null
export function asymDecrypt(
  ciphertext: string,
  fromPublic: string,
  toSecret: Uint8Array,
  nonce: string,
  toBuffer?: true,
): Buffer | null
export function asymDecrypt(
  ciphertext: string,
  fromPublic: string,
  toSecret: Uint8Array,
  nonce: string,
  toBuffer = false,
) {
  const cleartext = nacl.box.open(
    naclutil.decodeBase64(ciphertext),
    naclutil.decodeBase64(nonce),
    naclutil.decodeBase64(fromPublic),
    toSecret,
  )
  if (cleartext == null) {
    return null
  }
  return toBuffer ? Buffer.from(cleartext) : naclutil.encodeUTF8(cleartext)
}
