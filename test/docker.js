var test = require('tape')
var Docker = require('dockerode')

var memdb = require('memdb')
var swarm = require('discovery-swarm')()
var Hypercontainer = require('..')
var through = require('through2')

var conf = require('../conf')
var debug = require('debug')(conf.name)

var noopStream = function () {
  return through(function (chunk, encoding, cb) {
    debug('container output:', chunk)
    return cb()
  })
}

test('should list containers', function (t) {
  var hypercontainer = Hypercontainer(swarm, memdb())
  hypercontainer.ps('docker', function (err, containers) {
    debug('err:', err)
    t.error(err)
    t.pass('can list docker containers')
    t.end()
  })
})

test('should list both local and remote images', function (t) {
  var hypercontainer = Hypercontainer(swarm, memdb())
  hypercontainer.images('docker', function (err, images) {
    debug('err:', err)
    t.error(err)
    t.pass('can list both local and remote docker images')
    t.end()
  })
})

test('should save an image from a container into the archive', function (t) {
  var hypercontainer = Hypercontainer(swarm, memdb())
  var docker = new Docker()
  docker.run('alpine', ['ls'], noopStream(), function (err, data, container) {
    console.log('here')
    t.error(err)
    hypercontainer.create('docker', container.id, function (err, imageId) {
      debug('err:', err)
      t.error(err)
      t.notEqual(imageId, null, 'imageId is not null')
      t.pass('can create a shared image from a container')
      t.end()
    })
  })
})

test('should boot an image from the archive', function (t) {
  t.end()
})
