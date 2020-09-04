import { validateLink } from '3id-blockchain-utils'

import { Keychain, newAuthEntry } from '../src/keychain'
import Keyring from '../src/keyring'
import {
  AsymEncryptedMessage,
  asymDecrypt,
  asymEncrypt,
  naclRandom,
} from '../src/crypto'

const seed = '0x8e641c0dc77f6916cc7f743dad774cdf9f6f7bcb880b11395149dd878377cd398650bbfd4607962b49953c87da4d7f3ff247ed734b06f96bdd69479377bc612b'
const randomAuthSecret = () => naclRandom(32)
const randomSecret = () => '0x' + Buffer.from(naclRandom(32)).toString('hex')

describe('Keychain', () => {
  let keyring, threeIdx

  beforeAll(() => {
    keyring = new Keyring(seed)
  })

  beforeEach(async () => {
    let authEntries = []
    threeIdx = {
      DID: 'did:3:asdf',
      addAuthEntry: jest.fn(),
      loadIDX: jest.fn(async () => null),
      create3idDoc: jest.fn(),
      createIDX: jest.fn(async entry => authEntries.push(entry)),
      addAuthEntries: jest.fn(async entries => authEntries = authEntries.concat(entries)),
      getAllAuthEntries: jest.fn(() => authEntries),
    }
  })

  it('load, no IDX present', async () => {
    const keychain = await Keychain.load(threeIdx, randomAuthSecret())
    expect(threeIdx.loadIDX).toHaveBeenCalledTimes(1)
    expect(threeIdx.create3idDoc).toHaveBeenCalledTimes(1)
    //expect(threeIdx.createIDX).toHaveBeenCalledTimes(1)
    expect(keychain.list()).toEqual([])
  })

  it('load, IDX present', async () => {
    const authSecret = randomAuthSecret()
    // add the auth entry to IDX
    const tmpKc = await Keychain.load(threeIdx, authSecret)
    threeIdx.createIDX(await newAuthEntry(tmpKc._keyring, threeIdx.DID, 'authid', authSecret))

    threeIdx.loadIDX = jest.fn(async () => threeIdx.getAllAuthEntries()[0].data)
    const keychain = await Keychain.load(threeIdx, authSecret)
    expect(threeIdx.loadIDX).toHaveBeenCalledTimes(1)
    expect(keychain.list()).toEqual(['authid'])
  })

  it('commit adds, no IDX created yet', async () => {
    const keychain = new Keychain(keyring, threeIdx)
    expect(threeIdx.createIDX).toHaveBeenCalledTimes(0)
    await keychain.add('auth1', randomAuthSecret())
    await keychain.add('auth2', randomAuthSecret())
    expect(keychain.list()).toEqual([])
    await keychain.commit()
    expect(threeIdx.createIDX).toHaveBeenCalledTimes(1)
    expect(threeIdx.addAuthEntries).toHaveBeenCalledTimes(1)
    expect(threeIdx.addAuthEntries).toHaveBeenCalledTimes(1)
    expect(keychain.list()).toEqual(['auth2', 'auth1'])
  })

  it('commit adds, IDX already created', async () => {
    const keychain = new Keychain(keyring, threeIdx)
    threeIdx.createIDX(await newAuthEntry(keychain._keyring, threeIdx.DID, 'authid', randomAuthSecret()))

    await keychain.add('auth1', randomAuthSecret())
    await keychain.add('auth2', randomAuthSecret())
    expect(keychain.list()).toEqual(['authid'])
    await keychain.commit()
    expect(threeIdx.createIDX).toHaveBeenCalledTimes(1)
    expect(threeIdx.addAuthEntries).toHaveBeenCalledTimes(1)
    expect(keychain.list()).toEqual(['authid', 'auth1', 'auth2'])
  })

  it('add updates status', async () => {
    const keychain = await Keychain.load(threeIdx, randomAuthSecret())
    expect(keychain.status()).toEqual({ clean: true, adding: [], removing: [] })
    await keychain.add('auth1', randomAuthSecret())
    await keychain.add('auth2', randomAuthSecret())
    expect(keychain.status()).toEqual({
      clean: false,
      adding: ['auth1', 'auth2'],
      removing: [],
    })
    await keychain.add('auth3', randomAuthSecret())
    expect(keychain.status()).toEqual({
      clean: false,
      adding: ['auth1', 'auth2', 'auth3'],
      removing: [],
    })
  })
})
