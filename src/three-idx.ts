import { CeramicApi, Doctype, CeramicRecord } from '@ceramicnetwork/common'
import { TileDoctype } from '@ceramicnetwork/doctype-tile'
import CeramicClient from '@ceramicnetwork/http-client'
import { schemas, definitions } from '@ceramicstudio/idx-constants'
import CID from 'cids'

import type { DidProvider } from './did-provider'
import type { ThreeIdState } from './keyring'
import type { DID } from 'dids'
import type { JWE } from 'did-jwt'
import type DocID from '@ceramicnetwork/docid'

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
  data: EncData
  id: EncData
  //linkDoc: string
  //pub: string // base58 multicodec x25519 public key
}

interface AuthMap {
  [did: string]: AuthEntry
}

export interface NewAuthEntry {
  mapEntry: AuthMap
  did: DID
}

interface AuthLinkDocUpdate {
  record: CeramicRecord
  docid: DocID
  did: string
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
    return docId ? (docId.commit as CID).toString() : '0'
  }

  async loadDoc(name: string, controller: string, family: string): Promise<void> {
    this.docs[name] = await this.ceramic.createDocument(
      'tile',
      { deterministic: true, metadata: { controllers: [controller], family } },
      { anchor: false, publish: false }
    )
  }

  async createAuthLinkUpdate({ did }: NewAuthEntry): Promise<AuthLinkDocUpdate> {
    const didString = did.id
    await this.loadDoc(didString, didString, 'authLink')
    await this.ceramic.pin.add(this.docs[didString].id)
    return {
      record: await TileDoctype._makeRecord(this.docs[didString], did, { did: this.id }),
      docid: this.docs[didString].id,
      did: didString,
    }
  }

  async applyAuthLinkUpdate({ docid, record, did }: AuthLinkDocUpdate): Promise<void> {
    if (this.docs[did].content !== this.id) {
      await this.ceramic.applyRecord(docid, record)
    }
  }

  /**
   * Create a new IDX structure that has a given authEntry in it's keychain.
   */
  async createIDX(newEntry?: NewAuthEntry): Promise<void> {
    const docUpdatePromise = newEntry ? this.createAuthLinkUpdate(newEntry) : Promise.resolve(null)
    // eslint-disable-next-line prettier/prettier
    await Promise.all([
      this.loadDoc(KEYCHAIN_DEF, this.id, KEYCHAIN_DEF),
      this.loadDoc('idx', this.id, IDX),
    ])
    // eslint-disable-next-line prettier/prettier
    await Promise.all([
      this.pinAllDocs(),
      this.updateKeychainDoc(newEntry?.mapEntry),
      this.addKeychainToIDX(),
    ])
    // Only update the link document after the keychain have been updated.
    const docUpdate = await docUpdatePromise
    if (docUpdate) {
      await this.applyAuthLinkUpdate(docUpdate)
    }
  }

  /**
   * Returns the encrypted JWE for the given authLink
   */
  async loadIDX(authDid: string): Promise<EncKeyMaterial | null> {
    await this.loadDoc(authDid, authDid, 'authLink')
    const { did } = this.docs[authDid].content
    if (!did) return null
    // eslint-disable-next-line prettier/prettier
    await Promise.all([
      this.load3IDDoc(did),
      this.loadDoc(KEYCHAIN_DEF, did, KEYCHAIN_DEF),
      this.loadDoc('idx', did, IDX),
    ])
    const { authMap, pastSeeds } = this.docs[KEYCHAIN_DEF].content
    return {
      seed: authMap[authDid]?.data,
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
  async addAuthEntries(newEntries: Array<NewAuthEntry>): Promise<void> {
    const linkDocUpdatesPromise = Promise.all(newEntries.map(this.createAuthLinkUpdate.bind(this)))
    const { authMap, pastSeeds } = this.docs[KEYCHAIN_DEF].content
    const newAuthEntries = newEntries.reduce(
      (acc, { mapEntry }) => Object.assign(acc, mapEntry),
      {}
    )
    Object.assign(authMap, newAuthEntries)
    await this.updateKeychainDoc(authMap, pastSeeds)
    await Promise.all((await linkDocUpdatesPromise).map(this.applyAuthLinkUpdate.bind(this)))
  }

  /**
   * Returns all public keys that is in the auth keychain.
   */
  getAuthMap(): AuthMap {
    if (!this.docs[KEYCHAIN_DEF] || !this.docs[KEYCHAIN_DEF].content.authMap) return {}
    return this.docs[KEYCHAIN_DEF].content.authMap as AuthMap
  }

  async pinAllDocs(): Promise<void> {
    await Promise.all(
      Object.values(this.docs).map(async (doc) => {
        await this.ceramic.pin.add(doc.id)
      })
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

  async updateKeychainDoc(authMap: AuthMap = {}, pastSeeds: Array<JWE> = []): Promise<void> {
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
    authMap: AuthMap
  ): Promise<void> {
    if (!threeIdState.content) throw new Error('Content has to be defined')
    // Rotate keys in 3ID document and update keychain
    await Promise.all([
      this.docs.threeId.change({
        metadata: threeIdState.metadata,
        content: { ...this.docs.threeId.content, publicKeys: threeIdState.content.publicKeys },
      }),
      this.updateKeychainDoc(authMap, pastSeeds),
      this.pinAllDocs(),
    ])
  }
}
