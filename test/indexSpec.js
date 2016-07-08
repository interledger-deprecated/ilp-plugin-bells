'use strict'

const assert = require('chai').assert
const expect = require('chai').expect
const mock = require('mock-require')
const nock = require('nock')
const sinon = require('sinon')
const wsHelper = require('./helpers/ws')

mock('ws', wsHelper.WebSocket)
const PluginBells = require('..')

describe('PluginBells', function () {
  it('should be a class', function () {
    assert.isFunction(PluginBells)
  })

  describe('constructor', function () {
    it('should succeed with valid configuration', function () {
      const plugin = new PluginBells({
        auth: {
          account: 'http://red.example/accounts/mike',
          password: 'mike'
        }
      })

      assert.instanceOf(plugin, PluginBells)
    })

    it('should throw when options are missing', function () {
      assert.throws(() => {
        return new PluginBells()
      }, 'Expected an options object, received: undefined')
    })

    it('should throw when auth information is missing', function () {
      assert.throws(() => {
        return new PluginBells({
          // no auth
        })
      }, 'Expected options.auth to be an object, received: undefined')
    })
  })

  describe('instance', function () {
    beforeEach(function * () {
      this.plugin = new PluginBells({
        auth: {
          account: 'http://red.example/accounts/mike',
          password: 'mike'
        },
        id: 'http://red.example'
      })
    })

    it('connect', function * () {
      const nockAccount = nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })

      yield this.plugin.connect()

      assert.isTrue(this.plugin.isConnected())

      nockAccount.done()
    })

    it('should retry when getting connectors', function * () {
      const nockConnectorsError = nock('http://red.example')
        .get('/connectors')
        .replyWithError('Error')

      const nockConnectorsSuccess = nock('http://red.example')
        .get('/connectors')
        .reply(200, [{
          id: 'http://red.example/accounts/bob',
          name: 'bob',
          connector: 'http://connector.example'
        }])

      const connectors = yield this.plugin.getConnectors()
      expect(connectors).to.deep.equal(['http://connector.example'])

      nockConnectorsError.done()
      nockConnectorsSuccess.done()
    })
  })

  describe('connected instance', function () {
    beforeEach(function * () {
      this.plugin = new PluginBells({
        auth: {
          account: 'http://red.example/accounts/mike',
          password: 'mike'
        },
        debugReplyNotifications: true
      })

      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })

      this.wsRedLedger = new wsHelper.Server('ws://red.example/accounts/mike/transfers')

      yield this.plugin.connect()
    })

    afterEach(function * () {
      this.wsRedLedger.stop()
    })

    describe('receive', function () {
      it('should pass on incoming executed transfers', function * () {
        const stubReceive = sinon.stub()
        this.plugin.on('receive', stubReceive)
        this.wsRedLedger.send(JSON.stringify({
          resource: {
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
        }))

        yield new Promise((resolve) => this.wsRedLedger.on('message', resolve))

        sinon.assert.calledOnce(stubReceive)
        sinon.assert.calledWith(stubReceive, {
          id: 'ac518dfb-b8a6-49ef-b78d-5e26e81d7a45',
          direction: 'incoming',
          account: 'http://red.example/accounts/alice',
          amount: '10'
        })
      })
    })
  })
})
