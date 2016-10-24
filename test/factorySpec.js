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
const PluginBellsFactory = require('..').Factory

describe('PluginBellsFactory', function () {
  beforeEach(function * () {
    this.wsAdmin = new wsHelper.Server('ws://red.example/accounts/admin/transfers')
    this.wsRedLedger = new wsHelper.Server('ws://red.example/accounts/*/transfers')
    this.infoRedLedger = cloneDeep(require('./data/infoRedLedger.json'))

    nock('http://red.example')
      .get('/accounts/admin')
      .reply(200, {
        ledger: 'http://red.example',
        name: 'admin'
      })

    const infoRedLedger = cloneDeep(require('./data/infoRedLedger.json'))

    nock('http://red.example')
      .get('/')
      .reply(200, infoRedLedger)

    nock('http://red.example')
      .get('/')
      .reply(200, infoRedLedger)

    this.fiveBellsTransferMike = {
      id: 'http://red.example/transfers/ac518dfb-b8a6-49ef-b78d-5e26e81d7a45',
      ledger: 'http://red.example',
      debits: [{
        account: 'http://red.example/accounts/alice',
        amount: '10'
      }],
      credits: [{
        account: 'http://red.example/accounts/mike',
        amount: '10'
      }],
      state: 'executed'
    }

    this.transfer = {
      id: 'ac518dfb-b8a6-49ef-b78d-5e26e81d7a45',
      direction: 'incoming',
      account: 'example.red.alice',
      amount: '10',
      expiresAt: (new Date((new Date()).getTime() + 1000)).toISOString()
    }

    this.fiveBellsMessage = cloneDeep(require('./data/message.json'))
    this.message = {
      ledger: 'example.red.',
      account: 'example.red.alice',
      data: {foo: 'bar'}
    }

    this.factory = new PluginBellsFactory({
      adminUsername: 'admin',
      adminPassword: 'admin',
      adminAccount: 'http://red.example/accounts/admin',
      prefix: 'example.red.'
    })
  })

  afterEach(function * () {
    this.wsAdmin.stop()
    this.wsRedLedger.stop()
    assert(nock.isDone(), 'all nocks should be called')
  })

  describe('connect', function () {
    it('connects the admin plugin', function * () {
      yield this.factory.connect()
      assert.isTrue(this.factory.isConnected())
    })

    it('will not connect twice', function * () {
      yield this.factory.connect()
      assert.isTrue(this.factory.isConnected())

      yield this.factory.connect()
      assert.isTrue(this.factory.isConnected())
    })

    it('disconnects', function * () {
      yield this.factory.connect()
      assert.isTrue(this.factory.isConnected())

      yield this.factory.disconnect()
      assert.isFalse(this.factory.isConnected())
    })

    it('will not create a nonexistant account', function * () {
      yield this.factory.connect()
      assert.isTrue(this.factory.isConnected())

      const nockBob = nock('http://red.example')
        .get('/accounts/bob')
        .reply(404, {})

      try {
        yield this.factory.create({
          account: 'http://red.example/accounts/bob'
        })
        assert(false, 'factory create should have failed')
      } catch (e) {
        nockBob.done()
        assert.isTrue(true)
      }
    })

    it('will create a plugin', function * () {
      yield this.factory.connect()
      assert.isTrue(this.factory.isConnected())

      const nockMike = nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'admin'
        })

      const plugin = yield this.factory.create({
        account: 'http://red.example/accounts/mike'
      })

      nockMike.done()
      assert.isObject(plugin)
      assert.isTrue(plugin.isConnected())

      const plugin2 = yield this.factory.create({
        account: 'http://red.example/accounts/mike'
      })

      assert.equal(plugin, plugin2, 'only one plugin should be made per account')
    })

    it('will pass a notification to the correct plugin', function * () {
      yield this.factory.connect()
      assert.isTrue(this.factory.isConnected())

      const nockMike = nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'admin'
        })

      const pluginMike = yield this.factory.create({
        account: 'http://red.example/accounts/mike'
      })

      nockMike.done()

      const handled = new Promise((resolve, reject) => {
        pluginMike.on('incoming_transfer', resolve)
      })

      this.wsRedLedger.send(JSON.stringify({
        type: 'transfer',
        resource: this.fiveBellsTransferMike,
        related_resources: {}
      }))

      yield handled
    })

    it('will pass a message to the correct plugin', function * () {
      yield this.factory.connect()
      assert.isTrue(this.factory.isConnected())

      const nockMike = nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'admin'
        })

      const pluginMike = yield this.factory.create({
        account: 'http://red.example/accounts/mike'
      })

      nockMike.done()

      const handled = new Promise((resolve, reject) => {
        pluginMike.on('incoming_message', resolve)
      })

      this.wsRedLedger.send(JSON.stringify({
        type: 'message',
        resource: {
          ledger: 'http://red.example',
          account: 'http://red.example/accounts/mike',
          data: {}
        },
        related_resources: {}
      }))

      yield handled
    })

    it('removes a plugin', function * () {
      yield this.factory.connect()
      assert.isTrue(this.factory.isConnected())

      const nockMike = nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'admin'
        })

      yield this.factory.create({
        account: 'http://red.example/accounts/mike'
      })

      nockMike.done()

      yield this.factory.remove('http://red.example/accounts/mike')
      assert.isNotOk(this.factory.plugins.get('http://red.example/acounts/mike'))
    })
  })
})
