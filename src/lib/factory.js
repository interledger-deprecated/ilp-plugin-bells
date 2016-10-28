'use strict'

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
  * @param {string} opts.prefix optional set ledger prefix
  */
  constructor (opts) {
    this.adminUsername = opts.adminUsername
    this.adminPassword = opts.adminPassword
    this.adminAccount = opts.adminAccount
    this.metadata = {}
    this.metadata.prefix = opts.prefix
    this.connected = false
    this.plugins = new Map()
  }

  isConnected () {
    return this.connected
  }

  connect () {
    return co.wrap(this._connect).call(this)
  }
  * _connect () {
    if (this.connected) {
      return
    }

    // create the central admin instance
    this.adminPlugin = new Plugin({
      username: this.adminUsername,
      password: this.adminPassword,
      account: this.adminAccount,
      prefix: this.metadata.prefix
    })

    debug('connecting admin plugin')
    yield this.adminPlugin.connect()

    // get the shared metadata
    debug('retrieving ledger metadata')
    this.metadata.prefix = yield this.adminPlugin.getPrefix()
    this.metadata.info = yield this.adminPlugin.getInfo()
    this.metadata.urls = this.adminPlugin.urls
    this.metadata.host = this.adminPlugin.host

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
          this.connected = true
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
    return co.wrap(this._disconnect).call(this)
  }
  * _disconnect () {
    debug('disconnecting admin plugin')
    this.connected = false
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
      const msg = 'account ' + opts.account + ' cannot be reached: ' + exists.statusCode
      debug(msg)
      throw new UnreachableError(msg)
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
    plugin.urls = this.metadata.urls
    plugin.info = this.metadata.info
    plugin.prefix = this.metadata.prefix
    plugin.host = this.metadata.host

    this.plugins.set(opts.account, plugin)
    return plugin
  }

  /*
  * @param {string} account account of the plugin being removed
  */
  remove (account) {
    // delete all listeners to stop memory leaks
    this.plugins.get(account).removeAllListeners()
    this.plugins.delete(account)
    return Promise.resolve(null)
  }
}

module.exports = PluginFactory
