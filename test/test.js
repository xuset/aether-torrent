/* eslint-env mocha, browser */

const PermaTorrent = require('../')
const assert = require('assert')
const base = '/base/test/www/'

describe('PermaTorrent', function () {
  this.timeout(8000)

  it('getAll() empty', function () {
    var pt = new PermaTorrent({namespace: Math.random()})
    return pt.getAll()
    .then(torrents => assert.equal(torrents.length, 0))
    .then(() => pt.destroy())
  })

  it('add(url) then getAll()', function () {
    var pt = new PermaTorrent({namespace: Math.random()})
    return pt.add(base + 'foobar.txt.torrent')
    .then(t => {
      assert.equal(t.closed, false)
      assert.ok('infoHash' in t)
      return pt.getAll()
      .then(torrents => {
        assert.equal(torrents.length, 1)
        assert.strictEqual(torrents[0], t)
      })
    })
    .then(() => pt.destroy())
  })

  it('add(url) then remove()', function () {
    var pt = new PermaTorrent({namespace: Math.random()})
    return pt.add(base + 'foobar.txt.torrent')
    .then(t => pt.remove(t.infoHash))
    .then(() => pt.getAll())
    .then(torrents => assert.equal(torrents.length, 0))
    .then(() => pt.destroy())
  })

  it('torrent.getFile()', function () {
    var pt = new PermaTorrent({namespace: Math.random()})
    return pt.add(base + 'foobar.txt.torrent')
    .then(torrent => {
      var f = torrent.getFile('foobar.txt')
      assert.equal(f.path, 'foobar.txt')
      assert.equal(f.length, 7)
      assert.ok(typeof f.offset === 'number')
    })
    .then(() => pt.destroy())
  })

  it('file.getStream()', function () {
    var pt = new PermaTorrent({namespace: Math.random()})
    pt.startSeeder()
    return pt.add(base + 'foobar.txt.torrent', {webseeds: base + 'foobar.txt'})
    .then(torrent => nodeStreamToString(torrent.getFile('foobar.txt').getStream()))
    .then(text => assert.equal(text, 'foobar\n'))
    .then(() => pt.destroy())
  })

  it('file.getStream() - ranged', function () {
    var pt = new PermaTorrent({namespace: Math.random()})
    pt.startSeeder()
    return pt.add(base + 'foobar.txt.torrent', {webseeds: base + 'foobar.txt'})
    .then(torrent => {
      let stream = torrent.getFile('foobar.txt').getStream({start: 2, end: 4})
      return nodeStreamToString(stream)
    })
    .then(text => assert.equal(text, 'oba'))
    .then(() => pt.destroy())
  })

  it('file.getBlob()', function () {
    var pt = new PermaTorrent({namespace: Math.random()})
    pt.startSeeder()
    return pt.add(base + 'foobar.txt.torrent', {webseeds: base + 'foobar.txt'})
    .then(torrent => torrent.getFile('foobar.txt').getBlob())
    .then(blob => blobToString(blob))
    .then(text => assert.equal(text, 'foobar\n'))
    .then(() => pt.destroy())
  })

  it('file.getBlob() - ranged', function () {
    var pt = new PermaTorrent({namespace: Math.random()})
    pt.startSeeder()
    return pt.add(base + 'foobar.txt.torrent', {webseeds: base + 'foobar.txt'})
    .then(torrent => torrent.getFile('foobar.txt').getBlob({start: 2, end: 4}))
    .then(blob => blobToString(blob))
    .then(text => assert.equal(text, 'oba'))
    .then(() => pt.destroy())
  })

  it('file.getWebStream()', function () {
    if (typeof ReadableStream === 'undefined') return Promise.resolve()
    var pt = new PermaTorrent({namespace: Math.random()})
    pt.startSeeder()
    return pt.add(base + 'foobar.txt.torrent', {webseeds: base + 'foobar.txt'})
    .then(torrent => {
      let webStream = torrent.getFile('foobar.txt').getWebStream()
      assert.equal(webStream.length, 7)
      return webStreamToString(webStream)
    })
    .then(text => assert.equal(text, 'foobar\n'))
    .then(() => pt.destroy())
  })

  it('file.getWebStream() - ranged', function () {
    if (typeof ReadableStream === 'undefined') return Promise.resolve()
    var pt = new PermaTorrent({namespace: Math.random()})
    pt.startSeeder()
    return pt.add(base + 'foobar.txt.torrent', {webseeds: base + 'foobar.txt'})
    .then(torrent => {
      let webStream = torrent.getFile('foobar.txt').getWebStream({start: 2, end: 4})
      assert.equal(webStream.length, 3)
      return webStreamToString(webStream)
    })
    .then(text => assert.equal(text, 'oba'))
    .then(() => pt.destroy())
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

function blobToString (blob) {
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
