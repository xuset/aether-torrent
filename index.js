module.exports = AetherTorrent

/* global URL, location */

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var parseTorrent = require('parse-torrent')
var promisize = require('promisize')
var TabElect = require('tab-elect')
var TorrentStore = require('./lib/torrentstore')
var Torrent = require('./lib/torrent')
var Seeder = require('./lib/seeder')

inherits(AetherTorrent, EventEmitter)
function AetherTorrent (opts) {
  if (!(this instanceof AetherTorrent)) return new AetherTorrent(opts)
  EventEmitter.call(this)

  var self = this
  opts = opts || {}
  self.destroyed = false

  self.torrents = []
  self.ready = false

  self._namespace = opts.namespace || 'aethertorrent'
  self._torrentStore = new TorrentStore(self._namespace)
  self._tabElect = null
  self._seeder = null

  if (typeof window !== 'undefined') {
    self._seeder = new Seeder() // TODO pass opts to wt
    self._tabElect = new TabElect(self._namespace + '-tabelect')
    self._tabElect.on('elected', self._seeder.start.bind(self._seeder))
    self._tabElect.on('deposed', self._seeder.stop.bind(self._seeder))
  }

  self._torrentStore.on('add', function (rawTorrent) {
    self._onAdd(rawTorrent)
  })

  self._torrentStore.getAll(function (err, values) {
    if (err) return self.emit('error', err)
    values.forEach(function (v) { self._onAdd(v) })
    self.ready = true
    self.emit('ready')
  })
}

AetherTorrent.prototype.get = function (infoHash) {
  if (this.destroyed) throw new Error('Instance is destroyed')
  for (var i = 0; i < this.torrents.length; i++) {
    if (this.torrents[i].infoHash === infoHash) return this.torrents[i]
  }
  return undefined
}

AetherTorrent.prototype.add = function (torrentId, opts, cb) {
  var self = this
  if (self.destroyed) throw new Error('Instance is destroyed')
  if (typeof opts === 'function') return self.add(torrentId, null, opts)
  opts = opts || {}
  cb = promisize(cb)

  if (!self.ready) {
    self.once('ready', function () {
      if (self.destroyed) return
      self.add(torrentId, opts, cb)
    })
    return cb.promise
  }

  var webseeds = (typeof opts.webseeds === 'string' ? [opts.webseeds] : opts.webseeds) || []
  webseeds = webseeds.map(function (url) { return new URL(url, location.origin).toString() })

  if (typeof torrentId === 'string' && torrentId.startsWith('/')) {
    torrentId = new URL(torrentId, location.origin).toString()
  }

  if (torrentId instanceof ArrayBuffer) torrentId = Buffer.from(torrentId)

  parseTorrent.remote(torrentId, function (err, torrentMeta) {
    if (err) return cb(err)
    if (self.destroyed) return
    if (self.get(torrentMeta.infoHash)) return cb(null, self.get(torrentMeta.infoHash))
    var rawTorrent = {
      magnetURI: parseTorrent.toMagnetURI(torrentMeta),
      infoHash: torrentMeta.infoHash,
      webseeds: webseeds
    }
    // if the full meta data exists
    if (torrentMeta.info) rawTorrent.torrentMetaBuffer = parseTorrent.toTorrentFile(torrentMeta)

    self._torrentStore.add(torrentMeta.infoHash, rawTorrent, function (err) {
      if (err) return cb(err)
      self._onAdd(rawTorrent, cb)
    })
  })

  return cb.promise
}

AetherTorrent.prototype._onAdd = function (rawTorrent, cb) {
  var self = this
  if (self.destroyed) return

  // Torrents are 're-added' when the torrentMeta is retreived from peers
  var torrent = self.get(rawTorrent.infoHash)
  if (!torrent) {
    var torrentDB = self._torrentStore.connectTorrentDB(rawTorrent.infoHash)
    torrent = new Torrent(rawTorrent.infoHash, rawTorrent.webseeds, torrentDB)
    torrent.once('ready', onready)
    self.torrents.push(torrent)
  }

  torrent.updateMeta(parseTorrent(rawTorrent.torrentMetaBuffer
    ? Buffer.from(rawTorrent.torrentMetaBuffer)
    : rawTorrent.magnetURI))
  if (self._seeder) self._seeder.add(torrent)

  function onready () {
    if (self.destroyed) return
    self.emit('torrent', torrent)
    if (cb) cb(null, torrent)
  }
}

AetherTorrent.prototype.remove = function (infoHash, cb) {
  var self = this
  if (self.destroyed) throw new Error('Instance already destroyed')
  cb = promisize(cb)

  if (!self.ready) {
    self.once('ready', function () {
      if (self.destroyed) return
      self.remove(infoHash, cb)
    })
    return cb.promise
  }

  var index = self.torrents.findIndex(function (t) { return t.infoHash === infoHash })
  var torrent = self.torrents[index]
  if (torrent) {
    self.torrents.splice(index, 1)
    torrent.destroy()
  }

  if (self._seeder) self._seeder.remove(infoHash)
  self._torrentStore.remove(infoHash, cb)
  return cb.promise
}

AetherTorrent.prototype.destroy = function () {
  var self = this
  if (self.destroyed) return
  self.destroyed = true

  for (var infoHash in self.torrents) self.torrents[infoHash].close()
  if (self.seeder != null) self.seeder.destroy()
  self._torrentStore.close()
  self._tabElect.destroy()

  self._tabElect = null
  self.torrents = null
  self._torrentStore = null
  self._seeder = null
}
