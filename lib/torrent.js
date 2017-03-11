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

  this._namespace = namespace
  this._priorityDbName = 'planktos-priority-' + this.hash + '-' + namespace
  this._priority = new IdbKvStore(this._priorityDbName)
  this._missingChunks = null
  this._chunkStore = new IdbChunkStore(this.torrentMeta.pieceLength, {
    name: this.hash
  })
}

Torrent.prototype.getFile = function (fpath) {
  if (this.closed) throw new Error('Torrent is closed')
  fpath = path.normalize(fpath)
  if (fpath.startsWith('/') || fpath === '.') fpath = fpath.substr(1)

  let fileInfo = this.torrentMeta.files.find(f => f.name === fpath)
  return fileInfo ? new File(this, fpath, fileInfo) : undefined
}

Torrent.prototype.close = function () {
  if (this.closed) return
  this.closed = true

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
