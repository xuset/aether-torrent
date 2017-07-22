module.exports = Seeder

var WebTorrent = require('webtorrent')

function Seeder () {
  if (typeof window === 'undefined') throw new Error('must be called in a wep page')

  this.destroyed = false
  this.started = false
  this._seeds = {}
  this._webtorrent = null
}

Seeder.prototype.add = function (torrent) {
  if (this.destroyed) throw new Error('Seeder has been destroyed')
  if (torrent.closed || torrent.infoHash in this._seeds) return

  var listener = this._prioritize.bind(this, torrent)

  this._seeds[torrent.infoHash] = {
    torrent: torrent,
    listener: listener
  }

  if (this.started) {
    torrent._torrentDB.on('priority', listener)
    this._seed(torrent)
  }
}

Seeder.prototype.remove = function (infoHash) {
  if (this.destroyed) throw new Error('Seeder has been destroyed')
  if (!this._seeds[infoHash]) return

  var seed = this._seeds[infoHash]
  delete this._seeds[infoHash]

  if (this._webtorrent) this._webtorrent.remove(seed.torrent.infoHash)

  if (seed != null && !seed.torrent.closed) {
    seed.torrent._torrentDB.removeListener('priority', this._seeds[infoHash].listener)
  }
}

Seeder.prototype.start = function () {
  if (this.destroyed) throw new Error('Seeder is destroyed')
  if (this.started) return

  this.started = true
  this._webtorrent = this._webtorrent || new WebTorrent()

  for (var infoHash in this._seeds) {
    var torrent = this._seeds[infoHash].torrent
    if (torrent.closed) {
      delete this._seeds[infoHash]
    } else {
      torrent._torrentDB.on('priority', this._seeds[infoHash].listener)
      this._seed(torrent)
    }
  }
}

Seeder.prototype.stop = function () {
  if (this.destroyed || !this.started) return

  this.started = false
  if (this._webtorrent) this._webtorrent.destroy()
  this._webtorrent = null

  for (var infoHash in this._seeds) {
    var torrent = this._seeds[infoHash].torrent
    if (torrent.closed) delete this._seeds[infoHash]
    else torrent._torrentDB.removeListener('priority', this._seeds[infoHash].listener)
  }
}

Seeder.prototype._seed = function (torrent) {
  var self = this
  if (self.destroyed || self._webtorrent.get(torrent.infoHash)) return

  var opts = {store: wrapChunkStore(torrent)}
  var torrentId = torrent.torrentMetaBuffer ? torrent.torrentMetaBuffer : torrent.magnetURI
  self._webtorrent.add(torrentId, opts, function (wtorrent) {
    if (torrent.closed || self.destroyed) return

    torrent._torrentDB.updateMeta(wtorrent.torrentFile)

    for (var i in torrent.urlList) {
      var url = torrent.urlList[i]
      if (wtorrent.urlList.indexOf(url) === -1) wtorrent.addWebSeed(url)
    }

    // Process any priority requests that came in before the listener was added
    torrent._torrentDB.getPriorities(function (err, values) {
      if (err) throw err
      values.forEach(function (v) { self._prioritize(torrent, v) })
    })

    wtorrent.on('done', function () {
      if (torrent.closed || self.destroyed) return
      torrent._torrentDB.removeAllPriorities()
    })
  })
}

Seeder.prototype._prioritize = function (torrent, range) {
  if (torrent.closed || this.destroyed || this._webtorrent == null) return

  var start = Math.floor(range.start / torrent.pieceLength)
  var end = Math.floor(range.end / torrent.pieceLength)
  var wtorrent = this._webtorrent.get(torrent.infoHash)

  if (wtorrent != null && wtorrent.ready && wtorrent.progress !== 1) {
    if (range.type === 'critical') wtorrent.critical(start, end)
    else if (range.type === 'select') wtorrent.select(start, end, range.priority)
    else if (range.type === 'deselect') wtorrent.deselect(start, end, range.priority)
  }
}

Seeder.prototype.destroy = function () {
  if (this.destroyed) return
  this.stop()
  this.destroyed = true
  this._seeds = null
}

function wrapChunkStore (torrent) {
  return function (chunkLength, opts) {
    return torrent._torrentDB.createChunkStore(chunkLength, opts)
  }
}
