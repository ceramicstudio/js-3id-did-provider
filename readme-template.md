[![CircleCI](https://img.shields.io/circleci/project/github/3box/identity-wallet.svg?style=for-the-badge)](https://circleci.com/gh/3box/identity-wallet)
[![Discord](https://img.shields.io/discord/484729862368526356.svg?style=for-the-badge)](https://discordapp.com/invite/Z3f3Cxy)
[![npm](https://img.shields.io/npm/dt/identity-wallet.svg?style=for-the-badge)](https://www.npmjs.com/package/identity-wallet)
[![npm](https://img.shields.io/npm/v/identity-wallet.svg?style=for-the-badge)](https://www.npmjs.com/package/identity-wallet)
[![Codecov](https://img.shields.io/codecov/c/github/3box/identity-wallet.svg?style=for-the-badge)](https://codecov.io/gh/3box/identity-wallet)
[![Twitter Follow](https://img.shields.io/twitter/follow/3boxdb.svg?style=for-the-badge&label=Twitter)](https://twitter.com/3boxdb)
[![Greenkeeper badge](https://badges.greenkeeper.io/3box/identity-wallet.svg)](https://greenkeeper.io/)

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
