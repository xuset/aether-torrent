/* eslint-env mocha, browser */

const PermaTorrent = require('../')
const assert = require('assert')
const parseTorrent = require('parse-torrent-file')
const base = '/base/test/www/'

describe('PermaTorrent', function () {
  this.timeout(8000)

  it('getAll() empty', function () {
    var pt = new PermaTorrent({namespace: random()})
    return pt.getAll()
    .then(torrents => assert.equal(torrents.length, 0))
    .then(() => pt.destroy())
  })

  it('add(url) then getAll()', function () {
    var pt = new PermaTorrent({namespace: random()})
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

  it('add(url) then getAll() - in different instances', function () {
    var namespace = random()
    var pt1 = new PermaTorrent({namespace: namespace})
    var pt2 = new PermaTorrent({namespace: namespace})
    return pt1.add(base + 'foobar.txt.torrent')
    .then(() => pt2.getAll())
    .then(torrents => {
      assert.equal(torrents.length, 1)
      pt1.destroy()
      pt2.destroy()
    })
  })

  it('add(url) then remove()', function () {
    var pt = new PermaTorrent({namespace: random()})
    return pt.add(base + 'foobar.txt.torrent')
    .then(t => pt.remove(t.infoHash))
    .then(() => pt.getAll())
    .then(torrents => assert.equal(torrents.length, 0))
    .then(() => pt.destroy())
  })

  it('add(url) then remove() - in different instances', function () {
    var namespace = random()
    var pt1 = new PermaTorrent({namespace: namespace})
    var pt2 = new PermaTorrent({namespace: namespace})
    var pt3 = new PermaTorrent({namespace: namespace})

    return pt1.add(base + 'foobar.txt.torrent')
    .then(() => pt2.getAll())
    .then(torrents => pt1.remove(torrents[0].infoHash))
    .then(() => pt2.getAll())
    .then(torrents => assert.equal(torrents.length, 1))
    .then(() => pt3.getAll())
    .then(torrents => assert.equal(torrents.length, 1))
    .then(() => {
      pt1.destroy()
      pt2.destroy()
      pt3.destroy()
    })
  })

  it('remove() - non existent', function () {
    var pt = new PermaTorrent({namespace: random()})
    return pt.remove('f00ba70000000000000000000000000000000000')
    .then(() => pt.destroy())
  })

  it('add(buffer) - Using torrent defined webseed', function () {
    var pt = new PermaTorrent({namespace: random()})
    pt.startSeeder()

    return fetch(base + 'foobar.txt.torrent')
    .then(response => response.arrayBuffer())
    .then(arrayBuffer => {
      var meta = parseTorrent(new Buffer(arrayBuffer))
      meta.urlList.push(new URL(base + 'foobar.txt', location.origin).toString())
      return pt.add(parseTorrent.encode(meta))
    })
    .then(t => nodeStreamToString(t.files[0].getStream()))
    .then(text => {
      assert.equal(text, 'foobar\n')
      pt.destroy()
    })
  })

  it('add(url) - Start seeder after add', function () {
    var pt = new PermaTorrent({namespace: random()})
    return pt.add(base + 'foobar.txt.torrent')
    .then(t => {
      pt.startSeeder()
      return nodeStreamToString(t.files[0].getStream())
    })
    .then(text => {
      assert.equal(text, 'foobar\n')
      pt.destroy()
    })
  })

  it('add(url) - for multi file torrent', function () {
    var pt = new PermaTorrent({namespace: random()})
    pt.startSeeder()

    return pt.add(base + 'multi.torrent')
    .then(torrent => {
      console.log('FILES', torrent.files.map(f => f.path))
      var fileA = torrent.getFile('multi/fileA')
      var fileB = torrent.getFile('multi/nested/fileB')

      assert.notEqual(fileA, undefined)
      assert.equal(fileA.name, 'fileA')
      assert.equal(fileA.path, 'multi/fileA')
      assert.equal(fileA.length, 6)
      assert.ok(fileA.offset >= 0)

      assert.notEqual(fileB, undefined)
      assert.equal(fileB.name, 'fileB')
      assert.equal(fileB.path, 'multi/nested/fileB')
      assert.equal(fileB.length, 6)
      assert.ok(fileB.offset >= 0)
    })
  })

  it('torrent.getFile()', function () {
    var pt = new PermaTorrent({namespace: random()})
    return pt.add(base + 'foobar.txt.torrent')
    .then(torrent => {
      var f = torrent.getFile('foobar.txt')
      assert.equal(f.path, 'foobar.txt')
      assert.equal(f.length, 7)
      assert.equal(f.mime, 'text/plain')
      assert.ok(typeof f.offset === 'number')
    })
    .then(() => pt.destroy())
  })

  it('torrent.getFile() - Check mime type', function () {
    var pt = new PermaTorrent({namespace: random()})
    return pt.add(base + 'index.html.torrent').then(torrent => {
      var f = torrent.getFile('index.html')
      assert.equal(f.path, 'index.html')
      assert.equal(f.mime, 'text/html')
    })
  })

  it('file.getStream()', function () {
    var pt = new PermaTorrent({namespace: random()})
    pt.startSeeder()
    return pt.add(base + 'foobar.txt.torrent', {webseeds: base + 'foobar.txt'})
    .then(torrent => nodeStreamToString(torrent.getFile('foobar.txt').getStream()))
    .then(text => assert.equal(text, 'foobar\n'))
    .then(() => pt.destroy())
  })

  it('file.getStream() - ranged', function () {
    var pt = new PermaTorrent({namespace: random()})
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
    var pt = new PermaTorrent({namespace: random()})
    pt.startSeeder()
    return pt.add(base + 'foobar.txt.torrent', {webseeds: base + 'foobar.txt'})
    .then(torrent => torrent.getFile('foobar.txt').getBlob())
    .then(blob => {
      assert.equal(blob.mime, 'text/plain')
      return blobToString(blob)
    })
    .then(text => assert.equal(text, 'foobar\n'))
    .then(() => pt.destroy())
  })

  it('file.getBlob() - ranged', function () {
    var pt = new PermaTorrent({namespace: random()})
    pt.startSeeder()
    return pt.add(base + 'foobar.txt.torrent', {webseeds: base + 'foobar.txt'})
    .then(torrent => torrent.getFile('foobar.txt').getBlob({start: 2, end: 4}))
    .then(blob => {
      assert.equal(blob.mime, 'text/plain')
      return blobToString(blob)
    })
    .then(text => assert.equal(text, 'oba'))
    .then(() => pt.destroy())
  })

  it('file.getBlob() - Check Mime', function () {
    var pt = new PermaTorrent({namespace: random()})
    pt.startSeeder()
    return pt.add(base + 'index.html.torrent', {webseeds: base + 'index.html'})
      .then(torrent => torrent.getFile('index.html').getBlob())
      .then(blob => {
        assert.equal(blob.mime, 'text/html')
      })
      .then(() => pt.destroy())
  })

  it('file.getWebStream()', function () {
    if (typeof ReadableStream === 'undefined') return Promise.resolve()
    var pt = new PermaTorrent({namespace: random()})
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
    var pt = new PermaTorrent({namespace: random()})
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

function random () {
  return Math.random().toString(16).substr(2)
}
