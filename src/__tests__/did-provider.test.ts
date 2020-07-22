import { DidProvider } from '../did-provider'

describe('DidProvider', () => {
  let nextId = 0
  async function expectRPC(provider, req, res) {
    const id = nextId++
    return await expect(
      provider.send({ jsonrpc: '2.0', id, ...req }),
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
      { result: { accounts: ['did:3:test'] } },
    )
  })

  test('`did_createJWS` method throws an error', async () => {
    await expectRPC(
      new DidProvider({}),
      { method: 'did_createJWS' },
      { error: { code: 0, message: 'Not implemented' } },
    )
  })
})
