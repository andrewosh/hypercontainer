var path = require('path')
var proc = require('child_process')
var Swarm = require('discovery-swarm')
var Docker = require('dockerode')
var hyperdrive = require('hyperdrive')
var from = require('from2')
var level = require('level')
var cow = require('copy-on-write')
var cuid = require('cuid')

var conf = require('../conf')
var debug = require('debug')(conf.name)

function ImageManager (opts) {
  if (!(this instanceof ImageManager)) return new ImageManager(opts)
  this.opts = opts || {}
  this.db = opts.db || level(conf.db)
  this.drive = hyperdrive(this.db)
}

ImageManager.prototype.import = function (name, cb) {
  // Create an archive out of an Docker image tarball
}

ImageManager.prototype.list = function (cb) {
  // List all available Hyperimages
  throw Error('ImageManager.list is not implemented yet.')
}

function Hyperimage (name, archive, opts) {
  if (!(this instanceof Hyperimage)) return new Hyperimage(name, opts)
  this.opts = opts || {}
  this.name = name
  this.archive = archive
}

Hyperimage.prototype.run = function (opts, cb) {
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
        proc.spawn('docker', command, {stdio: 'inherit'}).on('exit', function () {
          console.log('EXITING')
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
    return cb(null, Hypercontainer(id, self.archive, fs))
  })
}

Hyperimage.prototype.seed = function () {
  var self = this
  var swarm = Swarm()
  swarm.listen()
  swarm.join(this.archive.key)
  swarm.on('connection', function (conn) {
    conn.pipe(self.archive.replicate()).pipe(conn)
  })
  return swarm
}

function Hypercontainer (id, archive, filesystem, opts) {
  if (!(this instanceof Hypercontainer)) return new Hypercontainer(filesystem, opts)
  this.opts = opts || {}
  this.id = id
  this.archive = archive
  this.fs = filesystem
}

Hypercontainer.prototype.stop = function (cb) {
  // Stop the container, unmount the filesystem, and delete the layers
}

Hypercontainer.prototype.commit = function (opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  var self = this
  var name = opts.name || cuid()

  // Merge the filesystem's changes stream with the archive's index stream, then write
  // a new archive (create a new Hyperimage) from the merged results
  this.fs.createChangesStream(function (err, changesStream) {
    if (err) return cb(err)
    var originalStream = this.archive.list()
  })
}

module.exports = Hypercontainer
