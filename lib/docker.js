var path = require('path')
var from = require('from2')
var cuid = require('cuid')
var proc = require('child_process')
var pump = require('pumpify')
var tar = require('tar-stream')
var sub = require('subleveldown')
var Swarm = require('discovery-swarm')
var Docker = require('dockerode')
var mkdirp = require('mkdirp')
var hyperdrive = require('hyperdrive')
var filesystem = require('./filesystem')

var conf = require('../conf')
var debug = require('debug')(conf.name)

function DockerEngine (db, opts) {
  if (!(this instanceof DockerEngine)) return new DockerEngine(db, opts)
  this.opts = opts || {}
  this.db = db
  this.drive = hyperdrive(db)
  this.docker = new Docker()
}

DockerEngine.prototype.run = function (image, opts, cb) {
  // check if the image is in the hyperdrive,  else boot it from Docker Hub
  var self = this
  var archive = this.drive.createArchive(image)
  var id = cuid()
  console.log('booting from drive with id:', id, 'and img:', image)
  self._bootFromArchive(archive, id, opts, cb)
}

DockerEngine.prototype._bootFromArchive = function (archive, id, opts, cb) {
  var mnt = path.resolve(conf.containerDir, id, 'mnt')
  var data = path.resolve(conf.containerDir, id, 'data')
  // TODO: async?
  mkdirp.sync(mnt)

  var swarm = Swarm()
  swarm.listen()
  swarm.join(archive.key)
  swarm.on('connection', function (conn) {
    conn.pipe(archive.replicate()).pipe(conn)
  })

  function createImageStream (entry, offset) {
    var total = entry.length - offset
    var cursor = archive.createByteCursor(entry.name, offset)
    var read = 0
    var done = false
    // TODO: this can be optimized a lot
    return from(function (size, next) {
      if (done) return next(null, null)
      cursor.next(function (err, buf) {
        if (err) return next(err)
        if (!buf) {
          return next(null, null)
        }
        read += buf.length
        if (read > total) {
          done = true
          var sliced = buf.slice(0, read - total)
          return next(null, sliced)
        }
        return next(null, buf)
      })
    })
  }

  function createIndexStream () {
    return archive.list()
  }

  filesystem(sub(this.db, id), mnt, data, {
    createImageStream: createImageStream,
    createIndexStream: createIndexStream,
    log: debug,
    uid: process.getuid(),
    gid: process.getgid()
  }, function (err, fs) {
    if (err) throw err
    debug('filesystem index loaded. booting vm...')
    fs.readdir('/', function (err, files) {
      console.log('files are:', files)
      if (err) throw err

      files = files
        .filter(function (file) {
          return file !== '.' && file !== '..' && file !== 'proc' && file !== 'dev'
        })
        .map(function (file) {
          return '-v ' + path.resolve(path.join(conf.containerDir, id, 'mnt', file)) + ':/' + file + ' '
        })
        .join('').trim().split(/\s+/)

      var entrypoint = opts.cmd || '/bin/bash'

      var command = ['run', '-it', '--entrypoint', entrypoint]
      command = command.concat(['--net', opts.net || 'bridge'])
        .concat(files).concat('tianon/true')
      if (opts.env) {
        var vars = [].concat(opts.env || [])
        var env = []
        vars.forEach(function (v) {
          env.push('-e', v)
        })
        command = command.concat(env)
      }
      var spawn = function () {
        proc.spawn('docker', command, {stdio: 'inherit'}).on('exit', function () {
          console.log('EXITING')
          return cb()
        })
      }

      var ns = new Buffer('nameserver 8.8.8.8\nnameserver 8.8.4.4\n')
      fs.open('/etc/resolv.conf', 1, function (err, fd) {
        if (err < 0) return spawn()
        fs.write('/etc/resolv.conf', 0, ns.length, ns, fd, function (err) {
          if (err < 0) return spawn()
          fs.release('/etc/resolv.conf', fd, spawn)
        })
      })
    })
  })
}

DockerEngine.prototype._bootFromHub = function (id, image, opts, cb) {
  var containerOpts = Object.assign({ Image: image }, opts)
  this.docker.createContainer(containerOpts, function (err, container) {
    if (err) return cb(err)
    container.attach({ stream: true, stdout: true, stderr: true }, function (err, stream) {
      if (err) return cb(err)
      return cb(null, stream)
    })
  })
}

DockerEngine.prototype.ps = function (opts, cb) {
  // list all running docker containers (just a thin wrapper around `docker ps`)
  this.docker.listContainers(opts, function (err, containers) {
    if (err) return cb(err)
    return cb(null, containers)
  })
}

/**
 * Create an image from a container (specified by ID)
 */
DockerEngine.prototype.create = function (id, opts, cb) {
  var self = this
  console.log('id:', id)
  var container = this.docker.getContainer(id)
  console.log('container:', container)
  if (container) {
    var archive = self.drive.createArchive()
    container.export(function (err, stream) {
      debug('finished exporting', id)
      if (err) return cb(err)
      var extract = tar.extract()
      extract.on('entry', function (header, stream, callback) {
        header.name = '/' + header.name
        var fileStream = pump(stream, archive.createFileWriteStream(header))
        fileStream.on('finish', function () {
          return callback()
        })
        fileStream.on('error', function (err) {
          return callback(err)
        })
        fileStream.resume()
        return callback()
      })
      var archiveStream = pump(stream, extract)
      archiveStream.on('finish', function () {
        archive.finalize(function (err) {
          if (err) return cb(err)
          if (opts.seed) {
            return _seed(archive, cb)
          }
          return cb(null, archive.key.toString('hex'))
        })
      })
      archiveStream.on('error', function (err) {
        debug('error before all entries were extracted', err)
        return cb(err)
      })
      archiveStream.resume()
    })
  } else {
    return cb(new Error('container does not exist'))
  }
  function _seed (archive, cb) {
    var swarm = Swarm()
    swarm.listen()
    swarm.join(archive.key)
    swarm.on('connection', function (conn) {
      conn.pipe(archive.replicate()).pipe(conn)
    })
    return cb(null, archive.key.toString('hex'))
  }
}
module.exports = DockerEngine
