import type { ThreeIDX, AuthEntry, NewAuthEntry, EncData } from './three-idx'
import type { DidProvider } from './did-provider'
import Keyring, { LATEST } from './keyring'
import { asymDecryptJWE, asymEncryptJWE, parseJWEKids } from './crypto'
import { encodeKey, decodeKey, fakeEthProvider } from './utils'

import { createLink } from '3id-blockchain-utils'
import { AccountID } from 'caip'

async function decryptAuthId(encrypted: EncData, keyring: Keyring): Promise<string> {
  if (!encrypted.jwe) throw new Error('Invalid encrypted block')
  const decrypter = keyring.getAsymDecrypter(parseJWEKids(encrypted.jwe))
  const decrypted = await asymDecryptJWE(encrypted.jwe, { decrypter })
  return decrypted.id as string
}

export async function newAuthEntry(
  keyring: Keyring,
  did: string,
  authId: string,
  authSecret: Uint8Array
): Promise<NewAuthEntry> {
  const mainPub = keyring.getEncryptionPublicKey()
  const mainKid = `${did}#${keyring.getKeyFragment(LATEST, true)}`
  const { publicKey } = Keyring.authSecretToKeyPair(authSecret)
  const wallet = Keyring.authSecretToWallet(authSecret)
  const accountId = new AccountID({ address: wallet.address, chainId: 'eip155:1' })
  const cleartext: Record<string, any> = { seed: keyring.seed }
  // If we have a legacy seed v03ID will be defined
  if (keyring.v03ID) cleartext.v03ID = keyring.v03ID
  const resolvedPromises = await Promise.all([
    asymEncryptJWE(cleartext, { publicKey }),
    asymEncryptJWE({ id: authId }, { publicKey: mainPub, kid: mainKid }),
    createLink(did, accountId, fakeEthProvider(wallet)),
  ])
  return {
    pub: encodeKey(publicKey, 'x25519'),
    data: { jwe: resolvedPromises[0] },
    id: { jwe: resolvedPromises[1] },
    linkProof: resolvedPromises[2],
  }
}

export async function updateAuthEntry(
  keyring: Keyring,
  authEntry: AuthEntry,
  removedAuthIds: Array<string>,
  did: string
): Promise<AuthEntry | null> {
  const mainPub = keyring.getEncryptionPublicKey()
  const mainKid = `${did}#${keyring.getKeyFragment(LATEST, true)}`
  const publicKey = decodeKey(authEntry.pub)
  const authId = await decryptAuthId(authEntry.id, keyring)
  // Return null if auth entry should be removed
  if (removedAuthIds.find((id) => id === authId)) return null
  const jwes = await Promise.all([
    asymEncryptJWE({ seed: keyring.seed }, { publicKey }),
    asymEncryptJWE({ id: authId }, { publicKey: mainPub, kid: mainKid }),
  ])
  return Object.assign(authEntry, {
    data: { jwe: jwes[0] },
    id: { jwe: jwes[1] },
  })
}

async function rotateKeys(
  threeIdx: ThreeIDX,
  keyring: Keyring,
  removedAuthIds: Array<string>
): Promise<void> {
  const version = threeIdx.get3idVersion()
  await keyring.generateNewKeys(version)
  const update3idState = keyring.get3idState()
  const pastSeeds = keyring.pastSeeds
  const updatedAuthEntries = (
    await Promise.all(
      threeIdx
        .getAllAuthEntries()
        .map((entry) => updateAuthEntry(keyring, entry, removedAuthIds, threeIdx.id))
    )
  ).filter(Boolean) as Array<AuthEntry> // filter removes null entires
  await threeIdx.rotateKeys(update3idState, pastSeeds, updatedAuthEntries)
}

interface PendingAdd {
  authId: string
  entry: NewAuthEntry
}

interface KeychainStatus {
  clean: boolean
  adding: Array<string>
  removing: Array<string>
}

export class Keychain {
  private _pendingAdds: Array<PendingAdd> = []
  private _pendingRms: Array<string> = []
  /**
   * The Keychain enables adding and removing of authentication methods.
   */
  constructor(public _keyring: Keyring, protected _threeIdx: ThreeIDX) {}

  /**
   * List all current authentication methods.
   *
   * @return    {Array<string>}                           A list of authIds.
   */
  async list(): Promise<Array<string>> {
    return Promise.all(
      this._threeIdx.getAllAuthEntries().map(
        async ({ id }: AuthEntry): Promise<string> => {
          return decryptAuthId(id, this._keyring)
        }
      )
    )
  }

  /**
   * Add a new authentication method (adds to staging).
   *
   * @param     {String}            authId          An identifier for the auth method
   * @param     {Uint8Array}        authSecret      The authSecret to use, should be of sufficient entropy
   */
  async add(authId: string, authSecret: Uint8Array): Promise<void> {
    this._pendingAdds.push({
      authId,
      entry: await newAuthEntry(this._keyring, this._threeIdx.id, authId, authSecret),
    })
  }

  /**
   * Remove an authentication method (adds to staging).
   *
   * @param     {String}            authId          An identifier for the auth method
   */
  async remove(authId: string): Promise<void> { // eslint-disable-line
    this._pendingRms.push(authId)
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
      clean: !(this._pendingAdds.length + this._pendingRms.length),
      adding: this._pendingAdds.map((e) => e.authId),
      removing: this._pendingRms,
    }
  }

  /**
   * Commit the staged changes to the keychain.
   */
  async commit(): Promise<void> {
    if (!this._pendingAdds.length && !this._pendingRms.length) throw new Error('Nothing to commit')
    if (this._threeIdx.getAllAuthEntries().length === 0) {
      if (this._pendingRms.length) throw new Error('Can not remove non-existent auth method')
      if (!this._pendingAdds.length) throw new Error('Can not add non-existent auth method')
      // Create IDX structure if not present
      await this._threeIdx.createIDX(this._pendingAdds.pop()?.entry)
    }
    if (this._pendingRms.length) {
      await rotateKeys(this._threeIdx, this._keyring, this._pendingRms)
      this._pendingRms = []
    }
    if (this._pendingAdds.length) {
      const entries = this._pendingAdds.map((e) => e.entry)
      this._pendingAdds = []
      await this._threeIdx.addAuthEntries(entries)
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
    if (authData) {
      if (!authData.seed?.jwe) throw new Error('Unable to find auth data')
      try {
        const decrypted = await asymDecryptJWE(authData.seed.jwe, { secretKey })
        // If we have a legacy seed v03ID will be defined
        const keyring = new Keyring(new Uint8Array(decrypted.seed), decrypted.v03ID)
        await keyring.loadPastSeeds(authData.pastSeeds)
        // We might have the v03ID in the past seeds, if so we need to create the 3ID documents from the keys
        if (keyring.v03ID) await threeIdx.create3idDoc(keyring.get3idState(true))
        return new Keychain(keyring, threeIdx)
      } catch (e) {
        if (e.message === 'Failed to decrypt') throw new Error('Auth not allowed')
        throw e
      }
    }
    return Keychain.create(threeIdx, makeTmpProvider)
  }

  static async create(
    threeIdx: ThreeIDX,
    makeTmpProvider: (keyring: Keyring, managementKey: string) => DidProvider,
    seed?: Uint8Array,
    v03ID?: string
  ): Promise<Keychain> {
    const keyring = new Keyring(seed, v03ID)
    const docParams = keyring.get3idState(true)
    // Temporarily set DID provider to create 3ID document
    await threeIdx.setDIDProvider(makeTmpProvider(keyring, docParams.metadata.controllers[0]))
    await threeIdx.create3idDoc(docParams)
    if (v03ID) threeIdx.setV03ID(v03ID)
    return new Keychain(keyring, threeIdx)
  }
}
