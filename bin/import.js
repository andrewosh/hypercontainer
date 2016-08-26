var client = require('../daemon/client')
var parseArgs = require('minimist')

function checkArgs (argv) {
  if (argv._.length === 0) {
    return false
  }
  return true
}

function showUsage () {
  console.log('Usage: hypercontainer import image-name')
  process.exit(1)
}

var argv = parseArgs(process.argv.slice(2))
if (!checkArgs(argv)) showUsage()
var container = argv._[0]

console.log('Importing image from container:', container)
client.importImage(container, function (err, image) {
  if (err) return console.error('Could not import image:', err)
  console.log('Imported image:', image)
})
