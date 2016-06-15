var mkdirp = require('mkdirp')

var conf = require('./conf')
var DockerEngine = require('./lib/docker')

function Hypercontainer (db, opts) {
  if (!(this instanceof Hypercontainer)) return new Hypercontainer(db, opts)
  this.opts = opts || {}
  this.db = db
  this._initialized = false
}

Hypercontainer.prototype._initialize = function (cb) {
  var self = this
  mkdirp(conf.dbDir, function (err) {
    if (err) return cb(err)
    mkdirp(conf.containerDir, function (err) {
      if (err) return cb(err)
      self._initialized = true
      cb()
    })
  })
}

Hypercontainer.prototype._getEngine = function (name) {
  if (name === 'docker') {
    return DockerEngine(this.db)
  }
}

Hypercontainer.prototype.run = function (engineName, image, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  var self = this
  if (!this._initialized) {
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

Hypercontainer.prototype.ps = function (engineName, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  var self = this
  if (!this._initialized) {
    this._initialize(_ps)
  } else {
    return _ps()
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
    opts = {}
  }
  var self = this
  if (!this._initialized) {
    this._initialize(_create)
  } else {
    return _create()
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

Hypercontainer.prototype.run = function (engineName, image, opts, cb) {
  console.log('in run')
  if (typeof opts === 'function') {
    cb = opts
    opts = null
  }
  var self = this
  if (!this._initialized) {
    return this._initialize(_run)
  } else {
    return _run()
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

module.exports = Hypercontainer
