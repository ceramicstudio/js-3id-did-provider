import ThreeIdProvider from '../src/threeid-provider'

import { randomBytes } from '@stablelib/random'
import { verifyJWT } from 'did-jwt'
import { Resolver } from 'did-resolver'
import tmp from 'tmp-promise'
import Ceramic from '@ceramicnetwork/core'
import Ipfs from 'ipfs'
import { publishIDXConfig } from '@ceramicstudio/idx-tools'
import { definitions } from '@ceramicstudio/idx-constants'

import dagJose from 'dag-jose';
import { sha256 } from 'multiformats/cjs/src/hashes/sha2.js'
import legacy from 'multiformats/cjs/src/legacy.js'
import * as u8a from 'uint8arrays'

const KEYCHAIN_DEF = definitions.threeIdKeychain
const seed = u8a.fromString('af0253c646e3d6ccf93758154f55b6055ab5739e22d54fb0b3b6ad1819c73ffaaca52378afeda236f41755c59db9e8aeb30d4cefbd61327603ba6aee63a59b1d', 'base16')

const randomAuthSecret = () => randomBytes(32)
const getPermissionMock = jest.fn(async () => [])

const genIpfsConf = (folder) => {
  const hasher = {}
  hasher[sha256.code] = sha256
  const format = legacy(dagJose, {hashes: hasher})
  return {
    ipld: { formats: [format] },
    repo: `${folder}/ipfs/`,
    config: {
      Addresses: { Swarm: [] },
      Bootstrap: []
    },
    silent: true,
  }
}

jest.mock('cross-fetch', (o) => {
  return (a) => ({
    ok: true,
    json: () => ({
      value: {
        publicKey: [{
          id: 'did:3:GENESIS#signingKey',
          type: 'Secp256k1VerificationKey2018',
          publicKeyHex: '0452fbcde75f7ddd7cff18767e2b5536211f500ad474c15da8e74577a573e7a346f2192ef49a5aa0552c41f181a7950af3afdb93cafcbff18156943e3ba312e5b2'
        }, {
          id: 'did:3:GENESIS#encryptionKey',
          type: 'Curve25519EncryptionPublicKey',
          publicKeyBase64: 'DFxR24MNHVxEDAdL2f6pPEwNDJ2p0Ldyjoo7y/ItLDc='
        }],
        authentication: [{
          type: 'Secp256k1SignatureAuthentication2018',
          publicKey: 'did:3:GENESIS#signingKey'
        }]
      }
    })
  })
})

describe('ThreeIdProvider', () => {
  jest.setTimeout(45000)
  let tmpFolder
  let ipfs, ceramic

  beforeAll(async () => {
    tmpFolder = await tmp.dir({ unsafeCleanup: true })
    ipfs = await Ipfs.create(genIpfsConf(tmpFolder.path))
    ceramic = await Ceramic.create(ipfs, { stateStoreDirectory: tmpFolder.path + '/ceramic/' })
    await publishIDXConfig(ceramic)
  })

  afterAll(async () => {
    await ceramic.close()
    await ipfs.stop()
    await tmpFolder.cleanup()
  })

  describe('.create', () => {
    it('Creates instance from seed', async () => {
      const config = {
        getPermission: getPermissionMock,
        seed,
        ceramic
      }
      const idw = await ThreeIdProvider.create(config)
      expect(await ceramic.context.resolver.resolve(idw.id)).toMatchSnapshot()
      expect(await idw.keychain.list()).toEqual([])
    })

    it('Creates instance from authSecret, new DID', async () => {
      const config = {
        getPermission: getPermissionMock,
        authSecret: randomAuthSecret(),
        authId: 'testAuth',
        ceramic
      }
      const idw = await ThreeIdProvider.create(config)
      expect(await ceramic.context.resolver.resolve(idw.id)).toBeDefined()
      expect(await idw.keychain.list()).toEqual(['testAuth'])
    })

    it('Creates instance from authSecret, existing DID', async () => {
      const config = {
        getPermission: getPermissionMock,
        authSecret: randomAuthSecret(),
        authId: 'testAuth',
        ceramic
      }
      const idw1 = await ThreeIdProvider.create(config)
      expect(await ceramic.context.resolver.resolve(idw1.id)).toBeDefined()
      expect(await idw1.keychain.list()).toEqual(['testAuth'])

      const idw2 = await ThreeIdProvider.create(config)
      expect(await idw2.keychain.list()).toEqual(['testAuth'])
      expect(idw1.id).toEqual(idw2.id)
    })

    it('Create instance with seed & v03ID', async () => {
      const v03ID = 'did:3:bafyreidv6yl2bbmuslkqby45hdn6sd6ha22zlolxjjxxz4suuwfqpezewu'
      const config = {
        getPermission: getPermissionMock,
        seed,
        v03ID,
        ceramic
      }
      const idw = await ThreeIdProvider.create(config)
      expect(idw.id).toEqual(v03ID)
      expect(await ceramic.context.resolver.resolve(idw.id)).toMatchSnapshot()
      expect(await idw.keychain.list()).toEqual([])
    })
  })

  describe('.keychain', () => {
    it('Adds authSecret to the keychain', async () => {
      const config1 = { getPermission: getPermissionMock, seed, ceramic }
      const idw1 = await ThreeIdProvider.create(config1)
      expect(await idw1.keychain.list()).toEqual([])

      await idw1.keychain.add('auth2', randomAuthSecret())
      await idw1.keychain.commit()
      expect(await idw1.keychain.list()).toEqual(['auth2'])
    })

    it('Creates instance from added authSecret', async () => {
      const config1 = { getPermission: getPermissionMock, seed: randomBytes(32), ceramic }
      const idw1 = await ThreeIdProvider.create(config1)
      expect(await idw1.keychain.list()).toEqual([])

      const config2 = {
        getPermission: getPermissionMock,
        authId: 'auth2',
        authSecret: randomAuthSecret(),
        ceramic
      }
      await idw1.keychain.add(config2.authId, config2.authSecret)
      await idw1.keychain.commit()

      const idw2 = await ThreeIdProvider.create(config2)
      expect(await idw2.keychain.list()).toEqual(['auth2'])
      expect(idw1.id).toEqual(idw2.id)
    })

    it('Removes authSecret from keychain and creates instance', async () => {
      const config1 = {
        getPermission: getPermissionMock,
        authSecret: randomAuthSecret(),
        authId: 'auth1',
        ceramic
      }
      const idw1 = await ThreeIdProvider.create(config1)
      expect(await idw1.keychain.list()).toEqual(['auth1'])
      const config2 = {
        getPermission: getPermissionMock,
        authId: 'auth2',
        authSecret: randomAuthSecret(),
        ceramic
      }
      await idw1.keychain.add(config2.authId, config2.authSecret)
      await idw1.keychain.commit()
      expect(await idw1.keychain.list()).toEqual(['auth1', 'auth2'])

      await idw1.keychain.remove('auth1')
      await idw1.keychain.commit()
      expect(await idw1.keychain.list()).toEqual(['auth2'])
      const idw2 = await ThreeIdProvider.create(config2)
      expect(idw1.id).toEqual(idw2.id)
      await expect(ThreeIdProvider.create(config1)).rejects.toThrow('Unable to find auth data')
    })

    it('Does keyrotation when v03ID is being used', async () => {
      const v03ID = 'did:3:bafyreiffkeeq4wq2htejqla2is5ognligi4lvjhwrpqpl2kazjdoecmugi'
      const config = {
        getPermission: getPermissionMock,
        seed,
        v03ID,
        ceramic
      }
      const idw1 = await ThreeIdProvider.create(config)
      const config1 = { getPermission: getPermissionMock, authId: 'auth1', authSecret: randomAuthSecret(), ceramic }
      const config2 = { getPermission: getPermissionMock, authId: 'auth2', authSecret: randomAuthSecret(), ceramic }
      await idw1.keychain.add(config1.authId, config1.authSecret)
      await idw1.keychain.add(config2.authId, config2.authSecret)
      await idw1.keychain.commit()
      expect(await idw1.keychain.list()).toEqual(['auth2', 'auth1'])

      await idw1.keychain.remove('auth1')
      await idw1.keychain.commit()
      expect(await idw1.keychain.list()).toEqual(['auth2'])
      const idw2 = await ThreeIdProvider.create(config2)
      expect(idw1.id).toEqual(idw2.id)
      await expect(ThreeIdProvider.create(config1)).rejects.toThrow('Unable to find auth data')
    })
  })

  it('.resetIDX calls the method on threeIdx', async () => {
    const reset = jest.fn()
    const idw = await ThreeIdProvider.create({ getPermission: getPermissionMock, seed, ceramic })
    idw._threeIdx.resetIDX = reset
    await idw.resetIDX()
    expect(reset).toHaveBeenCalled()
  })
})

describe('ThreeIdProvider with disabled IDX', () => {
  let tmpFolder
  let ipfs, ceramic

  beforeAll(async () => {
    tmpFolder = await tmp.dir({ unsafeCleanup: true })
    ipfs = await Ipfs.create(genIpfsConf(tmpFolder.path))
    ceramic = await Ceramic.create(ipfs, { stateStoreDirectory: tmpFolder.path + '/ceramic/' })
  })

  afterAll(async () => {
    await ceramic.close()
    await ipfs.stop()
    await tmpFolder.cleanup()
  })

  describe('.create', () => {
    it('Creates instance from seed', async () => {
      const config = {
        getPermission: getPermissionMock,
        seed,
        ceramic,
        disableIDX: true,
      }
      const idw = await ThreeIdProvider.create(config)
      expect(await ceramic.context.resolver.resolve(idw.id)).toBeDefined()
      expect(await idw.keychain.list()).toEqual([])
      expect(idw._threeIdx.docs.idx).toBeUndefined()
    })

    it('Throws when trying to creates instance from authSecret', async () => {
      const config = {
        getPermission: getPermissionMock,
        authSecret: randomAuthSecret(),
        authId: 'testAuth',
        ceramic,
        disableIDX: true,
      }
      await expect(ThreeIdProvider.create(config)).rejects.toThrow(
        'AuthId cannot be used with disableIDX'
      )
    })
  })
})