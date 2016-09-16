'use strict'

const BaseError = require('./base-error')
class UnprocessableEntityError extends BaseError {}

class UnrelatedNotificationError extends UnprocessableEntityError {

  * handler (ctx, log) {
    log.warn('Unrelated Notification: ' + this.message)
    ctx.status = 422
    ctx.body = {
      id: this.name,
      message: this.message
    }
  }
}

module.exports = UnrelatedNotificationError
