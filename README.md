[![CircleCI](https://img.shields.io/circleci/project/github/3box/identity-wallet-js.svg?style=for-the-badge)](https://circleci.com/gh/3box/identity-wallet-js)
[![Discord](https://img.shields.io/discord/484729862368526356.svg?style=for-the-badge)](https://discordapp.com/invite/Z3f3Cxy)
[![npm](https://img.shields.io/npm/dt/identity-wallet.svg?style=for-the-badge)](https://www.npmjs.com/package/identity-wallet)
[![npm](https://img.shields.io/npm/v/identity-wallet.svg?style=for-the-badge)](https://www.npmjs.com/package/identity-wallet)
[![Codecov](https://img.shields.io/codecov/c/github/3box/identity-wallet-js.svg?style=for-the-badge)](https://codecov.io/gh/3box/identity-wallet-js)
[![Twitter Follow](https://img.shields.io/twitter/follow/3boxdb.svg?style=for-the-badge&label=Twitter)](https://twitter.com/3boxdb)

# Identity Wallet
🆔-wallet

IdentityWallet is a JavaScript SDK that allows developers to create and manage 3ID identities on the Ceramic network. It exposes a [DID Provider](https://eips.ethereum.org/EIPS/eip-2844) interface which exposes JOSE signing and decryption though a JOSN-RPC interface. IdentityWallet can be used in combination with [js-did](https://github.com/ceramicnetwork/js-did).


## Getting Started
### <a name="install"></a>Installation
Install 3box in your npm project:
```
$ npm install identity-wallet
```

### <a name="usage"></a>Usage
#### Import Identity Wallet into your project
Import the identity-wallet module
```js
const IdentityWallet = require('identity-wallet')
```
Import using the dist build in your html code
```js
<script type="text/javascript" src="../dist/identity-wallet.js"></script>
```

#### Understanding the `getPermission` function
the `getPermission` configuration parameter is always required when creating an instance of IdentityWallet. It is used to give an application permission to decrypt and sign data. What this function should do is to present a dialog to the user in the wallet UI, asking for permission to access the given paths.

The function is called with one parameter which is the `request` object. It looks like this:
```js
{
  type: 'authenticate',
  origin: 'https://my.app.origin',
  payload: {
    paths: ['/path/1', '/path/2']
  }
}
```
In the above example the app with origin `https://my.app.origin` is requesting access to `/path/1` and `/path/2`. If the user consents to this the function should just return the `paths` array, otherwise an empty array. Note that an array containing only some of the requested paths may also be returned.

#### Creating a wallet with an authentication method
To create a wallet with an auth method you can pass two params to the create method of IDW as shown below. If the auth method doesn't have a 3ID associated with it yet IDW will create a new 3ID.
```js
const authSecret = new Uint8Array([ ... ]) // Entropy used to authenticate
const authId = 'myAuthenticationMethod' // a name of the auth method

const idWallet = await IdentityWallet.create({ getPermission, authSecret, authId })
```

#### Creating a wallet with a seed
To create a wallet with a seed you can simply pass it as an option to the constructor. This will create an instance of the IdentityWallet that derives all it's keys from this seed. Be careful, if this seed is lost the identity and all of it's data will be lost as well.
```js
const seed = '0xabc123...' // a hex encoded seed

const idWallet = await IdentityWallet.create({ getPermission, seed })
```

#### Using the IdentityWallet with js-did
An instance of the DID provider from IdentityWallet can be passed directly to js-did.
```js
const provider = idWallet.getDidProvider()
const did = new DID({ provider })
```

## Maintainers
[@oed](https://github.com/oed)

## <a name="api"></a> API Documentation
<a name="IdentityWallet"></a>

### IdentityWallet
**Kind**: global class  

* [IdentityWallet](#IdentityWallet)
    * [new IdentityWallet()](#new_IdentityWallet_new)
    * _instance_
        * [.keychain](#IdentityWallet+keychain)
        * [.permissions](#IdentityWallet+permissions)
        * [.id](#IdentityWallet+id)
        * [.getDidProvider()](#IdentityWallet+getDidProvider) ⇒ <code>DidProvider</code>
        * [.get3idProvider()](#IdentityWallet+get3idProvider) ⇒ <code>ThreeIdProvider</code>
    * _static_
        * [.create(config)](#IdentityWallet.create) ⇒ [<code>IdentityWallet</code>](#IdentityWallet)

<a name="new_IdentityWallet_new"></a>

#### new IdentityWallet()
Use IdentityWallet.create() to create an IdentityWallet instance

<a name="IdentityWallet+keychain"></a>

#### identityWallet.keychain
**Kind**: instance property of [<code>IdentityWallet</code>](#IdentityWallet)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| keychain | [<code>Keychain</code>](#Keychain) | Edit the keychain |

<a name="IdentityWallet+permissions"></a>

#### identityWallet.permissions
**Kind**: instance property of [<code>IdentityWallet</code>](#IdentityWallet)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| permissions | [<code>Permissions</code>](#Permissions) | Edit permissions |

<a name="IdentityWallet+id"></a>

#### identityWallet.id
**Kind**: instance property of [<code>IdentityWallet</code>](#IdentityWallet)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | The DID of the IdentityWallet instance |

<a name="IdentityWallet+getDidProvider"></a>

#### identityWallet.getDidProvider() ⇒ <code>DidProvider</code>
Get the DIDProvider

**Kind**: instance method of [<code>IdentityWallet</code>](#IdentityWallet)  
**Returns**: <code>DidProvider</code> - The DIDProvider for this IdentityWallet instance  
<a name="IdentityWallet+get3idProvider"></a>

#### identityWallet.get3idProvider() ⇒ <code>ThreeIdProvider</code>
Get the 3IDProvider

**Kind**: instance method of [<code>IdentityWallet</code>](#IdentityWallet)  
**Returns**: <code>ThreeIdProvider</code> - The 3IDProvider for this IdentityWallet instance  
<a name="IdentityWallet.create"></a>

#### IdentityWallet.create(config) ⇒ [<code>IdentityWallet</code>](#IdentityWallet)
Creates an instance of IdentityWallet

**Kind**: static method of [<code>IdentityWallet</code>](#IdentityWallet)  
**Returns**: [<code>IdentityWallet</code>](#IdentityWallet) - An IdentityWallet instance  

| Param | Type | Description |
| --- | --- | --- |
| config | <code>Object</code> | The configuration to be used |
| config.getPermission | <code>function</code> | The function that is called to ask the user for permission |
| config.seed | <code>String</code> | The seed of the identity, 32 bytes hex string |
| config.authSecret | <code>Uint8Array</code> | The authSecret to use, 32 bytes |
| config.authId | <code>String</code> | The authId is used to identify the authSecret |
| config.externalAuth | <code>String</code> | External auth function, directly returns key material, used to migrate legacy 3box accounts |

<a name="Keychain"></a>

### Keychain
**Kind**: global class  

* [Keychain](#Keychain)
    * [new Keychain()](#new_Keychain_new)
    * [.list()](#Keychain+list) ⇒ <code>Array.&lt;string&gt;</code>
    * [.add(authId, authSecret)](#Keychain+add)
    * [.remove(authId)](#Keychain+remove)
    * [.status()](#Keychain+status) ⇒ <code>KeychainStatus</code>
    * [.commit()](#Keychain+commit)

<a name="new_Keychain_new"></a>

#### new Keychain()
The Keychain enables adding and removing of authentication methods.

<a name="Keychain+list"></a>

#### keychain.list() ⇒ <code>Array.&lt;string&gt;</code>
List all current authentication methods.

**Kind**: instance method of [<code>Keychain</code>](#Keychain)  
**Returns**: <code>Array.&lt;string&gt;</code> - A list of authIds.  
<a name="Keychain+add"></a>

#### keychain.add(authId, authSecret)
Add a new authentication method (adds to staging).

**Kind**: instance method of [<code>Keychain</code>](#Keychain)  

| Param | Type | Description |
| --- | --- | --- |
| authId | <code>String</code> | An identifier for the auth method |
| authSecret | <code>Uint8Array</code> | The authSecret to use, should be of sufficient entropy |

<a name="Keychain+remove"></a>

#### keychain.remove(authId)
Remove an authentication method (adds to staging).

**Kind**: instance method of [<code>Keychain</code>](#Keychain)  

| Param | Type | Description |
| --- | --- | --- |
| authId | <code>String</code> | An identifier for the auth method |

<a name="Keychain+status"></a>

#### keychain.status() ⇒ <code>KeychainStatus</code>
Show the staging status of the keychain.
Since removing auth methods will rotate the keys of the 3ID its a good idea
to remove multiple auth methods at once if desired. Therefore we introduce
a commit pattern to do multiple updates to the keychain at once.

**Kind**: instance method of [<code>Keychain</code>](#Keychain)  
**Returns**: <code>KeychainStatus</code> - Object that states the staging status of the keychain  
<a name="Keychain+commit"></a>

#### keychain.commit()
Commit the staged changes to the keychain.

**Kind**: instance method of [<code>Keychain</code>](#Keychain)  
<a name="Permissions"></a>

### Permissions
**Kind**: global class  

* [Permissions](#Permissions)
    * [new Permissions()](#new_Permissions_new)
    * [.request(origin, paths)](#Permissions+request) ⇒ <code>Array.&lt;String&gt;</code>
    * [.has(origin, paths)](#Permissions+has) ⇒ <code>Boolean</code>
    * [.get(origin)](#Permissions+get) ⇒ <code>Array.&lt;String&gt;</code>
    * [.set(origin, paths)](#Permissions+set)

<a name="new_Permissions_new"></a>

#### new Permissions()
The Permissions class exposes methods to read and update the given permissions

<a name="Permissions+request"></a>

#### permissions.request(origin, paths) ⇒ <code>Array.&lt;String&gt;</code>
Request permission for given paths for a given origin.

**Kind**: instance method of [<code>Permissions</code>](#Permissions)  
**Returns**: <code>Array.&lt;String&gt;</code> - The paths that where granted permission for  

| Param | Type | Description |
| --- | --- | --- |
| origin | <code>String</code> | Application domain |
| paths | <code>Array.&lt;String&gt;</code> | The desired paths |

<a name="Permissions+has"></a>

#### permissions.has(origin, paths) ⇒ <code>Boolean</code>
Determine if permission has been given for paths for a given origin.

**Kind**: instance method of [<code>Permissions</code>](#Permissions)  
**Returns**: <code>Boolean</code> - True if permission has previously been given  

| Param | Type | Description |
| --- | --- | --- |
| origin | <code>String</code> | Application domain |
| paths | <code>Array.&lt;String&gt;</code> | The desired paths |

<a name="Permissions+get"></a>

#### permissions.get(origin) ⇒ <code>Array.&lt;String&gt;</code>
Get the paths which the given origin has permission for.

**Kind**: instance method of [<code>Permissions</code>](#Permissions)  
**Returns**: <code>Array.&lt;String&gt;</code> - The permissioned paths  

| Param | Type | Description |
| --- | --- | --- |
| origin | <code>String</code> | Application domain |

<a name="Permissions+set"></a>

#### permissions.set(origin, paths)
Set the paths which the given origin should have permission for.

**Kind**: instance method of [<code>Permissions</code>](#Permissions)  

| Param | Type | Description |
| --- | --- | --- |
| origin | <code>String</code> | Application domain |
| paths | <code>Array.&lt;String&gt;</code> | The desired paths |

