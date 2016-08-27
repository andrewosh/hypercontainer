var path = require('path')
var grpc = require('grpc')

var conf = require('../conf')
var address = conf.host + ':' + conf.port
var descriptor = grpc.load(path.join(__dirname, 'daemon.proto')).hypercontainer
var client = new descriptor.HypercontainerDaemon(address, grpc.credentials.createInsecure())

function checkError (msg) {
  return msg.errorCode !== 'SUCCESS'
}

function handleError (msg, cb) {
  if (msg.errorCode) {
    return cb(new Error(msg.errorDescription))
  }
}

function listImages (cb) {
  client.listImages(function (err, response) {
    if (err) return cb(err)
    if (checkError(response)) return handleError(response, cb)
    return cb(null, response.images)
  })
}

function listContainers (cb) {
  client.listContainers(function (err, response) {
    if (err) return cb(err)
    if (checkError(response)) return handleError(response, cb)
    return cb(null, response.containers)
  })
}

function importImage (image, cb) {
  client.importImage({ image: { id: image } }, function (err, response) {
    if (err) return cb(err)
    if (checkError(response)) return handleError(response, cb)
    return cb(null, response.image.id)
  })
}

function runImage (image, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  client.runImage({ image: { id: image }, opts: JSON.stringify(opts) }, function (err, response) {
    if (err) return cb(err)
    if (checkError(response)) return handleError(response, cb)
    return cb(null, response.container.id)
  })
}

function seedImage (image, cb) {
  client.seedImage({ image: { id: image } }, function (err, response) {
    if (err) return cb(err)
    if (checkError(response)) return handleError(response, cb)
    return cb(null, response.image.id)
  })
}

function commitContainer (container, cb) {
  client.commitContainer({ container: { id: container } }, function (err, response) {
    if (err) return cb(err)
    if (checkError(response)) return handleError(response, cb)
    return cb(null, { image: response.image })
  })
}

function stop (cb) {
  client.stop(function (err, response) {
    if (err) return cb(err)
    if (checkError(response)) return handleError(response, cb)
    return cb(null)
  })
}

module.exports = {
  listImages: listImages,
  listContainers: listContainers,
  importImage: importImage,
  runImage: runImage,
  seedImage: seedImage,
  commitContainer: commitContainer,
  stop: stop
}
