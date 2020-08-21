import { CeramicApi, Doctype } from '@ceramicnetwork/ceramic-common'
import CeramicClient from '@ceramicnetwork/ceramic-http-client'

import { PublicKeys } from './utils'

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
}
