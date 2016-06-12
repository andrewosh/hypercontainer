var path = require('path')
var from = require('from2')
var cuid = require('cuid')
var find = require('lodash.find')
var proc = require('child_process')
var pump = require('pumpify')
var Docker = require('dockerode')

var conf = require('../conf')
var debug = require('debug')(conf.name)
var filesystem = require('./filesystem')

function DockerEngine (archive, opts) {
  if (!(this instanceof DockerEngine)) return new DockerEngine(archive, opts)
  this.archive = archive
  this.opts = opts
  this.docker = new Docker()
}

DockerEngine.prototype.run = function (image, opts, cb) {
  // check if the image is in the hyperdrive,  else boot it from Docker Hub
  var self = this
  this.archive.list(function (err, images) {
    if (err) return cb(err)
    var img = find(images, { name: image })
    var id = cuid()
    if (img) {
      self._bootFromDrive(id, img, opts, cb)
    } else {
      self._bootFromHub(id, image, opts, cb)
    }
  })
}

DockerEngine.prototype._bootFromDrive = function (id, image, opts, cb) {
  var self = this
  var mnt = path.join(conf.containerDir, id, 'mnt')
  var data = path.join(conf.containerDir, id, 'data')

  function createImageStream (opts) {
    var offset = opts.start || 0
    if (opts.end) {
      var total = opts.end - offset
    }
    var cursor = self.archive.createByteCursor(image, offset)
    var read = 0
    var done = false
    // TODO: this can be optimized a lot
    return from(function (size, next) {
      if (done) return next(null)
      cursor.next(function (err, buf) {
        if (err) return next(err)
        read += buf.length
        if (read > total) {
          done = true
          return next(null, buf.slice(read - total))
        }
        return next(null, buf)
      })
    })
  }

  function createIndexStream () {
    return self.archive.list()
  }

  filesystem(mnt, data, {
    createImageStream: createImageStream,
    createIndexStream: createIndexStream,
    log: debug,
    uid: process.getuid(),
    gid: process.getgid()
  }, function (err, fs) {
    if (err) throw err
    debug('filesystem index loaded. booting vm...')
    fs.readdir('/', function (err, files) {
      if (err) throw err

      files = files
        .filter(function (file) {
          return file !== '.' && file !== '..' && file !== 'proc' && file !== 'dev'
        })
        .map(function (file) {
          return '-v ' + id + '/mnt/' + file + ':/' + file + ' '
        })
        .join('').trim().split(/\s+/)

      var entrypoint = opts.cmd || '/bin/bash'

      var command = ['run', '--it', '--rm']
      command = command.concat(['--net', opts.net || 'bridge', '--entrypoint', entrypoint])
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
          process.exit()
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

DockerEngine.prototype.images = function (opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }
  var self = this
  this.archive.list(function (err, remote) {
    if (err) return cb(err)
    self.docker.listImages(function (err, local) {
      if (err) return cb(err)
      return cb(null, {
        remote: remote,
        local: local
      })
    })
  })
}

DockerEngine.prototype.ps = function (opts, cb) {
  // list all running docker containers (just a thin wrapper around `docker ps`)
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }
  this.docker.listContainers(opts, function (err, containers) {
    if (err) return cb(err)
    return cb(null, containers)
  })
}

/**
 * Create an image from a container (specified by ID)
 */
DockerEngine.prototype.create = function (id, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }
  var self = this
  console.log('id:', id)
  var container = this.docker.getContainer(id)
  console.log('container:', container)
  if (container) {
    var imageId = cuid()
    container.export(function (err, stream) {
      if (err) return cb(err)
      var archiveStream = pump(stream, self.archive.createFileWriteStream(imageId))
      archiveStream.on('end', function () {
        console.log('ended')
        return cb(null, imageId)
      })
      archiveStream.on('error', function (err) {
        console.log('erroed')
        return cb(err)
      })
      archiveStream.resume()
    })
  } else {
    return cb(new Error('container does not exist'))
  }
}

module.exports = DockerEngine
