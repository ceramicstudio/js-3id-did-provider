[![CircleCI](https://img.shields.io/circleci/project/github/ceramicstudio/js-3id-did-provider.svg?style=for-the-badge)](https://circleci.com/gh/ceramicstudio/js-3id-did-provider)
[![Discord](https://img.shields.io/discord/484729862368526356.svg?style=for-the-badge)](https://discordapp.com/invite/Z3f3Cxy)
[![npm](https://img.shields.io/npm/dt/3id-did-provider.svg?style=for-the-badge)](https://www.npmjs.com/package/3id-did-provider)
[![npm](https://img.shields.io/npm/v/3id-did-provider.svg?style=for-the-badge)](https://www.npmjs.com/package/3id-did-provider)
[![Codecov](https://img.shields.io/codecov/c/github/ceramicstudio/js-3id-did-provider.svg?style=for-the-badge)](https://codecov.io/gh/ceramicstudio/js-3id-did-provider)
[![Twitter Follow](https://img.shields.io/twitter/follow/ceramicnetwork.svg?style=for-the-badge&label=Twitter)](https://twitter.com/ceramicnetwork)

# ThreeIdProvider

ThreeIdProvider is a JavaScript SDK that allows developers to create and manage 3ID identities on the Ceramic network. It exposes a [DID Provider](https://eips.ethereum.org/EIPS/eip-2844) interface which exposes JOSE signing and decryption though a JSON-RPC interface. ThreeIdProvider can be used in combination with [js-did](https://github.com/ceramicnetwork/js-did).


## Getting Started
### <a name="install"></a>Installation
Install 3id-did-provider in your npm project:
```
$ npm install 3id-did-provider
```

### <a name="usage"></a>Usage
#### Import ThreeIdProvider into your project
Import the 3id-did-provider module
```js
import { ThreeIdProvider } from '3id-did-provider'
```
Import using the dist build in your html code
```js
<script type="text/javascript" src="../dist/threeid-provider.js"></script>
```

#### Understanding the `getPermission` function
the `getPermission` configuration parameter is always required when creating an instance of ThreeIdProvider. It is used to give an application permission to decrypt and sign data. What this function should do is to present a dialog to the user in the wallet UI, asking for permission to access the given paths.

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

#### Instantiate ThreeIdProvider with an authentication method
To create an instance with an auth method you can pass two params to the create function as shown below. If the auth method doesn't have a 3ID associated with it yet a new 3ID will be created. This means that a seed will be randomly generated in the background. and the given *authSecret* will be added as an authentication method to the newly created 3ID.
```js
const authSecret = new Uint8Array([ ... ]) // 32 bytes of entropy used to authenticate
const authId = 'myAuthenticationMethod' // a name of the auth method
const ceramic = ... // An instance of Ceramic (either @ceramicnetwork/core, or @ceramicnetwork/http-client)

const threeId = await ThreeIdProvider.create({ getPermission, authSecret, authId, ceramic })
```

#### Instantiate ThreeIdProvider with a seed
To create a wallet with a seed you can simply pass it as an option to the constructor. This will create an instance of the ThreeIdProvider that derives all it's keys from this seed. Be careful, if this seed is lost the DID and all of it's data will be lost as well. Note that you will get different 3IDs every time the `create` method is invoked with the same seed. An authentication method must be used in order to interact with the same 3ID consistently.
```js
const seed = new Uint8Array([ ... ]) // 32 bytes of entropy used as the seed
const ceramic = ... // An instance of Ceramic (either @ceramicnetwork/core, or @ceramicnetwork/http-client)

const threeId = await ThreeIdProvider.create({ getPermission, seed, ceramic })
```

#### Using the ThreeIdProvider with js-did
An instance of the DID provider from ThreeIdProvider can be passed directly to js-did.
```js
import ThreeIdResolver from '@ceramicnetwork/3id-did-resolve'
import Ceramic from '@ceramicnetwork/http-client'

const provider = threeId.getDidProvider()
const resolver = ThreeIdResolver.getResolver(new Ceramic())

const did = new DID({ provider, resolver })
```

## Maintainers
[@oed](https://github.com/oed)

## <a name="api"></a> API Documentation
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

<a name="ThreeIdProvider"></a>

### ThreeIdProvider
**Kind**: global class  

* [ThreeIdProvider](#ThreeIdProvider)
    * [new ThreeIdProvider()](#new_ThreeIdProvider_new)
    * _instance_
        * [.keychain](#ThreeIdProvider+keychain)
        * [.permissions](#ThreeIdProvider+permissions)
        * [.id](#ThreeIdProvider+id)
        * [.getDidProvider()](#ThreeIdProvider+getDidProvider) ⇒ <code>DidProvider</code>
    * _static_
        * [.create(config)](#ThreeIdProvider.create) ⇒ [<code>ThreeIdProvider</code>](#ThreeIdProvider)

<a name="new_ThreeIdProvider_new"></a>

#### new ThreeIdProvider()
Use ThreeIdProvider.create() to create an ThreeIdProvider instance

<a name="ThreeIdProvider+keychain"></a>

#### threeIdProvider.keychain
**Kind**: instance property of [<code>ThreeIdProvider</code>](#ThreeIdProvider)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| keychain | [<code>Keychain</code>](#Keychain) | Edit the keychain |

<a name="ThreeIdProvider+permissions"></a>

#### threeIdProvider.permissions
**Kind**: instance property of [<code>ThreeIdProvider</code>](#ThreeIdProvider)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| permissions | [<code>Permissions</code>](#Permissions) | Edit permissions |

<a name="ThreeIdProvider+id"></a>

#### threeIdProvider.id
**Kind**: instance property of [<code>ThreeIdProvider</code>](#ThreeIdProvider)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | The DID of the ThreeIdProvider instance |

<a name="ThreeIdProvider+getDidProvider"></a>

#### threeIdProvider.getDidProvider() ⇒ <code>DidProvider</code>
Get the DIDProvider

**Kind**: instance method of [<code>ThreeIdProvider</code>](#ThreeIdProvider)  
**Returns**: <code>DidProvider</code> - The DIDProvider for this ThreeIdProvider instance  
<a name="ThreeIdProvider.create"></a>

#### ThreeIdProvider.create(config) ⇒ [<code>ThreeIdProvider</code>](#ThreeIdProvider)
Creates an instance of ThreeIdProvider

**Kind**: static method of [<code>ThreeIdProvider</code>](#ThreeIdProvider)  
**Returns**: [<code>ThreeIdProvider</code>](#ThreeIdProvider) - An ThreeIdProvider instance  

| Param | Type | Description |
| --- | --- | --- |
| config | <code>Object</code> | The configuration to be used |
| config.getPermission | <code>function</code> | The function that is called to ask the user for permission |
| config.ceramic | <code>CeramicApi</code> | The ceramic instance to use |
| config.loader | <code>TileLoader</code> | An optional TileLoader instance to use |
| config.seed | <code>Uint8Array</code> | The seed of the 3ID, 32 bytes |
| config.authSecret | <code>Uint8Array</code> | The authSecret to use, 32 bytes |
| config.authId | <code>String</code> | The authId is used to identify the authSecret |
| config.disableIDX | <code>Boolean</code> | Disable creation of the IDX document |
| config.v03ID | <code>String</code> | A v0 3ID, has to be passed if a migration is being preformed |

