module.exports = Torrent

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var path = require('path')
var ChunkStream = require('chunk-store-read-stream')
var parseTorrent = require('parse-torrent')
var File = require('./file')

inherits(Torrent, EventEmitter)
function Torrent (infoHash, webseeds, TorrentDB) {
  EventEmitter.call(this)
  this.closed = false
  this.ready = false
  this.infoHash = infoHash
  this._customWebSeeds = webseeds

  this._torrentDB = TorrentDB
  this._missingChunks = {}
}

Torrent.prototype.updateMeta = function (torrentMeta) {
  var self = this
  if (self.closed) throw new Error('torrent is closed')
  if (self.infoHash !== torrentMeta.infoHash) throw new Error('Meta does not match infoHash')
  if (self.ready) return

  self.name = torrentMeta.name
  self.created = torrentMeta.created
  self.createdBy = torrentMeta.createdBy
  self.announce = torrentMeta.announce
  self.urlList = self._customWebSeeds.concat(torrentMeta.urlList)
  self.length = torrentMeta.length
  self.pieceLength = torrentMeta.pieceLength
  self.lastPieceLength = torrentMeta.lastPieceLength
  self.pieces = torrentMeta.pieces
  self.info = torrentMeta.info
  self.magnetURI = parseTorrent.toMagnetURI(torrentMeta)

  // TODO is it better to check 'info' instead?
  if (torrentMeta.files && torrentMeta.pieceLength) {
    self.files = torrentMeta.files.map(function (f) { return new File(self, f) })
    self._chunkStore = self._torrentDB.createChunkStore(self.pieceLength)
    self._chunkStore._store.on('set', self._onChunkPut.bind(self))
    self.torrentMetaBuffer = parseTorrent.toTorrentFile(torrentMeta)
    self.ready = true
    self.emit('ready')
  }
}

Torrent.prototype.getFile = function (fpath) {
  if (this.closed) throw new Error('Torrent is closed')
  if (!this.ready) throw new Error('Torrent is not ready yet')

  fpath = path.normalize(fpath)
  if (fpath.startsWith('/')) fpath = fpath.substr(1)
  return this.files.find(function (f) { return f.path === fpath }) || undefined
}

Torrent.prototype.close = function () {
  if (this.closed) return
  this.closed = true

  this.files = null

  this._torrentDB.close()
  this._torrentDB = null

  this._chunkStore.close()
  this._chunkStore = null
  this._missingChunks = null
}

Torrent.prototype.getStream = function (opts) {
  var self = this
  if (self.closed) throw new Error('torrent is closed')
  if (!self.ready) throw new Error('Torrent is not ready yet')

  opts = opts || {}
  var start = opts.start != null ? opts.start : 0
  var end = opts.end != null ? opts.end : self.length - 1

  if (start < 0 || end > self.length - 1 || start > end) {
    throw new Error('Range out of bounds')
  }

  self._torrentDB.addPriority(start, end)

  var stream = new ChunkStream(self._chunkStore, {
    start: start,
    end: end,
    onmiss: self._onChunkMiss.bind(self)
  })
  stream.length = end - start + 1
  stream.on('close', onClose)
  return stream

  function onClose () {
    self._torrentDB.removePriority(start, end)
  }
}

Torrent.prototype.destroy = function () {
  if (this._closed) return
  this._torrentDB.destroy()
  this.close()
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
    this._torrentDB.critical(index * this.pieceLength, (index + 1) * this.pieceLength - 1)
    this._missingChunks[index] = this._missingChunks[index] || []
    this._missingChunks[index].push(cb)
  } else {
    cb(err)
  }
}
