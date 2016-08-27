var path = require('path')
var from = require('from2')
var deepAssign = require('deep-assign')
var cow = require('copy-on-write')
var Swarm = require('discovery-swarm')
var Docker = require('dockerode')

var conf = require('../conf')
var debug = require('debug')(conf.name)

var HyperContainer = require('./container')

function HyperImage (drive, archive, opts) {
  if (!(this instanceof HyperImage)) return new HyperImage(drive, archive, opts)
  this.opts = opts || {}
  this.drive = drive
  this.archive = archive
  this.id = this.archive.key.toString('hex')
  this.docker = new Docker()
}

HyperImage.prototype.run = function (opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  opts = opts || {}
  var self = this
  if (!this.swarm) {
    this.seed(function (err, swarm) {
      if (err) return cb(err)
      self.swarm = swarm
      bootImage()
    })
  } else {
    bootImage()
  }

  function bootImage () {
    function createFileStream (entry, offset) {
      var total = entry.length - offset
      var cursor = self.archive.createByteCursor(entry.name, offset)
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
      return self.archive.list()
    }

    cow({
      dir: conf.containers,
      createFileStream: createFileStream,
      createIndexStream: createIndexStream,
      log: debug
    }, function (err, fs) {
      if (err) return cb(err)
      debug('Filesystem mounted, booting container...')
      fs.readdir('/', function (err, files) {
        if (err) throw err

        files = files.filter(function (file) {
          return file !== '.' && file !== '..' && file !== 'proc' && file !== 'dev'
        })
        var volumes = files.reduce(function (l, file) {
          l.push(path.resolve(path.join(fs.mnt, file)) + ':' + '/' + file)
          return l
        }, [])
        var runOpts = {
          Cmd: ['/bin/bash'],
          AttachStdin: true,
          OpenStdin: true,
          Tty: true,
          HostConfig: {
            NetworkMode: 'bridge',
            Binds: volumes
          }
        }
        deepAssign(runOpts, opts)
        if (opts.HostConfig && opts.HostConfig.Binds) {
          opts.HostConfig.Binds.forEach(function (volume) {
            runOpts.HostConfig.Binds.push(volume)
          })
        }
        runOpts.Image = 'tianon/true'
        function spawn () {
          self.docker.createContainer(runOpts, function (err, container) {
            if (err) return cb(err)
            container.start(function (err) {
              if (err) return cb(err)
              return cb(null, HyperContainer(container.id, self.drive, self.archive, fs))
            })
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
}

HyperImage.prototype.seed = function (cb) {
  var self = this
  var swarm = Swarm()
  swarm.listen()
  swarm.join(this.archive.key)
  swarm.on('connection', function (conn) {
    conn.pipe(self.archive.replicate()).pipe(conn)
  })
  return cb(null, swarm)
}

module.exports = HyperImage
