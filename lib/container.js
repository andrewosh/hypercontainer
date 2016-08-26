var HyperImage = require('./image')

function HyperContainer (id, drive, archive, filesystem, opts) {
  if (!(this instanceof HyperContainer)) return new HyperContainer(id, drive, archive, filesystem, opts)
  this.opts = opts || {}
  this.id = id
  this.drive = drive
  this.archive = archive
  this.fs = filesystem
}

HyperContainer.prototype.stop = function (cb) {
  // Stop the container, unmount the filesystem, and delete the layers
}

HyperContainer.prototype.commit = function (cb) {
  var self = this
  var newArchive = this.drive.createArchive()

  // Merge the filesystem's changes stream with the archive's index stream, then write
  // a new archive (create a new Hyperimage) from the merged results
  this.fs.createChangesStream(function (err, changesStream) {
    if (err) return cb(err)
    var originalStream = self.archive.list()
    return cb(null, HyperImage(self.drive, { key: newArchive.key }))
  })
}

module.exports = HyperContainer
