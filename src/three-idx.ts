import { CeramicApi } from '@ceramicnetwork/ceramic-common'
import { CeramicClient } from '@ceramicnetwork/ceramic-http-client'

import { gen3IDgenesis } from './utils'

export class ThreeIDX {
  constructor(private ceramic?: CeramicApi) {
    if (!ceramic) ceramic = new CeramicClient()
    this.docs = {}
  }

  async setDIDProvider(provider: any) {
    await this.ceramic.setDIDProvider(config.provider)
  }

  get DID() {
    return 'did:3:' + this.docs['3id'].id.split('//')[1]
  }

  async create3idDoc(publicKeys) {
    const docParams = gen3IDgenesis(publicKeys)
    this.docs['3id'] = await this.ceramic.createDocument('3id', docParams)
  }

  async loadStructure(accountId: string) {
  }

  async encodeKidWithVersion(keyName: string = 'signing'): Promise<string> {
    const version = (await this.ceramic.listVersions(this.docs['3id'].id)).pop() || 0
    return `${this.DID}?version=${version}#${keyName}`
  }

  parseKeyName(kid: string): string {
    if (!kid) return null
    const [did, keyName] = kid.split('#')
    if (this.DID == null || did !== this.DID) {
      throw new Error('Invalid DID')
    }
    return keyName
  }

}
