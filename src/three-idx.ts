import { CeramicApi, Doctype } from '@ceramicnetwork/ceramic-common'
import CeramicClient from '@ceramicnetwork/ceramic-http-client'
import { AccountID } from 'caip'
import { LinkProof } from '3id-blockchain-utils'

import { PublicKeys } from './utils'
import type { AsymEncryptedMessage } from './crypto'

const gen3IDgenesis = (pubkeys: PublicKeys): Record<string, any> => {
  return {
    metadata: {
      owners: [pubkeys.managementKey],
    },
    content: {
      publicKeys: {
        signing: pubkeys.signingKey,
        encryption: pubkeys.asymEncryptionKey,
      },
    },
  }
}

interface EncData {
  jwe?: string
  box?: AsymEncryptedMessage
}

export interface AuthEntry {
  pub: string // base58 multicodec x25519 public key
  data: EncData
  id: EncData
}

interface AuthEntryCreate extends AuthEntry {
  linkProof: LinkProof
}

/**
 * Class used for creating the 3ID and IDX data structure.
 */
export class ThreeIDX {
  public docs: Record<string, Doctype>
  public ceramic: CeramicApi

  constructor(ceramic?: CeramicApi) {
    this.ceramic = ceramic || new CeramicClient()
    this.docs = {}
  }

  async setDIDProvider(provider: any): Promise<void> {
    await this.ceramic.setDIDProvider(provider)
  }

  get DID(): string {
    return `did:3:${this.docs['3id'].id.split('//')[1]}`
  }

  async create3idDoc(publicKeys: PublicKeys): Promise<void> {
    const docParams = gen3IDgenesis(publicKeys)
    this.docs['3id'] = await this.ceramic.createDocument('3id', docParams)
  }

  async encodeKidWithVersion(keyName = 'signing'): Promise<string> {
    const version = (await this.ceramic.listVersions(this.docs['3id'].id)).pop() || 0
    return `${this.DID}?version-id=${version}#${keyName}`
  }

  parseKeyName(kid: string): string | undefined {
    if (!kid) return
    const [did, keyName] = kid.split('#')
    if (this.DID == null || did !== this.DID) {
      throw new Error('Invalid DID')
    }
    return keyName
  }

  /**
   * Returns the encrypted JWE for the given authId
   */
  async loadIDX(authId: AccountID): Promise<EncData | null> {
    this.docs[authId.toString()] = await ceramic.createDocument('account-link', {
      metadata: { owners: [authId.toString()] }
    })
    const did = this.docs[authId.toString()].content
    if (!did) return null
    this.docs['3id'] = await ceramic.loadDocument('ceramic://' + did.split(':')[2])
    const idxDocid = this.docs['3id'].content.idx
    if (!idxDocid) return null
    this.docs['idx'] = await ceramic.loadDocument(idxDocid)
    const authKeychainDocid = this.docs['idx'].content['AuthKeychain']
    if (!authKeychainDocid) return null
    this.docs['auth-keychain'] = await ceramic.loadDocument(authKeychainDocid)
    const linkDocid = this.docs[authId.toString()].id
    return Object.entries(this.docs['auth-keychain'].content).find(([pubkey, entry]) => {
      return entry.link === linkDocid
    }).data
  }

  /**
   * Create a new IDX structure that has a given authEntry in it's keychain.
   */
  async createIDX(authEntry: AuthEntryCreate): Promise<void> {
    const authId = authEntry.linkProof.account
    this.docs[authId] = await ceramic.createDocument('account-link', {
      metadata: { owners: [authId] }
    })
    // TODO - add proof
    this.docs['auth-keychain'] = await ceramic.createDocument('tile', {
      metadata: { owners: [this.DID] },
      content: {
        [authEntry.pub]: {
          link: this.docs[authId].id,
          data: authEntry.data,
          id: authEntry.id,
        },
      },
    })
    this.docs['idx'] = await ceramic.createDocument('tile', {
      metadata: { owners: [this.DID] },
      content: { 'AuthKeychain': this.docs['auth-keychain'].id },
    })
  }

  /**
   * Adds a new AuthEntry to the Auth keychain.
   */
  async addAuthEntry(authEntry: AuthEntryCreate): Promise<void> {
    const authId = authEntry.linkProof.account
    this.docs[authId] = await ceramic.createDocument('account-link', {
      metadata: { owners: [authId] }
    })
    // TODO - add proof
    const content = Object.assign(
      {
        [authEntry.pub]: {
          link: this.docs[authId].id,
          data: authEntry.data,
          id: authEntry.id,
        },
      },
      this.docs['auth-keychain'].content
    )
    await this.docs['auth-keychain'].change({ content })
  }

  /**
   * Returns all public keys that is in the auth keychain.
   */
  getAllAuthEntries(): Promise<Array<AuthEntry>> {
    const content = this.docs['auth-keychain'].content
    return Object.keys(content).map((pub: string): AuthEntry => {
      return {
        ...content[pubkey],
        pub
      }
    })
  }

  /**
   * Preform a key rotation.
   * Will update the keys in the 3id document, and create a new auth keychain
   * with the given authEntries.
   */
  //async rotateKeys(publicKeys: PublicKeys, authEntries: Array<AuthEntry>): Promise<void> {
  //}
}

//function updateDoc(doc: any, )
