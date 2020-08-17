import ThreeIdProvider from '../src/threeIdProvider'
import { sha256Multihash, pad, unpad } from '../src/utils'

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

  it('is 3id provider', async () => {
    rpc = new ThreeIdProvider({})
    expect(rpc.is3idProvider).toBeTruthy()
    expect(rpc.isDidProvider).toBeTruthy()
  })

  it('authenticate correctly', async () => {
    const config = {
      permissions: { request: jest.fn(async (o, spaces) => spaces) },
      keyring: { getPublicKeys: jest.fn(({ space }) => {
        return space ? 'spacekeys' : 'mainkeys'
      })}
    }
    rpc = new ThreeIdProvider(config)
    const origin = 'https://my.origin'
    const spaces = ['space1']
    const authData = ['enc auth data']
    const payload = formatCall('authenticate', { spaces, authData })
    expect(await rpc.send(payload, origin)).toMatchSnapshot()
    expect(config.keyring.getPublicKeys).toHaveBeenCalledTimes(2)
    expect(config.keyring.getPublicKeys).toHaveBeenNthCalledWith(1, {})
    expect(config.keyring.getPublicKeys).toHaveBeenNthCalledWith(2, { space: spaces[0], uncompressed: true })
    const payload2 = formatCall('authenticate', { spaces, authData, mgmtPub: true })
    expect(await rpc.send(payload2, origin)).toMatchSnapshot()
    expect(config.keyring.getPublicKeys).toHaveBeenCalledTimes(4)
    expect(config.keyring.getPublicKeys).toHaveBeenNthCalledWith(3, { mgmtPub: true })
    expect(config.keyring.getPublicKeys).toHaveBeenNthCalledWith(4, { space: spaces[0], uncompressed: true })
  })

  it('isAuthenticated correctly', async () => {
    const config = {
      permissions: { has: jest.fn(() => true) },
    }
    rpc = new ThreeIdProvider(config)
    const origin = 'https://my.origin'
    const spaces = ['space1']
    const payload = formatCall('isAuthenticated', { spaces })
    expect(await rpc.send(payload, origin)).toMatchSnapshot()
    expect(config.permissions.has).toHaveBeenCalledTimes(1)
    expect(config.permissions.has).toHaveBeenCalledWith(origin, spaces)
  })

  it('sign claim correctly', async () => {
    const config = {
      permissions: { has: jest.fn(() => true) },
      threeIdx: { DID: 'did:3:asdf' },
      keyring: { getJWTSigner: () => () => Promise.resolve('signed') },
    }
    rpc = new ThreeIdProvider(config)
    const pl = { d: 'data', iat: undefined }
    const space = 'space1'
    const payload = formatCall('signClaim', { payload: pl, space })
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(await callWithCB(rpc, payload)).toMatchSnapshot()
  })

  it('encrypt correctly', async () => {
    const config = {
      permissions: { has: jest.fn(() => true) },
      keyring: { symEncrypt: jest.fn(() => 'encrypted msg') }
    }
    rpc = new ThreeIdProvider(config)
    const message = 'data'
    const space = 'space1'
    const payload = formatCall('encrypt', { message, space })
    expect((await rpc.send(payload)).result).toEqual('encrypted msg')
    expect(config.keyring.symEncrypt).toHaveBeenCalledTimes(1)
    expect(config.keyring.symEncrypt).toHaveBeenCalledWith(pad(message), { space })
  })

  it('asymmetrically encrypt correctly', async () => {
    const config = {
      permissions: { has: jest.fn(() => true) },
      keyring: { asymEncrypt: jest.fn(() => 'encrypted msg') }
    }
    rpc = new ThreeIdProvider(config)
    const message = 'data'
    const to = 'pubkey'
    const payload = formatCall('encrypt', { message, to })
    expect((await rpc.send(payload)).result).toEqual('encrypted msg')
    expect(config.keyring.asymEncrypt).toHaveBeenCalledTimes(1)
    expect(config.keyring.asymEncrypt).toHaveBeenCalledWith(pad(message), to)
  })

  it('decrypt correctly', async () => {
    const config = {
      permissions: { has: jest.fn(() => true) },
      keyring: { symDecrypt: jest.fn(() => 'decrypted msg') }
    }
    rpc = new ThreeIdProvider(config)
    const ciphertext = 'data'
    const nonce = 'nonce'
    const space = 'space1'
    const payload = formatCall('decrypt', { ciphertext, nonce, space })
    expect(await rpc.send(payload)).toMatchSnapshot()
    expect(config.keyring.symDecrypt).toHaveBeenCalledTimes(1)
    expect(config.keyring.symDecrypt).toHaveBeenCalledWith(ciphertext, nonce, { space })
  })

  it('asymmetrically decrypt correctly', async () => {
    const config = {
      permissions: { has: jest.fn(() => true) },
      keyring: { asymDecrypt: jest.fn(() => 'decrypted msg') }
    }
    rpc = new ThreeIdProvider(config)
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
    expect(config.keyring.asymDecrypt).toHaveBeenCalledTimes(1)
    expect(config.keyring.asymDecrypt).toHaveBeenCalledWith(
      ciphertext, ephemeralFrom, nonce, { space }
    )
  })

  it('hash entry key correctly', async () => {
    const config = {
      permissions: { has: jest.fn(() => true) },
      keyring: { getDBSalt: jest.fn(() => 'saltysalt') }
    }
    rpc = new ThreeIdProvider(config)
    const key = 'key'
    const space = 'space1'
    const payload = formatCall('hashEntryKey', { key, space })
    expect((await rpc.send(payload)).result).toEqual(sha256Multihash('saltysalt' + key))
    expect(config.keyring.getDBSalt).toHaveBeenCalledTimes(1)
    expect(config.keyring.getDBSalt).toHaveBeenCalledWith(space)
  })

  it('Unsupported method should throw', async () => {
    const payload = formatCall('notSupported')
    await expect(rpc.send(payload)).rejects.toMatchSnapshot()
    await expect(callWithCB(rpc, payload)).rejects.toMatchSnapshot()
  })
})
