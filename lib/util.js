var lexint = require('lexicographic-integer')

module.exports = {
  toIndexKey: function (name) {
    var depth = name.split('/').length - 1
    return lexint.pack(depth, 'hex') + name
  }
}
