module.exports = Torrent

const parseTorrent = require('parse-torrent-file')
const path = require('path')
const IdbKvStore = require('idb-kv-store')
const IdbChunkStore = require('indexeddb-chunk-store')
const File = require('./file')

const global = typeof window !== 'undefined' ? window : self // eslint-disable-line

function Torrent (obj, namespace) {
  this.closed = false
  this.torrentMetaBuffer = Buffer.isBuffer(obj.torrentMetaBuffer)
                           ? obj.torrentMetaBuffer : new Buffer(obj.torrentMetaBuffer)
  this.torrentMeta = parseTorrent(this.torrentMetaBuffer)
  this.hash = obj.hash
  this.rootUrl = obj.rootUrl
  this.files = this.torrentMeta.files.map(f => new File(this, f))

  this._priorityDbName = 'planktos-priority-' + this.hash + '-' + namespace
  this._priority = new IdbKvStore(this._priorityDbName)
  this._missingChunks = {}
  this._chunkStore = new IdbChunkStore(this.torrentMeta.pieceLength, {
    name: this.hash
  })
  this._chunkStore._store.on('set', this._onChunkPut.bind(this))
}

Torrent.prototype.getFile = function (fpath) {
  if (this.closed) throw new Error('Torrent is closed')
  fpath = path.normalize(fpath)
  if (fpath.startsWith('/')) fpath = fpath.substr(1)
  return this.files.find(f => f.path === fpath) || undefined
}

Torrent.prototype.close = function () {
  if (this.closed) return
  this.closed = true

  this.files = null

  this._priority.close()
  this._priority = null

  this._chunkStore.close()
  this._chunkStore = null
}

Torrent.prototype.destroy = function () {
  this.close()
  global.indexedDB.deleteDatabase(this.hash)
  global.indexedDB.deleteDatabase(this._priorityDbName)
}

Torrent.prototype._onChunkPut = function (change) {
  if (this._missingChunks[change.key] != null) {
    let cbList = this._missingChunks[change.key]
    delete this._missingChunks[change.key]
    cbList.forEach(cb => cb(null))
  }
}

Torrent.prototype._notifyOnChunkPut = function (index, cb) {
  this._missingChunks[index] = this._missingChunks[index] || []
  this._missingChunks[index].push(cb)
}
