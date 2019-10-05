const ThreeIdProvider = require('../threeIdProvider')

let eventCB
const IDW_MOCK = {
  getAddress: jest.fn(() => 'link'),
  linkManagementKey: jest.fn(() => 'link data'),
  authenticate: jest.fn(() => 'auth data'),
  isAuthenticated: jest.fn(() => true),
  signClaim: jest.fn(() => 'signed claim'),
  encrypt: jest.fn(() => 'encrypted data'),
  decrypt: jest.fn(() => 'decrypted data'),
  hashDBKey: jest.fn(() => 'hashed data'),
  events: {
    on: jest.fn((name, cb) => eventCB = cb)
  }
}

function formatCall (method, params) {
  return {
    'id': 1,
    'json-rpc': '2.0',
    method: `3id_${method}`,
    params
  }
}

async function callWithCB (rpc, payload) {
  return new Promise((resolve, reject) => {
    rpc.send(payload, (err, resp) => {
      if (err) reject(err)
      else resolve(resp)
    })
  })
}

describe('ThreeIdProvider', () => {
  let rpc

  beforeEach(() => {
    rpc = new ThreeIdProvider(IDW_MOCK)
  })

  it('getLink correctly', async () => {
    const payload = formatCall('getLink')
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.getAddress).toHaveBeenCalledTimes(1)
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
    expect(IDW_MOCK.getAddress).toHaveBeenCalledTimes(2)
  })

  it('linkManagementKey correctly', async () => {
    const did = 'did:3:my'
    const payload = formatCall('linkManagementKey', { did })
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.linkManagementKey).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.linkManagementKey).toHaveBeenCalledWith(did)
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
    expect(IDW_MOCK.linkManagementKey).toHaveBeenCalledTimes(2)
  })

  it('authenticate correctly', async () => {
    const spaces = ['space1']
    const authData = ['enc auth data']
    const payload = formatCall('authenticate', { spaces, authData })
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.authenticate).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.authenticate).toHaveBeenCalledWith(spaces, { authData })
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
    expect(IDW_MOCK.authenticate).toHaveBeenCalledTimes(2)
  })

  it('isAuthenticated correctly', async () => {
    const spaces = ['space1']
    const payload = formatCall('isAuthenticated', { spaces })
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(IDW_MOCK.isAuthenticated).toHaveBeenCalledTimes(1)
    expect(IDW_MOCK.isAuthenticated).toHaveBeenCalledWith(spaces)
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
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
    expect(IDW_MOCK.encrypt).toHaveBeenCalledWith(message, space, { blockSize: undefined })
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
    expect(IDW_MOCK.decrypt).toHaveBeenCalledWith({ ciphertext, nonce }, space)
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
    eventCB(authBlob)
    response = await rpc.send(payload)
    expect(response.result.length).toEqual(1)
    expect(response.result).toEqual([authBlob])
    eventCB(authBlob)
    response = await callWithCB(rpc, payload)
    expect(response.result.length).toEqual(1)
    expect(response.result).toEqual([authBlob])
  })

  it('Unsupported method should throw', async () => {
    const payload = formatCall('notSupported')
    await expect(rpc.send(payload)).rejects.toMatchSnapshot()
    await expect(callWithCB(rpc, payload)).rejects.toMatchSnapshot()
  })
})
