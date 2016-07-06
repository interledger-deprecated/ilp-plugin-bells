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
    this.sock.send(msg)
  }

  handleOpen () {
    this.emit('open')
  }

  handleClose (evt) {
    this.emit('close', evt.code, evt.reason)
  }

  handleMessage (evt) {
    this.emit('message', evt.data, {})
  }

  handleError (err) {
    this.emit('error', err)
  }
}

exports.WebSocket = MockWebSocket
exports.Server = mockSocket.Server
