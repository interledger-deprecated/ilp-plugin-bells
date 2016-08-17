'use strict'

const assert = require('chai').assert
const expect = require('chai').expect
const mock = require('mock-require')
const nock = require('nock')
const sinon = require('sinon')
const wsHelper = require('./helpers/ws')
const ExternalError = require('../src/errors/external-error')
const cloneDeep = require('lodash/cloneDeep')

mock('ws', wsHelper.WebSocket)
const PluginBells = require('..')

describe('PluginBells', function () {
  afterEach(function () { assert(nock.isDone()) })

  it('should be a class', function () {
    assert.isFunction(PluginBells)
  })

  describe('constructor', function () {
    it('should succeed with valid configuration', function () {
      const plugin = new PluginBells({
        prefix: 'foo.',
        account: 'http://red.example/accounts/mike',
        password: 'mike'
      })

      assert.instanceOf(plugin, PluginBells)
    })

    it('should throw when options are missing', function () {
      assert.throws(() => {
        return new PluginBells()
      }, 'Expected an options object, received: undefined')
    })

    it('should throw when options.prefix is missing', function () {
      assert.throws(() => {
        return new PluginBells({
          prefix: 5 // prefix is wrong type
        })
      }, 'Expected options.prefix to be a string, received: number')
    })

    it('should throw when options.prefix is an invalid prefix', function () {
      assert.throws(() => {
        return new PluginBells({
          prefix: 'foo', // no trailing "."
          account: 'http://red.example/accounts/mike',
          password: 'mike'
        })
      }, 'Expected options.prefix to end with "."')
    })
  })

  describe('instance', function () {
    beforeEach(function * () {
      this.plugin = new PluginBells({
        prefix: 'example.red.',
        account: 'http://red.example/accounts/mike',
        password: 'mike'
      })

      this.infoRedLedger = cloneDeep(require('./data/infoRedLedger.json'))
    })

    describe('connect', function () {
      it('connects', function * () {
        nock('http://red.example')
          .get('/accounts/mike')
          .reply(200, {
            ledger: 'http://red.example',
            name: 'mike'
          })
        nock('http://red.example')
          .get('/')
          .reply(200, this.infoRedLedger)

        yield assertResolve(this.plugin.connect(), null)
        assert.isTrue(this.plugin.isConnected())
      })

      it('ignores if called twice', function * () {
        nock('http://red.example')
          .get('/accounts/mike')
          .reply(200, {
            ledger: 'http://red.example',
            name: 'mike'
          })

        const nockInfo = nock('http://red.example')
          .get('/')
          .reply(200, this.infoRedLedger)

        yield this.plugin.connect()
        yield this.plugin.connect()
        assert.isTrue(this.plugin.isConnected())
        nockInfo.done()
      })

      it('fails if the response is invalid', function * () {
        nock('http://red.example')
          .get('/accounts/mike')
          .reply(200, { name: 'mike' })

        try {
          yield this.plugin.connect()
          assert(false)
        } catch (err) {
          assert.isFalse(this.plugin.isConnected())
          assert.equal(err.message, 'Failed to resolve ledger URI from account URI')
        }
      })

      it('retries if ledger accounts not available', function * () {
        const nockAccountError = nock('http://red.example')
          .get('/accounts/mike')
          .reply(400)

        const nockAccountSuccess = nock('http://red.example')
          .get('/accounts/mike')
          .reply(200, {
            ledger: 'http://red.example',
            name: 'mike'
          })

        const nockInfo = nock('http://red.example')
          .get('/')
          .reply(200, this.infoRedLedger)

        yield this.plugin.connect()

        nockAccountError.done()
        nockAccountSuccess.done()
        nockInfo.done()
      })

      describe('a connector', function () {
        beforeEach(function () {
          this.plugin = new PluginBells({
            connector: 'http://mark.example',
            prefix: 'example.red.',
            account: 'http://red.example/accounts/mike',
            password: 'mike'
          })
        })

        it('sets the connector field', function * () {
          nock('http://red.example')
            .get('/accounts/mike')
            .reply(200, { ledger: 'http://red.example', name: 'mike' })
            .put('/accounts/mike', { name: 'mike', connector: 'http://mark.example' })
            .reply(200)

          const nockInfo = nock('http://red.example')
            .get('/')
            .reply(200, this.infoRedLedger)

          yield this.plugin.connect()

          nockInfo.done()
        })

        it('throws an ExternalError if unable to set the connector field', function * () {
          nock('http://red.example')
            .get('/accounts/mike')
            .reply(200, { ledger: 'http://red.example', name: 'mike' })
            .put('/accounts/mike', { name: 'mike', connector: 'http://mark.example' })
            .reply(500)
          try {
            yield this.plugin.connect()
            assert(false)
          } catch (err) {
            assert(err instanceof ExternalError)
            assert.equal(err.message, 'Remote error: status=500')
          }
        })
      })
    })

    describe('getConnectors (not connected)', function () {
      it('fails when not connected', function * () {
        try {
          yield assertResolve(this.plugin.getConnectors(), undefined)
          assert(false)
        } catch (err) {
          assert.equal(err.message, 'Must be connected before getConnectors can be called')
        }
      })
    })

    describe('getAccount (not connected)', function () {
      it('throws if not connected', function (done) {
        this.plugin.getAccount().catch(function (err) {
          assert.equal(err.message, 'Must be connected before getAccount can be called')
          done()
        })
      })
    })
  })

  describe('connected instance', function () {
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

    function * itEmitsFulfillExecutionCondition () {
      this.wsRedLedger.send(JSON.stringify({
        resource: Object.assign(this.fiveBellsTransferExecuted, {
          execution_condition: 'cc:0:3:vmvf6B7EpFalN6RGDx9F4f4z0wtOIgsIdCmbgv06ceI:7'
        }),
        related_resources: {
          execution_condition_fulfillment: 'cf:0:ZXhlY3V0ZQ'
        }
      }))

      yield new Promise((resolve) => this.wsRedLedger.on('message', resolve))

      if (this.stubPrepare) sinon.assert.notCalled(this.stubPrepare)
      sinon.assert.calledOnce(this.stubFulfillExecutionCondition)
      sinon.assert.calledWith(this.stubFulfillExecutionCondition,
        Object.assign(this.transfer, {
          executionCondition: 'cc:0:3:vmvf6B7EpFalN6RGDx9F4f4z0wtOIgsIdCmbgv06ceI:7'
        }), 'cf:0:ZXhlY3V0ZQ')
    }

    function * itEmitsFulfillCancellationCondition () {
      this.wsRedLedger.send(JSON.stringify({
        resource: Object.assign(this.fiveBellsTransferExecuted, {
          state: 'rejected',
          cancellation_condition: 'cc:0:3:vmvf6B7EpFalN6RGDx9F4f4z0wtOIgsIdCmbgv06ceI:7'
        }),
        related_resources: {
          cancellation_condition_fulfillment: 'cf:0:ZXhlY3V0ZQ'
        }
      }))

      yield new Promise((resolve) => this.wsRedLedger.on('message', resolve))

      if (this.stubReceive) sinon.assert.notCalled(this.stubReceive)
      sinon.assert.notCalled(this.stubFulfillExecutionCondition)
      sinon.assert.calledOnce(this.stubFulfillCancellationCondition)
      sinon.assert.calledWith(this.stubFulfillCancellationCondition,
        Object.assign(this.transfer, {
          cancellationCondition: 'cc:0:3:vmvf6B7EpFalN6RGDx9F4f4z0wtOIgsIdCmbgv06ceI:7'
        }), 'cf:0:ZXhlY3V0ZQ')
    }

    describe('notifications of unrelated transfers', function () {
      it('emits an UnrelatedNotificationError for an unrelated notification', function (done) {
        this.wsRedLedger.on('message', function (message) {
          assert.deepEqual(JSON.parse(message), {
            result: 'ignored',
            ignoreReason: {
              id: 'UnrelatedNotificationError',
              message: 'Notification does not seem related to connector'
            }
          })
          done()
        })
        this.wsRedLedger.send(JSON.stringify({
          resource: {
            id: 'http://red.example/transfers/ac518dfb-b8a6-49ef-b78d-5e26e81d7a45',
            ledger: 'http://red.example',
            debits: [{
              account: 'http://red.example/accounts/alice',
              amount: '10'
            }],
            credits: [{
              account: 'http://red.example/accounts/bob',
              amount: '10'
            }],
            state: 'executed'
          }
        }))
      })
    })

    describe('notification of timeout', function () {
      beforeEach(function () {
        this.stubReceive = sinon.stub()
        this.stubFulfillExecutionCondition = sinon.stub()
        this.stubIncomingCancel = sinon.stub()
        this.stubOutgoingCancel = sinon.stub()
        this.plugin.on('incoming_cancel', this.stubIncomingCancel)
        this.plugin.on('outgoing_cancel', this.stubOutgoingCancel)
        this.plugin.on('incoming_prepare', this.stubReceive)
        this.plugin.on('outgoing_fulfill', this.stubFulfillExecutionCondition)

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
          state: 'rejected'
        }
        this.fiveBellsTransferAlice = {
          id: 'http://red.example/transfers/ac518dfb-b8a6-49ef-b78d-5e26e81d7a45',
          ledger: 'http://red.example',
          debits: [{
            account: 'http://red.example/accounts/mike',
            amount: '10'
          }],
          credits: [{
            account: 'http://red.example/accounts/alice',
            amount: '10'
          }],
          state: 'rejected'
        }

        this.transfer = {
          id: 'ac518dfb-b8a6-49ef-b78d-5e26e81d7a45',
          direction: 'incoming',
          account: 'example.red.alice',
          amount: '10',
          expiresAt: (new Date((new Date()).getTime() + 1000)).toISOString()
        }
      })

      it('should handle a rejected transfer to mike', function * () {
        this.wsRedLedger.send(JSON.stringify({
          resource: Object.assign(this.fiveBellsTransferAlice, {
            execution_condition: 'cc:0:3:vmvf6B7EpFalN6RGDx9F4f4z0wtOIgsIdCmbgv06ceI:7'
          }),
          related_resources: {
            execution_condition_fulfillment: 'cf:0:ZXhlY3V0ZQ'
          }
        }))

        yield new Promise((resolve) => this.wsRedLedger.on('message', resolve))

        if (this.stubReceive) sinon.assert.notCalled(this.stubReceive)
        sinon.assert.calledOnce(this.stubOutgoingCancel)
        sinon.assert.notCalled(this.stubFulfillExecutionCondition)
      })

      it('should handle a rejected transfer to alice', function * () {
        this.wsRedLedger.send(JSON.stringify({
          resource: Object.assign(this.fiveBellsTransferMike, {
            execution_condition: 'cc:0:3:vmvf6B7EpFalN6RGDx9F4f4z0wtOIgsIdCmbgv06ceI:7'
          }),
          related_resources: {
            execution_condition_fulfillment: 'cf:0:ZXhlY3V0ZQ'
          }
        }))

        yield new Promise((resolve) => this.wsRedLedger.on('message', resolve))

        if (this.stubReceive) sinon.assert.notCalled(this.stubReceive)
        sinon.assert.calledOnce(this.stubIncomingCancel)
        sinon.assert.notCalled(this.stubFulfillExecutionCondition)
      })
    })

    describe('notifications of incoming transfers', function () {
      beforeEach(function () {
        this.stubPrepare = sinon.stub()
        this.stubExecute = sinon.stub()
        this.stubFulfillExecutionCondition = sinon.stub()
        this.stubFulfillCancellationCondition = sinon.stub()
        this.plugin.on('incoming_prepare', this.stubPrepare)
        this.plugin.on('incoming_transfer', this.stubExecute)
        this.plugin.on('incoming_fulfill', this.stubFulfillExecutionCondition)
        this.plugin.on('incoming_cancel', this.stubFulfillCancellationCondition)

        this.fiveBellsTransferExecuted = {
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
          ledger: 'example.red.',
          amount: '10'
        }
      })

      it('should emit "fulfill_execution_condition" on incoming executed transfers',
        itEmitsFulfillExecutionCondition)
      it('should emit "fulfill_cancellation_condition" on incoming rejected transfers',
        itEmitsFulfillCancellationCondition)

      it('should pass on incoming prepared transfers', function * () {
        this.fiveBellsTransferExecuted.expires_at = (new Date()).toISOString()
        this.fiveBellsTransferExecuted.state = 'prepared'
        this.wsRedLedger.send(JSON.stringify({
          resource: this.fiveBellsTransferExecuted
        }))

        yield new Promise((resolve) => this.wsRedLedger.on('message', resolve))
        sinon.assert.calledOnce(this.stubPrepare)
        sinon.assert.calledWith(this.stubPrepare, Object.assign(this.transfer, {
          expiresAt: this.fiveBellsTransferExecuted.expires_at
        }))
      })

      it('should pass on incoming executed transfers', function * () {
        this.fiveBellsTransferExecuted.expires_at = (new Date()).toISOString()
        this.wsRedLedger.send(JSON.stringify({
          resource: this.fiveBellsTransferExecuted
        }))

        yield new Promise((resolve) => this.wsRedLedger.on('message', resolve))
        sinon.assert.calledOnce(this.stubExecute)
        sinon.assert.calledWith(this.stubExecute, Object.assign(this.transfer, {
          expiresAt: this.fiveBellsTransferExecuted.expires_at
        }))
      })

      it('should ignore unrelated credits', function * () {
        this.fiveBellsTransferExecuted.credits.push({
          account: 'http://red.example/accounts/george',
          amount: '10'
        })
        this.wsRedLedger.send(JSON.stringify({
          resource: this.fiveBellsTransferExecuted
        }))

        yield new Promise((resolve) => this.wsRedLedger.on('message', resolve))
        sinon.assert.calledOnce(this.stubExecute)
        sinon.assert.calledWith(this.stubExecute, this.transfer)
      })
    })

    describe('notifications of outgoing transfers', function () {
      beforeEach(function () {
        this.stubFulfillExecutionCondition = sinon.stub()
        this.stubFulfillCancellationCondition = sinon.stub()
        this.stubOutgoingPrepare = sinon.stub()
        this.stubOutgoingExecute = sinon.stub()
        this.plugin.on('outgoing_prepare', this.stubOutgoingPrepare)
        this.plugin.on('outgoing_transfer', this.stubOutgoingExecute)
        this.plugin.on('outgoing_fulfill', this.stubFulfillExecutionCondition)
        this.plugin.on('outgoing_cancel', this.stubFulfillCancellationCondition)

        this.fiveBellsTransferExecuted = {
          id: 'http://red.example/transfers/ac518dfb-b8a6-49ef-b78d-5e26e81d7a45',
          ledger: 'http://red.example',
          debits: [{
            account: 'http://red.example/accounts/mike',
            amount: '10'
          }],
          credits: [{
            account: 'http://red.example/accounts/alice',
            amount: '10'
          }],
          state: 'executed'
        }
        this.transfer = {
          id: 'ac518dfb-b8a6-49ef-b78d-5e26e81d7a45',
          direction: 'outgoing',
          account: 'example.red.alice',
          ledger: 'example.red.',
          amount: '10'
        }
      })

      it('should emit "fulfill_execution_condition" on outgoing executed transfers',
        itEmitsFulfillExecutionCondition)
      it('should emit "fulfill_cancellation_condition" on outgoing rejected transfers',
        itEmitsFulfillCancellationCondition)

      it('be notified of an outgoing prepare', function * () {
        this.fiveBellsTransferExecuted.expires_at = (new Date()).toISOString()
        this.fiveBellsTransferExecuted.state = 'prepared'
        this.wsRedLedger.send(JSON.stringify({
          resource: this.fiveBellsTransferExecuted
        }))

        yield new Promise((resolve) => this.wsRedLedger.on('message', resolve))
        sinon.assert.calledOnce(this.stubOutgoingPrepare)
        sinon.assert.calledWith(this.stubOutgoingPrepare, Object.assign(this.transfer, {
          expiresAt: this.fiveBellsTransferExecuted.expires_at
        }))
      })

      it('be notified of an outgoing execute', function * () {
        this.fiveBellsTransferExecuted.expires_at = (new Date()).toISOString()
        this.wsRedLedger.send(JSON.stringify({
          resource: this.fiveBellsTransferExecuted
        }))

        yield new Promise((resolve) => this.wsRedLedger.on('message', resolve))
        sinon.assert.calledOnce(this.stubOutgoingExecute)
        sinon.assert.calledWith(this.stubOutgoingExecute, Object.assign(this.transfer, {
          expiresAt: this.fiveBellsTransferExecuted.expires_at
        }))
      })
    })

    describe('disconnect', function () {
      it('closes the connection', function () {
        assert.isTrue(this.plugin.isConnected())
        this.plugin.disconnect()
        assert.isFalse(this.plugin.isConnected())
        // A second time does nothing.
        this.plugin.disconnect()
      })
    })

    describe('getInfo', function () {
      it('gets the precision and scale', function * () {
        nock('http://red.example')
          .get('/')
          .reply(200, this.infoRedLedger)
        yield assertResolve(this.plugin.getInfo(), {
          currencyCode: 'USD',
          currencySymbol: '$',
          precision: 2,
          scale: 4
        })
      })

      it('throws an ExternalError on 500', function * () {
        nock('http://red.example')
          .get('/')
          .reply(500)
        try {
          yield this.plugin.getInfo()
          assert(false)
        } catch (err) {
          assert(err instanceof ExternalError)
          assert.equal(err.message, 'Unable to determine ledger precision')
        }
      })

      it('throws an ExternalError when the precision is missing', function * () {
        nock('http://red.example')
          .get('/')
          .reply(200, {scale: 4})
        try {
          yield this.plugin.getInfo()
          assert(false)
        } catch (err) {
          assert(err instanceof ExternalError)
          assert.equal(err.message, 'Unable to determine ledger precision')
        }
      })
    })

    describe('getPrefix', function () {
      it('returns the plugin\'s prefix', function * () {
        yield assertResolve(this.plugin.getPrefix(), 'example.red.')
      })
    })

    describe('getAccount', function () {
      it('returns the plugin\'s account', function * () {
        yield assertResolve(this.plugin.getAccount(), 'example.red.mike')
      })
    })

    describe('getBalance', function () {
      it('returns the current balance', function * () {
        nock('http://red.example')
          .get('/accounts/mike')
          .reply(200, {balance: '100'})
        yield assertResolve(this.plugin.getBalance(), '100')
      })

      it('throws an ExternalError on 500', function * () {
        nock('http://red.example')
          .get('/accounts/mike')
          .reply(500)
        try {
          yield this.plugin.getBalance()
          assert(false)
        } catch (err) {
          assert(err instanceof ExternalError)
          assert.equal(err.message, 'Unable to determine current balance')
        }
      })
    })

    describe('getConnectors', function () {
      it('returns a list of connectors', function * () {
        nock('http://red.example')
          .get('/connectors')
          .reply(200, [{connector: 'one'}, {connector: 'two'}])
        yield assertResolve(this.plugin.getConnectors(), ['one', 'two'])
      })

      it('throws an ExternalError on 500', function * () {
        nock('http://red.example')
          .get('/connectors')
          .reply(500)
        try {
          yield this.plugin.getConnectors()
          assert(false)
        } catch (err) {
          assert(err instanceof ExternalError)
          assert.equal(err.message, 'Unexpected status code: 500')
        }
      })

      it('should retry when getting connectors', function * () {
        this.timeout(10000)
        nock('http://red.example')
          .get('/connectors').times(2)
          .replyWithError('Error')
          .get('/connectors')
          .reply(200, [{
            id: 'http://red.example/accounts/bob',
            name: 'bob',
            connector: 'http://connector.example'
          }])

        const connectors = yield this.plugin.getConnectors()
        expect(connectors).to.deep.equal(['http://connector.example'])
      })
    })

    describe('send', function () {
      it('submits a transfer', function * () {
        nock('http://red.example')
          .put('/transfers/6851929f-5a91-4d02-b9f4-4ae6b7f1768c', {
            id: 'http://red.example/transfers/6851929f-5a91-4d02-b9f4-4ae6b7f1768c',
            ledger: 'http://red.example',
            debits: [{
              account: 'http://red.example/accounts/mike',
              amount: '123',
              authorized: true,
              memo: {source: 'something'}
            }],
            credits: [{
              account: 'http://red.example/accounts/alice',
              amount: '123',
              memo: {foo: 'bar'}
            }]
          })
          .reply(200)
        yield assertResolve(this.plugin.send({
          id: '6851929f-5a91-4d02-b9f4-4ae6b7f1768c',
          account: 'red.alice',
          amount: '123',
          noteToSelf: {source: 'something'},
          data: {foo: 'bar'}
        }), null)
      })

      it('throws an ExternalError on 400', function (done) {
        nock('http://red.example')
          .put('/transfers/6851929f-5a91-4d02-b9f4-4ae6b7f1768c', {
            id: 'http://red.example/transfers/6851929f-5a91-4d02-b9f4-4ae6b7f1768c',
            ledger: 'http://red.example',
            debits: [{
              account: 'http://red.example/accounts/mike',
              amount: '123',
              authorized: true
            }],
            credits: [{
              account: 'http://red.example/accounts/alice',
              amount: '123'
            }]
          })
          .reply(400, {id: 'SomeError'})

        this.plugin.send({
          id: '6851929f-5a91-4d02-b9f4-4ae6b7f1768c',
          account: 'red.alice',
          amount: '123'
        }).catch((err) => {
          assert.equal(err.message, 'Remote error: status=400')
          done()
        })
      })

      it('sets up case notifications when "cases" is provided', function * () {
        nock('http://notary.example/cases/2cd5bcdb-46c9-4243-ac3f-79046a87a086')
          .post('/targets', ['http://red.example/transfers/6851929f-5a91-4d02-b9f4-4ae6b7f1768c/fulfillment'])
          .reply(200)
        nock('http://red.example')
          .put('/transfers/6851929f-5a91-4d02-b9f4-4ae6b7f1768c', {
            id: 'http://red.example/transfers/6851929f-5a91-4d02-b9f4-4ae6b7f1768c',
            ledger: 'http://red.example',
            debits: [{
              account: 'http://red.example/accounts/mike',
              amount: '123',
              authorized: true
            }],
            credits: [{
              account: 'http://red.example/accounts/alice',
              amount: '123'
            }],
            additional_info: {cases: ['http://notary.example/cases/2cd5bcdb-46c9-4243-ac3f-79046a87a086']}
          })
          .reply(200)

        yield this.plugin.send({
          id: '6851929f-5a91-4d02-b9f4-4ae6b7f1768c',
          account: 'red.alice',
          amount: '123',
          cases: ['http://notary.example/cases/2cd5bcdb-46c9-4243-ac3f-79046a87a086']
        })
      })

      it('handles unexpected status on cases notification', function (done) {
        nock('http://notary.example/cases/2cd5bcdb-46c9-4243-ac3f-79046a87a086')
          .post('/targets', ['http://red.example/transfers/6851929f-5a91-4d02-b9f4-4ae6b7f1768c/fulfillment'])
          .reply(400)

        this.plugin.send({
          id: '6851929f-5a91-4d02-b9f4-4ae6b7f1768c',
          account: 'red.alice',
          amount: '123',
          cases: ['http://notary.example/cases/2cd5bcdb-46c9-4243-ac3f-79046a87a086']
        }).catch((err) => {
          assert.equal(err.message, 'Unexpected status code: 400')
          done()
        })
      })
    })

    describe('fulfillCondition', function () {
      it('errors on improper fulfillment', function (done) {
        nock('http://red.example')
          .put('/transfers/6851929f-5a91-4d02-b9f4-4ae6b7f1768c/fulfillment', 'garbage')
          .reply(203)
        this.plugin.fulfillCondition('6851929f-5a91-4d02-b9f4-4ae6b7f1768c', 'garbage')
          .catch((err) => {
            assert.equal(err.message, 'Failed to submit fulfillment for' +
              ' transfer: 6851929f-5a91-4d02-b9f4-4ae6b7f1768c' +
              ' Error: undefined')
            done()
          })
      })

      it('puts the fulfillment', function * () {
        nock('http://red.example')
          .put('/transfers/6851929f-5a91-4d02-b9f4-4ae6b7f1768c/fulfillment', 'cf:0:ZXhlY3V0ZQ')
          .reply(201)
        yield assertResolve(this.plugin.fulfillCondition(
          '6851929f-5a91-4d02-b9f4-4ae6b7f1768c',
          'cf:0:ZXhlY3V0ZQ'), null)
      })

      it('throws an ExternalError on 500', function * () {
        nock('http://red.example')
          .put('/transfers/6851929f-5a91-4d02-b9f4-4ae6b7f1768c/fulfillment', 'cf:0:ZXhlY3V0ZQ')
          .reply(500)
        try {
          yield this.plugin.fulfillCondition('6851929f-5a91-4d02-b9f4-4ae6b7f1768c', 'cf:0:ZXhlY3V0ZQ')
        } catch (err) {
          assert(err instanceof ExternalError)
          assert.equal(err.message, 'Remote error: status=500')
        }
      })
    })
  })
})

function * assertResolve (promise, expected) {
  assert(promise instanceof Promise)
  assert.deepEqual(yield promise, expected)
}
