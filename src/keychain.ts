import Keyring from './keyring'
import { ThreeIDX, AuthEntry } from './keyring'
import {
  AsymEncryptedMessage,
  EncryptedMessage,
  asymDecrypt,
  asymEncrypt,
} from './crypto'
import { PublicKeys, encodeKey, hexToU8A, fakeEthProvider } from './utils'

import { createLink } from '3id-blockchain-utils'
import { AccountID } from 'caip'

interface KeychainStatus {
  clean: boolean
  adding: Array<string>
  removing: Array<string>
}

export class Keychain {
  /**
   * Create an instance of the keychain
   */
  constructor(
    protected _keyring: Keyring,
    protected _threeIdx: ThreeIDX
  ) {}

  /**
   * List all current authentication methods.
   *
   * @return    {Array<string>}                           A list of authIds.
   */
  async list(): Promise<Array<string>> {
    return (await this._threeIdx.getAllAuthEntries()).map(({ }: AuthEntry): string => {
      return this._keyring.asymDecrypt(entry.ciphertext, entry.ephemeralFrom, entry.nonce)
    })
  }

  /**
   * Add a new authentication method (adds to staging).
   *
   * @param     {String}            authId          An identifier for the auth method
   * @param     {Uint8Array}        authSecret      The authSecret to use, should be of sufficient entropy
   */
  async add(authId: string, authSecret: Uint8Array): Promise<void> {
    const mainPub = this._keyring.getPublicKeys().asymEncryptionKey
    const { publicKey } = Keyring.authSecretToKeyPair(authSecret)
    const wallet = Keyring.authSecretToWallet(authSecret)
    const accountId = new AccountID({ address: wallet.address, chainId: 'eip155:1' })
    const authEntry = {
      pub: encodeKey(publicKey, 'x25519'),
      data: asymEncrypt(this._keyring.serialize(), publicKey),
      id: asymEncrypt(authId, mainPub),
      linkProof: await createLink(this._threeIdx.DID, accountId, fakeEthProvider(wallet)),
    }
    await this._threeIdx.addAuthEntry(authEntry)
  }

  /**
   * Remove an authentication method (adds to staging).
   *
   * @param     {String}            authId          An identifier for the auth method
   */
  async remove(authId: string): Promise<void> {
    throw new Error('Not implmeented yet')
  }

  /**
   * Show the staging status of the keychain.
   * Since removing auth methods will rotate the keys of the 3ID its a good idea
   * to remove multiple auth methods at once if desired. Therefore we introduce
   * a commit pattern to do multiple updates to the keychain at once.
   *
   * @return    {KeychainStatus}                    Object that states the staging status of the keychain
   */
  status(): KeychainStatus {
  }

  /**
   * Commit the staged changes to the keychain.
   */
  async commit(): Promise<void> {
  }

  static async load(threeIdx: ThreeIDX, authSecret: Uint8Array): Promise<Keychain> {
    const { secretKey } = Keyring.authSecretToKeyPair(authSecret)
    const wallet = Keyring.authSecretToWallet(authSecret)
    const accountId = new AccountID({ address: wallet.address, chainId: 'eip155:1' })
    const authData = await threeIdx.loadIDX(accountId.toString())
    if (!authData) {
      // create seed, 3id, and IDX
    } else {
    }
    const seed = asymDecrypt(
      authData.box.ciphertext,
      authData.box.ephemeralFrom,
      secretKey,
      authData.box.nonce,
    )
    const keyring = new Keyring(seed)
    return new Keychain(keyring, threeIdx)
  }
}
