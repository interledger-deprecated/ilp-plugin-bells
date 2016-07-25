module.exports = function (wallaby) {
  return {
    files: [
      'src/**/*.js',
      'index.js',
      'test/helpers/*.js',
      'test/data/*.json'
    ],

    tests: [
      'test/*Spec.js'
    ],

    testFramework: 'mocha',

    env: {
      type: 'node',
      runner: 'node',
      params: {
        env: 'NODE_ENV=unit'
      }
    },

    bootstrap: function () {
      require('co-mocha')(wallaby.testFramework.constructor)
    }
  }
}
