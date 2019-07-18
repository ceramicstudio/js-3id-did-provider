[![CircleCI](https://img.shields.io/circleci/project/github/3box/identity-wallet.svg?style=for-the-badge)](https://circleci.com/gh/3box/identity-wallet)
[![Discord](https://img.shields.io/discord/484729862368526356.svg?style=for-the-badge)](https://discordapp.com/invite/Z3f3Cxy)
[![npm](https://img.shields.io/npm/dt/3box.svg?style=for-the-badge)](https://www.npmjs.com/package/3box)
[![npm](https://img.shields.io/npm/v/3box.svg?style=for-the-badge)](https://www.npmjs.com/package/3box)
[![Codecov](https://img.shields.io/codecov/c/github/3box/identity-wallet.svg?style=for-the-badge)](https://codecov.io/gh/3box/identity-wallet)
[![Twitter Follow](https://img.shields.io/twitter/follow/3boxdb.svg?style=for-the-badge&label=Twitter)](https://twitter.com/3boxdb)
[![Greenkeeper badge](https://badges.greenkeeper.io/3box/identity-wallet.svg)](https://greenkeeper.io/)

# Identity Wallet

The Identity Wallet SDK allows developers to easily create a wallet that let's users control their own data. An identity can be tied to an ethereum account, ethereum smart contract, or simply exist by itself. The Identity Wallet can be used together with [3Box](https://github.com/3box/3box-js) to sync, update, and store user data. It provides APIs for encrypting/decrypting data, and signing claims.

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
const Box = require('identity-wallet')
```
Import using the dist build in your html code
```js
<script type="text/javascript" src="../dist/identity-wallet.js"></script>
```

## <a name="api"></a> API Documentation
<a name="IdentityWallet"></a>

### IdentityWallet
**Kind**: global class  

* [IdentityWallet](#IdentityWallet)
    * [new IdentityWallet(config)](#new_IdentityWallet_new)
    * [.authenticate(spaces, opts)](#IdentityWallet+authenticate) ⇒ <code>Object</code>
    * [.addAuthMethod(authSecret)](#IdentityWallet+addAuthMethod)
    * [.signClaim(payload, opts)](#IdentityWallet+signClaim) ⇒ <code>String</code>
    * [.encrypt(message, space, opts)](#IdentityWallet+encrypt) ⇒ <code>Object</code>
    * [.decrypt(encryptedObject, space)](#IdentityWallet+decrypt) ⇒ <code>String</code>

<a name="new_IdentityWallet_new"></a>

#### new IdentityWallet(config)
Creates an instance of IdentityWallet

**Returns**: <code>this</code> - An IdentityWallet instance  

| Param | Type | Description |
| --- | --- | --- |
| config | <code>Object</code> | The configuration to be used |
| config.seed | <code>String</code> | The seed of the identity, 32 hex string |
| config.authSecret | <code>String</code> | The authSecret to use, 32 hex string |
| config.ethereumAddress | <code>String</code> | The ethereumAddress of the identity |

<a name="IdentityWallet+authenticate"></a>

#### identityWallet.authenticate(spaces, opts) ⇒ <code>Object</code>
Authenticate to given spaces

**Kind**: instance method of [<code>IdentityWallet</code>](#IdentityWallet)  
**Returns**: <code>Object</code> - The public keys for the requested spaces of this identity  

| Param | Type | Description |
| --- | --- | --- |
| spaces | <code>Array.&lt;String&gt;</code> | The desired spaces |
| opts | <code>Object</code> | Optional parameters |
| opts.authData | <code>Array.&lt;Object&gt;</code> | The authData for this identity |

<a name="IdentityWallet+addAuthMethod"></a>

#### identityWallet.addAuthMethod(authSecret)
Add a new authentication method for this identity

**Kind**: instance method of [<code>IdentityWallet</code>](#IdentityWallet)  

| Param | Type | Description |
| --- | --- | --- |
| authSecret | <code>String</code> | A 32 byte hex string used as authentication secret |

<a name="IdentityWallet+signClaim"></a>

#### identityWallet.signClaim(payload, opts) ⇒ <code>String</code>
Sign a verifiable credential. The format of the credential is [did-jwt](https://github.com/uport-project/did-jwt).

**Kind**: instance method of [<code>IdentityWallet</code>](#IdentityWallet)  
**Returns**: <code>String</code> - The signed claim encoded as a JWT  

| Param | Type | Description |
| --- | --- | --- |
| payload | <code>Object</code> | The payload of the claim |
| opts | <code>Object</code> | Optional parameters |
| opts.DID | <code>String</code> | The DID used as the issuer of this claim |
| opts.space | <code>String</code> | The space used to sign the claim |
| opts.expiresIn | <code>String</code> | Set an expiry date for the claim as unix timestamp |

<a name="IdentityWallet+encrypt"></a>

#### identityWallet.encrypt(message, space, opts) ⇒ <code>Object</code>
Encrypt a message

**Kind**: instance method of [<code>IdentityWallet</code>](#IdentityWallet)  
**Returns**: <code>Object</code> - The encrypted object (ciphertext and nonce)  

| Param | Type | Description |
| --- | --- | --- |
| message | <code>String</code> | The message to be encrypted |
| space | <code>String</code> | The space used for encryption |
| opts | <code>Object</code> | Optional parameters |
| opts.nonce | <code>String</code> | The nonce used to encrypt the message |
| opts.blockSize | <code>String</code> | The blockSize used for padding (default 24) |

<a name="IdentityWallet+decrypt"></a>

#### identityWallet.decrypt(encryptedObject, space) ⇒ <code>String</code>
Decrypt a message

**Kind**: instance method of [<code>IdentityWallet</code>](#IdentityWallet)  
**Returns**: <code>String</code> - The decrypted message  

| Param | Type | Description |
| --- | --- | --- |
| encryptedObject | <code>Object</code> | The encrypted object (ciphertext and nonce) |
| space | <code>String</code> | The space used for encryption |

