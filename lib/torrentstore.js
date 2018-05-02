module.exports = TorrentStore

/* global indexedDB */

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var IdbKvStore = require('idb-kv-store')
var IdbChunkStore = require('indexeddb-chunk-store')

inherits(TorrentStore, EventEmitter)
function TorrentStore (namespace) {
  EventEmitter.call(this)
  var self = this
  self._namespace = namespace
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

TorrentStore.prototype.updateMeta = function (infoHash, torrentMetaBuffer, cb) {
  var self = this
  if (!self._store) throw new Error('Database is closed')
  var transaction = self._store.transaction()
  transaction.get(infoHash, function (err, rawTorrent) {
    if (err) return cb(err)
    if (!rawTorrent) cb(new Error('Torrent does not exist'))

    rawTorrent.torrentMetaBuffer = torrentMetaBuffer
    transaction.set(infoHash, rawTorrent, function (err) {
      if (err) {
        if (cb) cb(err)
      } else {
        self.emit('add', rawTorrent)
        if (cb) cb(null)
      }
    })
  })
}

TorrentStore.prototype.connectTorrentDB = function (infoHash) {
  return new TorrentDB(this, this._namespace, infoHash)
}

TorrentStore.prototype.close = function () {
  if (!this._store) return
  this._store.close()
  this._store = null
  this.removeAllListeners()
}

inherits(TorrentDB, EventEmitter)
function TorrentDB (torrentStore, namespace, infoHash) {
  var self = this
  EventEmitter.call(self)
  self.closed = false
  self._torrentStore = torrentStore
  self._infoHash = infoHash
  self._priorityDbName = namespace + '-priority-' + infoHash
  self._chunkStoreDbName = namespace + '-data-' + infoHash
  self._priority = new IdbKvStore(self._priorityDbName) // TODO lazily initiaize resources
  self._priority.on('add', onPriority)

  function onPriority (change) {
    self.emit('priority', change.value)
  }
}

TorrentDB.prototype.updateMeta = function (torrentMetaBuffer, cb) {
  if (this.closed) throw new Error('Torrent database is closed')
  this._torrentStore.updateMeta(this._infoHash, torrentMetaBuffer, cb)
}

TorrentDB.prototype.getPriorities = function (cb) {
  if (this.closed) throw new Error('Torrent database is closed')
  this._priority.values(cb)
}

TorrentDB.prototype.addPriority = function (start, end, priority, cb) {
  if (this.closed) throw new Error('Torrent database is closed')
  if (typeof priority === 'function') return this.addPriority(start, end, null, priority)

  this._setPriority('select', start, end, priority, cb)
}

TorrentDB.prototype.removePriority = function (start, end, priority, cb) {
  if (this.closed) throw new Error('Torrent database is closed')
  if (typeof priority === 'function') return this.removePriority(start, end, null, priority)

  this._setPriority('deselect', start, end, priority, cb)
}

TorrentDB.prototype.critical = function (start, end, cb) {
  if (this.closed) throw new Error('Torrent database is closed')

  this._setPriority('critical', start, end, cb)
}

TorrentDB.prototype._setPriority = function (type, start, end, priority, cb) {
  if (this.closed) throw new Error('Torrent database is closed')

  priority = priority || 1
  var p = { type: type, start: start, end: end, priority: priority }
  this._priority.add(p, cb) // TODO only add if necessary
  this.emit('priority', p) // onPriority is not called for local mutations
}

TorrentDB.prototype.removeAllPriorities = function (cb) {
  if (this.closed) throw new Error('Torrent database is closed')
  this._priority.clear(cb)
}

TorrentDB.prototype.createChunkStore = function (chunkLength, opts) {
  if (this.closed) throw new Error('Torrent database is closed')
  var custom = {} // Good practice to treat `opts` as read only so copy into `custom`
  for (var k in opts) custom[k] = opts[k]
  custom.name = this._chunkStoreDbName
  delete custom.torrent // TODO fix this in indexeddb-chunk-store
  return new IdbChunkStore(chunkLength, custom)
}

TorrentDB.prototype.close = function () {
  if (this.closed) return
  this.closed = true
  this._priority.close()
  this._priority = null
  this._torrentStore = null
  this.removeAllListeners()
}

TorrentDB.prototype.destroy = function () {
  this.close()
  indexedDB.deleteDatabase(this._priorityDbName)
  indexedDB.deleteDatabase(this._chunkStoreDbName)
}
