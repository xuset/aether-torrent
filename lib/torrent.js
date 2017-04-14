module.exports = Torrent

/* global indexedDB */

var parseTorrent = require('parse-torrent-file')
var path = require('path')
var IdbKvStore = require('idb-kv-store')
var IdbChunkStore = require('indexeddb-chunk-store')
var ChunkStream = require('chunk-store-read-stream')
var File = require('./file')

function Torrent (obj, namespace) {
  this.closed = false
  this.torrentMetaBuffer = Buffer.from(obj.torrentMetaBuffer)
  var torrentMeta = parseTorrent(this.torrentMetaBuffer)

  this.name = torrentMeta.name
  this.created = torrentMeta.created
  this.createdBy = torrentMeta.createdBy
  this.announce = torrentMeta.announce
  this.urlList = obj.webseeds.concat(torrentMeta.urlList)
  this.length = torrentMeta.length
  this.pieceLength = torrentMeta.pieceLength
  this.lastPieceLength = torrentMeta.lastPieceLength
  this.pieces = torrentMeta.pieces
  this.infoHash = obj.infoHash
  var self = this
  this.files = torrentMeta.files.map(function (f) { return new File(self, f) })

  this._priorityDbName = namespace + '-priority-' + this.infoHash
  this._priority = new IdbKvStore(this._priorityDbName) // TODO lazily initiaize resources
  this._missingChunks = {}
  this._chunkStoreDbName = namespace + '-data-' + this.infoHash
  this._chunkStore = new IdbChunkStore(this.pieceLength, {
    name: this._chunkStoreDbName
  })
  this._chunkStore._store.on('set', this._onChunkPut.bind(this))
}

Torrent.prototype.getFile = function (fpath) {
  if (this.closed) throw new Error('Torrent is closed')
  fpath = path.normalize(fpath)
  if (fpath.startsWith('/')) fpath = fpath.substr(1)
  return this.files.find(function (f) { return f.path === fpath }) || undefined
}

Torrent.prototype.close = function () {
  if (this.closed) return
  this.closed = true

  this.files = null

  this._priority.close()
  this._priority = null

  this._chunkStore.close()
  this._chunkStore = null
  this._missingChunks = null
}

Torrent.prototype.getStream = function (opts) {
  opts = opts || {}
  var start = opts.start != null ? opts.start : 0
  var end = opts.end != null ? opts.end : this.length - 1

  if (this.closed) throw new Error('torrent is closed')

  if (start < 0 || end > this.length - 1 || start > end) {
    throw new Error('Range out of bounds')
  }

  this._priority.add({ start: start, end: end }) // TODO only add if necessary

  var stream = new ChunkStream(this._chunkStore, {
    start: start,
    end: end,
    onmiss: this._onChunkMiss.bind(this)
  })
  stream.length = end - start + 1
  return stream
}

Torrent.prototype.destroy = function () {
  this.close()
  indexedDB.deleteDatabase(this._chunkStoreDbName)
  indexedDB.deleteDatabase(this._priorityDbName)
}

Torrent.prototype._onChunkPut = function (change) {
  if (this._closed) return
  if (this._missingChunks[change.key] != null) {
    var cbList = this._missingChunks[change.key]
    delete this._missingChunks[change.key]
    cbList.forEach(function (cb) { cb(null) })
  }
}

Torrent.prototype._onChunkMiss = function (err, index, cb) {
  if (this.closed) return
  if (err.name === 'MissingChunkError') {
    this._missingChunks[index] = this._missingChunks[index] || []
    this._missingChunks[index].push(cb)
  } else {
    cb(err)
  }
}
