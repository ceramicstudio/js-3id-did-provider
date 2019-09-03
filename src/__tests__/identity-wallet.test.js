const IdentityWallet = require('../identity-wallet')
const { HDNode } = require('ethers').utils
const { verifyJWT } = require('did-jwt')
const { registerMethod } = require('did-resolver')

const wallet1Conf = {
  seed: HDNode.mnemonicToSeed('clay rubber drama brush salute cream nerve wear stuff sentence trade conduct')
}
const wallet2Conf = {
  authSecret: '24a0bc3a2a1d1404c0ab24bef9bb0618938ee892fbf62f63f82f015eddf1729e',
  ethereumAddress: '0xacae3479659b6c19E4DFf46e0DfEa48AFEBA8345'
}
const secondaryAuthSecret = '4567898765434567c0ab24bef9bb0618938ee892fbf62f63f82f015eddf1729e'
const badAuthData = [{
  nonce: 'Lxcd05Yk4aC8LCLbFjowzD3W6Uqx+v+n',
  ciphertext: 'elxT3d5Cxx4N9kIzRnJx0U1iKB1wLQu2u4pebshF3xXUEhw72rbCCfTsnNEKY3185MhRok0/t23Iyel5r6HJx/YOfj1XaKb4t9Ci8y21Bs38rQ=='
}]

registerMethod('3', async (_, { id }) => {
  let key = id === 'first'
    ? '027ab5238257532f486cbeeac59a5721bbfec2f13c3d26516ca9d4c5f0ec1aa229'
    : '0283441873077702f08a9e84d0ff869b5d08cb37361d77c7e5c57777e953670a0d'
  return {
    '@context': 'https://w3id.org/did/v1',
    'id': 'did:3:first',
    'publicKey': [{
      'id': 'did:3:first#owner',
      'type': 'Secp256k1VerificationKey2018',
      'owner': 'did:3:first',
      'publicKeyHex': key
    }],
    'authentication': [{
      'type': 'Secp256k1SignatureAuthentication2018',
      'publicKey': 'did:3:first#owner'
    }]
  }
})


describe('IdentityWallet', () => {

  let idWallet1, idWallet2

  beforeAll(() => {
    idWallet1 = new IdentityWallet(wallet1Conf)
    idWallet2 = new IdentityWallet(wallet2Conf)
  })

  it('should be correctly constructed', async () => {
    expect(idWallet1._keyring).toBeDefined()
  })

  it('getAddress correctly', async () => {
    expect(await idWallet1.getAddress()).toMatchSnapshot()
    expect(await idWallet2.getAddress()).toEqual(wallet2Conf.ethereumAddress)
  })

  it('addAuthMethod should throw before authenticate', async () => {
    await expect(idWallet2.addAuthMethod()).rejects.toMatchSnapshot()
  })

  describe('authenticate', () => {

    let authPubKeys
    let authData = []

    beforeEach(() => {
      idWallet2 = new IdentityWallet(wallet2Conf)
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
      expect(idWallet2._keyring).toBeUndefined()
      authPubKeys = await idWallet2.authenticate()
      authData.push(await authDataPromise)
    })

    it('should auth if no auth-data is passed', async () => {
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
      await idWallet2.addAuthMethod(secondaryAuthSecret)
      authData.push(await authDataPromise)

      const idWallet3 = new IdentityWallet({
        authSecret: secondaryAuthSecret,
        ethereumAddress: wallet2Conf.ethereumAddress
      })
      expect(await idWallet3.authenticate([], { authData })).toEqual(authPubKeys)
    })
  })

  it('signClaim throws without DID', async () => {
    const payload = {
      some: 'data'
    }
    await expect(idWallet1.signClaim(payload)).rejects.toThrow(/No issuing DID/)
  })

  it('signClaim creates JWTs correctly', async () => {
    const payload = {
      some: 'data'
    }
    const jwt1 = await idWallet1.signClaim(payload, { DID: 'did:3:first' })
    const jwt2 = await idWallet1.signClaim(payload, { DID: 'did:3:firstSub', space: 'space1' })

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
