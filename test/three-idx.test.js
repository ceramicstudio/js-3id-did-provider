import tmp from 'tmp-promise'
import Ceramic from '@ceramicnetwork/ceramic-core'
import Ipfs from 'ipfs'
import all from 'it-all'
import { AccountID } from 'caip'
import { createLink } from '3id-blockchain-utils'

import { ThreeIDX } from '../src/three-idx'
import { DidProvider } from '../src/did-provider'
import Keyring from '../src/keyring'
import {
  AsymEncryptedMessage,
  asymDecrypt,
  asymEncrypt,
  naclRandom,
} from '../src/crypto'
import { fakeEthProvider } from '../src/utils'

import dagJose from 'dag-jose'
import basicsImport from 'multiformats/cjs/src/basics-import.js'
import legacy from 'multiformats/cjs/src/legacy.js'

const seed = '0x8e641c0dc77f6916cc7f743dad774cdf9f6f7bcb880b11395149dd878377cd398650bbfd4607962b49953c87da4d7f3ff247ed734b06f96bdd69479377bc612b'

const genIpfsConf = (folder) => {
  basicsImport.multicodec.add(dagJose)
  const format = legacy(basicsImport, dagJose.name)
  return {
    ipld: { formats: [format] },
    repo: `${folder}/ipfs/`,
    config: {
      Addresses: { Swarm: [] },
      Bootstrap: []
    },
  }
}

const randomSecret = () => '0x' + Buffer.from(naclRandom(32)).toString('hex')

const genAuthEntryCreate = async (did) => {
  const wallet = Keyring.authSecretToWallet(randomSecret())
  const accountId = new AccountID({ address: wallet.address, chainId: 'eip155:1' })
  const newAuthEntry = {
    pub: 'publickey' + randomSecret(),
    data: 'authdata' + randomSecret(),
    id: 'authid' + randomSecret(),
    linkProof: await createLink(did || 'did:3:asdf', accountId, fakeEthProvider(wallet))
  }
  return { newAuthEntry, accountId: accountId.toString() }
}

const setup3id = async (threeIdx, keyring) => {
  const pubkeys = keyring.getPublicKeys({ mgmtPub: true, useMulticodec: true })
  const forcedDID = `did:key:${pubkeys.managementKey}`
  let didProvider = new DidProvider({ permissions: mockedPermissions, threeIdx, keyring, forcedDID })
  await threeIdx.setDIDProvider(didProvider)
  await threeIdx.create3idDoc(pubkeys)
  didProvider = new DidProvider({ permissions: mockedPermissions, threeIdx, keyring })
  await threeIdx.setDIDProvider(didProvider)
}

const mockedPermissions = {
  request: async () => [],
  has: () => true,
}

describe('ThreeIDX', () => {
  jest.setTimeout(15000)
  let tmpFolder
  let ipfs, ceramic
  let keyring, threeIdx

  beforeAll(async () => {
    tmpFolder = await tmp.dir({ unsafeCleanup: true })
    ipfs = await Ipfs.create(genIpfsConf(tmpFolder.path))
    ceramic = await Ceramic.create(ipfs, { stateStorePath: tmpFolder.path + '/ceramic/'})
  })

  afterAll(async () => {
    await ceramic.close()
    await ipfs.stop()
    await tmpFolder.cleanup()
  })

  beforeEach(async () => {
    keyring = new Keyring(randomSecret())
    threeIdx = new ThreeIDX(ceramic)
  })

  it('creates 3id doc', async () => {
    keyring = new Keyring(seed)
    await setup3id(threeIdx, keyring)
    expect(threeIdx.docs.threeId.state).toMatchSnapshot()
  })

  it('parses key name correctly', async () => {
    await setup3id(threeIdx, keyring)
    const badKid = 'did:3:bayfiuherg98h349h#signing'
    expect(() => threeIdx.parseKeyName(badKid)).toThrow('Invalid DID')
    const goodKid = threeIdx.id + '#signing'
    expect(threeIdx.parseKeyName(goodKid)).toEqual('signing')
  })

  it('encodes kid with version', async () => {
    await setup3id(threeIdx, keyring)
    // with no anchor
    expect(await threeIdx.encodeKidWithVersion()).toEqual(threeIdx.id + '?version-id=0#signing')
    expect(await threeIdx.encodeKidWithVersion('management')).toEqual(`${threeIdx.managementDID}#${threeIdx.managementDID.split(':')[2]}`)
    // wait for anchor
    await new Promise(resolve => threeIdx.docs.threeId.on('change', resolve))
    const latestVer = (await ceramic.listVersions(threeIdx.docs.threeId.id)).pop()
    expect(await threeIdx.encodeKidWithVersion()).toEqual(threeIdx.id + '?version-id=' + latestVer + '#signing')
  })

  it('creates authMapEntry', async () => {
    const { newAuthEntry, accountId } = await genAuthEntryCreate()
    const authMapEntry = await threeIdx.createAuthMapEntry(newAuthEntry)

    expect(authMapEntry).toEqual({
      [threeIdx.docs[accountId].id]: {
        pub: newAuthEntry.pub,
        data: newAuthEntry.data,
        id: newAuthEntry.id,
      }
    })
    expect(threeIdx.docs[accountId].owners).toEqual([accountId])
    expect(threeIdx.docs[accountId].content).toEqual('did:3:asdf')
  })

  it('createIDX with new auth entry', async () => {
    await setup3id(threeIdx, keyring)
    const { newAuthEntry, accountId } = await genAuthEntryCreate()
    await threeIdx.createIDX(newAuthEntry)

    expect(threeIdx.docs['auth-keychain'].content).toEqual({
      [threeIdx.docs[accountId].id]: {
        pub: newAuthEntry.pub,
        data: newAuthEntry.data,
        id: newAuthEntry.id,
      }
    })
    expect(threeIdx.docs.idx.content).toEqual({ 'auth-keychain': threeIdx.docs['auth-keychain'].id })
    expect(threeIdx.docs.threeId.content).toEqual(expect.objectContaining({ 'idx': threeIdx.docs.idx.id }))
    // should be pinned
    expect(await all(await ceramic.pin.ls())).toEqual(expect.arrayContaining([
      threeIdx.docs.threeId.id,
      threeIdx.docs.idx.id,
      threeIdx.docs['auth-keychain'].id,
      threeIdx.docs[accountId].id,
    ].map(docid => docid.replace('ceramic://', '/ceramic/'))))
  })

  it('createIDX with no auth entry', async () => {
    await setup3id(threeIdx, keyring)
    await threeIdx.createIDX()

    expect(threeIdx.docs.idx.content).toEqual({ 'auth-keychain': threeIdx.docs['auth-keychain'].id })
    expect(threeIdx.docs.threeId.content).toEqual(expect.objectContaining({ 'idx': threeIdx.docs.idx.id }))
    // should be pinned
    expect(await all(await ceramic.pin.ls())).toEqual(expect.arrayContaining([
      threeIdx.docs.threeId.id,
      threeIdx.docs.idx.id,
    ].map(docid => docid.replace('ceramic://', '/ceramic/'))))
  })

  it('loadIDX fails if authLink does not exist', async () => {
    await setup3id(threeIdx, keyring)
    const { newAuthEntry, accountId } = await genAuthEntryCreate(threeIdx.id)

    expect(await threeIdx.loadIDX(accountId)).toEqual(null)
  })

  it('loadIDX works if IDX created', async () => {
    await setup3id(threeIdx, keyring)
    const { newAuthEntry, accountId } = await genAuthEntryCreate(threeIdx.id)
    await threeIdx.createIDX(newAuthEntry)

    expect(await threeIdx.loadIDX(accountId)).toEqual(newAuthEntry.data)
  })

  it('addAuthEntries', async () => {
    await setup3id(threeIdx, keyring)
    const { newAuthEntry: nae1, accountId: ai1 } = await genAuthEntryCreate(threeIdx.id)
    await threeIdx.createIDX(nae1)

    const authEntry1 = { pub: nae1.pub, data: nae1.data, id: nae1.id }
    expect(threeIdx.getAllAuthEntries()).toEqual([authEntry1])

    const { newAuthEntry: nae2, accountId: ai2 } = await genAuthEntryCreate(threeIdx.id)
    const { newAuthEntry: nae3, accountId: ai3 } = await genAuthEntryCreate(threeIdx.id)
    const authEntry2 = { pub: nae2.pub, data: nae2.data, id: nae2.id }
    const authEntry3 = { pub: nae3.pub, data: nae3.data, id: nae3.id }
    await threeIdx.addAuthEntries([nae2, nae3])

    expect(threeIdx.getAllAuthEntries()).toEqual([authEntry1, authEntry2, authEntry3])
    expect(await all(await ceramic.pin.ls())).toEqual(expect.arrayContaining([
      threeIdx.docs[ai1].id,
      threeIdx.docs[ai2].id,
      threeIdx.docs[ai3].id,
    ].map(docid => docid.replace('ceramic://', '/ceramic/'))))
  })
})
