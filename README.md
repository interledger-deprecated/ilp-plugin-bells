# ilp-plugin-bells

> ILP ledger plugin for [five-bells-ledger](https://github.com/interledger/five-bells-ledger)

## Installation

``` sh
npm install --save ilp ilp-plugin-bells
```

## Usage

``` js
const Client = require('ilp').Client

const client = new Client({
  type: 'bells',
  prefix: 'ilpdemo.red.',
  auth: {
    // Account URI
    account: 'https://red.ilpdemo.org/ledger/accounts/alice',
    password: 'alice'
  }
})
```
