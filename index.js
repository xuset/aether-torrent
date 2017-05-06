module.exports = AetherTorrent

/* global URL, location */

var EventEmitter = require('events').EventEmitter
var inherits = require('inherits')
var simpleGet = require('simple-get')
var parseTorrent = require('parse-torrent-file')
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

  if (typeof torrentId === 'string') { // torrentId is a url
    simpleGet.concat(torrentId, function (err, res, data) {
      if (err) return cb(err)
      if (res.statusCode !== 200) return cb(new Error('Server sent a non 200 http response'))
      self._addFromBuffer(data, opts, cb)
    })
  } else {
    self._addFromBuffer(torrentId, opts, cb)
  }

  return cb.promise
}

AetherTorrent.prototype._addFromBuffer = function (torrentMetaBuffer, opts, cb) {
  var self = this

  torrentMetaBuffer = Buffer.from(torrentMetaBuffer)
  var infoHash = parseTorrent(torrentMetaBuffer).infoHash
  if (self.get(infoHash)) return cb(null, self.get(infoHash))

  var webseeds = (typeof opts.webseeds === 'string' ? [opts.webseeds] : opts.webseeds) || []
  webseeds = webseeds.map(function (url) { return new URL(url, location.origin).toString() })

  var rawTorrent = {
    torrentMetaBuffer: torrentMetaBuffer,
    infoHash: infoHash,
    webseeds: webseeds
  }

  self._torrentStore.add(infoHash, rawTorrent, function (err) {
    if (err) return cb(err)
    self._onAdd(rawTorrent)
    cb(null, self.get(rawTorrent.infoHash))
  })
}

AetherTorrent.prototype._onAdd = function (rawTorrent) {
  var self = this
  if (self.destroyed) return
  if (self.get(rawTorrent.infoHash)) return

  var torrent = new Torrent(rawTorrent, self._namespace)
  self.torrents.push(torrent)
  if (self._seeder) self._seeder.add(torrent)
  self.emit('torrent', torrent)
}

AetherTorrent.prototype.remove = function (infoHash, cb) {
  var self = this
  if (self.destroyed) throw new Error('Instance already destroyed')
  cb = promisize(cb)

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

  if (self.seeder != null) self.seeder.destroy()
  for (var infoHash in self._torrents) self._torrents[infoHash].close()
  self._torrentStore.close()
  self._tabElect.destroy()

  self._tabElect = null
  self._torrents = null
  self._torrentStore = null
  self._seeder = null
}
