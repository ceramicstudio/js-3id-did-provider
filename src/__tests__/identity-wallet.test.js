const IdentityWallet = require('../identity-wallet')
const { HDNode } = require('ethers').utils
const { verifyJWT } = require('did-jwt')
const { registerMethod } = require('did-resolver')

const seed = HDNode.mnemonicToSeed('clay rubber drama brush salute cream nerve wear stuff sentence trade conduct')

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

  let idWallet

  beforeEach(() => {
    idWallet = new IdentityWallet({ seed })
  })

  it('should be correctly constructed', async () => {
    expect(idWallet._keyring).toBeDefined()
  })

  it('getAddress correctly', async () => {
    expect(await idWallet.getAddress()).toEqual(null)
  })

  it('authenticate works correctly', async () => {
    expect(await idWallet.authenticate()).toMatchSnapshot()
    expect(await idWallet.authenticate(['space1', 'space2'])).toMatchSnapshot()
    expect(await idWallet.authenticate(['space3', 'space4'])).toMatchSnapshot()
    expect(await idWallet.authenticate(['space2', 'space3'])).toMatchSnapshot()
  })

  it('addAuthMethod works correctly', async () => {
    expect(await idWallet.addAuthMethod()).toEqual(undefined)
  })

  it('signClaim throws without DID', async () => {
    const payload = {
      some: 'data'
    }
    await expect(idWallet.signClaim(payload)).rejects.toThrow(/No issuing DID/)
  })

  it('signClaim creates JWTs correctly', async () => {
    const payload = {
      some: 'data'
    }
    const jwt1 = await idWallet.signClaim(payload, { DID: 'did:3:first' })
    const jwt2 = await idWallet.signClaim(payload, { DID: 'did:3:firstSub', space: 'space1' })

    expect(await verifyJWT(jwt1)).toBeDefined()
    expect(await verifyJWT(jwt2)).toBeDefined()
  })

  it('encrypt/decrypt works correctly', async () => {
    // encrypt and decrypt should work
    const msg1 = 'secret message'
    const encObj1 = await idWallet.encrypt(msg1)
    expect(await idWallet.decrypt(encObj1)).toEqual(msg1)

    // decrypt with wrong key should fail
    await expect(idWallet.decrypt(encObj1, 'space1')).rejects.toMatchSnapshot()

    // encrypt and decrypt should work with space
    const msg2 = 'secret message two'
    const encObj2 = await idWallet.encrypt(msg2, 'space1')
    expect(await idWallet.decrypt(encObj2, 'space1')).toEqual(msg2)
  })
})
