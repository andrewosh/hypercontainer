var test = require('tape')
var Docker = require('dockerode')

var memdb = require('memdb')
var through = require('through2')
var hyperdrive = require('hyperdrive')
var Swarm = require('discovery-swarm')
var Hypercontainer = require('..')

var conf = require('../conf')
var debug = require('debug')(conf.name)

var noopStream = function () {
  return through(function (chunk, encoding, cb) {
    debug('container output:', chunk)
    return cb()
  })
}

test('should list containers', function (t) {
  var hypercontainer = Hypercontainer(memdb())
  hypercontainer.ps('docker', function (err, containers) {
    debug('err:', err)
    t.error(err)
    t.pass('can list docker containers')
    t.end()
  })
})

test('should create an image from a container in an archive', function (t) {
  var hypercontainer = Hypercontainer(memdb())
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

test('should create an image from a container in an archive, and seed it', function (t) {
  var hypercontainer = Hypercontainer(memdb())
  var docker = new Docker()
  docker.run('alpine', ['ls'], noopStream(), function (err, data, container) {
    console.log('here')
    t.error(err)
    hypercontainer.create('docker', container.id, { seed: true }, function (err, imageId) {
      t.error(err)
      var drive = hyperdrive(memdb())
      var archive = drive.createArchive(imageId)
      var swarm = Swarm()
      swarm.listen()
      swarm.join(new Buffer(imageId, 'hex'))
      swarm.on('connection', function (conn) {
        conn.pipe(archive.replicate()).pipe(conn)
      })
      archive.list(function (err, entries) {
        t.error(err)
        t.notEqual(entries.length, 0)
        t.pass('creates and seeds an image from hyperdrive')
        t.end()
      })
    })
  })
})

test('should boot an image from the archive', function (t) {
  var hypercontainer = Hypercontainer(memdb())
  var docker = new Docker()
  docker.run('alpine', ['ls'], noopStream(), function (err, data, container) {
    console.log('here')
    t.error(err)
    hypercontainer.create('docker', container.id, { seed: true }, function (err, imageId) {
      t.error(err)
      var hyper2 = Hypercontainer(memdb())
      hyper2.run('docker', imageId, { cmd: 'ls' }, function (err) {
        t.error(err)
      })
    })
  })
})
