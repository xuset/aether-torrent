module.exports = TorrentDB

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var IdbKvStore = require('idb-kv-store')

inherits(TorrentDB, EventEmitter)
function TorrentDB (namespace) {
  EventEmitter.call(this)
  var self = this
  self._store = new IdbKvStore(namespace + '-torrents')

  self._store.on('set', function (change) {
    self.emit('add', change.value)
  })
}

TorrentDB.prototype.add = function (infoHash, rawTorrent, cb) {
  if (!this._store) throw new Error('Database is closed')
  this._store.set(infoHash, rawTorrent, cb)
}

TorrentDB.prototype.remove = function (infoHash, cb) {
  if (!this._store) throw new Error('Database is closed')
  this._store.remove(infoHash, cb)
}

TorrentDB.prototype.getAll = function (cb) {
  if (!this._store) throw new Error('Database is closed')
  this._store.values(cb)
}

TorrentDB.prototype.close = function () {
  if (!this._store) return
  this._store.close()
  this._store = null
}
