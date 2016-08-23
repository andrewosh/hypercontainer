var path = require('path')
var proc = require('child_process')
var from = require('from2')
var cuid = require('cuid')
var cow = require('copy-on-write')
var Swarm = require('discovery-swarm')

var conf = require('../conf')
var debug = require('debug')(conf.name)

var HyperContainer = require('./container')

function HyperImage (drive, opts) {
  if (!(this instanceof HyperImage)) return new HyperImage(drive, opts)
  this.opts = opts || {}
  this.drive = drive
  if (opts.key) {
    this.archive = drive.createArchive(opts.key)
  } else {
    this.archive = drive.createArchive()
  }
  this.id = this.archive.key.toString('hex')
}

HyperImage.prototype.run = function (opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  var self = this
  var id = opts.id || cuid()
  var mnt = opts.mnt || this.opts.mnt || path.join(conf.mnt, id)
  if (!this.swarm) {
    this.swarm = this.seed()
  }

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

  cow(mnt, {
    dir: conf.store,
    createFileStream: createFileStream,
    createIndexStream: createIndexStream,
    log: debug
  }, function (err, fs) {
    if (err) return cb(err)
    debug('Filesystem mounted, booting container...')
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
        var containerProc = proc.spawn('docker', command, {stdio: 'inherit'}).on('exit', function () {
          console.log('EXITING')
        })
        var container = HyperContainer(id, self.drive, self.archive, fs)
        return cb(null, containerProc, container)
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
