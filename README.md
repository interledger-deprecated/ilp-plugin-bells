# ilp-plugin-bells [![npm][npm-image]][npm-url] [![circle][circle-image]][circle-url] [![codecov][codecov-image]][codecov-url]

[npm-image]: https://img.shields.io/npm/v/ilp-plugin-bells.svg?style=flat
[npm-url]: https://npmjs.org/package/ilp-plugin-bells
[circle-image]: https://circleci.com/gh/interledgerjs/ilp-plugin-bells.svg?style=shield
[circle-url]: https://circleci.com/gh/interledgerjs/ilp-plugin-bells
[codecov-image]: https://codecov.io/gh/interledgerjs/ilp-plugin-bells/branch/master/graph/badge.svg
[codecov-url]: https://codecov.io/gh/interledgerjs/ilp-plugin-bells

> ILP ledger plugin for [five-bells-ledger](https://github.com/interledgerjs/five-bells-ledger)

## Usage

This plugin adheres to the
[Ledger Plugin Interface (LPI)](https://interledger.org/rfcs/0004-ledger-plugin-interface/),
which means it can be used in combination with other components, like the
[ilp module](https://github.com/interledgerjs/ilp#simple-payment-setup-protocol-spsp)
and the [ilp-connector](https://github.com/interledgerjs/ilp-connector#trading).

ILP-Plugin-Bells can also be created via a factory, which allows many instances
to share a single websocket connection.

**Note: this requires an admin account on a ledger. Otherwise the factory can't
listen for events on all accounts.**

```js
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
  // created for a given username, then the existing plugin is returned from `create`

  return factory.create({ username: 'alice' })
  // { account: 'https://red.ilpdemo.org/ledger/accounts/alice' } is also valid

}).then((plugin) => {

  // this call is uneccesary and will do nothing, because the plugin is already
  // connected
  plugin.connect()

  // neither will this call; the plugin doesn't maintain its own connection,
  // so it can't disconnect itself
  plugin.disconnect()

  // ...

  // when you're done using the plugin, call factory.remove in order to
  // get rid of all event listeners and stop caching the plugin.

  factory.remove('alice')
})
```

## Compatibility

`ilp-plugin-bells` version 12 uses `five-bells-shared` version 23, and is only compatible with `five-bells-ledger` version 20.
As of version 12.0.1, it exposes [version `2c9a2231` of the Ledger Plugin Interface](https://github.com/interledger/rfcs/blob/2c9a22312dfd750f72b73406017fea246c8cd292/0004-ledger-plugin-interface/0004-ledger-plugin-interface.md)
