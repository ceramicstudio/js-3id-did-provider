import { CeramicApi, CeramicCommit, SyncOptions } from '@ceramicnetwork/common'
import { TileDocument } from '@ceramicnetwork/stream-tile'
import CeramicClient from '@ceramicnetwork/http-client'
import { definitions, schemas } from '@ceramicstudio/idx-constants'
import CID from 'cids'
import KeyDidResolver from 'key-did-resolver'
import ThreeIdResolver from '@ceramicnetwork/3id-did-resolver'
import { Resolver } from 'did-resolver'
import { DID } from 'dids'

import type { DidProvider } from './did-provider'
import type { ThreeIdState } from './keyring'
import type { JWE } from 'did-jwt'
import type { StreamID } from '@ceramicnetwork/streamid'

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
}

export interface AuthMap {
  [did: string]: AuthEntry
}

export interface NewAuthEntry {
  mapEntry: AuthMap
  did: DID
}

interface AuthLinkDocUpdate {
  commit: CeramicCommit
  docid: StreamID
  did: string
}

export class ThreeIDX {
  public docs: Record<string, TileDocument>
  public ceramic: CeramicApi
  protected _v03ID?: string

  constructor(ceramic?: CeramicApi) {
    this.ceramic = ceramic || new CeramicClient()
    this.docs = {}
  }

  async setDIDProvider(provider: DidProvider): Promise<void> {
    const keyDidResolver = KeyDidResolver.getResolver()
    const threeIdResolver = ThreeIdResolver.getResolver(this.ceramic)
    const resolver = new Resolver({
      ...threeIdResolver,
      ...keyDidResolver,
    })
    const did = new DID({ provider, resolver })
    await did.authenticate()
    await this.ceramic.setDID(did)
  }

  setV03ID(did: string): void {
    this._v03ID = did
  }

  get id(): string {
    return this._v03ID || `did:3:${this.docs.threeId.id.baseID.toString()}`
  }

  async create3idDoc(docParams: ThreeIdState): Promise<void> {
    this.docs.threeId = await TileDocument.create(
      this.ceramic,
      docParams.content,
      docParams.metadata,
      {
        anchor: false,
        publish: false,
      }
    )
  }

  get3idVersion(): string {
    const anchorCommitIds = this.docs.threeId.anchorCommitIds
    const docId = anchorCommitIds[anchorCommitIds.length - 1]
    return docId ? docId.commit.toString() : '0'
  }

  async loadDoc(name: string, controller: string, family: string): Promise<TileDocument> {
    const stream = await TileDocument.create<Record<string, any>>(
      this.ceramic,
      null,
      { controllers: [controller], family: family, deterministic: true },
      { anchor: false, publish: false }
    )
    this.docs[name] = stream
    return stream
  }

  async createAuthLinkUpdate({ did }: NewAuthEntry): Promise<AuthLinkDocUpdate> {
    const didString = did.id
    const tile = await this.loadDoc(didString, didString, 'authLink')
    await this.ceramic.pin.add(tile.id)
    const commit = await tile.makeCommit({ did }, { did: this.id })
    return {
      commit: commit,
      docid: tile.id,
      did: didString,
    }
  }

  async applyAuthLinkUpdate({ docid, commit, did }: AuthLinkDocUpdate): Promise<void> {
    // @ts-ignore
    if (this.docs[did].content !== this.id) {
      await this.ceramic.applyCommit(docid, commit)
      await this.docs[did].sync()
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
      this.docs.threeId = await this.ceramic.loadStream(id)
    }
  }

  /**
   * Reset the IDX doc structure to a default (mostly empty) state.
   */
  async resetIDX(): Promise<void> {
    if (this.docs.idx == null) {
      throw new Error('No IDX doc')
    }
    const nextContent = { [KEYCHAIN_DEF]: this.docs[KEYCHAIN_DEF].id.toUrl() }
    const nextMetadata = this.docs.idx.metadata.schema ? undefined : { schema: IdentityIndex }
    await this.docs.idx.update(nextContent, nextMetadata)
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
      const nextContent = Object.assign(content || {}, {
        [KEYCHAIN_DEF]: this.docs[KEYCHAIN_DEF].id.toUrl(),
      })
      const nextMetadata = this.docs.idx.metadata.schema ? undefined : { schema: IdentityIndex }
      await this.docs.idx.update(nextContent, nextMetadata)
    }
  }

  async updateKeychainDoc(authMap: AuthMap = {}, pastSeeds: Array<JWE> = []): Promise<void> {
    if (Object.keys(authMap).length !== 0) {
      const update: Record<string, any> = { content: { authMap, pastSeeds } }
      if (!this.docs[KEYCHAIN_DEF].metadata.schema) {
        update.metadata = { schema: ThreeIdKeychain }
      }
      await this.docs[KEYCHAIN_DEF].update(update.content, update.metadata)
      await this.docs[KEYCHAIN_DEF].sync()
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
      this.docs.threeId.update(
        {
          ...this.docs.threeId.content,
          publicKeys: threeIdState.content.publicKeys,
        },
        threeIdState.metadata
      ),
      this.updateKeychainDoc(authMap, pastSeeds),
      this.pinAllDocs(),
    ])
  }
}
