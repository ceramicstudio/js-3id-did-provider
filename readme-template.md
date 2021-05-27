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
const ThreeIdProvider = require('3id-did-provider')
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
