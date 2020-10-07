import { mnemonicToSeed } from '@ethersproject/hdnode'
import * as u8a from 'uint8arrays'

import { randomBytes } from '../src/crypto'
import Keyring from '../src/keyring'

describe('Keyring', () => {
  const seed = u8a.fromString('f0e4c2f76c58916ec258f246851bea091d14d4247a2fc3e18694461b1816e13b', 'base16')

  it('Generates random seed if none passed', async () => {
    const keyring = new Keyring()
    expect(keyring.serialize()).toBeDefined()
  })

  it('Derives correct keys from seed', async () => {
    const keyring = new Keyring(seed)
    expect(keyring.serialize()['latest']).toEqual(seed)
    expect(keyring.get3idState(true)).toMatchSnapshot()
    expect(keyring.getEncryptionPublicKey()).toMatchSnapshot()
    expect(keyring.serialize()).toMatchSnapshot()
  })
})
