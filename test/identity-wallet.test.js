import IdentityWallet from '../src/identity-wallet'
import { mnemonicToSeed } from '@ethersproject/hdnode'
import { verifyJWT } from 'did-jwt'
import { Resolver } from 'did-resolver'

const wallet1Conf = {
  seed: mnemonicToSeed(
    'clay rubber drama brush salute cream nerve wear stuff sentence trade conduct'
  ),
}
const wallet2Conf = {
  authSecret:
    '24a0bc3a2a1d1404c0ab24bef9bb0618938ee892fbf62f63f82f015eddf1729e',
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

const secondaryAuthSecret =
  '4567898765434567c0ab24bef9bb0618938ee892fbf62f63f82f015eddf1729e'
const badAuthData = [
  {
    nonce: 'Lxcd05Yk4aC8LCLbFjowzD3W6Uqx+v+n',
    ciphertext:
      'elxT3d5Cxx4N9kIzRnJx0U1iKB1wLQu2u4pebshF3xXUEhw72rbCCfTsnNEKY3185MhRok0/t23Iyel5r6HJx/YOfj1XaKb4t9Ci8y21Bs38rQ==',
  },
]
const getConsentMock = jest.fn(() => false)

const resolver = new Resolver({
  '3': async (did, { id }) => {
    let key
    if (
      id === 'bafyreia6evyez2xdlewmbh7hfz3dz3besmlhnlrnkiounscnnvboym7q2u' ||
      id === 'first'
    ) {
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
  },
})

describe('IdentityWallet', () => {
  let idWallet1, idWallet2, idWalletExternalAuth

  beforeAll(() => {
    idWallet1 = new IdentityWallet(getConsentMock, wallet1Conf)
    idWallet2 = new IdentityWallet(getConsentMock, wallet2Conf)
    idWalletExternalAuth = new IdentityWallet(
      getConsentMock,
      walletExternalAuthConf
    )
  })

  it('should be correctly constructed', async () => {
    expect(idWallet1._seed).toBeDefined()
    expect(idWallet2._authSecret).toBeDefined()
    expect(idWalletExternalAuth._externalAuth).toBeDefined()
  })

  it('getLink correctly', async () => {
    const linkProofPromise = new Promise((resolve, reject) => {
      idWallet1.events.on('new-link-proof', resolve)
    })
    expect(await idWallet1.getLink()).toMatchSnapshot()
    await linkProofPromise
    expect(await idWallet2.getLink()).toMatchSnapshot()
  })

  describe('consent functionality', () => {
    const origin = 'https://my.origin'
    const type = 'authenticate'

    beforeEach(() => {
      getConsentMock.mockClear()
    })

    it('should throw if getConsent param not passed to constructor', async () => {
      expect(() => new IdentityWallet(wallet1Conf)).toThrow(
        'getConsent parameter has to be a function'
      )
    })

    it('returns false if no consent given', async () => {
      expect(await idWallet1.getConsent([], origin)).toBeFalsy()
      expect(getConsentMock).toHaveBeenCalledTimes(1)
      expect(getConsentMock).toHaveBeenCalledWith({
        type,
        spaces: [],
        origin,
        opts: { address: undefined },
      })
    })

    it('works without spaces', async () => {
      getConsentMock.mockImplementationOnce(() => true)
      expect(await idWallet1.getConsent([], origin)).toBeTruthy()
      expect(getConsentMock).toHaveBeenCalledTimes(1)
      expect(getConsentMock).toHaveBeenCalledWith({
        type,
        spaces: [],
        origin,
        opts: { address: undefined },
      })
    })

    it('should not call consent fn if consent already given', async () => {
      expect(await idWallet1.getConsent([], origin)).toBeTruthy()
      expect(getConsentMock).toHaveBeenCalledTimes(0)
    })

    it('should not have consent for different origin', async () => {
      expect(
        await idWallet1.hasConsent([], 'https://my.other.origin')
      ).toBeFalsy()
    })

    it('works with spaces', async () => {
      const spaces = ['s1', 's2', 's3']
      getConsentMock.mockImplementationOnce(() => true)
      expect(await idWallet1.getConsent(spaces, origin)).toBeTruthy()
      expect(getConsentMock).toHaveBeenCalledTimes(1)
      expect(getConsentMock).toHaveBeenCalledWith({
        type,
        spaces,
        origin,
        opts: { address: undefined },
      })
    })

    it('works with spaces, already have consent', async () => {
      const spaces = ['s1', 's2']
      expect(await idWallet1.getConsent(spaces, origin)).toBeTruthy()
      expect(getConsentMock).toHaveBeenCalledTimes(0)
    })
  })

  it('addAuthMethod should throw before authenticate', async () => {
    await expect(idWallet2.addAuthMethod()).rejects.toMatchSnapshot()
  })

  describe('authenticate', () => {
    let authPubKeys
    const authData = []

    beforeEach(() => {
      getConsentMock.mockImplementation(() => true)
      idWallet2 = new IdentityWallet(getConsentMock, wallet2Conf)
    })

    it('works correctly w/ seed only wallet', async () => {
      expect(await idWallet1.authenticate()).toMatchSnapshot()
      expect(
        await idWallet1.authenticate(['space1', 'space2'])
      ).toMatchSnapshot()
      expect(
        await idWallet1.authenticate(['space3', 'space4'])
      ).toMatchSnapshot()
      expect(
        await idWallet1.authenticate(['space2', 'space3'])
      ).toMatchSnapshot()
    })

    it('should generate seed if no auth data passed', async () => {
      const authDataPromise = new Promise((resolve, reject) => {
        idWallet2.events.on('new-auth-method', resolve)
      })
      const linkProofPromise = new Promise((resolve, reject) => {
        idWallet2.events.on('new-link-proof', resolve)
      })
      expect(idWallet2._keyring).toBeUndefined()
      authPubKeys = await idWallet2.authenticate()
      authData.push(await authDataPromise)
      await linkProofPromise
    })

    it('should auth if auth-data is passed', async () => {
      expect(idWallet2._keyring).toBeUndefined()
      expect(await idWallet2.authenticate([], { authData })).toEqual(
        authPubKeys
      )
    })

    it('should throw if no valid authSecrets', async () => {
      await expect(
        idWallet2.authenticate([], { authData: badAuthData })
      ).rejects.toMatchSnapshot()
    })

    it('addAuthMethod works correctly', async () => {
      const authDataPromise = new Promise((resolve, reject) => {
        idWallet2.events.on('new-auth-method', resolve)
      })
      expect(await idWallet2.authenticate([], { authData })).toEqual(
        authPubKeys
      )
      const linkProofPromise = new Promise((resolve, reject) => {
        idWallet2.events.on('new-link-proof', resolve)
      })
      await idWallet2.addAuthMethod(secondaryAuthSecret)
      authData.push(await authDataPromise)
      const linkAddress = (await linkProofPromise).address

      const idWallet3 = new IdentityWallet(getConsentMock, {
        authSecret: secondaryAuthSecret,
      })
      expect((await idWallet3.getLink()).toLowerCase()).toEqual(linkAddress)
      expect(await idWallet3.authenticate([], { authData })).toEqual(
        authPubKeys
      )
    })
  })

  describe('authenticate externalAuth migration', () => {
    let getConsent, initKeyring

    beforeEach(() => {
      getConsentMock.mockImplementation(() => true)
      idWalletExternalAuth = new IdentityWallet(
        getConsentMock,
        walletExternalAuthConf
      )
      getConsent = jest.spyOn(idWalletExternalAuth, 'getConsent')
      initKeyring = jest.spyOn(idWalletExternalAuth, '_initKeyring')
    })

    const opts = { address: migratedKeys.managementAddress }

    it('returns keys', async () => {
      const opts = { address: migratedKeys.managementAddress }
      expect(
        await idWalletExternalAuth.authenticate([], opts)
      ).toMatchSnapshot()
      expect(
        await idWalletExternalAuth.authenticate(['space1'], opts)
      ).toMatchSnapshot()
      expect(
        await idWalletExternalAuth.authenticate(['space1', 'space2'], opts)
      ).toMatchSnapshot()
    })

    it('throws if request space not available in migratedKeys', async () => {
      await expect(
        idWalletExternalAuth.authenticate(['notSpace '], opts)
      ).rejects.toThrow(/not derive/)
    })

    it('getConsent function is called before creating keyring', async () => {
      const order = (spy) => spy.mock.invocationCallOrder[0]
      await idWalletExternalAuth.authenticate([], opts)
      expect(order(getConsent)).toBeLessThan(order(initKeyring))
    })

    it('getConsent function is given address arg', async () => {
      await idWalletExternalAuth.authenticate([], opts)
      expect(getConsent).toHaveBeenCalledWith([], undefined, opts)
    })

    it('keyring is created on every auth request', async () => {
      await idWalletExternalAuth.authenticate([], opts)
      await idWalletExternalAuth.authenticate([], opts)
      await idWalletExternalAuth.authenticate([], opts)
      expect(initKeyring).toHaveBeenCalledTimes(3)
    })

    it('throws if not given address opts ', async () => {
      await expect(idWalletExternalAuth.authenticate([])).rejects.toThrow(
        /requires an address/
      )
    })
  })

  it('signClaim creates JWTs correctly', async () => {
    const payload = {
      some: 'data',
    }
    const jwt0 = await idWallet1.signClaim(payload)
    const jwt1 = await idWallet1.signClaim(payload, { DID: 'did:3:first' })
    const jwt2 = await idWallet1.signClaim(payload, { space: 'space1' })

    expect(await verifyJWT(jwt0, { resolver })).toBeDefined()
    expect(await verifyJWT(jwt1, { resolver })).toBeDefined()
    expect(await verifyJWT(jwt2, { resolver })).toBeDefined()
  })

  it('encrypt/decrypt works correctly', async () => {
    // encrypt and decrypt should work
    const msg1 = 'secret message'
    const encObj1 = await idWallet1.encrypt(msg1)
    expect(await idWallet1.decrypt(encObj1)).toEqual(msg1)

    // decrypt with wrong key should fail
    await expect(idWallet1.decrypt(encObj1, 'space1')).rejects.toMatchSnapshot()

    // encrypt and decrypt should work with space
    const msg2 = 'secret message two'
    const encObj2 = await idWallet1.encrypt(msg2, 'space1')
    expect(await idWallet1.decrypt(encObj2, 'space1')).toEqual(msg2)
  })

  it('asymmetrically encrypt/decrypt works correctly', async () => {
    // encrypt and decrypt should work
    const msg1 = 'secret message'
    const { asymEncryptionKey } = idWallet1._keyring.getPublicKeys({
      space: 'space1',
    })
    const encObj1 = await idWallet1.encrypt(msg1, null, {
      to: asymEncryptionKey,
    })
    expect(await idWallet1.decrypt(encObj1, 'space1')).toEqual(msg1)

    // decrypt with wrong key should fail
    await expect(idWallet1.decrypt(encObj1, 'space2')).rejects.toMatchSnapshot()
  })
})
