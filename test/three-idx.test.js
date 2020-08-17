import tmp from 'tmp-promise'
import Ceramic from '@ceramicnetwork/ceramic-core'
import Ipfs from 'ipfs'

import { ThreeIDX } from '../src/three-idx'
import Keyring from '../src/keyring'

const seed = '0x8e641c0dc77f6916cc7f743dad774cdf9f6f7bcb880b11395149dd878377cd398650bbfd4607962b49953c87da4d7f3ff247ed734b06f96bdd69479377bc612b'

const genIpfsConf = (folder) => {
  return {
    repo: `${folder}/ipfs/`,
    config: {
      Addresses: { Swarm: [] },
      Bootstrap: []
    },
  }
}


describe('ThreeIDX', () => {
  let tmpFolder
  let ipfs, ceramic
  let keyring, threeIdx

  beforeAll(async () => {
    tmpFolder = await tmp.dir({ unsafeCleanup: true })
    ipfs = await Ipfs.create(genIpfsConf(tmpFolder.path))
    ceramic = await Ceramic.create(ipfs, { stateStorePath: tmpFolder.path + '/ceramic/'})
    keyring = new Keyring(seed)
  })

  afterAll(async () => {
    await ceramic.close()
    await ipfs.stop()
    await tmpFolder.cleanup()
  })

  beforeEach(async () => {
    threeIdx = new ThreeIDX(ceramic)
  })

  it('creates 3id doc', async () => {
    const pubkeys = keyring.getPublicKeys({ mgmtPub: true })
    await threeIdx.create3idDoc(pubkeys)
    expect(threeIdx.docs['3id'].state).toMatchSnapshot()
  })

  it('parses key name correctly', async () => {
    const pubkeys = keyring.getPublicKeys({ mgmtPub: true })
    await threeIdx.create3idDoc(pubkeys)
    const badKid = 'did:3:bayfiuherg98h349h#signing'
    expect(() => threeIdx.parseKeyName(badKid)).toThrow('Invalid DID')
    const goodKid = threeIdx.DID + '#signing'
    expect(threeIdx.parseKeyName(goodKid)).toEqual('signing')
  })

  it('encodes kid with version', async () => {
    const pubkeys = keyring.getPublicKeys({ mgmtPub: true })
    await threeIdx.create3idDoc(pubkeys)
    const latestVer = (await ceramic.listVersions(threeIdx.docs['3id'].id)).pop()
    expect(await threeIdx.encodeKidWithVersion()).toEqual(threeIdx.DID + '?version=' + latestVer + '#signing')
    expect(await threeIdx.encodeKidWithVersion('management')).toEqual(threeIdx.DID + '?version=' + latestVer + '#management')
  })
})
