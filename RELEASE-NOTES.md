# Release Notes

## v1.0.2 - 2021-05-28

feat: deterministic DID with seed

## v1.0.1 - 2021-05-27

- fix: 3IDv1 without deterministic flag
- chore: remove webpack and UMD build

## v1.0.0 - 2021-05-06

Release version 1 of 3id-did-provider.

- chore: update dependencies
- chore: remove resetIDX method (#129)
- fix: 3IDv0 key derivation

## v0.4.0 - 2021-01-14

- ref: use `did:key` for authmethods
- chore: Bump Ceramic version
- chore: Integration tests for 3IDv0

## v0.1.0 - 2020-12-02

Initial release of `3id-did-provider`.
Major refactor to use Ceramic and 3IDv1.

# IdentityWallet Release Notes

Package was previously named `identity-wallet`.

## v1.4.0 - 2020-08-07

feat: add DID provider
feat: typescript support
chore: dependency up, eslint

## v1.3.0 - 2020-05-21

feat: 3id-connect v2 support, externalAuth link on auth

## v1.2.0 - 2020-04-13

fix: buffer (un)encrypt (now support confidential threads)
feat: import migrated keys, and external auth function (support 3boxjs migration)

## v1.1.3 - 2020-03-18

fix: sign hex encoded messages correctly
chore: pin `hdnode` and `wallet` package versions

## v1.1.1 - 2020-02-12

chore: update `hdnode` and `wallet` packages from `ethers.js`

## v1.1.0 - 2020-01-07

feature: Add support for asymmetric encryption

## v1.0.0 - 2019-12-02

refactor: improved logic for linking blockchain addresses
fix: use js-sha256 instead of crypto dependency

Also features other minor bug fixes

## v0.3.1 - 2019-11-14

Fix: add is3idProvider property to provider

## v0.3.0 - 2019-11-05

Feat: add required getConsent function
Fix: bug when opening spaces
chore: reduced bundle size

## v0.2.1 - 2019-10-22

Fix: correct name for encryption key

## v0.2.0 - 2019-10-17

Feat: add 3ID Provider

## v0.1.0 - 2019-09-26

Fixed various issues and added missing functionality.

## v0.0.1 - 2019-07-09

First release
