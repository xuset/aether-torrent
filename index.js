module.exports = PermaTorrent

/* global fetch, URL, location */

const IdbKvStore = require('idb-kv-store')
const parseTorrent = require('parse-torrent-file')
const TabElect = require('tab-elect')
const Torrent = require('./lib/torrent')
const Seeder = require('./lib/seeder')

function PermaTorrent (opts) {
  let self = this
  opts = opts || {}
  self.destroyed = false

  self._namespace = opts.namespace || 'permatorrent'
  self._torrents = {}
  self._seeder = null
  self._torrentStore = new IdbKvStore(self._namespace + '-torrents')

  self._torrentStore.on('set', function (change) {
    if (self._torrents[change.key]) return
    let t = self._torrents[change.key] || new Torrent(change.value, self._namespace)
    self._torrents[change.key] = t
    if (self._seeder) self._seeder.add(t)
  })
}

PermaTorrent.prototype.getAll = function () {
  let self = this
  if (self.destroyed) throw new Error('Instance already destroyed')

  return self._torrentStore.values().then(rawTorrents => {
    for (let i = 0; i < rawTorrents.length; i++) {
      let t = rawTorrents[i]
      self._torrents[t.infoHash] = self._torrents[t.infoHash] || new Torrent(t, self._namespace)
    }

    return Object.keys(self._torrents).map(k => self._torrents[k])
  })
}

PermaTorrent.prototype.add = function (torrentMetaBuffer, opts) {
  let self = this
  opts = opts || {}
  if (self.destroyed) throw new Error('Instance already destroyed')

  if (typeof torrentMetaBuffer === 'string') {
    return fetch(torrentMetaBuffer)
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => self.add(arrayBuffer, opts))
  }

  if (!Buffer.isBuffer(torrentMetaBuffer)) torrentMetaBuffer = new Buffer(torrentMetaBuffer)

  let infoHash = parseTorrent(new Buffer(torrentMetaBuffer)).infoHash
  if (infoHash in self._torrents) return Promise.resolve(self._torrents[infoHash])

  let webseeds = (typeof opts.webseeds === 'string' ? [opts.webseeds] : opts.webseeds) || []
  webseeds = webseeds.map(url => new URL(url, location.origin).toString())

  let rawTorrent = {
    torrentMetaBuffer: torrentMetaBuffer,
    infoHash: infoHash,
    webseeds: webseeds
  }

  let torrent = new Torrent(rawTorrent, self._namespace)
  self._torrents[infoHash] = torrent
  if (self._seeder) self._seeder.add(torrent)
  return self._torrentStore.set(torrent.infoHash, rawTorrent).then(() => torrent)
}

PermaTorrent.prototype.remove = function (infoHash) {
  let self = this
  if (self.destroyed) throw new Error('Instance already destroyed')
  if (self._torrents[infoHash]) self._torrents[infoHash].destroy()
  if (self._seeder) self._seeder.remove(infoHash)
  delete self._torrents[infoHash]
  return self._torrentStore.remove(infoHash)
}

PermaTorrent.prototype.startSeeder = function () {
  let self = this
  if (self.destroyed) throw new Error('Instance already destroyed')
  if (self._seeder) return self._seeder
  self._seeder = new Seeder()

  for (let infoHash in self._torrents) self._seeder.add(self._torrents[infoHash])

  let tabElect = new TabElect(self._namespace + '-tabelect')
  tabElect.on('elected', self._seeder.start.bind(self._seeder))
  tabElect.on('deposed', self._seeder.stop.bind(self._seeder))

  return self._seeder
}

PermaTorrent.prototype.destroy = function () {
  let self = this
  if (self.destroyed) return
  self.destroyed = true

  if (self.seeder != null) self.seeder.destroy()
  for (let infoHash in self._torrents) self._torrents[infoHash].close()
  self._torrentStore.close()

  self._torrents = null
  self._torrentStore = null
  self._seeder = null
}
