'use strict'

const debug = require('debug')('ilp-plugin-bells:ledger-context')
const parseURL = require('url').parse
const ExternalError = require('../errors/external-error')

const REQUIRED_LEDGER_URLS = [ 'transfer', 'transfer_fulfillment', 'transfer_rejection', 'account', 'auth_token', 'websocket', 'message' ]

function parseAndValidateLedgerUrls (metadataUrls) {
  if (!metadataUrls) {
    throw new ExternalError('ledger metadata does not include a urls map')
  }

  const urls = {}
  REQUIRED_LEDGER_URLS.forEach((service) => {
    if (!metadataUrls[service]) {
      throw new ExternalError('ledger metadata does not include ' + service + ' url')
    }

    if (service === 'websocket') {
      if (metadataUrls[service].indexOf('ws') !== 0) {
        throw new ExternalError('ledger metadata ' + service + ' url must be a full ws(s) url')
      }
    } else {
      if (metadataUrls[service].indexOf('http') !== 0) {
        throw new ExternalError('ledger metadata ' + service + ' url must be a full http(s) url')
      }
    }
    urls[service] = metadataUrls[service]
  })

  return urls
}

class LedgerContext {
  constructor (host, ledgerMetadata) {
    this.host = host
    this.urls = parseAndValidateLedgerUrls(ledgerMetadata.urls)
    debug('using service urls:', this.urls)
    this.prefix = ledgerMetadata.ilp_prefix
    this.info = {
      connectors: ledgerMetadata.connectors,
      precision: ledgerMetadata.precision,
      scale: ledgerMetadata.scale,
      currencyCode: ledgerMetadata.currency_code,
      currencySymbol: ledgerMetadata.currency_symbol
    }
  }

  /**
   * Get the account name from "http://red.example/accounts/alice" (where
   * accountUriTemplate is "http://red.example/accounts/:name").
   */
  accountUriToName (accountURI) {
    const templatePath = parseURL(this.urls.account).path.split('/')
    const accountPath = parseURL(accountURI).path.split('/')
    for (let i = 0; i < templatePath.length; i++) {
      if (templatePath[i] === ':name') return accountPath[i]
    }
  }

}

module.exports = LedgerContext
