import IdentityWallet from '../src/identity-wallet'

import { verifyJWT } from 'did-jwt'
import { Resolver } from 'did-resolver'
import tmp from 'tmp-promise'
import Ceramic from '@ceramicnetwork/ceramic-core'
import Ipfs from 'ipfs'

const seed = '0x6e34b2e1a9624113d81ece8a8a22e6e97f0e145c25c1d4d2d0e62753b4060c837097f768559e17ec89ee20cba153b23b9987912ec1e860fa1212ba4b84c776ce'
const wallet2Conf = {
  authSecret: '24a0bc3a2a1d1404c0ab24bef9bb0618938ee892fbf62f63f82f015eddf1729e',
}

const migratedKeys = {
  managementAddress: '0x8fef7ac873dec3cc8a112ea20cd25d4f01cb3e6a',
  seed:
    '0x8e641c0dc77f6916cc7f743dad774cdf9f6f7bcb880b11395149dd878377cd398650bbfd4607962b49953c87da4d7f3ff247ed734b06f96bdd69479377bc612b',
  spaceSeeds: {
    space1:
      '0xcaf77e39b1e480fabffded1f53b60d6f3ade208205f84021e5cdad7e34c1177d5bf8ef9cf55b053f32e704027259e5c7de89ca871558715985e859b4ea522666',
    space2:
      '0x4799b693d258582dc0439ede87e007fa853b78678e4ba87811bb6044b84c411ba6cf64232448ddc3c72bb9ecc200e17ebf739187967c0f18c48f5f3f1dd0375b',
  },
}

const walletExternalAuthConf = {
  externalAuth: jest.fn(({ address, spaces, type }) => {
    if (type === '3id_migration') return JSON.stringify(migratedKeys)
  }),
}

const secondaryAuthSecret = '4567898765434567c0ab24bef9bb0618938ee892fbf62f63f82f015eddf1729e'
const badAuthData = [
  {
    nonce: 'Lxcd05Yk4aC8LCLbFjowzD3W6Uqx+v+n',
    ciphertext:
      'elxT3d5Cxx4N9kIzRnJx0U1iKB1wLQu2u4pebshF3xXUEhw72rbCCfTsnNEKY3185MhRok0/t23Iyel5r6HJx/YOfj1XaKb4t9Ci8y21Bs38rQ==',
  },
]
const getConsentMock = jest.fn(() => false)

const threeIdResolver = async (_, { id }) => {
  let key
  if (id === 'bafyreia6evyez2xdlewmbh7hfz3dz3besmlhnlrnkiounscnnvboym7q2u' || id === 'first') {
    key = '027ab5238257532f486cbeeac59a5721bbfec2f13c3d26516ca9d4c5f0ec1aa229'
  } else {
    // key for 'space1'
    key = '0283441873077702f08a9e84d0ff869b5d08cb37361d77c7e5c57777e953670a0d'
  }
  return {
    '@context': 'https://w3id.org/did/v1',
    id: 'did:3:' + id,
    publicKey: [
      {
        id: 'did:3:' + id + '#owner',
        type: 'Secp256k1VerificationKey2018',
        owner: 'did:3:' + id,
        publicKeyHex: key,
      },
    ],
    authentication: [
      {
        type: 'Secp256k1SignatureAuthentication2018',
        publicKey: 'did:3:' + id + '#owner',
      },
    ],
  }
}

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
  let tmpFolder
  let idw
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

  it('Creates instance correctly', async () => {
    const config = {
      getPermission: async () => [],
      seed,
      ceramic
    }
    idw = await IdentityWallet.create(config)
  })
})
