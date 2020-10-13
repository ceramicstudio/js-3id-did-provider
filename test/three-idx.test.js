import tmp from 'tmp-promise'
import Ceramic from '@ceramicnetwork/ceramic-core'
import Ipfs from 'ipfs'
import all from 'it-all'
import { AccountID } from 'caip'
import { createLink } from '3id-blockchain-utils'
import { schemas, definitions } from '@ceramicstudio/idx-constants'
import { publishIDXConfig } from '@ceramicstudio/idx-tools'

import { ThreeIDX } from '../src/three-idx'
import { DidProvider } from '../src/did-provider'
import Keyring from '../src/keyring'
import { randomBytes } from '../src/crypto'
import { fakeEthProvider } from '../src/utils'

import dagJose from 'dag-jose'
import basicsImport from 'multiformats/cjs/src/basics-import.js'
import legacy from 'multiformats/cjs/src/legacy.js'
import * as u8a from 'uint8arrays'

const seed = u8a.fromString('8e641c0dc77f6916cc7f743dad774cdf9f6f7bcb880b11395149dd878377cd398650bbfd4607962b49953c87da4d7f3ff247ed734b06f96bdd69479377bc612b', 'base16')
const KEYCHAIN_DEF = definitions.threeIdKeychain.replace('ceramic://', '')

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

const randomSecret = () => '0x' + Buffer.from(randomBytes(32)).toString('hex')

const fakeJWE = () => ({
  jwe: {
    protected: 'prot',
    tag: 'tag',
    ciphertext: randomSecret(),
    iv: 'iv',
  }
})
const genAuthEntryCreate = async (did) => {
  const wallet = Keyring.authSecretToWallet(randomSecret())
  const accountId = new AccountID({ address: wallet.address, chainId: 'eip155:1' })
  const newAuthEntry = {
    pub: 'publickey' + randomSecret(),
    data: fakeJWE(),
    id: fakeJWE(),
    linkProof: await createLink(did || 'did:3:asdf', accountId, fakeEthProvider(wallet))
  }
  return { newAuthEntry, accountId: accountId.toString() }
}

const setup3id = async (threeIdx, keyring) => {
  const genState = keyring.get3idState(true)
  const forcedDID = genState.metadata.owners[0]
  let didProvider = new DidProvider({ permissions: mockedPermissions, threeIdx, keyring, forcedDID })
  await threeIdx.setDIDProvider(didProvider)
  await threeIdx.create3idDoc(genState)
  didProvider = new DidProvider({ permissions: mockedPermissions, threeIdx, keyring })
  await threeIdx.setDIDProvider(didProvider)
}

const mockedPermissions = {
  request: async () => [],
  has: () => true,
}

describe('ThreeIDX', () => {
  jest.setTimeout(25000)
  let tmpFolder
  let ipfs, ceramic
  let keyring, threeIdx

  beforeAll(async () => {
    tmpFolder = await tmp.dir({ unsafeCleanup: true })
    ipfs = await Ipfs.create(genIpfsConf(tmpFolder.path))
    ceramic = await Ceramic.create(ipfs, { stateStorePath: tmpFolder.path + '/ceramic/'})
    await publishIDXConfig(ceramic)
  })

  afterAll(async () => {
    await ceramic.close()
    await ipfs.stop()
    await tmpFolder.cleanup()
  })

  beforeEach(async () => {
    keyring = new Keyring(randomBytes(32))
    threeIdx = new ThreeIDX(ceramic)
  })

  it('creates 3id doc', async () => {
    keyring = new Keyring(seed)
    await setup3id(threeIdx, keyring)
    expect(threeIdx.docs.threeId.state).toMatchSnapshot()
  })

  it('handles v0 3ID correctly', async () => {
    const v03ID = 'did:3:abc234'
    await setup3id(threeIdx, keyring)
    const v13ID = threeIdx.id
    threeIdx.setV03ID(v03ID)
    expect(threeIdx.id).not.toEqual(v13ID)
    expect(threeIdx.id).toEqual(v03ID)
  })

  it('gets correct 3id version', async () => {
    await setup3id(threeIdx, keyring)
    // with no anchor
    expect(await threeIdx.get3idVersion()).toEqual('0')
    // with anchor, createIDX to update 3id doc
    await threeIdx.createIDX()
    await new Promise(resolve => threeIdx.docs.threeId.on('change', resolve))
    const latestVer = (await ceramic.listVersions(threeIdx.docs.threeId.id)).pop()
    expect(await threeIdx.get3idVersion()).toEqual(latestVer)
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

    expect(threeIdx.docs[KEYCHAIN_DEF].content).toEqual({
      authMap: {
        [threeIdx.docs[accountId].id]: {
          pub: newAuthEntry.pub,
          data: newAuthEntry.data,
          id: newAuthEntry.id,
        }
      },
      pastSeeds: []
    })
    expect(threeIdx.docs.idx.content).toEqual({ [KEYCHAIN_DEF]: threeIdx.docs[KEYCHAIN_DEF].id })
    expect(threeIdx.docs.idx.metadata.schema).toBe(schemas.IdentityIndex)
    expect(threeIdx.docs[KEYCHAIN_DEF].metadata.schema).toBe(schemas.ThreeIdKeychain)
    expect(threeIdx.docs.threeId.content).toEqual(expect.objectContaining({ 'idx': threeIdx.docs.idx.id }))
    // should be pinned
    expect(await all(await ceramic.pin.ls())).toEqual(expect.arrayContaining([
      threeIdx.docs.threeId.id,
      threeIdx.docs.idx.id,
      threeIdx.docs[KEYCHAIN_DEF].id,
      threeIdx.docs[accountId].id,
    ].map(docid => docid.replace('ceramic://', '/ceramic/'))))
  })

  it('createIDX with no auth entry', async () => {
    await setup3id(threeIdx, keyring)
    await threeIdx.createIDX()

    expect(threeIdx.docs.idx.content).toEqual({ [KEYCHAIN_DEF]: threeIdx.docs[KEYCHAIN_DEF].id })
    expect(threeIdx.docs.idx.metadata.schema).toBe(schemas.IdentityIndex)
    expect(threeIdx.docs[KEYCHAIN_DEF].metadata.schema).toBe(schemas.ThreeIdKeychain)
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

    expect(await threeIdx.loadIDX(accountId)).toEqual({
      seed: newAuthEntry.data,
      pastSeeds: []
    })
  })

  it('addAuthEntries', async () => {
    await setup3id(threeIdx, keyring)
    const resolved = await Promise.all([
      genAuthEntryCreate(threeIdx.id),
      genAuthEntryCreate(threeIdx.id),
      genAuthEntryCreate(threeIdx.id)
    ])
    const { newAuthEntry: nae1, accountId: ai1 } = resolved[0]
    const { newAuthEntry: nae2, accountId: ai2 } = resolved[1]
    const { newAuthEntry: nae3, accountId: ai3 } = resolved[2]
    const authEntry1 = { pub: nae1.pub, data: nae1.data, id: nae1.id }
    const authEntry2 = { pub: nae2.pub, data: nae2.data, id: nae2.id }
    const authEntry3 = { pub: nae3.pub, data: nae3.data, id: nae3.id }
    await threeIdx.createIDX(nae1)
    expect(threeIdx.getAllAuthEntries()).toEqual([authEntry1])
    await threeIdx.addAuthEntries([nae2, nae3])

    expect(threeIdx.getAllAuthEntries()).toEqual([authEntry1, authEntry2, authEntry3])
    expect(await all(await ceramic.pin.ls())).toEqual(expect.arrayContaining([
      threeIdx.docs[ai1].id,
      threeIdx.docs[ai2].id,
      threeIdx.docs[ai3].id,
    ].map(docid => docid.replace('ceramic://', '/ceramic/'))))
  })

  it('rotateKeys', async () => {
    await setup3id(threeIdx, keyring)
    const resolved = await Promise.all([
      genAuthEntryCreate(threeIdx.id),
      genAuthEntryCreate(threeIdx.id),
      genAuthEntryCreate(threeIdx.id)
    ])
    const { newAuthEntry: nae1, accountId: ai1 } = resolved[0]
    const { newAuthEntry: nae2, accountId: ai2 } = resolved[1]
    const { newAuthEntry: nae3, accountId: ai3 } = resolved[2]
    await threeIdx.createIDX(nae1)
    await threeIdx.addAuthEntries([nae2, nae3])

    // Rotate keys correctly
    await keyring.generateNewKeys(await threeIdx.get3idVersion())
    const new3idState = keyring.get3idState()
    const updatedEntry1 = { pub: nae1.pub, data: fakeJWE(), id: fakeJWE() }
    const updatedEntry2 = { pub: nae2.pub, data: fakeJWE(), id: fakeJWE() }
    await threeIdx.rotateKeys(new3idState, keyring.pastSeeds, [updatedEntry1, updatedEntry2])
    expect(threeIdx.getAllAuthEntries()).toEqual(expect.arrayContaining([updatedEntry1, updatedEntry2]))
    const state = threeIdx.docs.threeId.state
    expect(state.content).toEqual(expect.objectContaining(new3idState.content))
    expect(state.metadata.owners).toEqual(new3idState.metadata.owners)

    // load 3id with rotated keys
    expect(await threeIdx.loadIDX(ai1)).toEqual({
      seed: updatedEntry1.data,
      pastSeeds: keyring.pastSeeds
    })
  })
})
