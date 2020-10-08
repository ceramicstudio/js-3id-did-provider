import IdentityWallet from '../src/identity-wallet'
import { randomBytes } from '../src/crypto'

import { verifyJWT } from 'did-jwt'
import { Resolver } from 'did-resolver'
import tmp from 'tmp-promise'
import Ceramic from '@ceramicnetwork/ceramic-core'
import Ipfs from 'ipfs'
import { publishIDXConfig } from '@ceramicstudio/idx-tools'

import dagJose from 'dag-jose'
import basicsImport from 'multiformats/cjs/src/basics-import.js'
import legacy from 'multiformats/cjs/src/legacy.js'

const seed = '0x6e34b2e1a9624113d81ece8a8a22e6e97f0e145c25c1d4d2d0e62753b4060c837097f768559e17ec89ee20cba153b23b9987912ec1e860fa1212ba4b84c776ce'

const randomAuthSecret = () => randomBytes(32)
const getPermissionMock = jest.fn(async () => [])

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

describe('IdentityWallet', () => {
  jest.setTimeout(15000)
  let tmpFolder
  let ipfs, ceramic

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

  describe('.create', () => {
    it('Creates instance from seed', async () => {
      const config = {
        getPermission: getPermissionMock,
        seed,
        ceramic
      }
      const idw = await IdentityWallet.create(config)
      expect(await ceramic.context.resolver.resolve(idw.id)).toBeDefined()
      expect(idw.keychain.list()).toEqual([])
    })

    it('Creates instance from authSecret, new DID', async () => {
      const config = {
        getPermission: getPermissionMock,
        authSecret: randomAuthSecret(),
        authId: 'testAuth',
        ceramic
      }
      const idw = await IdentityWallet.create(config)
      expect(await ceramic.context.resolver.resolve(idw.id)).toBeDefined()
      expect(idw.keychain.list()).toEqual(['testAuth'])
    })

    it('Creates instance from authSecret, existing DID', async () => {
      const config = {
        getPermission: getPermissionMock,
        authSecret: randomAuthSecret(),
        authId: 'testAuth',
        ceramic
      }
      const idw1 = await IdentityWallet.create(config)
      expect(await ceramic.context.resolver.resolve(idw1.id)).toBeDefined()
      expect(idw1.keychain.list()).toEqual(['testAuth'])

      const idw2 = await IdentityWallet.create(config)
      expect(idw2.keychain.list()).toEqual(['testAuth'])
      expect(idw1.id).toEqual(idw2.id)
    })
  })

  describe('.keychain', () => {
    it('Adds authSecret to the keychain', async () => {
      const config1 = { getPermission: getPermissionMock, seed, ceramic }
      const idw1 = await IdentityWallet.create(config1)
      expect(idw1.keychain.list()).toEqual([])

      await idw1.keychain.add('auth2', randomAuthSecret())
      await idw1.keychain.commit()
      expect(idw1.keychain.list()).toEqual(['auth2'])
    })

    it('Creates instance from added authSecret', async () => {
      const config1 = { getPermission: getPermissionMock, seed, ceramic }
      const idw1 = await IdentityWallet.create(config1)
      expect(idw1.keychain.list()).toEqual([])

      const config2 = {
        getPermission: getPermissionMock,
        authId: 'auth2',
        authSecret: randomAuthSecret(),
        ceramic
      }
      await idw1.keychain.add(config2.authId, config2.authSecret)
      await idw1.keychain.commit()

      const idw2 = await IdentityWallet.create(config2)
      expect(idw2.keychain.list()).toEqual(['auth2'])
      expect(idw1.id).toEqual(idw2.id)
    })
  })
})

describe('IdentityWallet with disabled IDX', () => {
  jest.setTimeout(15000)
  let tmpFolder
  let ipfs, ceramic

  beforeAll(async () => {
    tmpFolder = await tmp.dir({ unsafeCleanup: true })
    ipfs = await Ipfs.create(genIpfsConf(tmpFolder.path))
    ceramic = await Ceramic.create(ipfs, { stateStorePath: tmpFolder.path + '/ceramic/' })
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
      const idw = await IdentityWallet.create(config)
      expect(await ceramic.context.resolver.resolve(idw.id)).toBeDefined()
      expect(idw.keychain.list()).toEqual([])
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
      await expect(IdentityWallet.create(config)).rejects.toThrow(
        'AuthId cannot be used with disableIDX'
      )
    })
  })
})
