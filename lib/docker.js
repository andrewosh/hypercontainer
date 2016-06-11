var filesystem = require('./filesystem')
var from = require('from2')
var pump = require('pumpify')
var cuid = require('cuid')
var find = require('lodash.find')
var Docker = require('dockerode')

function DockerEngine (archive, opts) {
  if (!(this instanceof Docker)) return new Docker(opts)
  this.archive = archive
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
    log: log,
    uid: argv.uid !== undefined ? Number(argv.uid) : process.getuid(),
    gid: argv.gid !== undefined ? Number(argv.gid) : process.getgid()
  }, function(err, fs) {
    if (err) throw err
    if (argv.docker === false) return console.log('image mounted...')
    console.log('filesystem index loaded. booting vm...')  
    fs.readdir('/', function(err, files) {
      if (err) throw err

      files = files
        .filter(function(file) {
          return file !== '.' && file !== '..' && file !== 'proc' && file !== 'dev' && noMount.indexOf(file) === -1
        })
        .map(function(file) {
          return '-v '+container+'/mnt/'+file+':/'+file+' '
        })
        .join('').trim().split(/\s+/)

      var vars = [].concat(argv.e || []).concat(argv.env || [])
      var env = []

      vars.forEach(function(v) {
        env.push('-e', v)
      })

      var spawn = function() {
        proc.spawn('docker', ['run', '--net', argv.net || 'bridge', '-it', '--rm', '--entrypoint=/bin/bash'].concat(env).concat(files).concat('tianon/true'), {stdio:'inherit'}).on('exit', function() {
          process.exit()
        })        
      }

      var ns = new Buffer('nameserver 8.8.8.8\nnameserver 8.8.4.4\n')
      fs.open('/etc/resolv.conf', 1, function(err, fd) {
        if (err < 0) return spawn()
        fs.write('/etc/resolv.conf', 0, ns.length, ns, fd, function(err) {
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

Docker.prototype.images = function (opts, cb) {
  var self = this
  this.archive.list(function (err, remote) {
    if (err) return cb(err)
    self.docker.listImage(function (err, local) {
      if (err) return cb(err)
      return cb(null, {
        remote: remote,
        local: local
      })
    })
  })
}

Docker.prototype.ps = function (opts, cb) {
  // list all running docker containers (just a thin wrapper around `docker ps`)
  var self = this
}

module.exports = DockerEngine
