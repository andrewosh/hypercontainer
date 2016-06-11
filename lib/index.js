var path = require('path')
var mkdir = require('mkdirp')
var hyperlog = require('hyperlog')
var hyperkv = require('hyperkv')
var sub = require('subleveldown')

var conf = require('../conf')

// TODO: indexing should be part of a separate module that references unique IDs in
// hypercontainer

function Index (db, swarm, opts) {
  if (!(this instanceof Index)) return new Index(swarm, opts)
  this.store = hyperkv({
    log: hyperlog(sub(db, 'log'), { valueEncoding: 'json' }),
    db: sub(db, 'metadata')
  })
}

Index.prototype.something = { }

module.exports = Index
