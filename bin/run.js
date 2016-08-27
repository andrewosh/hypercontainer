var fs = require('fs')
var client = require('../daemon/client')
var parseArgs = require('minimist')

function checkArgs (argv) {
  if ((argv._.length === 0) && (!argv.f)) {
    return false
  }
  return true
}

function showUsage () {
  console.log('Usage: hypercontainer run [-f file] [image-name]')
  process.exit(1)
}

var argv = parseArgs(process.argv.slice(2))
var imageName = (argv._.length !== 0) ? argv._[0] : 'none'
if (!checkArgs(argv)) showUsage()
var opts = (argv.f) ? JSON.parse(fs.readFileSync(argv.f)) : ''
client.runImage(imageName, opts, function (err, container) {
  if (err) return console.error('Could not seed image:', err)
  console.log('Running container:', container)
  console.log('Attach to this container with: `docker attach', container + '`')
})
