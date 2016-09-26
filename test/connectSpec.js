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
const _ = require('lodash')
const ExternalError = require('../src/errors/external-error')

mock('ws', wsHelper.WebSocket)
const PluginBells = require('..')

describe('Connection methods', function () {
  beforeEach(function * () {
    this.plugin = new PluginBells({
      prefix: 'example.red.',
      account: 'http://red.example/accounts/mike',
      password: 'mike'
    })

    this.wsRedLedger = new wsHelper.Server('ws://red.example/accounts/mike/transfers')
    this.infoRedLedger = cloneDeep(require('./data/infoRedLedger.json'))
  })

  afterEach(function * () {
    this.wsRedLedger.stop()
    assert(nock.isDone(), 'nock should be called')
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

    it('doesn\'t connect when ws server is down', function () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, this.infoRedLedger)

      this.wsRedLedger.stop()
      return this.plugin.connect().should.be.rejected
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

    it('fails if the response is invalid', function (done) {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, { name: 'mike' })

      this.plugin.connect().should.be
        .rejectedWith('Failed to resolve ledger URI from account URI')
        .notify(() => {
          assert.isFalse(this.plugin.isConnected())
          done()
        })
    })

    it('should set the username based on the account name returned', function * () {
      const accountNock = nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      const infoNock = nock('http://red.example')
        .get('/')
        .reply(200, this.infoRedLedger)
      yield this.plugin.connect()
      assert.equal(this.plugin.credentials.username, 'mike')
      accountNock.done()
      infoNock.done()
    })

    it('should set urls from object in ledger metadata and strip unnecessary values', function * () {
      const accountNock = nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      const urls = {
        'health': 'http://random.example/health',
        'transfer': 'http://another.example/endpoint/:id',
        'transfer_fulfillment': 'http://garbage.example/anything/:id/something',
        'transfer_rejection': 'http://abc.example/athing/:id/another',
        'transfer_state': 'http://more.example/:id/state',
        'connectors': 'http://other.example/',
        'accounts': 'http://thing.example/a',
        'account': 'http://red.example/accounts/:name',
        'account_transfers': 'ws://red.example/accounts/:name/transfers'
      }
      const infoNock = nock('http://red.example')
        .get('/')
        .reply(200, Object.assign({}, this.infoRedLedger, {urls: urls}))

      yield this.plugin.connect()
      assert.deepEqual(this.plugin.urls, _.pick(urls, [
        'transfer',
        'transfer_fulfillment',
        'transfer_rejection',
        'account',
        'account_transfers'
      ]), 'urls should be set from metadata')
      accountNock.done()
      infoNock.done()
    })

    it('should reject if the ledger metadata does not include a urls map', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, Object.assign({}, this.infoRedLedger, {urls: null}))

      yield assertRejectsWith(this.plugin.connect(), ExternalError, 'ledger metadata does not include a urls map')
    })

    it('should reject if the ledger metadata does not include transfer url', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, _.merge({}, this.infoRedLedger, {
          urls: {
            transfer: null
          }
        }))

      yield assertRejectsWith(this.plugin.connect(), ExternalError, 'ledger metadata does not include transfer url')
    })

    it('should reject if the ledger metadata transfer url is not a full http url', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, _.merge({}, this.infoRedLedger, {
          urls: {
            transfer: '/transfers/:id'
          }
        }))

      yield assertRejectsWith(this.plugin.connect(), ExternalError, 'ledger metadata transfer url must be a full http(s) url')
    })

    it('should reject if the ledger metadata does not include transfer_fulfillment url', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, _.merge({}, this.infoRedLedger, {
          urls: {
            transfer_fulfillment: null
          }
        }))

      yield assertRejectsWith(this.plugin.connect(), ExternalError, 'ledger metadata does not include transfer_fulfillment url')
    })

    it('should reject if the ledger metadata transfer_fulfillment url is not a full http url', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, _.merge({}, this.infoRedLedger, {
          urls: {
            transfer_fulfillment: '/transfer_fulfillment/:id'
          }
        }))

      yield assertRejectsWith(this.plugin.connect(), ExternalError, 'ledger metadata transfer_fulfillment url must be a full http(s) url')
    })

    it('should reject if the ledger metadata does not include transfer_rejection url', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, _.merge({}, this.infoRedLedger, {
          urls: {
            transfer_rejection: null
          }
        }))

      yield assertRejectsWith(this.plugin.connect(), ExternalError, 'ledger metadata does not include transfer_rejection url')
    })

    it('should reject if the ledger metadata transfer_rejection url is not a full http url', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, _.merge({}, this.infoRedLedger, {
          urls: {
            transfer_rejection: '/transfer_fulfillment/:id'
          }
        }))

      yield assertRejectsWith(this.plugin.connect(), ExternalError, 'ledger metadata transfer_rejection url must be a full http(s) url')
    })

    it('should reject if the ledger metadata does not include account url', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, _.merge({}, this.infoRedLedger, {
          urls: {
            account: null
          }
        }))

      yield assertRejectsWith(this.plugin.connect(), ExternalError, 'ledger metadata does not include account url')
    })

    it('should reject if the ledger metadata account url is not a full http url', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, _.merge({}, this.infoRedLedger, {
          urls: {
            account: '/accounts/:name'
          }
        }))

      yield assertRejectsWith(this.plugin.connect(), ExternalError, 'ledger metadata account url must be a full http(s) url')
    })

    it('should reject if the ledger metadata does not include account_transfers url', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, _.merge({}, this.infoRedLedger, {
          urls: {
            account_transfers: null
          }
        }))

      yield assertRejectsWith(this.plugin.connect(), ExternalError, 'ledger metadata does not include account_transfers url')
    })

    it('should reject if the ledger metadata account_transfers url is not a full ws url', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      nock('http://red.example')
        .get('/')
        .reply(200, _.merge({}, this.infoRedLedger, {
          urls: {
            account_transfers: '/accounts/:name/transfers'
          }
        }))

      yield assertRejectsWith(this.plugin.connect(), ExternalError, 'ledger metadata account_transfers url must be a full ws(s) url')
    })

    it('should subscribe to notifications using the account_transfers websocket url', function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      let usedCorrectWsUrl = false
      const wsRedLedger = new wsHelper.Server('ws://somewhererandom.example/notifications/mike')
      wsRedLedger.on('connection', () => {
        usedCorrectWsUrl = true
      })

      nock('http://red.example')
        .get('/')
        .reply(200, _.merge(this.infoRedLedger, {
          urls: {
            account_transfers: 'ws://somewhererandom.example/notifications/:name'
          }
        }))

      yield this.plugin.connect()

      assert.equal(usedCorrectWsUrl, true, 'did not use the ws url from the metadata')

      wsRedLedger.stop()
    })
    it('should not overwrite the username if one is specified in the options', function * () {
      const accountNock = nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })
      const infoNock = nock('http://red.example')
        .get('/')
        .reply(200, this.infoRedLedger)
      const wsRedLedger = new wsHelper.Server('ws://red.example/accounts/xavier/transfers')
      const plugin = new PluginBells({
        prefix: 'foo.',
        account: 'http://red.example/accounts/mike',
        password: 'mike',
        username: 'xavier'
      })
      yield plugin.connect()
      assert.equal(plugin.credentials.username, 'xavier')
      accountNock.done()
      infoNock.done()
      wsRedLedger.stop()
    })

    it('doesn\'t retry if account is nonexistant', function (done) {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(404)

      this.plugin.connect().should.be
        .rejectedWith('Failed to resolve ledger URI from account URI')
        .notify(() => {
          assert.isFalse(this.plugin.isConnected())
          done()
        })
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

      it('throws an ExternalError if unable to set the connector field', function (done) {
        nock('http://red.example')
          .get('/accounts/mike')
          .reply(200, { ledger: 'http://red.example', name: 'mike' })
          .put('/accounts/mike', { name: 'mike', connector: 'http://mark.example' })
          .reply(500)
        this.plugin.connect().should.be
          .rejectedWith('Remote error: status=500')
          .notify(done)
      })
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

  describe('disconnect', function () {
    beforeEach(function * () {
      nock('http://red.example')
        .get('/accounts/mike')
        .reply(200, {
          ledger: 'http://red.example',
          name: 'mike'
        })

      nock('http://red.example')
        .get('/')
        .reply(200, this.infoRedLedger)

      yield this.plugin.connect()
    })

    it('closes the connection', function * () {
      yield assertResolve(this.plugin.disconnect(), null)
      assert.isFalse(this.plugin.isConnected())
      // A second time does nothing.
      yield assertResolve(this.plugin.disconnect(), null)
    })
  })
})

function * assertResolve (promise, expected) {
  assert(promise instanceof Promise)
  assert.deepEqual(yield promise, expected)
}

function * assertRejectsWith (promise, errorConstructor, errorMessage) {
  assert(promise instanceof Promise)
  let error
  try {
    yield promise
  } catch (e) {
    error = e
  }
  assert.ok(error, 'promise did not reject')
  assert.instanceOf(error, errorConstructor)
  assert.equal(error.message, errorMessage)
}

