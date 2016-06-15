var rc = require('rc')

var appName = require('./package.json')['name']
module.exports = rc(appName, {
  name: appName,
  dbDir: './dbs',
  containerDir: './containers'
})
