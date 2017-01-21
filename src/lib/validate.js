'use strict'

const UnrelatedNotificationError = require('../errors/unrelated-notification-error')

const validateTransfer = (transfer) => {
  // validator.validate('TransferTemplate', transfer)
}

const validateMessage = (message, ledgerContext) => {
  if (message.ledger !== ledgerContext.host) {
    throw new UnrelatedNotificationError('Notification does not seem related to connector')
  }
}

Object.assign(module.exports, {
  validateTransfer,
  validateMessage
})
