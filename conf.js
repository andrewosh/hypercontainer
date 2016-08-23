var rc = require('rc')

var appName = require('./package.json')['name']
module.exports = rc(appName, {
  name: appName,
  host: 'localhost',
  port: '8081'
})
