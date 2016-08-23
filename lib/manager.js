var hyperdrive = require('@andrewosh/hyperdrive')
var level = require('level')

var conf = require('../conf')

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

ImageManager.prototype.get = function (key, cb) {
  // Get a Hyperimage by key
}
