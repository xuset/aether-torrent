module.exports = Seeder

const WebTorrent = require('webtorrent')
const IdbChunkStore = require('indexeddb-chunk-store')

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

  let listener = this._prioritize.bind(this, torrent)

  this._seeds[torrent.infoHash] = {
    torrent: torrent,
    listener: listener
  }

  if (this.started) {
    torrent._priority.on('add', listener)
    this._seed(torrent)
  }
}

Seeder.prototype.remove = function (infoHash) {
  if (this.destroyed) throw new Error('Seeder has been destroyed')

  let seed = this._seeds[infoHash]
  delete this._seeds[infoHash]

  if (this._webtorrent) this._webtorrent.remove(seed.torrent.torrentMetaBuffer)

  if (seed != null && !seed.torrent.closed) {
    seed.torrent._priority.removeListener('add', this._seeds[infoHash].listener)
  }
}

Seeder.prototype.start = function () {
  if (this.destroyed) throw new Error('Seeder is destroyed')
  if (this.started) return

  this.started = true
  this._webtorrent = this._webtorrent || new WebTorrent()

  for (let infoHash in this._seeds) {
    let torrent = this._seeds[infoHash].torrent
    if (torrent.closed) {
      delete this._seeds[infoHash]
    } else {
      torrent._priority.on('add', this._seeds[infoHash].listener)
      this._seed(torrent)
    }
  }
}

Seeder.prototype.stop = function () {
  if (this.destroyed || !this.started) return

  this.started = false
  if (this._webtorrent) this._webtorrent.destroy()
  this._webtorrent = null

  for (let infoHash in this._seeds) {
    let torrent = this._seeds[infoHash].torrent
    if (torrent.closed) delete this._seeds[infoHash]
    else torrent._priority.removeListener('add', this._seeds[infoHash].listener)
  }
}

Seeder.prototype._seed = function (torrent) {
  var self = this
  if (self.destroyed || self._webtorrent.get(torrent.torrentMetaBuffer)) return

  let opts = {store: IdbChunkStore}
  self._webtorrent.add(torrent.torrentMetaBuffer, opts, function (wtorrent) {
    if (torrent.closed || self.destroyed) return

    for (let i in torrent.urlList) {
      let url = torrent.urlList[i]
      if (wtorrent.urlList.indexOf(url) === -1) wtorrent.addWebSeed(url)
    }

    // Process any priority requests that came in before the listener was added
    torrent._priority.values()
    .then(values => values.forEach(v => self._prioritize(torrent, v)))

    wtorrent.on('done', function () {
      if (torrent.closed || self.destroyed) return
      torrent._priority.clear()
    })
  })
}

Seeder.prototype._prioritize = function (torrent, range) {
  if (torrent.closed || this.destroyed || this._webtorrent == null) return
  if (range.value) range = range.value

  let start = Math.floor(range.start / torrent.pieceLength)
  let end = Math.floor(range.end / torrent.pieceLength)
  let wtorrent = this._webtorrent.get(torrent.infoHash)

  if (wtorrent != null && wtorrent.progress !== 1) wtorrent.select(start, end, 1)
}

Seeder.prototype.destroy = function () {
  if (this.destroyed) return
  this.stop()
  this.destroyed = true
  this._seeds = null
}
