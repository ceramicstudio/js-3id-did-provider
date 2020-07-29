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
    const wallet = {
      authenticate: jest.fn(async () => {}),
      DID: 'did:3:test',
    }
    await expectRPC(
      new DidProvider(wallet),
      'foo',
      { method: 'did_authenticate' },
      { result: { did: 'did:3:test' } }
    )
    expect(wallet.authenticate).toBeCalledWith([], {}, 'foo')
  })

  test('`did_createJWS` method throws an error if the user is not authenticated', async () => {
    const payload = { foo: 'bar' }
    const headers = { bar: 'baz' }
    const isAuthenticated = jest.fn(() => false)
    await expectRPC(
      new DidProvider({ isAuthenticated }),
      'bar',
      { method: 'did_createJWS', params: { payload, headers } },
      { error: { code: 0, message: 'Authentication required' } }
    )
    expect(isAuthenticated).toBeCalledWith([], 'bar')
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
      null,
      { method: 'did_createJWS', params: { payload, headers } },
      { result: { jws: 'eyJhbGciOiJFUzI1NksifQ.eyJmb28iOiJiYXIifQ.signed' } }
    )
  })
})
