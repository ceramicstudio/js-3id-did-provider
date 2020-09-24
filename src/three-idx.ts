import { CeramicApi, Doctype } from '@ceramicnetwork/ceramic-common'
import CeramicClient from '@ceramicnetwork/ceramic-http-client'
import { LinkProof } from '3id-blockchain-utils'

import { PublicKeys } from './utils'
import type { AsymEncryptedMessage } from './crypto'
import type { DidProvider } from './did-provider'

const gen3IDgenesis = (pubkeys: PublicKeys): Record<string, any> => {
  return {
    metadata: { tags: ['3id'], owners: [`did:key:${pubkeys.managementKey as string}`] },
    content: {
      publicKeys: {
        signing: pubkeys.signingKey,
        encryption: pubkeys.asymEncryptionKey,
      },
    },
  }
}

// map of collection definitions
const CDefs = {
  // TODO user actual collection definition docs
  authKeychain: 'auth-keychain',
  rotatedKeys: 'rotated-keys',
}

interface EncData {
  jwe?: string
  box: AsymEncryptedMessage
}

export interface AuthEntry {
  pub: string // base58 multicodec x25519 public key
  data: EncData
  id: EncData
}

interface AuthMapEntry {
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

  get managementDID(): string {
    return this.docs.threeId.owners[0]
  }

  async create3idDoc(publicKeys: PublicKeys): Promise<void> {
    const docParams = gen3IDgenesis(publicKeys)
    this.docs.threeId = await this.ceramic.createDocument('tile', docParams)
  }

  async encodeKidWithVersion(keyName = 'signing'): Promise<string> {
    // key id of a key-did: https://w3c-ccg.github.io/did-method-key/
    if (keyName === 'management') return `${this.managementDID}#${this.managementDID.split(':')[2]}`
    const version = (await this.ceramic.listVersions(this.docs.threeId.id)).pop() || 0
    return `${this.id}?version-id=${version}#${keyName}`
  }

  parseKeyName(kid: string): string | undefined {
    if (!kid) return
    const [did, keyName] = kid.split('#')
    if (did === this.managementDID) {
      return 'management'
    }
    if (this.id == null || did !== this.id) {
      throw new Error('Invalid DID')
    }
    return keyName
  }

  async createAuthMapEntry(authEntry: NewAuthEntry): Promise<AuthMapEntry> {
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
    this.docs[CDefs.authKeychain] = await this.ceramic.createDocument('tile', {
      metadata: { owners: [this.id] },
      content: entry,
    })
    this.docs.idx = await this.ceramic.createDocument('tile', {
      metadata: { owners: [this.id] },
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
  async loadIDX(authLink: string): Promise<EncData | null> {
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
    return this.docs[CDefs.authKeychain].content[linkDocid].data
  }

  /**
   * Adds a new AuthEntries to the Auth keychain.
   */
  async addAuthEntries(authEntries: Array<NewAuthEntry>): Promise<void> {
    const mapEntries = await Promise.all(authEntries.map(this.createAuthMapEntry.bind(this)))
    const content = Object.assign({}, this.docs[CDefs.authKeychain].content)
    const newContent = mapEntries.reduce((acc, entry) => Object.assign(acc, entry), content)
    await this.docs[CDefs.authKeychain].change({ content: newContent })
  }

  /**
   * Returns all public keys that is in the auth keychain.
   */
  getAllAuthEntries(): Array<AuthEntry> {
    if (!this.docs[CDefs.authKeychain]) return []
    const content = this.docs[CDefs.authKeychain].content
    return Object.keys(content).map((authLink: string): AuthEntry => content[authLink] as AuthEntry)
  }

  async pinAllDocs(): Promise<void> {
    await Promise.all(
      Object.values(this.docs).map(async (doc) => {
        await this.ceramic.pin.add(doc.id)
      })
    )
  }

  /**
   * Preform a key rotation.
   * Will update the keys in the 3id document, and create a new auth keychain
   * with the given authEntries.
   */
  //async rotateKeys(publicKeys: PublicKeys, updatedAuthEntries: Array<AuthEntry>): Promise<void> {
  //}
}

//function updateDoc(doc: any, )
