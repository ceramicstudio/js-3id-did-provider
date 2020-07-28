import { mnemonicToSeed } from '@ethersproject/hdnode'

import { naclRandom } from '../src/crypto'
import Keyring from '../src/keyring'

const migratedKeys = JSON.stringify({
  managementAddress: '0x8fef7ac873dec3cc8a112ea20cd25d4f01cb3e6a',
  seed:
    '0x8e641c0dc77f6916cc7f743dad774cdf9f6f7bcb880b11395149dd878377cd398650bbfd4607962b49953c87da4d7f3ff247ed734b06f96bdd69479377bc612b',
  spaceSeeds: {
    space1:
      '0xcaf77e39b1e480fabffded1f53b60d6f3ade208205f84021e5cdad7e34c1177d5bf8ef9cf55b053f32e704027259e5c7de89ca871558715985e859b4ea522666',
    space2:
      '0x4799b693d258582dc0439ede87e007fa853b78678e4ba87811bb6044b84c411ba6cf64232448ddc3c72bb9ecc200e17ebf739187967c0f18c48f5f3f1dd0375b',
  },
})

describe('Keyring', () => {
  let keyring
  const seed = mnemonicToSeed(
    'clay rubber drama brush salute cream nerve wear stuff sentence trade conduct'
  )

  it('throws error if no seed', async () => {
    expect(() => new Keyring()).toThrow()
  })

  it('derives correct keys from entropy', async () => {
    keyring = new Keyring(
      '0xf0e4c2f76c58916ec258f246851bea091d14d4247a2fc3e18694461b1816e13b'
    )
    // keyring3 = new Keyring('0x24a0bc3a2a1d1404c0ab24bef9bb0618938ee892fbf62f63f82f015eddf1729e')
    expect(keyring._seed).toEqual(
      '0xf0e4c2f76c58916ec258f246851bea091d14d4247a2fc3e18694461b1816e13b'
    )
  })

  const seedKeyring = new Keyring(seed)
  const migratedKeyring = new Keyring(undefined, migratedKeys)
  const cases = [
    ['seed', seedKeyring],
    ['migratedKeys', migratedKeyring],
  ]

  describe.each(cases)('Keyring from %s', (type, keyring1) => {
    it('derives correct keys from', async () => {
      expect(keyring1.getPublicKeys()).toMatchSnapshot()
      expect(keyring1.getPublicKeys({ mgmtPub: true })).toMatchSnapshot()
      expect(keyring1.getPublicKeys({ uncompressed: true })).toMatchSnapshot()
      if (type === 'seed') expect(keyring1.serialize()).toEqual(seed)
    })

    it('signs data correctly', async () => {
      expect(await keyring1.getJWTSigner()('asdf')).toMatchSnapshot()
      expect(await keyring1.getJWTSigner('space1')('asdf')).toMatchSnapshot()
      expect(await keyring1.getJWTSigner('space2')('asdf')).toMatchSnapshot()
    })

    it('encrypts and decrypts correctly', () => {
      const testMsg = 'Very secret test message'
      const box = keyring1.asymEncrypt(
        testMsg,
        keyring.getPublicKeys().asymEncryptionKey
      )

      const cleartext = keyring.asymDecrypt(
        box.ciphertext,
        box.ephemeralFrom,
        box.nonce
      )
      expect(cleartext).toEqual(testMsg)
    })

    it('symmetrically encrypts correctly', async () => {
      const testMsg = 'Very secret test message'
      const box = keyring.symEncrypt(testMsg)
      const cleartext = keyring.symDecrypt(box.ciphertext, box.nonce)
      expect(cleartext).toEqual(testMsg)
    })

    it('encrypts and decrypts correctly with authSecret', () => {
      const testMsg = 'Very secret test message'
      const authSecret = Buffer.from(naclRandom(32)).toString('hex')

      const box = Keyring.encryptWithAuthSecret(testMsg, authSecret)
      const cleartext = Keyring.decryptWithAuthSecret(
        box.ciphertext,
        box.nonce,
        authSecret
      )
      expect(cleartext).toEqual(testMsg)
    })
  })
})
