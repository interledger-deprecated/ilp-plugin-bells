'use strict'

const NotFoundError = require('./not-found-error')

class MissingFulfillmentError extends NotFoundError {
  * handler (ctx, log) {
    log.warn('Missing fulfillment: ' + this.message)
    ctx.status = 404
    ctx.body = {
      id: this.name,
      message: this.message
    }
  }
}

module.exports = MissingFulfillmentError
