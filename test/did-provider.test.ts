import { DidProvider } from '../src/did-provider'
import { RPCError } from 'rpc-utils'
import { createJWE, x25519Encrypter } from 'did-jwt'
import { prepareCleartext } from 'dag-jose-utils'
import { randomBytes } from '@stablelib/random'
import { generateKeyPairFromSeed } from '@stablelib/x25519'
import Keyring from '../src/keyring'
import dagCBOR from 'ipld-dag-cbor'
import CID from 'cids'
import * as u8a from 'uint8arrays'
import multihashes from 'multihashes'

describe('DidProvider', () => {
  let nextId = 0
  async function expectRPC(provider, origin, req, res) {
    const id = nextId++
    return await expect(provider.send({ jsonrpc: '2.0', id, ...req }, origin)).resolves.toEqual({
      jsonrpc: '2.0',
      id,
      ...res,
    })
  }
  async function expectRPCError(provider, origin, req, error) {
    const id = nextId++
    return await expect(provider.send({ jsonrpc: '2.0', id, ...req }, origin)).resolves.toEqual(error)
  }

  test('has a `isDidProvider` prop', () => {
    const provider = new DidProvider({})
    expect(provider.isDidProvider).toBe(true)
  })

  test('`did_authenticate` method returns the accounts', async () => {
    const config = {
      permissions: { request: jest.fn(async (origin, paths) => paths) },
      threeIdx: { id: 'did:3:test' },
    }
    await expectRPC(
      new DidProvider(config),
      'foo',
      { method: 'did_authenticate' },
      { result: { did: 'did:3:test', paths: [] } }
    )
    expect(config.permissions.request).toBeCalledWith('foo', [])
    await expectRPC(
      new DidProvider(config),
      'foo',
      { method: 'did_authenticate', params: { paths: ['/1'] } },
      { result: { did: 'did:3:test', paths: ['/1'] } }
    )
  })

  test('`did_createJWS` method throws an error if the user is not authenticated', async () => {
    const payload = { foo: 'bar' }
    const protected = { bar: 'baz' }
    const permissions = { has: jest.fn(() => false) }
    await expectRPC(
      new DidProvider({ permissions }),
      'bar',
      { method: 'did_createJWS', params: { payload, protected } },
      { error: { code: 4100, message: 'Unauthorized' } }
    )
    expect(permissions.has).toBeCalledWith('bar')
  })

  test('`did_createJWS` returns the JWS string', async () => {
    const config = {
      permissions: { has: jest.fn(() => true) },
      threeIdx: {
        parseKeyName: (did) => did.split('#')[1] || 'signing',
        encodeKidWithVersion: async (keyName) => Promise.resolve('did:3:asdf?version=0#' + keyName),
      },
      keyring: { getSigner: () => () => Promise.resolve('signed') },
    }
    const payload = { foo: 'bar' }
    const protected = { bar: 'baz' }
    let did = 'did:3:asdf'
    await expectRPC(
      new DidProvider(config),
      null,
      { method: 'did_createJWS', params: { payload, protected, did } },
      { result: { jws: 'eyJiYXIiOiJiYXoiLCJraWQiOiJkaWQ6Mzphc2RmP3ZlcnNpb249MCNzaWduaW5nIiwiYWxnIjoiRVMyNTZLIn0.eyJmb28iOiJiYXIifQ.signed' } }
    )
    did = 'did:3:asdf#management'
    await expectRPC(
      new DidProvider(config),
      null,
      { method: 'did_createJWS', params: { payload, protected, did } },
      { result: { jws: 'eyJiYXIiOiJiYXoiLCJraWQiOiJkaWQ6Mzphc2RmP3ZlcnNpb249MCNtYW5hZ2VtZW50IiwiYWxnIjoiRVMyNTZLIn0.eyJmb28iOiJiYXIifQ.signed' } }
    )
  })

  test('`did_decryptJWE` correctly decrypts a JWE', async () => {
    const keyring = new Keyring('0xf0e4c2f76c58916ec258f246851bea091d14d4247a2fc3e18694461b1816e13b')
    const encrypter = x25519Encrypter(u8a.fromString(keyring.getPublicKeys().asymEncryptionKey, 'base64pad'))
    const cleartext = prepareCleartext({ asdf: 234 })
    const jwe = await createJWE(cleartext, [encrypter])
    const config = {
      permissions: { has: jest.fn(() => true) },
      keyring,
    }
    await expectRPC(
      new DidProvider(config),
      null,
      { method: 'did_decryptJWE', params: { jwe } },
      { result: u8a.toString(cleartext, 'base64pad') }
    )
  })

  test('`did_decryptJWE` correctly respects permissions', async () => {
    const keyring = new Keyring('0xf0e4c2f76c58916ec258f246851bea091d14d4247a2fc3e18694461b1816e13b')
    const encrypter = x25519Encrypter(u8a.fromString(keyring.getPublicKeys().asymEncryptionKey, 'base64pad'))
    const cleartext1 = prepareCleartext({ paths: ['a'] })
    const cleartext2 = prepareCleartext({ paths: ['b'] })
    const jwe1 = await createJWE(cleartext1, [encrypter])
    const jwe2 = await createJWE(cleartext2, [encrypter])
    const config = {
      permissions: { has: jest.fn((o, paths) => {
        return paths ? paths.includes('a') : true
      }) },
      keyring,
    }
    await expectRPC(
      new DidProvider(config),
      null,
      { method: 'did_decryptJWE', params: { jwe: jwe1 } },
      { result: u8a.toString(cleartext1, 'base64pad') }
    )
    await expectRPC(
      new DidProvider(config),
      null,
      { method: 'did_decryptJWE', params: { jwe: jwe2 } },
      { error: { code: 4100, data: undefined, message: 'Unauthorized' }}
    )
  })
})
