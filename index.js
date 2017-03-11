module.exports = TorrentWorker

const global = typeof window !== 'undefined' ? window : self // eslint-disable-line

const IdbKvStore = require('idb-kv-store')
const parseTorrent = require('parse-torrent-file')
const TabElect = require('tab-elect')
const Torrent = require('./lib/torrent')
const Seeder = require('./lib/seeder')

function TorrentWorker (opts) {
  opts = opts || {}
  this._namespace = opts.namespace != null ? opts.namespace : '' // TODO set default to 'torrent-worker'
  this._torrents = {}
  this._torrentStore = new IdbKvStore('torrentworker-' + this._namespace)
  this._seeder = null
}

TorrentWorker.prototype.getAll = function () {
  let self = this

  return self._torrentStore.values().then(rawTorrents => {
    for (let i = 0; i < rawTorrents.length; i++) {
      let t = rawTorrents[i]
      self._torrents[t.hash] = self._torrents[t.hash] || new Torrent(t, self._namespace)
    }

    return Object.keys(self._torrents).map(k => self._torrents[k])
  })
}

TorrentWorker.prototype.add = function (torrentMetaBuffer) {
  let self = this

  if (typeof torrentMetaBuffer === 'string') {
    return global.fetch(torrentMetaBuffer)
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => self.add(arrayBuffer))
  }

  if (!Buffer.isBuffer(torrentMetaBuffer)) torrentMetaBuffer = new Buffer(torrentMetaBuffer)

  let hash = parseTorrent(new Buffer(torrentMetaBuffer)).infoHash
  if (hash in self._torrents) return Promise.resolve(torrent)

  let rawTorrent = {
    torrentMetaBuffer: torrentMetaBuffer,
    hash: hash // TODO change to infoHash
  }

  let torrent = new Torrent(rawTorrent, self._namespace)
  self._torrents[hash] = torrent
  if (self._seeder) self._seeder.add(torrent)
  return self._torrentStore.set(torrent.hash, rawTorrent).then(() => torrent)
}

TorrentWorker.prototype.remove = function (hash) {
  let self = this
  if (self._torrents[hash]) self._torrents[hash].destroy()
  if (self._seeder) self._seeder.remove(hash)
  delete self._torrents[hash]
  return self._torrentStore.remove(hash)
}

TorrentWorker.prototype.startSeeder = function () {
  let self = this
  if (self._seeder) return self._seeder
  self._seeder = new Seeder()

  let tabElect = new TabElect('torrentworker')
  tabElect.on('elected', self._seeder.start.bind(self._seeder))
  tabElect.on('deposed', self._seeder.stop.bind(self._seeder))

  self._torrentStore.on('set', function (change) {
    self._seeder.add(new Torrent(change.value, self._namespace))
  })

  self._torrentStore.values().then(rawTorrent => {
    rawTorrent.forEach(t => self._seeder.add(new Torrent(t, self._namespace)))
  })

  return self._seeder
}
