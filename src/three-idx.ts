import { CeramicApi, Doctype } from '@ceramicnetwork/ceramic-common'
import CeramicClient from '@ceramicnetwork/ceramic-http-client'
import { schemas } from '@ceramicstudio/idx-constants'
import { LinkProof } from '3id-blockchain-utils'

import type { DidProvider } from './did-provider'
import type { ThreeIdState } from './keyring'
import type { JWE } from 'did-jwt'

// map of collection definitions
const CDefs = {
  // TODO user actual collection definition docs
  authKeychain: 'auth-keychain',
}

export interface EncData {
  jwe?: JWE
}

export interface EncKeyMaterial {
  seed: EncData
  pastSeeds: Array<JWE>
}

export interface AuthEntry {
  pub: string // base58 multicodec x25519 public key
  data: EncData
  id: EncData
}

interface AuthEntryMap {
  [link: string]: AuthEntry
}

export interface NewAuthEntry extends AuthEntry {
  linkProof: LinkProof
}

export class ThreeIDX {
  public docs: Record<string, Doctype>
  public ceramic: CeramicApi

  constructor(ceramic?: CeramicApi) {
    this.ceramic = ceramic || new CeramicClient()
    this.docs = {}
  }

  async setDIDProvider(provider: DidProvider): Promise<void> {
    await this.ceramic.setDIDProvider(provider)
  }

  get id(): string {
    return `did:3:${this.docs.threeId.id.split('//')[1]}`
  }

  async create3idDoc(docParams: Record<string, any>): Promise<void> {
    this.docs.threeId = await this.ceramic.createDocument('tile', docParams, {
      applyOnly: true,
    })
  }

  async get3idVersion(): Promise<string> {
    return (await this.ceramic.listVersions(this.docs.threeId.id)).pop() || '0'
  }

  async createAuthMapEntry(authEntry: NewAuthEntry): Promise<AuthEntryMap> {
    const authLink = authEntry.linkProof.account
    // tmp if statement, can be removed when fix released:
    // https://github.com/ceramicnetwork/js-ceramic/pull/287
    if (!this.docs[authLink]) {
      this.docs[authLink] = await this.ceramic.createDocument(
        'account-link',
        { metadata: { owners: [authLink] } },
        { applyOnly: true }
      )
    }
    await this.docs[authLink].change({ content: authEntry.linkProof })
    await this.ceramic.pin.add(this.docs[authLink].id)
    const tmpEntry = Object.assign({}, authEntry)
    delete tmpEntry.linkProof
    return { [this.docs[authLink].id]: tmpEntry }
  }

  /**
   * Create a new IDX structure that has a given authEntry in it's keychain.
   */
  async createIDX(authEntry?: NewAuthEntry): Promise<void> {
    const entry = authEntry ? await this.createAuthMapEntry(authEntry) : {}
    await this.createKeychainDoc(entry)
    this.docs.idx = await this.ceramic.createDocument('tile', {
      metadata: { owners: [this.id], schema: schemas.IdentityIndex },
      content: { [CDefs.authKeychain]: this.docs[CDefs.authKeychain].id },
    })
    await this.docs.threeId.change({
      content: Object.assign(this.docs.threeId.content, { idx: this.docs.idx.id }),
    })
    await this.pinAllDocs()
  }

  /**
   * Returns the encrypted JWE for the given authLink
   */
  async loadIDX(authLink: string): Promise<EncKeyMaterial | null> {
    this.docs[authLink] = await this.ceramic.createDocument(
      'account-link',
      { metadata: { owners: [authLink] } },
      { applyOnly: true }
    )
    const did = this.docs[authLink].content
    if (!did) return null
    this.docs.threeId = await this.ceramic.loadDocument(`ceramic://${did.split(':')[2] as string}`)
    const idxDocid = this.docs.threeId.content.idx
    if (!idxDocid) return null
    this.docs.idx = await this.ceramic.loadDocument(idxDocid)
    const authKeychainDocid = this.docs.idx.content[CDefs.authKeychain]
    if (!authKeychainDocid) return null
    this.docs[CDefs.authKeychain] = await this.ceramic.loadDocument(authKeychainDocid)
    const linkDocid = this.docs[authLink].id
    const { authMap, pastSeeds } = this.docs[CDefs.authKeychain].content
    return {
      seed: authMap[linkDocid]?.data,
      pastSeeds,
    } as EncKeyMaterial
  }

  /**
   * Adds a new AuthEntries to the Auth keychain.
   */
  async addAuthEntries(authEntries: Array<NewAuthEntry>): Promise<void> {
    const mapEntries = await Promise.all(authEntries.map(this.createAuthMapEntry.bind(this)))
    const content = this.docs[CDefs.authKeychain].content
    const newAuthEntries = mapEntries.reduce((acc, entry) => Object.assign(acc, entry), {})
    Object.assign(content.authMap, newAuthEntries)
    await this.docs[CDefs.authKeychain].change({ content })
  }

  /**
   * Returns all public keys that is in the auth keychain.
   */
  getAllAuthEntries(): Array<AuthEntry> {
    if (!this.docs[CDefs.authKeychain]) return []
    const authMap = this.docs[CDefs.authKeychain].content.authMap
    return Object.keys(authMap).map((authLink: string): AuthEntry => authMap[authLink] as AuthEntry)
  }

  async pinAllDocs(): Promise<void> {
    await Promise.all(
      Object.values(this.docs).map(async (doc) => {
        await this.ceramic.pin.add(doc.id)
      })
    )
  }

  async createKeychainDoc(authMap: AuthEntryMap, pastSeeds: Array<JWE> = []): Promise<void> {
    this.docs[CDefs.authKeychain] = await this.ceramic.createDocument('tile', {
      metadata: { owners: [this.id] },
      content: { authMap, pastSeeds },
    })
  }

  /**
   * Preform a key rotation.
   * Will update the keys in the 3id document, and create a new 3ID keychain
   * with the given authEntries.
   */
  async rotateKeys(
    threeIdState: ThreeIdState,
    pastSeeds: Array<JWE>,
    updatedAuthEntries: Array<AuthEntry>
  ): Promise<void> {
    // Rotate keys in 3ID document
    const promises = [
      this.docs.threeId.change({
        metadata: threeIdState.metadata,
        content: { ...this.docs.threeId.content, publicKeys: threeIdState.content.publicKeys },
      }),
    ]
    // update the authMap
    const oldAuthMap = this.docs[CDefs.authKeychain].content.authMap
    const authMap = Object.keys(oldAuthMap).reduce((authMap: AuthEntryMap, link: string) => {
      const entry = updatedAuthEntries.find((entry) => entry.pub === oldAuthMap[link].pub)
      if (entry) authMap[link] = entry
      return authMap
    }, {})
    // Create a new 3ID keychain document
    await this.createKeychainDoc(authMap, pastSeeds)
    promises.push(this.pinAllDocs())
    // Update IDX to point to new keychain
    promises.push(
      this.docs.idx.change({
        content: Object.assign(this.docs.idx.content, {
          [CDefs.authKeychain]: this.docs[CDefs.authKeychain].id,
        }),
      })
    )
    await Promise.all(promises)
  }
}
