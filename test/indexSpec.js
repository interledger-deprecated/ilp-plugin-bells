'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
chai.should()

const assert = chai.assert

const mock = require('mock-require')
const nock = require('nock')
const wsHelper = require('./helpers/ws')

mock('ws', wsHelper.WebSocket)
const PluginBells = require('..')

describe('PluginBells constructor', function () {
  afterEach(function () { assert(nock.isDone(), 'nock was not called') })

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
})

