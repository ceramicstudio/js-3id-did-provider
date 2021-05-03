import Permissions, { SELF_ORIGIN } from '../src/permissions'
import store from 'store'

let getPermFn = async req => []

describe('Permissions', () => {
  let permissions
  beforeEach(() => {
    permissions = new Permissions(getPermFn)
    permissions.setDID('did:3:asdf')
  })

  afterEach(() => {
    store.clearAll()
  })

  it('Correctly constructed', async () => {
    expect(() => new Permissions()).toThrow(/has to be a function/)
    permissions = new Permissions(getPermFn)
    expect(() => permissions.get('app1')).toThrow('DID not set')
    expect(() => permissions.set('app1')).toThrow('DID not set')
  })

  it('set / get correctly', async () => {
    permissions.set('app1', ['/1', '/2'])
    permissions.set('app2', ['/a', '/b'])
    expect(permissions.get('app1')).toEqual(['/1', '/2'])
    expect(permissions.get('app2')).toEqual(['/a', '/b'])
    permissions.set('app1', null)
    expect(permissions.get('app1')).toEqual(null)
  })

  it('has works correctly', async () => {
    permissions.set('app1', ['/1', '/2'])
    // Using self origin always returns true
    expect(permissions.has(SELF_ORIGIN)).toBeTruthy()
    expect(permissions.has(SELF_ORIGIN, ['a', 'b', 'c'])).toBeTruthy()
    expect(permissions.has('app1')).toBeTruthy()
    expect(permissions.has('app2')).toBeFalsy()
    expect(permissions.has('app1', ['/1'])).toBeTruthy()
    expect(permissions.has('app1', ['/1', '/2'])).toBeTruthy()
    expect(permissions.has('app1', ['/1', '/2', '/3'])).toBeFalsy()
  })

  it('request works correctly', async () => {
    expect(await permissions.request('app1', [])).toEqual([])
    expect(await permissions.request('app1', ['/1'])).toEqual([])
    permissions.getPermission = async req => null
    expect(await permissions.request('app2', [])).toEqual(null)
    // will remember previously given permissions
    expect(await permissions.request('app1', [])).toEqual([])
    permissions.getPermission = async req => ['/1']
    expect(await permissions.request('app1', ['/1'])).toEqual(['/1'])
    expect(await permissions.request('app1', ['/1', '/2'])).toEqual(['/1'])
    permissions.getPermission = async req => ['/1', '/2']
    expect(await permissions.request('app1', ['/1', '/2'])).toEqual(['/1', '/2'])
  })
})
