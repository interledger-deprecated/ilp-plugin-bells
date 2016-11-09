'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)

const assert = chai.assert

const mock = require('mock-require')
const nock = require('nock')
const wsHelper = require('./helpers/ws')
const cloneDeep = require('lodash/cloneDeep')

mock('ws', wsHelper.WebSocket)
const PluginBells = require('..')

describe('Info methods', function () {
  beforeEach(function * () {
    this.plugin = new PluginBells({
      prefix: 'example.red.',
      account: 'http://red.example/accounts/mike',
      password: 'mike',
      debugReplyNotifications: true,
      debugAutofund: {
        connector: 'http://mark.example',
        admin: {username: 'adminuser', password: 'adminpass'}
      }
    })

    this.infoRedLedger = cloneDeep(require('./data/infoRedLedger.json'))

    nock('http://red.example')
      .get('/accounts/mike')
      .reply(200, {
        ledger: 'http://red.example',
        name: 'mike'
      })

    const infoRedLedger = cloneDeep(require('./data/infoRedLedger.json'))

    nock('http://red.example')
      .get('/')
      .reply(200, infoRedLedger)

    this.wsRedLedger = wsHelper.makeServer('ws://red.example/websocket')

    yield this.plugin.connect()
  })

  afterEach(function * () {
    assert(nock.isDone(), 'all nocks should be called')
    this.wsRedLedger.stop()
  })

  describe('getInfo', function () {
    it('gets the precision and scale', function * () {
      nock('http://red.example')
        .get('/')
        .reply(200, this.infoRedLedger)
      const info = {
        connectors: [{
          id: 'http://red.example/accounts/mark',
          name: 'mark',
          connector: 'http://connector.example'
        }],
        currencyCode: 'USD',
        currencySymbol: '$',
        precision: 2,
        scale: 4
      }
      yield assert.eventually.deepEqual(this.plugin.getInfo(), info)
      // The result is cached.
      yield assert.eventually.deepEqual(this.plugin.getInfo(), info)
    })

    it('throws an ExternalError on 500', function () {
      nock('http://red.example')
        .get('/')
        .reply(500)
      return assert.isRejected(this.plugin.getInfo(), /ExternalError: Unable to determine ledger precision/)
    })

    it('throws an ExternalError when the precision is missing', function () {
      nock('http://red.example')
        .get('/')
        .reply(200, {scale: 4})
      return assert.isRejected(this.plugin.getInfo(), /ExternalError: Unable to determine ledger precision/)
    })
  })

  describe('getPrefix', function () {
    it('returns the plugin\'s prefix', function * () {
      yield assert.isFulfilled(this.plugin.getPrefix(), 'example.red.')
    })

    it('fails without any prefix', function () {
      const plugin = new PluginBells({
        // no prefix
        account: 'http://red.example/accounts/mike',
        password: 'mike'
      })
      return assert.isRejected(plugin.getPrefix(), /Error: Prefix has not been set/)
    })

    it('cannot connect without any prefix', function * () {
      const plugin = new PluginBells({
        account: 'http://blue.example/accounts/mike',
        password: 'mike',
        debugReplyNotifications: true,
        debugAutofund: {
          connector: 'http://mark.example',
          admin: {username: 'adminuser', password: 'adminpass'}
        }
      })

      const infoRedLedger = cloneDeep(require('./data/infoRedLedger.json'))
      nock('http://blue.example')
        .get('/')
        .reply(200, infoRedLedger)

      nock('http://blue.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://blue.example',
          name: 'mike'
        })

      yield assert.isRejected(plugin.connect(), /Error: Unable to set prefix from ledger or from local config/)
    })

    it('should use local if ledger and local prefix don\'t match', function * () {
      const plugin = new PluginBells({
        prefix: 'example.red.',
        account: 'http://blue.example/accounts/mike',
        password: 'mike',
        debugReplyNotifications: true,
        debugAutofund: {
          connector: 'http://mark.example',
          admin: {username: 'adminuser', password: 'adminpass'}
        }
      })

      const infoRedLedger = Object.assign(
        cloneDeep(require('./data/infoRedLedger.json')),
        { ilp_prefix: 'example.blue.' }
      )
      nock('http://blue.example')
        .get('/')
        .reply(200, infoRedLedger)

      nock('http://blue.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://blue.example',
          name: 'mike'
        })

      yield plugin.connect()
      assert.equal(plugin.prefix, 'example.red.')
    })

    it('gets the ledger\'s prefix when available', function * () {
      const plugin = new PluginBells({
        // no prefix
        account: 'http://blue.example/accounts/mike',
        password: 'mike',
        debugReplyNotifications: true,
        debugAutofund: {
          connector: 'http://mark.example',
          admin: {username: 'adminuser', password: 'adminpass'}
        }
      })

      const infoRedLedger = Object.assign(
        cloneDeep(require('./data/infoRedLedger.json')),
        { ilp_prefix: 'example.blue.' }
      )
      nock('http://blue.example')
        .get('/')
        .reply(200, infoRedLedger)

      nock('http://blue.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://blue.example',
          name: 'mike'
        })

      this.wsRedLedger = wsHelper.makeServer('ws://blue.example/websocket')

      yield plugin.connect()
      yield assert.isFulfilled(plugin.getPrefix(), 'example.blue.')
      yield plugin.disconnect()
    })
  })

  describe('getAccount', function () {
    it('returns the plugin\'s account', function * () {
      yield assert.isFulfilled(this.plugin.getAccount(), 'example.red.mike')
    })

    it('fails without any prefix', function () {
      const plugin = new PluginBells({
        // no prefix
        account: 'http://red.example/accounts/mike',
        password: 'mike'
      })
      return assert.isRejected(plugin.getAccount(), /Error: Must be connected before getAccount can be called/)
    })
  })

  describe('getBalance', function () {
    it('returns the current balance', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .basicAuth({user: 'mike', pass: 'mike'})
        .reply(200, {balance: '100'})
      yield assert.isFulfilled(this.plugin.getBalance(), '100')
    })

    it('throws an ExternalError on 500', function () {
      nock('http://red.example')
        .get('/accounts/mike')
        .basicAuth({user: 'mike', pass: 'mike'})
        .reply(500)
      return assert.isRejected(this.plugin.getBalance(), /Error: Unable to determine current balance/)
    })
  })
})

