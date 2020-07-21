import DidDocument from 'ipfs-did-document'

import { Keyring } from './did-keyring'
import { fakeIpfs } from './utils'

const DID_METHOD_NAME = '3'

export interface DIDContext {
  DID?: string
  keyring?: Keyring
}

export async function createDID(keyring: Keyring): Promise<string> {
  const pubkeys = keyring.getPublicKeys({ uncompressed: true })
  const doc = new DidDocument(fakeIpfs, DID_METHOD_NAME)
  doc.addPublicKey(
    'signingKey',
    'Secp256k1VerificationKey2018',
    'publicKeyHex',
    pubkeys.signingKey,
  )
  doc.addPublicKey(
    'encryptionKey',
    'Curve25519EncryptionPublicKey',
    'publicKeyBase64',
    pubkeys.asymEncryptionKey,
  )
  doc.addPublicKey(
    'managementKey',
    'Secp256k1VerificationKey2018',
    'ethereumAddress',
    pubkeys.managementKey,
  )
  doc.addAuthentication('Secp256k1SignatureAuthentication2018', 'signingKey')
  await doc.commit({ noTimestamp: true })
  return doc.DID
}

export const methods = {
  did_authenticate: async (ctx: DIDContext) => {
    if (ctx.DID == null) {
      if (ctx.keyring == null) {
        ctx.keyring = Keyring.create()
      }
      ctx.DID = await createDID(ctx.keyring)
    }
    return { did: ctx.DID }
  },
  did_createJWS: async () => {
    throw new Error('Not implemented')
  },
}
