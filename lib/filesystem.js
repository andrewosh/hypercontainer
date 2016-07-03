var fuse = require('fuse-bindings')
var fs = require('fs')
var collect = require('stream-collector')
var p = require('path')
var pump = require('pump')
var mkdirp = require('mkdirp')
var lexint = require('lexicographic-integer')
var stream = require('stream')
var shasum = require('shasum')
var mknod = require('mknod')

var ENOENT = -2
var EPERM = -1
// var EINVAL = -22
var EEXIST = -17

var toIndexKey = function (name) {
  var depth = name.split('/').length - 1
  return lexint.pack(depth, 'hex') + name
}

var empty = function () {
  var p = new stream.PassThrough()
  p.end()
  return p
}

module.exports = function (db, mnt, container, opts, cb) {
  if (typeof opts === 'function') return module.exports(mnt, container, null, opts)
  if (!opts) opts = {}

  var dmode = 0
  var fmode = 0
  var log = opts.log || function () {}

  if (opts.readable) {
    dmode |= parseInt('0555', 8)
    fmode |= parseInt('0444', 8)
  }
  if (opts.writable) {
    dmode |= parseInt('0333', 8)
    fmode |= parseInt('0222', 8)
  }

  var handlers = {}
  var store = container

  var createImageStream = opts.createImageStream || empty
  var createIndexStream = opts.createIndexStream || empty

  var createReadStream = function (entry, offset) {
    if (!entry.length) return empty()
    return createImageStream(entry, offset)
  }

  var ready = function () {
    var get = function (path, cb) {
      log('get', path)
      if (path === '/') return cb(null, {name: '/', mode: parseInt('0755', 8), type: 'directory'})

      db.get(toIndexKey(path), {valueEncoding: 'json'}, function (err, entry) {
        if (err) return cb(err)
        if (!entry.layer) return cb(null, entry)
        fs.stat(entry.layer, function (err, stat) {
          if (err) return cb(err)
          entry.length = stat ? stat.size : 0
          cb(null, entry)
        })
      })
    }

    handlers.getattr = function (path, cb) {
      log('getattr', path)

      get(path, function (err, entry) {
        if (err) return cb(ENOENT)
        console.log('getattr, entry:', JSON.stringify(entry))

        function sizeAndMode (stat, cb) {
          if (entry.type === 'file') {
            stat.size = entry.length
            stat.mode = parseInt('0100000', 8) | entry.mode | fmode
          }
          if (entry.type === 'directory') {
            stat.nlink = entry.nlink || 2
            stat.size = 4096
            stat.mode = parseInt('040000', 8) | entry.mode | dmode
          }
          if (entry.type === 'symlink') {
            stat.mode = parseInt('120000', 8) | entry.mode
          }
          if (entry.type === 'device') {
            stat.mode = entry.mode
          }
          return cb(0, stat)
        }

        var stat = {}
        stat.nlink = 1
        stat.size = 0
        stat.atime = entry.atim
        stat.mtime = entry.mtim
        if (opts.uid !== undefined) stat.uid = opts.uid
        if (opts.gid !== undefined) stat.gid = opts.gid

        if (entry.layer) {
          fs.stat(entry.layer, function (err, s) {
            if (err) return cb(err)
            stat.nlink = s.nlink
            return sizeAndMode(stat, cb)
          })
        } else {
          return sizeAndMode(stat, cb)
        }
      })
    }

    handlers.readdir = function (path, cb) {
      log('readdir', path)

      var resolved = p.resolve(path)
      if (!/\/$/.test(resolved)) resolved += '/'
      var gte = toIndexKey(resolved)
      var lt = toIndexKey(p.join(resolved, '\xff'))
      var rs = db.createReadStream({
        gte: gte,
        lt: lt,
        valueEncoding: 'json'
      })

      collect(rs, function (err, entries) {
        if (err) return cb(ENOENT)

        var files = entries.map(function (entry) {
          return p.basename(entry.value.name)
        })

        cb(0, files)
      })
    }

    var files = []

    var open = function (path, flags, cb) {
      var push = function (data) {
        var list = files[path] = files[path] || [true, true, true] // fd > 3
        var fd = list.indexOf(null)
        if (fd === -1) fd = list.length
        list[fd] = data
        cb(0, fd)
      }

      get(path, function (err, entry) {
        if (err) return cb(ENOENT)
        if (entry.type === 'symlink') return open(entry.linkname, flags, cb)
        if (!entry.layer) return push({offset: 0, entry: entry})

        fs.open(entry.layer, flags, function (err, fd) {
          if (err) return cb(EPERM)
          push({fd: fd, entry: entry})
        })
      })
    }

    var getTargetPath = function (path) {
      return p.join(store, 'layer', shasum(path + '-' + Date.now()))
    }

    var copyOnWrite = function (path, mode, upsert, cb) {
      log('copy-on-write', path)

      var target = getTargetPath(path)

      var done = function (entry) {
        db.put(toIndexKey(entry.name), entry, {valueEncoding: 'json'}, function (err) {
          if (err) {
            console.error('copy-on-write:done, err:', err)
            return cb(EPERM)
          }
          cb(0)
        })
      }

      var create = function () {
        var entry = {name: path, size: 0, type: 'file', mode: mode, layer: target}
        fs.writeFile(target, '', function (err) {
          if (err) {
            console.error('copy-on-write:create, err:', err)
            return cb(EPERM)
          }
          done(entry)
        })
      }

      get(path, function (err, entry) {
        if (err) {
          if (err.notFound && upsert) return create()
          if (err.notFound) return cb(ENOENT)
          return cb(err)
        }
        if (entry && entry.layer) return cb(0)
        if (!entry && upsert) return create()
        if (!entry) return cb(ENOENT)

        entry.layer = target
        if (mode) entry.mode = mode

        pump(createReadStream(entry, 0), fs.createWriteStream(target), function (err) {
          if (err) {
            console.error('copy-on-write:get, err:', err)
            return cb(EPERM)
          }
          done(entry)
        })
      })
    }

    handlers.open = function (path, flags, cb) {
      log('open', path, flags)

      if ((flags & 3) === 0) return open(path, flags, cb)
      copyOnWrite(path, 0, false, function (err) {
        if (err) return cb(err)
        open(path, flags, cb)
      })
    }

    handlers.release = function (path, handle, cb) {
      log('release', path, handle)

      var list = files[path] || []
      var file = list[handle]
      if (!file) return cb(ENOENT)

      if (file.stream) file.stream.destroy()
      list[handle] = null
      if (!list.length) delete files[path]

      if (file.fd === undefined) return cb(0)

      fs.close(file.fd, function (err) {
        if (err) {
          console.error('release, err:', err)
          return cb(EPERM)
        }
        cb(0)
      })
    }

    handlers.read = function (path, handle, buf, len, offset, cb) {
      log('read', path, offset, len, handle, buf.length)

      var list = files[path] || []
      var file = list[handle]
      if (!file) return cb(ENOENT)

      if (len + offset > file.entry.length) len = file.entry.length - offset

      if (file.fd !== undefined) {
        fs.read(file.fd, buf, 0, len, offset, function (err, bytes) {
          if (err) {
            console.error('read, err:', err)
            console.log('file.fd:', file.fd, 'file.entry:', file.entry)
            return cb(EPERM)
          }
          cb(bytes)
        })
        return
      }

      if (file.stream && file.offset !== offset) {
        file.stream.destroy()
        file.stream = null
      }

      if (!file.stream) {
        file.stream = createReadStream(file.entry, offset)
        file.offset = offset
      }

      var loop = function () {
        var result = file.stream.read(len)
        if (!result) return file.stream.once('readable', loop)
        file.offset += result.length
        result.copy(buf)
        cb(result.length)
      }

      loop()
    }

    handlers.truncate = function (path, size, cb) {
      log('truncate', path, size)

      copyOnWrite(path, 0, false, function (err) {
        if (err) return cb(err)
        get(path, function (err, entry) {
          if (err || !entry.layer) {
            console.error('truncate:get, err:', err)
            return cb(EPERM)
          }
          fs.truncate(entry.layer, size, function (err) {
            if (err) {
              console.error('truncate:fs, err:', err)
              return cb(EPERM)
            }
            cb(0)
          })
        })
      })
    }

    handlers.write = function (path, handle, buf, len, offset, cb) {
      log('write', path, offset, len, handle)

      var list = files[path] || []
      var file = list[handle]
      if (!file) return cb(ENOENT)
      if (file.fd === undefined) {
        console.error('write:fd  error')
        return cb(EPERM)
      }

      fs.write(file.fd, buf, 0, len, offset, function (err, bytes) {
        if (err) {
          console.error('write:write, err:', err)
          return cb(EPERM)
        }
        file.entry.length += bytes
        db.put(toIndexKey(path), file.entry, { valueEncoding: 'json' }, function (err) {
          if (err) return cb(err)
          return cb(bytes)
        })
      })
    }

    handlers.unlink = function (path, cb) {
      log('unlink', path)
      get(path, function (err, entry) {
        if (err) return cb(err)
        if (!entry) return cb(ENOENT)
        db.del(toIndexKey(path), function () {
          if (!entry.layer) return cb(0)
          fs.unlink(entry.layer, function () {
            cb(0)
          })
        })
      })
    }

    handlers.rename = function (src, dst, cb) {
      log('rename', src, dst)

      copyOnWrite(src, 0, false, function (err) {
        if (err) return cb(err)
        get(src, function (err, entry) {
          if (err || !entry.layer) {
            console.error('rename, err:', err)
            return cb(EPERM)
          }
          files[dst] = files[src] || []
          delete files[src]
          var batch = [{type: 'del', key: toIndexKey(entry.name)}, {type: 'put', key: toIndexKey(dst), valueEncoding: 'json', value: entry}]
          entry.name = dst
          db.batch(batch, function (err) {
            if (err) {
              console.error('rename:batch, err:', err)
              return cb(EPERM)
            }
            cb(0)
          })
        })
      })
    }

    handlers.mkdir = function (path, mode, cb) {
      log('mkdir', path)

      db.put(toIndexKey(path), {name: path, mode: mode, type: 'directory', size: 0}, {valueEncoding: 'json'}, function (err) {
        if (err) {
          console.error('mkdir, err:', err)
          return cb(EPERM)
        }
        cb(0)
      })
    }

    handlers.rmdir = function (path, cb) {
      log('rmdir', path)

      handlers.readdir(path, function (err, list) {
        if (err) {
          console.error('rmdir:readdir, err:', err)
          return cb(EPERM)
        }
        if (list.length) {
          console.error('rmdir, list.length, err:', err)
          return cb(EPERM)
        }
        handlers.unlink(path, cb)
      })
    }

    handlers.chown = function (path, uid, gid, cb) {
      log('chown', path, uid, gid)
      get(path, function (err, entry) {
        if (err) return cb(err)
        entry.uid = uid
        entry.gid = gid
        db.put(toIndexKey(path), entry, { valueEncoding: 'json' }, function (err) {
          if (err) {
            console.error('chown, err:', err)
            return cb(EPERM)
          }
          cb(0)
        })
      })
    }

    handlers.chmod = function (path, mode, cb) {
      log('chmod', path, mode)

      get(path, function (err, entry) {
        if (err) return cb(err)
        entry.mode = mode
        db.put(toIndexKey(path), entry, {valueEncoding: 'json'}, function (err) {
          if (err) {
            console.error('chmod, err:', err)
            return cb(EPERM)
          }
          cb(0)
        })
      })
    }

    handlers.create = function (path, mode, cb) {
      log('create', path, mode)

      copyOnWrite(path, mode, true, function (err) {
        if (err) return cb(err)
        open(path, 2, cb)
      })
    }

    handlers.getxattr = function (path, name, buffer, length, offset, cb) {
      log('getxattr')

      cb(0)
    }

    handlers.setxattr = function (path, name, buffer, length, offset, flags, cb) {
      log('setxattr')

      cb(0)
    }

    handlers.statfs = function (path, cb) {
      cb(0, {
        bsize: 1000000,
        frsize: 1000000,
        blocks: 1000000,
        bfree: 1000000,
        bavail: 1000000,
        files: 1000000,
        ffree: 1000000,
        favail: 1000000,
        fsid: 1000000,
        flag: 1000000,
        namemax: 1000000
      })
    }

    handlers.utimens = function (path, actime, modtime, cb) {
      log('utimens', path, actime, modtime)
      get(path, function (err, entry) {
        if (err) return cb(ENOENT)
        entry.atim = actime.getTime()
        entry.mtim = modtime.getTime()
        console.log('entry:', JSON.stringify(entry))
        db.put(toIndexKey(path), entry, { valueEncoding: 'json' }, function (err) {
          if (err) return cb(err)
          return cb(0)
        })
      })
    }

    handlers.mknod = function (path, mode, dev, cb) {
      log('mknod', path, mode, dev)
      var target = getTargetPath(path)
      var entry = { name: path, type: 'device', mode: mode, layer: target }
      mknod(target, mode, dev, function (err) {
        if (err) return cb(err)
        db.put(toIndexKey(path), entry, { valueEncoding: 'json' }, function (err) {
          if (err) return cb(err)
          return cb(0)
        })
      })
    }

    var processSrc = function (src) {
      if (src.startsWith(mnt)) {
        src = src.slice(mnt.length)
      }
      if (!src.startsWith('/')) src = '/' + src
      return src
    }

    handlers.symlink = function (src, dest, cb) {
      log('symlink', src, dest)
      get(dest, function (err, existing) {
        if (err && !err.notFound) return cb(err)
        if (existing) return cb(EEXIST)
        var mode = parseInt('120000', 8) | parseInt('0777', 8)
        var entry = { name: dest, type: 'symlink', linkname: src, mode: mode }
        db.put(toIndexKey(dest), entry, { valueEncoding: 'json' }, function (err) {
          if (err) return cb(err)
          return cb(0)
        })
      })
    }

    handlers.readlink = function (path, cb) {
      log('readlink', path)
      get(path, function (err, entry) {
        if (err) return cb(err)
        return cb(0, entry.linkname)
      })
    }

    handlers.link = function (src, dest, cb) {
      log('link', src, dest)
      src = processSrc(src)
      get(dest, function (err, existing) {
        if (err && !err.notFound) return cb(err)
        if (existing) return cb(EEXIST)
        var list = files[src] || []
        get(src, function (err, entry) {
          if (err && !err.notFound) return cb(err)
          if ((err || !entry) && (list.length < 3)) return cb(ENOENT)
          var srcTarget = (entry) ? entry.layer : list[3].entry.layer
          var destTarget = getTargetPath(dest)
          entry.layer = destTarget
          console.log('linking', srcTarget, 'to', destTarget)
          fs.link(srcTarget, destTarget, function (err) {
            if (err) return cb(err)
            console.log('IN LINK', toIndexKey(dest), '->', JSON.stringify(entry))
            db.put(toIndexKey(dest), entry, { valueEncoding: 'json' }, function (err) {
              if (err) return cb(err)
              return cb(0)
            })
          })
        })
      })
    }

    handlers.destroy = function (cb) {
      console.log('DESTROY')
      return cb(0)
    }

    handlers.options = ['allow_other']
    fuse.mount(mnt, handlers, function (err) {
      if (err) return cb(err)
      cb(null, handlers)
    })
  }

  fs.exists(p.join(store, 'db'), function (exists) {
    if (exists) return fuse.unmount(mnt, ready)

    mkdirp(p.join(store, 'layer'), function () {
      var indexStream = createIndexStream()
      indexStream.on('end', function () {
        fuse.unmount(mnt, ready)
      })
      indexStream.on('data', function (entry) {
        db.put(toIndexKey(p.resolve(entry.name)), entry, { valueEncoding: 'json' }, function (err) {
          if (err) return cb(err)
        })
      })
      indexStream.resume()
    })
  })
}
