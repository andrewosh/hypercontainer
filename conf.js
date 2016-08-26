var rc = require('rc')

var appName = require('./package.json')['name']
module.exports = rc(appName, {
  name: appName,
  metadata: 'meta.db',
  storage: 'images.db',
  containers: './containers',
  mnt: './mnt',
  host: 'localhost',
  port: '8081'
})
