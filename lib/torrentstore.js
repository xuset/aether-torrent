module.exports = TorrentStore
module.exports.TorrentDB = TorrentDB

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var IdbKvStore = require('idb-kv-store')

inherits(TorrentStore, EventEmitter)
function TorrentStore (namespace) {
  EventEmitter.call(this)
  var self = this
  self._store = new IdbKvStore(namespace + '-torrents')

  self._store.on('set', function (change) {
    self.emit('add', change.value)
  })
}

TorrentStore.prototype.add = function (infoHash, rawTorrent, cb) {
  if (!this._store) throw new Error('Database is closed')
  this._store.set(infoHash, rawTorrent, cb)
}

TorrentStore.prototype.remove = function (infoHash, cb) {
  if (!this._store) throw new Error('Database is closed')
  this._store.remove(infoHash, cb)
}

TorrentStore.prototype.getAll = function (cb) {
  if (!this._store) throw new Error('Database is closed')
  this._store.values(cb)
}

TorrentStore.prototype.close = function () {
  if (!this._store) return
  this._store.close()
  this._store = null
}

inherits(TorrentDB, EventEmitter)
function TorrentDB (namespace, infoHash) {
  var self = this
  EventEmitter.call(self)
  self._priorityDbName = namespace + '-priority-' + infoHash
  self._priority = new IdbKvStore(self._priorityDbName) // TODO lazily initiaize resources
  self._priority.on('add', onPriority)

  function onPriority (change) {
    self.emit('priority', change.value)
  }
}

TorrentDB.prototype.getPriorities = function (cb) {
  this._priority.values(cb)
}

TorrentDB.prototype.addPriority = function (start, end, cb) {
  var p = { start: start, end: end }
  this._priority.add(p, cb) // TODO only add if necessary
  this.emit('priority', p) // onPriority is not called for local mutations
}

TorrentDB.prototype.removeAllPriorities = function (cb) {
  this._priority.clear(cb)
}

TorrentDB.prototype.close = function () {
  if (!this._priority) return
  this._priority.close()
  this._priority = null
}
