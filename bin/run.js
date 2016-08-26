var client = require('../daemon/client')
var parseArgs = require('minimist')

function checkArgs (argv) {
  if (argv._.length === 0) {
    return false
  }
  return true
}

function showUsage () {
  console.log('Usage: hypercontainer run image-name')
  process.exit(1)
}

var argv = parseArgs(process.argv.slice(2))
if (!checkArgs(argv)) showUsage()
var opts = Object.assign({}, argv)
delete opts._
client.runImage(argv._[0], opts, function (err, container) {
  if (err) return console.error('Could not seed image:', err)
  console.log('Running container:', container)
  console.log('Attach to this container with: `docker attach', container + '`')
})
