import IdentityWallet from '../src/identity-wallet'
import { naclRandom } from '../src/crypto'

import { verifyJWT } from 'did-jwt'
import { Resolver } from 'did-resolver'
import tmp from 'tmp-promise'
import Ceramic from '@ceramicnetwork/ceramic-core'
import Ipfs from 'ipfs'

const seed = '0x6e34b2e1a9624113d81ece8a8a22e6e97f0e145c25c1d4d2d0e62753b4060c837097f768559e17ec89ee20cba153b23b9987912ec1e860fa1212ba4b84c776ce'

const randomAuthSecret = () => naclRandom(32)
const getPermissionMock = jest.fn(async () => [])

const genIpfsConf = (folder) => {
  return {
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
      expect(await ceramic.context.resolver.resolve(idw.DID)).toMatchSnapshot()
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
      expect(idw1.keychain.list()).toEqual(['testAuth'])

      const idw2 = await IdentityWallet.create(config)
      expect(idw2.keychain.list()).toEqual(['testAuth'])
      expect(idw1.DID).toEqual(idw2.DID)
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
      expect(idw1.DID).toEqual(idw2.DID)
    })
  })
})
