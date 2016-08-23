var path = require('path')
var grpc = require('grpc')
var stream = require('through2')

var conf = require('../conf')
var ImageManager = require('../lib/manager')
var HyperImage = require('../lib/image')
var HyperContainer = require('../lib/container')

var descriptor = grpc.load(path.join(__dirname, 'daemon.proto')).hypercontainer
var manager = ImageManager()
// container output is currently buffered fully in memory until streamed out
var containers = {}

function listImages (call, cb) {
  return cb(new Error('not yet implemented'))
}

function getErrorMessage (errorCode)  {
  switch (errorCode) {
    case  descriptor.Error.BAD_IMAGE:
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
}

function makeError (errorCode, err) {
  return { errorCode: errorCode, errorDescription: getErrorMessage(errorCode) + err }
}

function seedImage (call, cb) {
  var image = call.request.image
  manager.get(image, function (err, image) {
    if (err) return cb(null, makeError(description.Error.BAD_IMAGE, err))
    image.seed(function (err, swarm) {
      if (err) return cb(null, makeError(description.Error.SEED_FAILED, err))
      return cb(null, { image: image.id })
    })
  })
}

function importImage (call, cb) {
  var name = call.request.image
  manager.import(name, function (err, image) {
    if (err) return cb(null, makeError(description.Error.IMPORT_FAILED, err))
    return cb(null, { image: image.id })
  })
}

function runImage (call, cb) {
  var image = call.request.image
  manager.get(image, function (err, image) {
    if (err) return cb(null, makeError(description.Error.BAD_IMAGE, err))
    image.run(function (err, containerProc, container) {
      if (err) return cb(null, makeError(description.Error.RUN_FAILED, err))
      var stderr = stream()
      var stdout = stream()
      containerProc.stderr.pipe(stderr)
      containerProc.stdout.pipe(stdout)
      containers[container.id] = {
        proc: containerProc,
        container: container,
        stderr: stderr,
        stdout: stdout
      }
      return cb(null, { container: container.id })
    })
  })
}

function commitContainer (call, cb) {
  var id = call.request.container
  var containerInfo = containers[id]
  if (!containerInfo) {
    return cb(null, makeError(description.Error.BAD_CONTAINER))
  }
  var container = containerInfo.container
  container.commit(function (err, image) {
    if (err) return cb(null, makeError(description.Error.COMMIT_FAILED, err))
    return cb(null, { image: image.id })
  })
}

function attachToContainer (call, cb) {
  var id = null
  var container = null
  var outputListener = _writeMessage('stdout')
  var errorListener = _writeMessage('stderr')
  call.on('data', function (input) {
    id = input.container
    container = containers[id]
    _attachOutput()
    if (container && container.proc.connected) { 
      container.proc.stdin.write(input.stdin)
    }
  })
  call.on('end', function () {
    container.stderr.removeListener('data', outputListener)
    container.stdout.removeListener('data', errorListener)
  })
  function _attachOutput () {
    container.stdout.on('data', outputListener)
    container.stderr.on('data', errorListener)
  }
  function _writeMessage (name) {
    return function (data) {
      var msg = { container: id } 
      msg[name] = data
      call.write(msg)
    }
  }
}

function getServer () {
  var server = new grpc.Server()
  server.addProtoService(descriptor.HypercontainerDaemon.service, {
    listImages: listImages,
    seedImage: seedImage,
    importImage: importImage,
    runImage: runImage,
    commitContainer: commitContainer,
    attachToContainer: attachToContainer
  })
}

if (require.main === module) {
  var daemonServer = getServer()
  var address = conf.host + ':' + conf.port
  console.log('Hypercontainer daemon starting at:', address)
  daemonServer.bind(address, grpc.ServerCredentials.createInsecure())
  daemonServer.start()
}
module.exports = getServer

