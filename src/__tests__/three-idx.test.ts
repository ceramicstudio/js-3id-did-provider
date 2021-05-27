import tmp, { DirectoryResult } from 'tmp-promise'
import Ceramic from '@ceramicnetwork/core'
import { DID } from 'dids'
import { Ed25519Provider } from 'key-did-provider-ed25519'
import KeyResolver from 'key-did-resolver'
import Ipfs from 'ipfs'
import all from 'it-all'
import { schemas, definitions } from '@ceramicstudio/idx-constants'
import { publishIDXConfig } from '@ceramicstudio/idx-tools'
import { randomBytes } from '@stablelib/random'
import ThreeIdResolver from '@ceramicnetwork/3id-did-resolver'

import { NewAuthEntry, ThreeIDX } from '../three-idx'
import { DidProvider } from '../did-provider'
import Keyring from '../keyring'

import dagJose from 'dag-jose'
import { sha256 } from 'multiformats/hashes/sha2'
import legacy from 'multiformats/legacy'
import * as u8a from 'uint8arrays'
import type { Hasher } from 'multiformats/hashes/hasher'
import Permissions from '../permissions'
import KeyDidResolver from 'key-did-resolver'

const seed = u8a.fromString(
  '8e641c0dc77f6916cc7f743dad774cdf9f6f7bcb880b11395149dd878377cd398650bbfd4607962b49953c87da4d7f3ff247ed734b06f96bdd69479377bc612b',
  'base16'
)
const KEYCHAIN_DEF = definitions.threeIdKeychain

const genIpfsConf = (folder: string): any => {
  const hasher: Record<number, Hasher<string, number>> = {}
  hasher[sha256.code] = sha256
  const format = legacy(dagJose, { hashes: hasher })
  return {
    ipld: { formats: [format] },
    repo: `${folder}/ipfs/`,
    config: {
      Addresses: { Swarm: [] },
      Bootstrap: [],
    },
    silent: true,
  }
}
const randomSecret = () => '0x' + Buffer.from(randomBytes(32)).toString('hex')

const pauseSeconds = (sec: number) => new Promise((res) => setTimeout(res, sec * 1000))

const fakeJWE = () => ({
  jwe: {
    protected: 'prot',
    tag: 'tag',
    ciphertext: randomSecret(),
    iv: 'iv',
  },
})

async function genAuthEntryCreate(): Promise<NewAuthEntry> {
  const provider = new Ed25519Provider(randomBytes(32))
  const did = new DID({ provider, resolver: KeyResolver.getResolver() })
  await did.authenticate()
  return {
    did,
    mapEntry: {
      [did.id]: {
        data: fakeJWE(),
        id: fakeJWE(),
      },
    },
  }
}

const setup3id = async (threeIdx: ThreeIDX, keyring: Keyring) => {
  const genState = keyring.get3idState(true)
  const forcedDID = genState.metadata.controllers[0]
  let didProvider = new DidProvider({
    permissions: mockedPermissions,
    threeIdx,
    keyring,
    forcedDID,
  })
  await threeIdx.setDIDProvider(didProvider)
  await threeIdx.create3idDoc(genState)
  didProvider = new DidProvider({ permissions: mockedPermissions, threeIdx, keyring })
  await threeIdx.setDIDProvider(didProvider)
}

const mockedPermissions = {
  request: () => Promise.resolve([]),
  has: () => true,
} as unknown as Permissions

describe('ThreeIDX', () => {
  jest.setTimeout(250000)
  let tmpFolder: DirectoryResult
  let ipfs: Ipfs.IPFS
  let ceramic: Ceramic
  let keyring: Keyring
  let threeIdx: ThreeIDX
  let anchorService: any

  beforeAll(async () => {
    tmpFolder = await tmp.dir({ unsafeCleanup: true })
    ipfs = await Ipfs.create(genIpfsConf(tmpFolder.path))
    ceramic = await Ceramic.create(ipfs, {
      stateStoreDirectory: tmpFolder.path + '/ceramic/',
      anchorOnRequest: false,
    })
    anchorService = ceramic.context.anchorService
    const did = new DID({
      resolver: {
        ...KeyDidResolver.getResolver(),
        ...ThreeIdResolver.getResolver(ceramic),
      },
    })
    await ceramic.setDID(did)
    await publishIDXConfig(ceramic)
  })

  afterAll(async () => {
    await ceramic.close()
    await ipfs.stop()
    await tmpFolder.cleanup()
  })

  beforeEach(() => {
    keyring = new Keyring(randomBytes(32))
    threeIdx = new ThreeIDX(ceramic)
  })

  it('creates 3id doc', async () => {
    keyring = new Keyring(seed)
    await setup3id(threeIdx, keyring)
    const state = threeIdx.docs.threeId.state as any
    // will be different each run
    delete state.log
    delete state.metadata.unique
    expect(state).toMatchSnapshot()
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
    expect(threeIdx.get3idVersion()).toEqual('0')
    // with anchor, createIDX to update 3id doc
    await threeIdx.createIDX()
    // update the 3id doc
    await anchorService.anchor()
    await pauseSeconds(1)
    await threeIdx.docs.threeId.sync()
    await threeIdx.docs.threeId.update({ asdf: 123 }, undefined, { anchor: true })
    await anchorService.anchor()
    await pauseSeconds(1)
    await threeIdx.docs.threeId.sync()
    const latestCommit = threeIdx.docs.threeId.commitId.commit
    expect(threeIdx.get3idVersion()).toEqual(latestCommit.toString())
  })

  it('creates authMapEntry', async () => {
    await setup3id(threeIdx, keyring)
    const newAuthEntry = await genAuthEntryCreate()
    const update = await threeIdx.createAuthLinkUpdate(newAuthEntry)

    expect(update.did).toEqual(newAuthEntry.did.id)
    expect(threeIdx.docs[update.did].controllers).toEqual([newAuthEntry.did.id])
    expect(threeIdx.docs[update.did].content).toEqual({})

    await threeIdx.applyAuthLinkUpdate(update)
    expect(threeIdx.docs[update.did].content).toEqual({ did: threeIdx.id })
  })

  it('createIDX with new auth entry', async () => {
    await setup3id(threeIdx, keyring)
    const newAuthEntry = await genAuthEntryCreate()
    await threeIdx.createIDX(newAuthEntry)

    expect(threeIdx.docs[KEYCHAIN_DEF].content).toEqual({
      authMap: newAuthEntry.mapEntry,
      pastSeeds: [],
    })
    expect(threeIdx.docs.idx.content).toEqual({
      [KEYCHAIN_DEF]: threeIdx.docs[KEYCHAIN_DEF].id.toUrl(),
    })
    expect(threeIdx.docs.idx.metadata.schema).toBe(schemas.IdentityIndex)
    expect(threeIdx.docs[KEYCHAIN_DEF].metadata.schema).toBe(schemas.ThreeIdKeychain)
    // should be pinned
    expect(await all(await ceramic.pin.ls())).toEqual(
      expect.arrayContaining(
        [
          threeIdx.docs.threeId.id.toString(),
          threeIdx.docs.idx.id.toString(),
          threeIdx.docs[KEYCHAIN_DEF].id.toString(),
          threeIdx.docs[newAuthEntry.did.id].id.toString(),
        ].map((docid) => docid.replace('ceramic://', '/ceramic/'))
      )
    )
  })

  it('createIDX with no auth entry', async () => {
    await setup3id(threeIdx, keyring)
    await threeIdx.createIDX()

    expect(threeIdx.docs.idx.content).toEqual({
      [KEYCHAIN_DEF]: threeIdx.docs[KEYCHAIN_DEF].id.toUrl(),
    })
    expect(threeIdx.docs.idx.metadata.schema).toBe(schemas.IdentityIndex)
    expect(threeIdx.docs[KEYCHAIN_DEF].metadata.schema).toBeUndefined()
    // should be pinned
    expect(await all(await ceramic.pin.ls())).toEqual(
      expect.arrayContaining(
        [threeIdx.docs.threeId.id.toString(), threeIdx.docs.idx.id.toString()].map((docid) =>
          docid.replace('ceramic://', '/ceramic/')
        )
      )
    )
  })

  it('loadIDX fails if authLink does not exist', async () => {
    await setup3id(threeIdx, keyring)
    const newAuthEntry = await genAuthEntryCreate()

    expect(await threeIdx.loadIDX(newAuthEntry.did.id)).toEqual(null)
  })

  it('loadIDX works if IDX created', async () => {
    await setup3id(threeIdx, keyring)
    const newAuthEntry = await genAuthEntryCreate()
    await threeIdx.createIDX(newAuthEntry)

    expect(await threeIdx.loadIDX(newAuthEntry.did.id)).toEqual({
      seed: newAuthEntry.mapEntry[newAuthEntry.did.id].data,
      pastSeeds: [],
    })
  })

  it('addAuthEntries', async () => {
    await setup3id(threeIdx, keyring)
    const [nae1, nae2, nae3] = await Promise.all([
      genAuthEntryCreate(),
      genAuthEntryCreate(),
      genAuthEntryCreate(),
    ])
    await threeIdx.createIDX(nae1)
    expect(threeIdx.getAuthMap()).toEqual(nae1.mapEntry)
    await threeIdx.addAuthEntries([nae2, nae3])

    expect(threeIdx.getAuthMap()).toEqual({ ...nae1.mapEntry, ...nae2.mapEntry, ...nae3.mapEntry })
    expect(await all(await ceramic.pin.ls())).toEqual(
      expect.arrayContaining([
        threeIdx.docs[nae1.did.id].id.toString(),
        threeIdx.docs[nae2.did.id].id.toString(),
        threeIdx.docs[nae3.did.id].id.toString(),
      ])
    )
  })

  it('rotateKeys', async () => {
    await setup3id(threeIdx, keyring)
    const [nae1, nae2, nae3] = await Promise.all([
      genAuthEntryCreate(),
      genAuthEntryCreate(),
      genAuthEntryCreate(),
    ])
    await threeIdx.createIDX(nae1)
    await threeIdx.addAuthEntries([nae2, nae3])

    // Rotate keys correctly
    await keyring.generateNewKeys(threeIdx.get3idVersion())
    const new3idState = keyring.get3idState()
    const updatedAuthMap = {
      [nae1.did.id]: { data: fakeJWE(), id: fakeJWE() },
      [nae2.did.id]: { data: fakeJWE(), id: fakeJWE() },
    }
    await threeIdx.rotateKeys(new3idState, keyring.pastSeeds, updatedAuthMap)
    await anchorService.anchor()
    await pauseSeconds(2)

    expect(threeIdx.getAuthMap()).toEqual(updatedAuthMap)
    await threeIdx.docs.threeId.sync()
    const state = threeIdx.docs.threeId.state
    expect(state.content).toEqual(expect.objectContaining(new3idState.content))
    expect(state.metadata.controllers).toEqual(new3idState.metadata.controllers)

    // load 3id with rotated keys
    expect(await threeIdx.loadIDX(nae1.did.id)).toEqual({
      seed: updatedAuthMap[nae1.did.id].data,
      pastSeeds: keyring.pastSeeds,
    })
  })
})
