import { DidProvider } from '../src/did-provider'

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
})
