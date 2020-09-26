import type { ThreeIDX, AuthEntry, NewAuthEntry } from './three-idx'
import type { DidProvider } from './did-provider'
import Keyring from './keyring'
import { AsymEncryptedMessage, asymDecrypt, asymEncrypt, randomBytes } from './crypto'
import { encodeKey, fakeEthProvider, u8aToHex } from './utils'

import { createLink } from '3id-blockchain-utils'
import { AccountID } from 'caip'

interface KeychainStatus {
  clean: boolean
  adding: Array<string>
  removing: Array<string>
}

export async function newAuthEntry(
  keyring: Keyring,
  did: string,
  authId: string,
  authSecret: Uint8Array
): Promise<NewAuthEntry> {
  const mainPub = keyring.getPublicKeys().asymEncryptionKey
  const { publicKey } = Keyring.authSecretToKeyPair(authSecret)
  const wallet = Keyring.authSecretToWallet(authSecret)
  const accountId = new AccountID({ address: wallet.address, chainId: 'eip155:1' })
  return {
    pub: encodeKey(publicKey, 'x25519'),
    data: { box: asymEncrypt(keyring.serialize() as string, publicKey) },
    id: { box: asymEncrypt(authId, mainPub) },
    linkProof: await createLink(did, accountId, fakeEthProvider(wallet)),
  }
}

export class Keychain {
  private _pendingAdds: Array<NewAuthEntry> = []
  /**
   * The Keychain enables adding and removing of authentication methods.
   */
  constructor(public _keyring: Keyring, protected _threeIdx: ThreeIDX) {}

  _decryptBox(box: AsymEncryptedMessage): string | null {
    return this._keyring.asymDecrypt(box.ciphertext, box.ephemeralFrom, box.nonce)
  }

  /**
   * List all current authentication methods.
   *
   * @return    {Array<string>}                           A list of authIds.
   */
  list(): Array<string> {
    return this._threeIdx.getAllAuthEntries().map(({ id }: AuthEntry): string => {
      return this._decryptBox(id.box) as string
    })
  }

  /**
   * Add a new authentication method (adds to staging).
   *
   * @param     {String}            authId          An identifier for the auth method
   * @param     {Uint8Array}        authSecret      The authSecret to use, should be of sufficient entropy
   */
  async add(authId: string, authSecret: Uint8Array): Promise<void> {
    this._pendingAdds.push(await newAuthEntry(this._keyring, this._threeIdx.id, authId, authSecret))
  }

  /**
   * Remove an authentication method (adds to staging).
   *
   * @param     {String}            authId          An identifier for the auth method
   */
  async remove(authId: string): Promise<void> { // eslint-disable-line
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
    return {
      clean: !this._pendingAdds.length,
      adding: this._pendingAdds.map((e) => this._decryptBox(e.id.box) as string),
      removing: [],
    }
  }

  /**
   * Commit the staged changes to the keychain.
   */
  async commit(): Promise<void> {
    if (!this._pendingAdds.length) throw new Error('Nothing to commit')
    if (this._threeIdx.getAllAuthEntries().length === 0) {
      // Create IDX structure if not present
      await this._threeIdx.createIDX(this._pendingAdds.pop() as NewAuthEntry)
    }
    if (this._pendingAdds.length) {
      await this._threeIdx.addAuthEntries(this._pendingAdds)
      this._pendingAdds = []
    }
  }

  static async load(
    threeIdx: ThreeIDX,
    authSecret: Uint8Array,
    makeTmpProvider: (keyring: Keyring, managementKey: string) => DidProvider
  ): Promise<Keychain> {
    const { secretKey } = Keyring.authSecretToKeyPair(authSecret)
    const wallet = Keyring.authSecretToWallet(authSecret)
    const accountId = new AccountID({ address: wallet.address.toLowerCase(), chainId: 'eip155:1' })
    const authData = await threeIdx.loadIDX(accountId.toString())
    let keyring
    if (authData) {
      const seed = asymDecrypt(
        authData.box.ciphertext,
        authData.box.ephemeralFrom,
        secretKey,
        authData.box.nonce
      )
      keyring = new Keyring(seed)
    } else {
      const seed = '0x' + u8aToHex(randomBytes(32))
      keyring = new Keyring(seed)
      const pubkeys = keyring.getPublicKeys({ mgmtPub: true, useMulticodec: true })
      await threeIdx.setDIDProvider(makeTmpProvider(keyring, pubkeys.managementKey as string))
      await threeIdx.create3idDoc(pubkeys)
    }
    return new Keychain(keyring, threeIdx)
  }
}
