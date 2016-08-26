var client = require('../daemon/client')
client.stop(function (err) {
  if (err) console.error('Could not stop hypercontainer daemon:', err)
  console.log('Stopping hypercontainer daemon')
})
