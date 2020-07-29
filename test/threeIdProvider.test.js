import ThreeIdProvider from '../src/threeIdProvider'

let authCB, linkCB
const IDW_MOCK = {
  getLink: jest.fn(() => 'link'),
  linkManagementKey: jest.fn(() => 'link data'),
  authenticate: jest.fn(() => 'auth data'),
  isAuthenticated: jest.fn(() => true),
  signClaim: jest.fn(() => 'signed claim'),
  encrypt: jest.fn(() => 'encrypted data'),
  decrypt: jest.fn(() => 'decrypted data'),
  hashDBKey: jest.fn(() => 'hashed data'),
  events: {
    on: jest.fn((name, cb) => {
      if (name === 'new-auth-method') authCB = cb
      else linkCB = cb
    }),
  },
}

function formatCall(method, params) {
  return {
    id: 1,
    jsonrpc: '2.0',
    method: `3id_${method}`,
    params,
  }
}

async function callWithCB(rpc, payload, origin) {
  return new Promise((resolve, reject) => {
    const callback = (err, resp) => {
      if (err) reject(err)
      else resolve(resp)
    }
    if (origin) {
      rpc.send(payload, origin, callback)
    } else {
      rpc.send(payload, callback)
    }
  })
}

describe('ThreeIdProvider', () => {
  let rpc

  beforeEach(() => {
    rpc = new ThreeIdProvider(IDW_MOCK)
    IDW_MOCK.authenticate.mockClear()
    IDW_MOCK.encrypt.mockClear()
    IDW_MOCK.decrypt.mockClear()
  })

  it('is 3id provider', async () => {
    expect(rpc.is3idProvider).toBeTruthy()
  })

  it('getLink correctly', async () => {
    const payload = formatCall('getLink')
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.getLink).toHaveBeenCalledTimes(1)
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
    expect(IDW_MOCK.getLink).toHaveBeenCalledTimes(2)
  })

  it('linkManagementKey correctly', async () => {
    const payload = formatCall('linkManagementKey')
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.linkManagementKey).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.linkManagementKey).toHaveBeenCalledWith()
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
    expect(IDW_MOCK.linkManagementKey).toHaveBeenCalledTimes(2)
  })

  it('authenticate correctly', async () => {
    const origin = 'https://my.origin'
    const spaces = ['space1']
    const authData = ['enc auth data']
    const payload = formatCall('authenticate', { spaces, authData })
    expect(await rpc.send(payload, origin)).toMatchSnapshot()
    expect(IDW_MOCK.authenticate).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.authenticate).toHaveBeenCalledWith(spaces, { authData }, origin)
    expect(await callWithCB(rpc, payload, origin)).toMatchSnapshot()
    expect(IDW_MOCK.authenticate).toHaveBeenCalledTimes(2)
    const payload2 = formatCall('authenticate', { spaces, authData, mgmtPub: true })
    expect(await rpc.send(payload2, origin)).toMatchSnapshot()
    expect(IDW_MOCK.authenticate).toHaveBeenCalledTimes(3)
    expect(IDW_MOCK.authenticate).toHaveBeenCalledWith(spaces, { authData, mgmtPub: true }, origin)
  })

  it('isAuthenticated correctly', async () => {
    const origin = 'https://my.origin'
    const spaces = ['space1']
    const payload = formatCall('isAuthenticated', { spaces })
    expect(await rpc.send(payload, origin)).toMatchSnapshot()
    expect(IDW_MOCK.isAuthenticated).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.isAuthenticated).toHaveBeenCalledWith(spaces, origin)
    expect(await callWithCB(rpc, payload, origin)).toMatchSnapshot()
    expect(IDW_MOCK.isAuthenticated).toHaveBeenCalledTimes(2)
  })

  it('sign claim correctly', async () => {
    const pl = 'data'
    const space = 'space1'
    const did = ['enc auth data']
    const payload = formatCall('signClaim', { payload: pl, did, space })
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.signClaim).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.signClaim).toHaveBeenCalledWith(pl, { DID: did, space })
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
    expect(IDW_MOCK.signClaim).toHaveBeenCalledTimes(2)
  })

  it('encrypt correctly', async () => {
    const message = 'data'
    const space = 'space1'
    const payload = formatCall('encrypt', { message, space })
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.encrypt).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.encrypt).toHaveBeenCalledWith(message, space, {
      blockSize: undefined,
    })
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
    expect(IDW_MOCK.encrypt).toHaveBeenCalledTimes(2)
  })

  it('asymmetrically encrypt correctly', async () => {
    const message = 'data'
    const to = 'pubkey'
    const payload = formatCall('encrypt', { message, to })
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.encrypt).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.encrypt).toHaveBeenCalledWith(message, undefined, {
      to,
      blockSize: undefined,
    })
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
    expect(IDW_MOCK.encrypt).toHaveBeenCalledTimes(2)
  })

  it('decrypt correctly', async () => {
    const ciphertext = 'data'
    const nonce = 'nonce'
    const space = 'space1'
    const payload = formatCall('decrypt', { ciphertext, nonce, space })
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.decrypt).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.decrypt).toHaveBeenCalledWith({ ciphertext, nonce }, space, undefined)
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
    expect(IDW_MOCK.decrypt).toHaveBeenCalledTimes(2)
  })

  it('asymmetrically decrypt correctly', async () => {
    const ciphertext = 'data'
    const nonce = 'nonce'
    const space = 'space1'
    const ephemeralFrom = 'publicKey'
    const payload = formatCall('decrypt', {
      ciphertext,
      nonce,
      space,
      ephemeralFrom,
    })
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.decrypt).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.decrypt).toHaveBeenCalledWith(
      { ciphertext, ephemeralFrom, nonce },
      space,
      undefined
    )
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
    expect(IDW_MOCK.decrypt).toHaveBeenCalledTimes(2)
  })

  it('hash entry key correctly', async () => {
    const key = 'key'
    const space = 'space1'
    const payload = formatCall('hashEntryKey', { key, space })
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.hashDBKey).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.hashDBKey).toHaveBeenCalledWith(key, space)
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
    expect(IDW_MOCK.hashDBKey).toHaveBeenCalledTimes(2)
  })

  it('NEW_AUTH_METHOD_POLL should work correctly', async () => {
    const payload = formatCall('newAuthMethodPoll')
    let response
    response = await rpc.send(payload)
    expect(response.result.length).toEqual(0)
    response = await callWithCB(rpc, payload)
    expect(response.result.length).toEqual(0)

    const authBlob = 'auth data'
    authCB(authBlob)
    response = await rpc.send(payload)
    expect(response.result.length).toEqual(1)
    expect(response.result).toEqual([authBlob])
    authCB(authBlob)
    response = await callWithCB(rpc, payload)
    expect(response.result.length).toEqual(1)
    expect(response.result).toEqual([authBlob])
  })

  it('NEW_LINK_POLL should work correctly', async () => {
    const payload = formatCall('newLinkPoll')
    let response
    response = await rpc.send(payload)
    expect(response.result.length).toEqual(0)
    response = await callWithCB(rpc, payload)
    expect(response.result.length).toEqual(0)

    const linkProof = 'link proof'
    linkCB(linkProof)
    response = await rpc.send(payload)
    expect(response.result.length).toEqual(1)
    expect(response.result).toEqual([linkProof])
    linkCB(linkProof)
    response = await callWithCB(rpc, payload)
    expect(response.result.length).toEqual(1)
    expect(response.result).toEqual([linkProof])
  })

  it('Unsupported method should throw', async () => {
    const payload = formatCall('notSupported')
    await expect(rpc.send(payload)).rejects.toMatchSnapshot()
    await expect(callWithCB(rpc, payload)).rejects.toMatchSnapshot()
  })
})
