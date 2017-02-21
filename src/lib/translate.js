'use strict'

const UnrelatedNotificationError = require('../errors/unrelated-notification-error')

const base64url = require('base64url')
const isNil = require('lodash/fp/isNil')
const omitNil = require('lodash/fp/omitBy')(isNil)
const find = require('lodash/find')
const debug = require('debug')('ilp-plugin-bells:translate')
const { validateTransfer, validateMessage } = require('./validate')

// Regex matching a string containing 32 base64url-encoded bytes
const REGEX_32_BYTES_AS_BASE64URL = /^[A-Za-z0-9_-]{43}$/

// Crypto-condition URI prefix and suffix (specific to 32-byte preimages)
const PREIMAGE_CONDITION_PREFIX = 'ni:///sha-256;'
const PREIMAGE_CONDITION_SUFFIX = '?fpt=preimage-sha-256&cost=32'
const PREIMAGE_CONDITION_SUFFIX_START = 57

// DER encoding prefix (specific to 32-byte preimages)
const PREIMAGE_FULFILLMENT_PREAMBLE = Buffer.from([0xa0, 0x22, 0x80, 0x20])

/**
 * Convert from a crypto-condition URI to an Interledger hashlock Buffer.
 *
 * @param {String} cryptoCondition Crypto-condition ni: URI.
 * @param {Boolean} [allowCryptoConditions=false }] Whether non 32-byte SHA-256
 *   preimage crypto-conditions are accepted.
 *
 * @return {String} Base64url-encoded string containing the 32-byte condition hash.
 */
const translateFromCryptoCondition = (cryptoCondition) => {
  if (!cryptoCondition) {
    return null
  }

  if (typeof cryptoCondition !== 'string') {
    throw new TypeError('Crypto-conditions must be strings')
  }

  if (cryptoCondition.indexOf(PREIMAGE_CONDITION_PREFIX) !== 0 ||
      cryptoCondition.indexOf(PREIMAGE_CONDITION_SUFFIX) !==
        PREIMAGE_CONDITION_SUFFIX_START) {
    throw new Error('Invalid crypto-condition, must be PREIMAGE-SHA-256 with 32-byte preimage, but received: ' + cryptoCondition)
  }

  return cryptoCondition.slice(
    PREIMAGE_CONDITION_PREFIX.length,
    PREIMAGE_CONDITION_SUFFIX_START
  )
}

/**
 * Convert from an Interledger condition to a Five Bells Ledger
 *
 * @param {String} condition A base64url string with a SHA-256 preimage condition.
 *
 * @return {String} Crypto-condition URI
 */
const translateToCryptoCondition = (condition) => {
  if (!condition) {
    return null
  }

  if (typeof condition !== 'string') {
    throw new TypeError('Condition must be a string')
  }

  if (!REGEX_32_BYTES_AS_BASE64URL.test(condition)) {
    throw new Error('Condition size must be 32 bytes as base64url, but was: ' + condition)
  }

  return PREIMAGE_CONDITION_PREFIX + condition + PREIMAGE_CONDITION_SUFFIX
}

const translateFromCryptoFulfillment = (cryptoFulfillment) => {
  const asBuffer = Buffer.from(cryptoFulfillment, 'base64')

  if (PREIMAGE_FULFILLMENT_PREAMBLE.compare(asBuffer, 0, PREIMAGE_FULFILLMENT_PREAMBLE.length) !== 0) {
    throw new Error('Unexpected fulfillment preamble, not a PREIMAGE-SHA-256 fulfillment?')
  }

  return base64url(asBuffer.slice(PREIMAGE_FULFILLMENT_PREAMBLE.length))
}

const translateToCryptoFulfillment = (preimage) => {
  if (typeof preimage !== 'string') {
    throw new TypeError('Fulfillment must be a string')
  }

  if (!REGEX_32_BYTES_AS_BASE64URL.test(preimage)) {
    throw new Error('Condition preimage must be 32 bytes as base64url, but was: ' + preimage)
  }

  const fulfillment = Buffer.concat([PREIMAGE_FULFILLMENT_PREAMBLE, Buffer.from(preimage, 'base64')])
  const fulfillmentUri = base64url(fulfillment)
  return fulfillmentUri
}

/**
 * Take a five-bells-ledger notification event object and translate it into a
 * ledger plugin API event object.
 *
 * @param {Object} notification Five Bells Ledger Notification object
 * @param {String} account Account from whose perspective we're operating
 * @param {LedgerContext} ledgerContext Additional context related to the ledger
 *   that emitted the event
 *
 * @return {Array} Parameters for the `emit` method
 */
const translateBellsToPluginApi = (notification, account, ledgerContext) => {
  const event = notification.event
  const data = notification.resource
  if (event === 'transfer.create' || event === 'transfer.update') {
    debug('notify transfer', data.state, data.id)
    return translateTransferNotification(
      data,
      notification.related_resources,
      account,
      ledgerContext
    )
  } else if (event === 'message.send') {
    debug('notify message', data.account)
    return translateMessageNotification(data, account, ledgerContext)
  } else {
    throw new UnrelatedNotificationError('Invalid notification event: ' + event)
  }
}

const translateTransferNotification = (
  fiveBellsTransfer,
  relatedResources,
  account,
  ledgerContext
) => {
  validateTransfer(fiveBellsTransfer)

  let handled = false
  for (let credit of fiveBellsTransfer.credits) {
    if (credit.account === account) {
      handled = true

      // TODO: What if there are multiple debits?
      const debit = fiveBellsTransfer.debits[0]

      const transfer = omitNil({
        id: fiveBellsTransfer.id.substring(fiveBellsTransfer.id.length - 36),
        direction: 'incoming',
        account: ledgerContext.prefix + ledgerContext.accountUriToName(debit.account),
        from: ledgerContext.prefix + ledgerContext.accountUriToName(debit.account),
        to: ledgerContext.prefix + ledgerContext.accountUriToName(credit.account),
        ledger: ledgerContext.prefix,
        amount: credit.amount,
        data: credit.memo,
        executionCondition: translateFromCryptoCondition(
          fiveBellsTransfer.execution_condition
        ),
        cancellationCondition: translateFromCryptoCondition(
          fiveBellsTransfer.cancellation_condition
        ),
        expiresAt: fiveBellsTransfer.expires_at,
        cases: fiveBellsTransfer.additional_info && fiveBellsTransfer.additional_info.cases
          ? fiveBellsTransfer.additional_info.cases
          : undefined
      })

      if (fiveBellsTransfer.state === 'prepared') {
        return ['incoming_prepare', transfer]
      }
      if (fiveBellsTransfer.state === 'executed' && !transfer.executionCondition) {
        return ['incoming_transfer', transfer]
      }

      if (fiveBellsTransfer.state === 'executed' && relatedResources &&
          relatedResources.execution_condition_fulfillment) {
        return ['incoming_fulfill', transfer,
          translateFromCryptoFulfillment(relatedResources.execution_condition_fulfillment)]
      }

      if (fiveBellsTransfer.state === 'rejected' && relatedResources &&
          relatedResources.cancellation_condition_fulfillment) {
        return ['incoming_cancel', transfer,
          translateFromCryptoFulfillment(relatedResources.cancellation_condition_fulfillment)]
      } else if (fiveBellsTransfer.state === 'rejected') {
        const rejectedCredit = find(fiveBellsTransfer.credits, 'rejected')
        if (rejectedCredit) {
          return ['incoming_reject', transfer,
            new Buffer(rejectedCredit.rejection_message, 'base64').toString()]
        } else {
          return ['incoming_cancel', transfer, 'transfer timed out.']
        }
      }
    }
  }

  for (let debit of fiveBellsTransfer.debits) {
    if (debit.account === account) {
      handled = true

      // ILP transfers contain one credit and one debit
      // TODO: Perhaps this method should filter out transfers with multiple
      //       credits/debits?
      const credit = fiveBellsTransfer.credits[0]

      const transfer = omitNil({
        id: fiveBellsTransfer.id.substring(fiveBellsTransfer.id.length - 36),
        direction: 'outgoing',
        account: ledgerContext.prefix + ledgerContext.accountUriToName(credit.account),
        from: ledgerContext.prefix + ledgerContext.accountUriToName(debit.account),
        to: ledgerContext.prefix + ledgerContext.accountUriToName(credit.account),
        ledger: ledgerContext.prefix,
        amount: debit.amount,
        data: credit.memo,
        noteToSelf: debit.memo,
        executionCondition: translateFromCryptoCondition(
          fiveBellsTransfer.execution_condition
        ),
        cancellationCondition: translateFromCryptoCondition(
          fiveBellsTransfer.cancellation_condition
        ),
        expiresAt: fiveBellsTransfer.expires_at,
        cases: fiveBellsTransfer.additional_info && fiveBellsTransfer.additional_info.cases
          ? fiveBellsTransfer.additional_info.cases
          : undefined
      })

      if (fiveBellsTransfer.state === 'prepared') {
        return ['outgoing_prepare', transfer]
      }
      if (fiveBellsTransfer.state === 'executed' && !transfer.executionCondition) {
        return ['outgoing_transfer', transfer]
      }

      if (fiveBellsTransfer.state === 'executed' && relatedResources &&
          relatedResources.execution_condition_fulfillment) {
        return ['outgoing_fulfill', transfer,
          translateFromCryptoFulfillment(relatedResources.execution_condition_fulfillment)]
      }

      if (fiveBellsTransfer.state === 'rejected' && relatedResources &&
          relatedResources.cancellation_condition_fulfillment) {
        return ['outgoing_cancel', transfer,
          translateFromCryptoFulfillment(relatedResources.cancellation_condition_fulfillment)]
      } else if (fiveBellsTransfer.state === 'rejected') {
        const rejectedCredit = find(fiveBellsTransfer.credits, 'rejected')
        if (rejectedCredit) {
          return ['outgoing_reject', transfer,
            new Buffer(rejectedCredit.rejection_message, 'base64').toString()]
        } else {
          return ['outgoing_cancel', transfer, 'transfer timed out.']
        }
      }
    }
  }
  if (!handled) {
    throw new UnrelatedNotificationError('Notification does not seem related to connector')
  }
}

const translateMessageNotification = (message, account, ledgerContext) => {
  validateMessage(message, ledgerContext)
  return [
    'incoming_message',
    {
      ledger: ledgerContext.prefix,
      account: ledgerContext.prefix + ledgerContext.accountUriToName(message.from),
      from: ledgerContext.prefix + ledgerContext.accountUriToName(message.from),
      to: ledgerContext.prefix + ledgerContext.accountUriToName(message.to),
      data: message.data
    }
  ]
}

const translatePluginApiToBells = (transfer, account, ledgerContext) => {
  const sourceAddress = ledgerContext.parseAddress(transfer.account)
  return omitNil({
    id: ledgerContext.urls.transfer.replace(':id', transfer.id),
    ledger: ledgerContext.host,
    debits: [omitNil({
      account: account,
      amount: transfer.amount,
      authorized: true,
      memo: transfer.noteToSelf
    })],
    credits: [omitNil({
      account: ledgerContext.urls.account.replace(':name', encodeURIComponent(sourceAddress.username)),
      amount: transfer.amount,
      memo: transfer.data
    })],
    execution_condition: translateToCryptoCondition(
      transfer.executionCondition
    ),
    cancellation_condition: translateToCryptoCondition(
      transfer.cancellationCondition
    ),
    expires_at: transfer.expiresAt,
    additional_info: transfer.cases ? { cases: transfer.cases } : undefined
  })
}

Object.assign(module.exports, {
  translateBellsToPluginApi,
  translatePluginApiToBells,
  translateToCryptoFulfillment
})
