[![CircleCI](https://img.shields.io/circleci/project/github/3box/identity-wallet.svg?style=for-the-badge)](https://circleci.com/gh/3box/identity-wallet)
[![Discord](https://img.shields.io/discord/484729862368526356.svg?style=for-the-badge)](https://discordapp.com/invite/Z3f3Cxy)
[![npm](https://img.shields.io/npm/dt/identity-wallet.svg?style=for-the-badge)](https://www.npmjs.com/package/identity-wallet)
[![npm](https://img.shields.io/npm/v/identity-wallet.svg?style=for-the-badge)](https://www.npmjs.com/package/identity-wallet)
[![Codecov](https://img.shields.io/codecov/c/github/3box/identity-wallet.svg?style=for-the-badge)](https://codecov.io/gh/3box/identity-wallet)
[![Twitter Follow](https://img.shields.io/twitter/follow/3boxdb.svg?style=for-the-badge&label=Twitter)](https://twitter.com/3boxdb)
[![Greenkeeper badge](https://badges.greenkeeper.io/3box/identity-wallet.svg)](https://greenkeeper.io/)

# Identity Wallet
🆔-wallet

3Box `identity-wallet-js` is a JavaScript SDK that allows Ethereum JavaScript wallet developers to natively support 3Box identity and authentication functionalities, including: creating 3Box accounts, adding authentication methods (Ethereum keys), and responding to authentication requests for 3Box accounts as well as spaces.


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

#### Understanding the `getConsent` function
The first parameter of the IdentityWallet constructor is the `getConsent` function. This function determines whether or not any given `origin` (app) is allowed access to the users data. What this function should do is to present a dialog to the user in the wallet UI, asking for permission to access the given spaces.

The function is called with one parameter which is the `request` object. It looks like this:
```js
{
  type: 'authenticate',
  origin: 'https://my.app.origin',
  spaces: ['space1', 'space2']
}
```
In the above example the app with origin `https://my.app.origin` is requesting access to `space1` and `space2`. If the user consents to this the function should return `true`, otherwise it should return `false`.
Note that if the `spaces` array is empty the app is requesting access to the general 3Box storage.

#### Creating a wallet with a seed
To create a wallet with a seed you can simply pass it as an option to the constructor. This will create an instance of the IdentityWallet that derives all it's keys from this seed. Be careful, if this seed is lost the identity and all of it's data will be lost as well.
```js
const seed = '0xabc123...' // a hex encoded seed

const idWallet = new IdentityWallet(getConsent, { seed })
```

#### Creating an identity for a contract wallet
For wallets which doesn't have one keypair, e.g. smart contract wallets, we provide a way of creating an identity with multiple authentication secrets. In this model each authentication secret grants full access to the identity. To create an instance of the IdentityWallet in this way the ethereum address of the account also needs to be passed to the constructor.
```js
const authSecret = '0xabc123...' // a hex encoded secret
const ethereumAddress = '0xabc123' // an ethereum address

const idWallet = new IdentityWallet(getConsent, { authSecret, ethereumAddress })
```

New authentication secrets can later be added by calling the `addAuthMethod` instance method of the identityWallet. Note that this method can only be called after an authentication first has happened (`Box.openBox` has been called from `3box-js`).
```js
const authSecret2 = '0xabc123...' // a hex encoded secret

idWallet.addAuthMethod(authSecret2)
```

#### Using the IdentityWallet with 3box-js
An instance of IdentityWallet can be passed directly to 3box-js and will be used to authenticate the user.
```js
const provider = idWallet.get3idProvider()
const box = await Box.openBox(null, provider)
```

#### Using the ThreeIdProvider to consume RPC calls
As described above the *3idProvider* can be accessed by calling `idWallet.get3idProvider()`. The provider object that is returned can be used to consume [3ID JSON-RPC](https://github.com/3box/3box/blob/master/3IPs/3ip-10.md) requests.
```js
const provider = idWallet.get3idProvider()
// using the provider
const response = await provider.send(rpcRequest, origin)

// alternatively using a callback function
provider.send(rpcRequest, origin, (error, response) => {
  // use response or handle error
})
```
In the above example `rpcRequest` is a request formated according to the [3ID JSON-RPC](https://github.com/3box/3box/blob/master/3IPs/3ip-10.md) specification, and `origin` is a string, e.g. `https://my.app.origin`.

## <a name="api"></a> API Documentation
