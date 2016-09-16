'use strict'

const BaseError = require('./base-error')

class ExternalError extends BaseError {

  * handler (ctx, log) {
    log.warn('External Error: ' + this.message)
    ctx.status = 502
    ctx.body = {
      id: this.name,
      message: this.message,
      owner: this.accountIdentifier
    }
  }
}

module.exports = ExternalError
