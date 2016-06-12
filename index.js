var mkdirp = require('mkdirp')
var hyperdrive = require('hyperdrive')

var conf = require('./conf')
var DockerEngine = require('./lib/docker')

function Hypercontainer (swarm, db, opts) {
  if (!(this instanceof Hypercontainer)) return new Hypercontainer(swarm, db, opts)
  this.swarm = swarm
  this.db = db
  this.opts = opts || {}
  this.drive = null
}

Hypercontainer.prototype._initialize = function (cb) {
  var self = this
  mkdirp(conf.dbDir, function (err) {
    if (err) return cb(err)
    mkdirp(conf.containerDir, function (err) {
      if (err) return cb(err)
      self.drive = hyperdrive(self.db)
      cb()
    })
  })
}

Hypercontainer.prototype._getEngine = function (name) {
  if (name === 'docker') {
    var key = process.env['HYPERCONTAINER_KEY'] || this.opts.key
    var archive = this.drive.createArchive(key, {
      live: true
    })
    return DockerEngine(archive)
  }
}

Hypercontainer.prototype.run = function (engineName, image, opts, cb) {
  var self = this
  if (!this.drive) {
    this._initialize(_run)
  }
  function _run (err) {
    if (err) return cb(err)
    var engine = self._getEngine(engineName)
    if (engine) {
      return engine.run(image, opts, cb)
    }
    return cb(new Error('no engine found'))
  }
}

Hypercontainer.prototype.images = function (engineName, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }
  var self = this
  if (!this.drive) {
    this._initialize(_images)
  }
  function _images (err) {
    if (err) return cb(err)
    var engine = self._getEngine(engineName)
    if (engine) {
      return engine.images(opts, cb)
    }
    return cb(new Error('no engine found'))
  }
}

Hypercontainer.prototype.ps = function (engineName, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }
  var self = this
  if (!this.drive) {
    this._initialize(_ps)
  }
  function _ps (err) {
    if (err) return cb(err)
    var engine = self._getEngine(engineName)
    if (engine) {
      return engine.ps(opts, cb)
    }
    return cb(new Error('no engine found'))
  }
}

Hypercontainer.prototype.create = function (engineName, id, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }
  var self = this
  if (!this.drive) {
    this._initialize(_create)
  }
  function _create (err) {
    if (err) return cb(err)
    var engine = self._getEngine(engineName)
    if (engine) {
      return engine.create(id, opts, cb)
    }
    return cb(new Error('no engine found'))
  }
}

module.exports = Hypercontainer
