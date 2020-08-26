import Keyring from './keyring'
import { ThreeIDX, AuthEntry } from './keyring'
import {
  AsymEncryptedMessage,
  EncryptedMessage,
  asymDecrypt,
  asymEncrypt,
} from './crypto'
import { PublicKeys, encodeKey, hexToU8A } from './utils'

import { createLink } from '3id-blockchain-utils'
import { AccountID } from 'caip'

export class Keychain {
  /**
   * Create an instance of the keychain
   */
  constructor(
    protected _keyring: Keyring,
    protected _threeIdx: ThreeIDX
  ) {}

  async list(): Promise<Array<string>> {
    return (await this._threeIdx.getAllAuthEntries()).map(({ }: AuthEntry): string => {
      return this._keyring.asymDecrypt(entry.ciphertext, entry.ephemeralFrom, entry.nonce)
    })
  }

  async add(authId: string, authSecret: Uint8Array): Promise<void> {
    const mainPub = this._keyring.getPublicKeys().asymEncryptionKey
    const { publicKey } = Keyring.authSecretToKeyPair(authSecret)
    const wallet = Keyring.authSecretToWallet(authSecret)
    const accountId = new AccountID({ address: wallet.address, chainId: 'eip155:1' })
    const authEntry = {
      pub: encodeKey(publicKey, 'x25519')
      data: asymEncrypt(this._keyring.serialize(), publicKey)
      id: asymEncrypt(authId, mainPub)
      linkProof: await createLink(this._threeIdx.DID, accountId, fakeEthProvider(wallet))
    }
    await this._threeIdx.addAuthEntry(authEntry)
  }

  async remove(authId: string): Promise<void> {
    throw new Error('Not implmeented yet')
  }
}
