/* eslint-env mocha, browser */

const TorrentWorker = require('../')
const assert = require('assert')
const torrentURL = '/base/test/a.torrent'

localStorage.debug = 'webtorrent*'

describe('TorrentWorker', function () {
  this.timeout(8000)

  it('getAll() empty', function () {
    var tw = new TorrentWorker({namespace: Math.random()})
    return tw.getAll()
    .then(torrents => assert.equal(torrents.length, 0))
    .then(() => tw.destroy())
  })

  it('add(url) then getAll()', function () {
    var tw = new TorrentWorker({namespace: Math.random()})
    return tw.add(torrentURL)
    .then(t => {
      assert.equal(t.closed, false)
      assert.ok('hash' in t)
      return tw.getAll()
      .then(torrents => {
        assert.equal(torrents.length, 1)
        assert.strictEqual(torrents[0], t)
      })
    })
    .then(() => tw.destroy())
  })

  it('add(url) then remove()', function () {
    var tw = new TorrentWorker({namespace: Math.random()})
    return tw.add(torrentURL)
    .then(t => tw.remove(t.hash))
    .then(() => tw.getAll())
    .then(torrents => assert.equal(torrents.length, 0))
    .then(() => tw.destroy())
  })

  it('torrent.getFile()', function () {
    var tw = new TorrentWorker({namespace: Math.random()})
    return tw.add(torrentURL)
    .then(torrent => {
      var f = torrent.getFile('foobar.txt')
      assert.equal(f.path, 'foobar.txt')
      assert.equal(f.length, 7)
      assert.ok(typeof f.offset === 'number')
    })
    .then(() => tw.destroy())
  })

  it('file.getStream()', function () {
    var tw = new TorrentWorker({namespace: Math.random()})
    tw.startSeeder()
    return tw.add(torrentURL)
    .then(torrent => torrent.getFile('foobar.txt').getStream())
    .then(stream => nodeStreamToString(stream))
    .then(text => assert.equal(text, 'foobar\n'))
    .then(() => tw.destroy())
  })

  it('file.getStream() - ranged', function () {
    var tw = new TorrentWorker({namespace: Math.random()})
    tw.startSeeder()
    return tw.add(torrentURL)
    .then(torrent => torrent.getFile('foobar.txt').getStream({start: 2, end: 4}))
    .then(stream => nodeStreamToString(stream))
    .then(text => assert.equal(text, 'oba'))
    .then(() => tw.destroy())
  })

  it('file.getBlob()', function () {
    var tw = new TorrentWorker({namespace: Math.random()})
    tw.startSeeder()
    return tw.add(torrentURL)
    .then(torrent => torrent.getFile('foobar.txt').getBlob())
    .then(blob => blobToText(blob))
    .then(text => assert.equal(text, 'foobar\n'))
    .then(() => tw.destroy())
  })

  it('file.getBlob() - ranged', function () {
    var tw = new TorrentWorker({namespace: Math.random()})
    tw.startSeeder()
    return tw.add(torrentURL)
    .then(torrent => torrent.getFile('foobar.txt').getBlob({start: 2, end: 4}))
    .then(blob => blobToText(blob))
    .then(text => assert.equal(text, 'oba'))
    .then(() => tw.destroy())
  })

  it('file.getWebStream()', function () {
    if (typeof ReadableStream === 'undefined') return Promise.resolve()
    var tw = new TorrentWorker({namespace: Math.random()})
    tw.startSeeder()
    return tw.add(torrentURL)
    .then(torrent => torrent.getFile('foobar.txt').getWebStream())
    .then(stream => {
      assert.equal(stream.length, 7)
      return webStreamToString(stream)
    })
    .then(text => assert.equal(text, 'foobar\n'))
    .then(() => tw.destroy())
  })

  it('file.getWebStream() - ranged', function () {
    if (typeof ReadableStream === 'undefined') return Promise.resolve()
    var tw = new TorrentWorker({namespace: Math.random()})
    tw.startSeeder()
    return tw.add(torrentURL)
    .then(torrent => torrent.getFile('foobar.txt').getWebStream({start: 2, end: 4}))
    .then(stream => {
      assert.equal(stream.length, 3)
      return webStreamToString(stream)
    })
    .then(text => assert.equal(text, 'oba'))
    .then(() => tw.destroy())
  })
})

function nodeStreamToString (stream) {
  return new Promise(function (resolve, reject) {
    let buffer = ''
    stream.on('data', chunk => {
      buffer += chunk.toString()
    })
    stream.on('end', (c) => {
      resolve(buffer)
    })
    stream.on('error', (err) => {
      reject(err)
    })
  })
}

function blobToText (blob) {
  return new Promise(function (resolve, reject) {
    let fr = new window.FileReader()
    fr.onload = onload
    fr.onerror = onerror
    fr.readAsText(blob)

    function onload () {
      resolve(fr.result)
    }

    function onerror () {
      reject(fr.error)
    }
  })
}

function webStreamToString (stream) {
  return new Promise(function (resolve, reject) {
    let reader = stream.getReader()
    let buffer = ''
    reader.read().then(onRead)

    function onRead (result) {
      if (result.done) return resolve(buffer)

      buffer += result.value.toString()
      reader.read().then(onRead)
    }
  })
}
