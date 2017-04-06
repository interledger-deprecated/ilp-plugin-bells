'use strict'

const mockSocket = require('mock-socket')
const EventEmitter = require('events').EventEmitter

class MockWebSocket extends EventEmitter {
  constructor (uri, opts) {
    super()

    this.sock = new mockSocket.WebSocket(uri, opts)
    this.sock.onopen = this.handleOpen.bind(this)
    this.sock.onclose = this.handleClose.bind(this)
    this.sock.onmessage = this.handleMessage.bind(this)
    this.sock.onerror = this.handleError.bind(this)
  }

  close () {
    this.emit('close')
  }

  send (msg) {
    process.nextTick(() => {
      this.sock.send(msg)
    })
  }

  handleOpen () {
    this.emit('open')
  }

  handleClose (evt) {
    this.emit('close', evt.code, evt.reason)
  }

  handleMessage (evt) {
    process.nextTick(() => {
      this.emit('message', evt.data, {})
    })
  }

  handleError (err) {
    this.emit('error', err)
  }
}

exports.makeServer = function (uri) {
  const server = new mockSocket.Server(uri)
  server.on('connection', () => {
    server.send(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      method: 'connect'
    }))
  })
  server.on('message', (rpcMessageString) => {
    const rpcMessage = JSON.parse(rpcMessageString)
    if (rpcMessage.method === 'subscribe_account') {
      server.send(JSON.stringify({
        jsonrpc: '2.0',
        id: rpcMessage.id,
        result: rpcMessage.params.accounts.length
      }))
    } else if (rpcMessage.method === 'subscribe_all_accounts') {
      server.send(JSON.stringify({
        jsonrpc: '2.0',
        id: rpcMessage.id,
        result: 1
      }))
    }
  })
  return server
}

exports.WebSocket = MockWebSocket
exports.Server = mockSocket.Server
