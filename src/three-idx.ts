import { CeramicApi, Doctype } from '@ceramicnetwork/common'
import CeramicClient from '@ceramicnetwork/http-client'
import { schemas, definitions } from '@ceramicstudio/idx-constants'
import { LinkProof } from '3id-blockchain-utils'
import CID from 'cids'

import type { DidProvider } from './did-provider'
import type { ThreeIdState } from './keyring'
import type { JWE } from 'did-jwt'

const KEYCHAIN_DEF = definitions.threeIdKeychain
const IDX = 'IDX'
const { IdentityIndex, ThreeIdKeychain } = schemas

const isLegacyDid = (didId: string): boolean => {
  try {
    new CID(didId)
    return true
  } catch (e) {
    return false
  }
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

export interface TempAuthEntry extends AuthEntry {
  linkProof?: LinkProof
}

export class ThreeIDX {
  public docs: Record<string, Doctype>
  public ceramic: CeramicApi
  protected _v03ID?: string

  constructor(ceramic?: CeramicApi) {
    this.ceramic = ceramic || new CeramicClient()
    this.docs = {}
  }

  async setDIDProvider(provider: DidProvider): Promise<void> {
    await this.ceramic.setDIDProvider(provider)
  }

  setV03ID(did: string): void {
    this._v03ID = did
  }

  get id(): string {
    return this._v03ID || `did:3:${this.docs.threeId.id.baseID.toString()}`
  }

  async create3idDoc(docParams: Record<string, any>): Promise<void> {
    this.docs.threeId = await this.ceramic.createDocument('tile', docParams, {
      anchor: false,
      publish: false,
    })
  }

  get3idVersion(): string {
    const docId = this.docs.threeId.anchorCommitIds.pop()
    return docId ? docId.commit.toString() : '0'
  }

  async createAuthMapEntry(authEntry: NewAuthEntry): Promise<AuthEntryMap> {
    const authLink = authEntry.linkProof.account
    this.docs[authLink] = await this.ceramic.createDocument(
      'caip10-link',
      { metadata: { controllers: [authLink] } },
      { anchor: false, publish: false }
    )
    await this.docs[authLink].change({ content: authEntry.linkProof })
    await this.ceramic.pin.add(this.docs[authLink].id)
    const tmpEntry: TempAuthEntry = Object.assign({}, authEntry)
    delete tmpEntry.linkProof
    return { [this.docs[authLink].id.baseID.toString()]: tmpEntry }
  }

  /**
   * Create a new IDX structure that has a given authEntry in it's keychain.
   */
  async createIDX(authEntry?: NewAuthEntry): Promise<void> {
    const entry = authEntry ? await this.createAuthMapEntry(authEntry) : {}
    // eslint-disable-next-line prettier/prettier
    await Promise.all([
      this.loadKeychainDoc(this.id),
      this.loadIDXDoc(this.id)
    ])
    // eslint-disable-next-line prettier/prettier
    await Promise.all([
      this.pinAllDocs(),
      this.updateKeychainDoc(entry),
      this.addKeychainToIDX()
    ])
  }

  /**
   * Returns the encrypted JWE for the given authLink
   */
  async loadIDX(authLink: string): Promise<EncKeyMaterial | null> {
    this.docs[authLink] = await this.ceramic.createDocument(
      'caip10-link',
      { metadata: { controllers: [authLink] } },
      { anchor: false, publish: false }
    )
    const did = this.docs[authLink].content
    if (!did) return null
    // eslint-disable-next-line prettier/prettier
    await Promise.all([
      this.load3IDDoc(did),
      this.loadKeychainDoc(did),
      this.loadIDXDoc(did),
    ])
    const linkDocid = this.docs[authLink].id.baseID.toString()
    const { authMap, pastSeeds } = this.docs[KEYCHAIN_DEF].content
    return {
      seed: authMap[linkDocid]?.data,
      pastSeeds,
    } as EncKeyMaterial
  }

  async load3IDDoc(did: string): Promise<void> {
    const id = did.split(':')[2]
    if (isLegacyDid(id)) {
      // we have to load the document later when keys are loaded
      this._v03ID = did
    } else {
      this.docs.threeId = await this.ceramic.loadDocument(id)
    }
  }

  /**
   * Reset the IDX doc structure to a default (mostly empty) state.
   */
  async resetIDX(): Promise<void> {
    if (this.docs.idx == null) {
      throw new Error('No IDX doc')
    }
    const update: Record<string, any> = {
      content: { [KEYCHAIN_DEF]: this.docs[KEYCHAIN_DEF].id.toUrl() },
    }
    if (!this.docs.idx.metadata.schema) {
      update.metadata = { schema: IdentityIndex }
    }
    await this.docs.idx.change(update)
  }

  /**
   * Adds a new AuthEntries to the Auth keychain.
   */
  async addAuthEntries(authEntries: Array<NewAuthEntry>): Promise<void> {
    const mapEntries = await Promise.all(authEntries.map(this.createAuthMapEntry.bind(this)))
    const { authMap, pastSeeds } = this.docs[KEYCHAIN_DEF].content
    const newAuthEntries = mapEntries.reduce((acc, entry) => Object.assign(acc, entry), {})
    Object.assign(authMap, newAuthEntries)
    await this.updateKeychainDoc(authMap, pastSeeds)
  }

  /**
   * Returns all public keys that is in the auth keychain.
   */
  getAllAuthEntries(): Array<AuthEntry> {
    if (!this.docs[KEYCHAIN_DEF] || !this.docs[KEYCHAIN_DEF].content.authMap) return []
    const authMap = this.docs[KEYCHAIN_DEF].content.authMap
    return Object.values(authMap)
  }

  async pinAllDocs(): Promise<void> {
    await Promise.all(
      Object.values(this.docs).map(async (doc) => {
        await this.ceramic.pin.add(doc.id)
      })
    )
  }

  async loadIDXDoc(did: string): Promise<void> {
    this.docs.idx = await this.ceramic.createDocument(
      'tile',
      { deterministic: true, metadata: { controllers: [did], family: IDX } },
      { anchor: false, publish: false }
    )
  }

  async addKeychainToIDX(): Promise<void> {
    const content = this.docs.idx.content
    if (!content || !content[KEYCHAIN_DEF]) {
      const update: Record<string, any> = {
        content: Object.assign(content || {}, {
          [KEYCHAIN_DEF]: this.docs[KEYCHAIN_DEF].id.toUrl(),
        }),
      }
      if (!this.docs.idx.metadata.schema) {
        update.metadata = { schema: IdentityIndex }
      }
      await this.docs.idx.change(update)
    }
  }

  async loadKeychainDoc(did: string): Promise<void> {
    this.docs[KEYCHAIN_DEF] = await this.ceramic.createDocument(
      'tile',
      { deterministic: true, metadata: { controllers: [did], family: KEYCHAIN_DEF } },
      { anchor: false, publish: false }
    )
  }

  async updateKeychainDoc(authMap: AuthEntryMap, pastSeeds: Array<JWE> = []): Promise<void> {
    if (Object.keys(authMap).length !== 0) {
      const update: Record<string, any> = { content: { authMap, pastSeeds } }
      if (!this.docs[KEYCHAIN_DEF].metadata.schema) {
        update.metadata = { schema: ThreeIdKeychain }
      }
      await this.docs[KEYCHAIN_DEF].change(update)
    }
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
    if (!threeIdState.content) throw new Error('Content has to be defined')
    // Rotate keys in 3ID document
    const promises = [
      this.docs.threeId.change({
        metadata: threeIdState.metadata,
        content: { ...this.docs.threeId.content, publicKeys: threeIdState.content.publicKeys },
      }),
    ]
    // update the authMap
    const oldAuthMap = this.docs[KEYCHAIN_DEF].content.authMap
    const authMap = Object.keys(oldAuthMap).reduce((authMap: AuthEntryMap, link: string) => {
      const entry = updatedAuthEntries.find((entry) => entry.pub === oldAuthMap[link].pub)
      if (entry) authMap[link] = entry
      return authMap
    }, {})
    promises.push(this.updateKeychainDoc(authMap, pastSeeds))
    promises.push(this.pinAllDocs())
    await Promise.all(promises)
  }
}
