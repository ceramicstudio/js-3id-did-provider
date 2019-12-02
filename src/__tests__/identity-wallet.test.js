const IdentityWallet = require('../identity-wallet')
const HDNode = require('@ethersproject/hdnode')
const { decodeJWT, verifyJWT } = require('did-jwt')
const { registerMethod } = require('did-resolver')

const wallet1Conf = {
  seed: HDNode.mnemonicToSeed('clay rubber drama brush salute cream nerve wear stuff sentence trade conduct')
}
const wallet2Conf = {
  authSecret: '24a0bc3a2a1d1404c0ab24bef9bb0618938ee892fbf62f63f82f015eddf1729e'
}
const secondaryAuthSecret = '4567898765434567c0ab24bef9bb0618938ee892fbf62f63f82f015eddf1729e'
const badAuthData = [{
  nonce: 'Lxcd05Yk4aC8LCLbFjowzD3W6Uqx+v+n',
  ciphertext: 'elxT3d5Cxx4N9kIzRnJx0U1iKB1wLQu2u4pebshF3xXUEhw72rbCCfTsnNEKY3185MhRok0/t23Iyel5r6HJx/YOfj1XaKb4t9Ci8y21Bs38rQ=='
}]
const getConsentMock = jest.fn(() => false)

registerMethod('3', async (_, { id }) => {
  let key
  if (id === 'bafyreia6evyez2xdlewmbh7hfz3dz3besmlhnlrnkiounscnnvboym7q2u' || id === 'first') {
    key = '027ab5238257532f486cbeeac59a5721bbfec2f13c3d26516ca9d4c5f0ec1aa229'
  } else {
    // key for 'space1'
    key = '0283441873077702f08a9e84d0ff869b5d08cb37361d77c7e5c57777e953670a0d'
  }
  return {
    '@context': 'https://w3id.org/did/v1',
    'id': 'did:3:' + id,
    'publicKey': [{
      'id': 'did:3:' + id + '#owner',
      'type': 'Secp256k1VerificationKey2018',
      'owner': 'did:3:' + id,
      'publicKeyHex': key
    }],
    'authentication': [{
      'type': 'Secp256k1SignatureAuthentication2018',
      'publicKey': 'did:3:' + id + '#owner'
    }]
  }
})


describe('IdentityWallet', () => {

  let idWallet1, idWallet2

  beforeAll(() => {
    idWallet1 = new IdentityWallet(getConsentMock, wallet1Conf)
    idWallet2 = new IdentityWallet(getConsentMock, wallet2Conf)
  })

  it('should be correctly constructed', async () => {
    expect(idWallet1._seed).toBeDefined()
    expect(idWallet2._authSecret).toBeDefined()
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
      expect(() => new IdentityWallet(wallet1Conf)).toThrow('getConsent parameter has to be a function')
    })

    it('returns false if no consent given', async () => {
      expect(await idWallet1.getConsent([], origin)).toBeFalsy()
      expect(getConsentMock).toHaveBeenCalledTimes(1)
      expect(getConsentMock).toHaveBeenCalledWith({ type, spaces: [], origin })
    })

    it('works without spaces', async () => {
      getConsentMock.mockImplementationOnce(() => true)
      expect(await idWallet1.getConsent([], origin)).toBeTruthy()
      expect(getConsentMock).toHaveBeenCalledTimes(1)
      expect(getConsentMock).toHaveBeenCalledWith({ type, spaces: [], origin })
    })

    it('should not call consent fn if consent already given', async () => {
      expect(await idWallet1.getConsent([], origin)).toBeTruthy()
      expect(getConsentMock).toHaveBeenCalledTimes(0)
    })

    it('should not have consent for different origin', async () => {
      expect(await idWallet1.hasConsent([], 'https://my.other.origin')).toBeFalsy()
    })

    it('works with spaces', async () => {
      const spaces = ['s1', 's2', 's3']
      getConsentMock.mockImplementationOnce(() => true)
      expect(await idWallet1.getConsent(spaces, origin)).toBeTruthy()
      expect(getConsentMock).toHaveBeenCalledTimes(1)
      expect(getConsentMock).toHaveBeenCalledWith({ type, spaces, origin })
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
    let authData = []

    beforeEach(() => {
      getConsentMock.mockImplementation(() => true)
      idWallet2 = new IdentityWallet(getConsentMock, wallet2Conf)
    })

    it('works correctly w/ seed only wallet', async () => {
      expect(await idWallet1.authenticate()).toMatchSnapshot()
      expect(await idWallet1.authenticate(['space1', 'space2'])).toMatchSnapshot()
      expect(await idWallet1.authenticate(['space3', 'space4'])).toMatchSnapshot()
      expect(await idWallet1.authenticate(['space2', 'space3'])).toMatchSnapshot()
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
      expect(await idWallet2.authenticate([], { authData })).toEqual(authPubKeys)
    })

    it('should throw if no valid authSecrets', async () => {
      await expect(idWallet2.authenticate([], { authData: badAuthData })).rejects.toMatchSnapshot()
    })

    it('addAuthMethod works correctly', async () => {
      const authDataPromise = new Promise((resolve, reject) => {
        idWallet2.events.on('new-auth-method', resolve)
      })
      expect(await idWallet2.authenticate([], { authData })).toEqual(authPubKeys)
      const linkProofPromise = new Promise((resolve, reject) => {
        idWallet2.events.on('new-link-proof', resolve)
      })
      await idWallet2.addAuthMethod(secondaryAuthSecret)
      authData.push(await authDataPromise)
      const linkAddress = (await linkProofPromise).address

      const idWallet3 = new IdentityWallet(getConsentMock, {
        authSecret: secondaryAuthSecret
      })
      expect((await idWallet3.getLink()).toLowerCase()).toEqual(linkAddress)
      expect(await idWallet3.authenticate([], { authData })).toEqual(authPubKeys)
    })
  })

  it('signClaim creates JWTs correctly', async () => {
    const payload = {
      some: 'data'
    }
    const jwt0 = await idWallet1.signClaim(payload)
    const jwt1 = await idWallet1.signClaim(payload, { DID: 'did:3:first' })
    const jwt2 = await idWallet1.signClaim(payload, { space: 'space1' })

    expect(await verifyJWT(jwt0)).toBeDefined()
    expect(await verifyJWT(jwt1)).toBeDefined()
    expect(await verifyJWT(jwt2)).toBeDefined()
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
})
