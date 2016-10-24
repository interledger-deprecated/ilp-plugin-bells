# ilp-plugin-bells [![npm][npm-image]][npm-url] [![circle][circle-image]][circle-url] [![codecov][codecov-image]][codecov-url]

[npm-image]: https://img.shields.io/npm/v/ilp-plugin-bells.svg?style=flat
[npm-url]: https://npmjs.org/package/ilp-plugin-bells
[circle-image]: https://circleci.com/gh/interledgerjs/ilp-plugin-bells.svg?style=shield
[circle-url]: https://circleci.com/gh/interledgerjs/ilp-plugin-bells
[codecov-image]: https://codecov.io/gh/interledgerjs/ilp-plugin-bells/branch/master/graph/badge.svg
[codecov-url]: https://codecov.io/gh/interledgerjs/ilp-plugin-bells

> ILP ledger plugin for [five-bells-ledger](https://github.com/interledgerjs/five-bells-ledger)

## Installation

``` sh
npm install --save ilp ilp-plugin-bells
```

## Usage

``` js
const Client = require('ilp').Client

const client = new Client({
  type: 'bells',
  auth: {
    prefix: 'ilpdemo.red.',
    // Account URI
    account: 'https://red.ilpdemo.org/ledger/accounts/alice',
    password: 'alice'
  }
})
```

ILP-Plugin-Bells can also be created via a factory, which allows many instances
to share a single websocket connection:

```js
const Client = require('ilp').Client
const PluginBellsFactory = require('ilp-plugin-bells').Factory

// connects to the admin account and uses one websocket connection to subscribe
// to all transfers and messages on the ledger

const factory = new PluginBellsFactory({
  adminUsername: 'admin',
  adminPassword: 'admin',
  adminAccount: 'https://red.ilpdemo.org/ledger/accounts/admin' 
})

factory.connect().then(() => {

  // `create` will make a new, connected, PluginBells instance. If a plugin is already
  // created for a given account, then the existing plugin is returned from `create`

  const client = new Client(factory.create({
    account: 'https://red.ilpdemo.org/ledger/accounts/alice'
  })

  // ...
})
