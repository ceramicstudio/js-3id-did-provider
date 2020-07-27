import { DidProvider } from '../src/did-provider'

describe('DidProvider', () => {
  let nextId = 0
  async function expectRPC(provider, req, res) {
    const id = nextId++
    return await expect(
      provider.send({ jsonrpc: '2.0', id, ...req })
    ).resolves.toEqual({ jsonrpc: '2.0', id, ...res })
  }

  test('has a `isDidProvider` prop', () => {
    const provider = new DidProvider({})
    expect(provider.isDidProvider).toBe(true)
  })

  test('`did_authenticate` method returns the accounts', async () => {
    const wallet = {
      authenticate: jest.fn(async () => {}),
      DID: 'did:3:test',
    }
    await expectRPC(
      new DidProvider(wallet),
      { method: 'did_authenticate' },
      { result: { did: 'did:3:test' } }
    )
  })

  test('`did_createJWS` method throws an error if the ', async () => {
    const payload = { foo: 'bar' }
    const headers = { bar: 'baz' }
    await expectRPC(
      new DidProvider({ isAuthenticated: () => false }),
      { method: 'did_createJWS', params: { payload, headers } },
      { error: { code: 0, message: 'Authentication required' } }
    )
  })

  test('`did_createJWS` returns the JWS string', async () => {
    const wallet = {
      isAuthenticated: () => true,
      getRootSigner: () => () => Promise.resolve('signed'),
    }
    const payload = { foo: 'bar' }
    const headers = { bar: 'baz' }
    await expectRPC(
      new DidProvider(wallet),
      { method: 'did_createJWS', params: { payload, headers } },
      { result: { jws: 'eyJhbGciOiJFUzI1NksifQ.eyJmb28iOiJiYXIifQ.signed' } }
    )
  })
})
