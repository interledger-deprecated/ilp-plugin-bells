'use strict'

const validate = require('five-bells-shared/services/validate')
const UnrelatedNotificationError = require('../errors/unrelated-notification-error')
const errors = require('../errors')

const validateTransfer = (transfer) => {
  const validation = validate('TransferTemplate', transfer)
  if (!validation.valid) {
    throw new errors.InvalidFieldsError('invalid transfer')
  }
}

const validateMessage = (message, ledgerContext) => {
  const validation = validate('Message', message)
  if (!validation.valid) {
    throw new errors.InvalidFieldsError('invalid message')
  }
  if (message.ledger !== ledgerContext.host) {
    throw new UnrelatedNotificationError('Notification does not seem related to connector')
  }
}

Object.assign(module.exports, {
  validateTransfer,
  validateMessage
})
