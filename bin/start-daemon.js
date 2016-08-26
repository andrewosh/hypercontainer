var path = require('path')
var proc = require('child_process')

var conf = require('../conf')
var address = conf.host + ':' + conf.port
var daemon = proc.spawn('node', [path.join(__dirname, '..', 'daemon', 'server.js')], { detached: true })

console.log('Starting hypercontainer daemon at', address, '...')
daemon.on('close', function (code) {
  console.log('Hypercontainer daemon exited with code:', code)
})
daemon.on('error', function (err) {
  console.error('Failed to start hypercontainer daemon:', err)
})
