const co = require('co')
const Plugin = require('./plugin')
const reconnectCore = require('reconnect-core')
const WebSocket = require('ws')
const debug = require('debug')('ilp-plugin-bells:factory')
const UnreachableError = require('../errors/unreachable-error')
const request = require('co-request')

class PluginFactory {

  /*
  * @param {object} opts Options for PluginFactory
  *
  * @param {string} opts.adminUsername admin account username
  * @param {string} opts.adminPassword admin account password
  * @param {string} opts.accounts endpoint to subscribe to all accounts
  */
  constructor (opts) {
    this.adminUsername = opts.adminUsername
    this.adminPassword = opts.adminPassword
    this.adminAccount = opts.adminAccount
    this.metadata = {}

    // weakmap allows elements to be garbage collected if they aren't being
    // used. this stops the factory from holding onto unused plugins forever.
    this.plugins = new Map()
  }

  connect () {
    return co.wrap(this._connect).call(this)
  }
  * _connect () {
    // create the central admin instance
    this.adminPlugin = new Plugin({
      username: this.adminUsername,
      password: this.adminPassword,
      account: this.adminAccount
    })

    debug('connecting admin plugin')
    yield this.adminPlugin.connect()

    // get the shared metadata
    debug('retrieving ledger metadata')
    this.metadata.prefix = yield this.adminPlugin.getPrefix()
    this.metadata.info = yield this.adminPlugin.getInfo()

    const endpoint = this.adminPlugin
      .urls
      .account_transfers
      .replace(':name', '*')

    const auth = this.adminUsername + ':' + this.adminPassword
    const options = {
      headers: {
        Authorization: 'Basic ' + new Buffer(auth, 'utf8').toString('base64')
      }
    }

    const reconnect = reconnectCore(() => {
      return new WebSocket(endpoint, options)
    })

    debug('establishing websocket connection to ' + endpoint)
    return new Promise((resolve, reject) => {
      this.connection = reconnect({immediate: true}, (ws) => {
        debug('websocket exists now')
        ws.on('open', () => {
          debug('ws connected to ' + endpoint)
          resolve(null)
        })

        ws.on('message', (msg) => {
          const notification = JSON.parse(msg)

          // call the correct handle function on the correct plugin
          debug('notified of:', notification)
          co.wrap(this._routeNotification).call(this, notification)
        })

        ws.on('error', () => {
          debug('ws connection error on ' + endpoint)
          reject(new UnreachableError('ws connection error on ' + endpoint))
        })
        ws.on('disconnect', () => {
          debug('ws connection error on ' + endpoint)
          reject(new UnreachableError('ws disconnect on ' + endpoint))
        })
      })

      this.connection.connect()
    })
  }

  * _routeNotification (notification) {
    let accounts = []

    if (notification.type === 'transfer') {
      // add credits
      accounts = accounts.concat(notification.resource.credits
        .map((c) => (c.account)))

      // add debits
      accounts = accounts.concat(notification.resource.debits
        .map((c) => (c.account)))
    } else if (notification.type === 'message') {
      // add account
      accounts.push(notification.resource.account)
    }

    // for every account in the notification, call that plugin's notification
    // handler
    for (let account of accounts) {
      const plugin = this.plugins.get(account)
      if (plugin) {
        debug('sending notification to ' + account)
        co.wrap(plugin._handleNotification).call(
          plugin, // 'this' argument
          notification.type, // type
          notification.resource, // data
          notification.related_resources // related
        )
      }
    }
  }

  disconnect () {
    return co.wrap(this._connect).call(this)
  }
  * _disconnect () {
    debug('disconnecting admin plugin')
    yield this.adminPlugin.disconnect()
  }

  /*
  * @param {object} opts plugin options
  * @param {string} opts.account account to create a plugin for
  */
  create (opts) {
    return co.wrap(this._create).call(this, opts)
  }
  * _create (opts) {
    // try to retrieve existing plugin
    const existing = this.plugins.get(opts.account)
    if (existing) return existing

    // make sure that the account exists
    const exists = yield request(opts.account, {
      headers: {
        Authorization: this.adminUsername + ':' + this.adminPassword
      }
    })

    if (exists.statusCode !== 200) {
      debug('account ' + opts.account + ' cannot be reached: ' + exists.statusCode)
      return
    }

    // otherwise, create a new plugin
    const plugin = new Plugin({
      username: null,
      password: null,
      account: opts.account
    })

    // 'connects' the plugin without really connecting it
    plugin.connected = true
    plugin.connection = {} // stop plugin from double-connecting
    plugin.info = this.metadata.info
    plugin.prefix = this.metadata.prefix

    this.plugins.set(opts.account, plugin)
    return plugin
  }
}

module.exports = PluginFactory
