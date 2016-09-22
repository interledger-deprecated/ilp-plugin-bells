'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
chai.should()

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

    const nockAccount = nock('http://red.example')
      .get('/accounts/mike')
      .reply(200, {
        ledger: 'http://red.example',
        name: 'mike'
      })

    const infoRedLedger = cloneDeep(require('./data/infoRedLedger.json'))

    const nockInfo = nock('http://red.example')
      .get('/')
      .reply(200, infoRedLedger)

    this.wsRedLedger = new wsHelper.Server('ws://red.example/accounts/mike/transfers')

    yield this.plugin.connect()

    nockAccount.done()
    nockInfo.done()
  })

  afterEach(function * () {
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
      yield assertResolve(this.plugin.getInfo(), info)
      // The result is cached.
      yield assertResolve(this.plugin.getInfo(), info)
    })

    it('throws an ExternalError on 500', function (done) {
      nock('http://red.example')
        .get('/')
        .reply(500)
      this.plugin.getInfo().should.be
        .rejectedWith('Unable to determine ledger precision')
        .notify(done)
    })

    it('throws an ExternalError when the precision is missing', function (done) {
      nock('http://red.example')
        .get('/')
        .reply(200, {scale: 4})
      this.plugin.getInfo().should.be
        .rejectedWith('Unable to determine ledger precision')
        .notify(done)
    })
  })

  describe('getPrefix', function () {
    it('returns the plugin\'s prefix', function * () {
      yield assertResolve(this.plugin.getPrefix(), 'example.red.')
    })

    it('fails without any prefix', function (done) {
      const plugin = new PluginBells({
        // no prefix
        account: 'http://red.example/accounts/mike',
        password: 'mike'
      })
      plugin.getPrefix().should.be
        .rejectedWith('Prefix has not been set')
        .notify(done)
    })

    it('cannot connect without any prefix', function (done) {
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
      const nockInfo = nock('http://blue.example')
        .get('/')
        .reply(200, infoRedLedger)

      const nockAccount = nock('http://blue.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://blue.example',
          name: 'mike'
        })

      plugin.connect().should.be
        .rejectedWith('Unable to set prefix from ledger or from local config')
        .notify(() => {
          nockInfo.done()
          nockAccount.done()
          done()
        })
    })

    it('should use local if ledger and local prefix don\'t match', function (done) {
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
      const nockInfo = nock('http://blue.example')
        .get('/')
        .reply(200, infoRedLedger)

      const nockAccount = nock('http://blue.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://blue.example',
          name: 'mike'
        })

      plugin.connect().then(() => {
        assert.equal(plugin.prefix, 'example.red.')
        nockInfo.done()
        nockAccount.done()
        done()
      })
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
      const nockInfo = nock('http://blue.example')
        .get('/')
        .reply(200, infoRedLedger)

      const nockAccount = nock('http://blue.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://blue.example',
          name: 'mike'
        })

      this.wsRedLedger = new wsHelper.Server('ws://blue.example/accounts/mike/transfers')

      yield plugin.connect()
      yield assertResolve(plugin.getPrefix(), 'example.blue.')
      yield plugin.disconnect()
      nockInfo.done()
      nockAccount.done()
    })
  })

  describe('getAccount', function () {
    it('returns the plugin\'s account', function * () {
      yield assertResolve(this.plugin.getAccount(), 'example.red.mike')
    })

    it('fails without any prefix', function (done) {
      const plugin = new PluginBells({
        // no prefix
        account: 'http://red.example/accounts/mike',
        password: 'mike'
      })
      plugin.getAccount().should.be
        .rejectedWith('Must be connected before getAccount can be called')
        .notify(done)
    })
  })

  describe('getBalance', function () {
    it('returns the current balance', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .basicAuth({user: 'mike', pass: 'mike'})
        .reply(200, {balance: '100'})
      yield assertResolve(this.plugin.getBalance(), '100')
    })

    it('throws an ExternalError on 500', function (done) {
      nock('http://red.example')
        .get('/accounts/mike')
        .basicAuth({user: 'mike', pass: 'mike'})
        .reply(500)
      this.plugin.getBalance().should.be
        .rejectedWith('Unable to determine current balance')
        .notify(done)
    })
  })
})

function * assertResolve (promise, expected) {
  assert(promise instanceof Promise)
  assert.deepEqual(yield promise, expected)
}
