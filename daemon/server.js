var path = require('path')
var grpc = require('grpc')
var stream = require('through2')

var conf = require('../conf')
var ImageManager = require('../lib/manager')
var HyperImage = require('../lib/image')
var HyperContainer = require('../lib/container')

var descriptor = grpc.load(path.join(__dirname, 'daemon.proto')).hypercontainer
var manager = ImageManager()
var daemonServer = null
// container output is currently buffered fully in memory until streamed out
var containers = {}

function getErrorMessage (errorCode) {
  switch (errorCode) {
    case descriptor.Error.BAD_IMAGE:
      return 'could not get image for that ID:'
    case descriptor.Error.BAD_CONTAINER:
      return 'could not get container with that ID:'
    case descriptor.Error.IMPORT_FAILED:
      return 'could not import Docker image with that name:'
    case descriptor.Error.SEED_FAILED:
      return 'could not seed image:'
    case descriptor.Error.RUN_FAILED:
      return 'could not boot image:'
    case descriptor.Error.COMMIT_FAILED:
      return 'could not commit container:'
    case descriptor.Error.ATTACH_FAILED:
      return 'could not attach to container:'
    case descriptor.Error.LIST_FAILED:
      return 'could not list resource:'
  }
}

function makeError (errorCode, err) {
  return { errorCode: errorCode, errorDescription: getErrorMessage(errorCode) + err }
}

function listImages (call, cb) {
  manager.listImages(function (err, images) {
    if (err) return cb(null, makeError(descriptor.Error.LIST_FAILED, err))
    return cb(null, { images: images })
  })
  return cb(new Error('not yet implemented'))
}

function listContainers (call, cb) {
  var containers = Object.keys(containers).map(function (c) {
    return {id: c}
  })
  return cb(null, containers)
}

function seedImage (call, cb) {
  var image = call.request.image.id
  manager.get(image, function (err, image) {
    if (err) return cb(null, makeError(descriptor.Error.BAD_IMAGE, err))
    image.seed(function (err, swarm) {
      if (err) return cb(null, makeError(descriptor.Error.SEED_FAILED, err))
      return cb(null, { image: { id: image.id } })
    })
  })
}

function importImage (call, cb) {
  var name = call.request.image.id
  console.log('importing...')
  manager.import(name, function (err, image) {
    console.log('finishing with err:', err)
    if (err) return cb(null, makeError(descriptor.Error.IMPORT_FAILED, err))
    return cb(null, { image: { id: image.id } })
  })
}

function runImage (call, cb) {
  var opts = JSON.parse(call.request.opts)
  var image = (opts) ? opts.Image : call.request.image.id
  manager.get(image, function (err, image) {
    if (err) return cb(null, makeError(descriptor.Error.BAD_IMAGE, err))
    console.log('running image with opts:', JSON.stringify(opts))
    image.run(opts, function (err, container) {
      if (err) return cb(null, makeError(descriptor.Error.RUN_FAILED, err))
      containers[container.id] = container
      return cb(null, { container: { id: container.id } })
    })
  })
}

function commitContainer (call, cb) {
  var id = call.request.container.id
  var container = containers[id]
  if (!container) {
    return cb(null, makeError(descriptor.Error.BAD_CONTAINER))
  }
  container.commit(function (err, image) {
    if (err) return cb(null, makeError(descriptor.Error.COMMIT_FAILED, err))
    return cb(null, { image: image.id })
  })
}

function stop (call, cb) {
  console.log('Stopping hypercontainer daemon...')
  if (daemonServer) {
    daemonServer.stop()
  }
}

function getServer () {
  var server = new grpc.Server()
  server.addProtoService(descriptor.HypercontainerDaemon.service, {
    listImages: listImages,
    listContainers: listContainers,
    seedImage: seedImage,
    importImage: importImage,
    runImage: runImage,
    commitContainer: commitContainer,
    stop: stop
  })
  return server
}

if (require.main === module) {
  daemonServer = getServer()
  var address = conf.host + ':' + conf.port
  console.log('Hypercontainer daemon starting at:', address)
  daemonServer.bind(address, grpc.ServerCredentials.createInsecure())
  daemonServer.start()
}

module.exports = getServer
