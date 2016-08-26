var hyperdrive = require('@andrewosh/hyperdrive')
var Docker = require('dockerode')
var tar = require('tar-stream')
var pump = require('pumpify')
var level = require('level')

var conf = require('../conf')
var HyperImage = require('./image')

function ImageManager (opts) {
  if (!(this instanceof ImageManager)) return new ImageManager(opts)
  this.opts = opts || {}
  this.db = this.opts.db || level(conf.storage)
  this.drive = hyperdrive(this.db)
  this.docker = new Docker()
}

ImageManager.prototype.import = function (name, cb) {
  // Create an archive out of an Docker container tarball
  var self = this
  var container = this.docker.getContainer(name)
  if (container) {
    var archive = self.drive.createArchive()
    container.export(function (err, stream) {
      if (err) return cb(err)
      var extract = tar.extract()
      extract.on('entry', function (header, stream, callback) {
        header.name = '/' + header.name
        console.log('processing:', header)
        var fileStream = pump(stream, archive.createFileWriteStream(header))
        fileStream.on('finish', function () {
          return callback()
        })
        fileStream.on('error', function (err) {
          return callback(err)
        })
        fileStream.resume()
      })
      var archiveStream = pump(stream, extract)
      archiveStream.on('finish', function () {
        archive.finalize(function (err) {
          if (err) return cb(err)
          return cb(null, HyperImage(self.drive, archive))
        })
      })
      archiveStream.on('error', function (err) {
        return cb(err)
      })
      archiveStream.resume()
    })
  } else {
    return cb(new Error('container does not exist'))
  }
}

ImageManager.prototype.list = function (cb) {
  // List all available Hyperimages
  throw Error('ImageManager.list is not implemented yet.')
}

ImageManager.prototype.get = function (key, cb) {
  if (typeof key === 'string') key = new Buffer(key, 'hex')
  var archive = this.drive.createArchive(key)
  return cb(null, HyperImage(this.drive, archive))
}

module.exports = ImageManager
