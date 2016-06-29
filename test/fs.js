var path = require('path')
var test = require('tape')
var memdb = require('memdb')
var mkdir = require('mkdirp')
var cuid = require('cuid')
var rimraf = require('rimraf')
var fs = require('fs')
var through = require('through2')
var filesystem = require('../lib/filesystem')

var conf = require('../conf')
var debug = require('debug')(conf.name)

var id = cuid()
var containers = path.join(__dirname, 'containers')
var layers = path.join(__dirname, 'layers')
var mnt = path.join(layers, id)
var store = path.join(containers, id)
var data = path.join(__dirname, 'data')

rimraf.sync(containers)
rimraf.sync(layers)
mkdir(mnt)
mkdir(store)

function createImageStream (entry, offset) {
  var p = path.join(data, entry.name.slice(1))
  debug('reading:', p, 'at', offset)
  return fs.createReadStream(p, { start: offset })
}

function createIndexStream () {
  var stream = through.obj()
  stream.pause()
  function emitError (err) {
    stream.emit('error', err)
    stream.end()
  }
  fs.readdir(data, function (err, paths) {
    if (err) emitError(err)
    var pushed = 0
    paths.forEach(function (p) {
      var entry = {}
      fs.stat(path.join(data, p), function (err, stat) {
        if (err) emitError(err)
        entry.name = '/' + p
        entry.length = stat.size
        entry.mode = 0
        entry.uid = 0
        entry.gid = 0
        entry.type = 'file'
        stream.push(entry)
        console.log('pushed:', JSON.stringify(entry))
        pushed++
        if (pushed === paths.length) {
          stream.end()
        }
      })
    })
  })
  return stream
}

test('should mount a copy-on-write filesystem', function (t) {
  filesystem(memdb(), mnt, store, {
    createImageStream: createImageStream,
    createIndexStream: createIndexStream,
    log: debug,
    uid: process.getuid(),
    git: process.getgid()
  }, function (err, fs) {
    t.error(err)
    t.pass('mounted filesystem')
    t.end()
  })
})
