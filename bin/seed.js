var client = require('../daemon/client')
var parseArgs = require('minimist')

function checkArgs (argv) {
  if (argv._.length === 0) {
    return false
  }
  return true
}

function showUsage () {
  console.log('Usage: hypercontainer seed image-name')
  process.exit(1)
}

var argv = parseArgs(process.argv.slice(2))
if (!checkArgs(argv)) showUsage()
var image = argv._[0]

client.seedImage(image, function (err, image) {
  if (err) return console.error('Could not seed image:', err)
  console.log('Seeding image:', image)
})
