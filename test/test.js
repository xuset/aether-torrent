/* eslint-env browser, mocha */

// TODO add index.html to multi file torrent

var AetherTorrent = require('../')
var assert = require('assert')
var simpleGet = require('simple-get')
var parseTorrent = require('parse-torrent')
var WebTorrent = require('webtorrent')
var base = '/base/test/www/'

describe('AetherTorrent', function () {
  this.timeout(4000)

  it('torrent array empty', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    pt.on('ready', function () {
      assert.equal(pt.torrents.length, 0)
      pt.destroy()
      done()
    })
  })

  it('add(url)', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    pt.add(base + 'foobar.txt.torrent', function (err, torrent) {
      assert.equal(null, err)
      assert.equal(torrent.closed, false)
      assert.ok('infoHash' in torrent)
      assert.equal(pt.torrents.length, 1)
      assert.strictEqual(pt.torrents[0], torrent)
      pt.destroy()
      done()
    })
  })

  it('add(url) - in different instances', function (done) {
    var namespace = random()
    var pt1 = new AetherTorrent({namespace: namespace})
    var pt2 = new AetherTorrent({namespace: namespace})

    pt2.on('torrent', function (t) {
      assert.equal(pt2.torrents.length, 1)
      assert.strictEqual(t, pt2.torrents[0])
      pt1.destroy()
      pt2.destroy()
      done()
    })

    pt1.add(base + 'foobar.txt.torrent', function (err) {
      assert.equal(err, null)
    })
  })

  it('add(url) then remove()', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    pt.add(base + 'foobar.txt.torrent', function (err, t) {
      assert.equal(err, null)
      pt.remove(t.infoHash, function (err) {
        assert.equal(err, null)
        assert.equal(pt.torrents.length, 0)
        pt.destroy()
        done()
      })
    })
  })

  it('add(url) then remove() - in different instances', function (done) {
    var namespace = random()
    var pt1 = new AetherTorrent({namespace: namespace})
    var pt2 = new AetherTorrent({namespace: namespace})

    pt2.on('torrent', function (t) {
      assert.equal(pt2.torrents.length, 1)
      pt2.remove(t.infoHash, function (err) {
        assert.equal(err, null)
        assert.equal(pt2.torrents.length, 0)
        assert.equal(pt1.torrents.length, 1)
        pt1.destroy()
        pt2.destroy()
        done()
      })
    })

    pt1.add(base + 'foobar.txt.torrent', function (err) {
      assert.equal(err, null)
    })
  })

  it('remove() - non existent', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    pt.remove('f00ba70000000000000000000000000000000000', function (err) {
      assert.equal(null, err)
      pt.destroy()
      done()
    })
  })

  it('add(url) - for multi file torrent', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    pt.add(base + 'multi.torrent', function (err, t) {
      assert.equal(err, null)

      var fileA = t.getFile('multi/fileA')
      var fileB = t.getFile('multi/nested/fileB')

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

      pt.destroy()
      done()
    })
  })

  it('torrent.getFile()', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    pt.add(base + 'foobar.txt.torrent', function (err, t) {
      assert.equal(err, null)
      var f = t.getFile('foobar.txt')
      assert.equal(f.path, 'foobar.txt')
      assert.equal(f.length, 7)
      assert.equal(f.mime, 'text/plain')
      assert.equal(f.offset, 0)
      pt.destroy()
      done()
    })
  })

  it('torrent.getFile() - non normalized path', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    pt.add(base + 'foobar.txt.torrent', function (err, t) {
      assert.equal(err, null)
      assert.notEqual(t.getFile('foobar.txt'), undefined)
      assert.notEqual(t.getFile('/foobar.txt'), undefined)
      assert.notEqual(t.getFile('/foo/../foobar.txt'), undefined)
      assert.notEqual(t.getFile('/./foobar.txt'), undefined)
      pt.destroy()
      done()
    })
  })

  it('torrent.getFile() - check mime type', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    pt.add(base + 'index.html.torrent', function (err, t) {
      assert.equal(err, null)
      var f = t.getFile('index.html')
      assert.equal(f.path, 'index.html')
      assert.equal(f.mime, 'text/html')
      pt.destroy()
      done()
    })
  })

  it('file.getStream()', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: new URL(base + 'foobar.txt', location.origin).toString()}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, t) {
      assert.equal(err, null)
      var stream = t.getFile('foobar.txt').getStream()
      assert.equal(stream.length, 7)
      nodeStreamToString(stream, function (err, text) {
        assert.equal(err, null)
        assert.equal(text, 'foobar\n')
        pt.destroy()
        done()
      })
    })
  })

  it('torrent.getStream()', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: new URL(base + 'foobar.txt', location.origin).toString()}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, t) {
      assert.equal(err, null)
      var stream = t.getStream()
      assert.equal(stream.length, 7)
      nodeStreamToString(stream, function (err, text) {
        assert.equal(err, null)
        assert.equal(text, 'foobar\n')
        pt.destroy()
        done()
      })
    })
  })

  it('add(buffer) - Using torrent defined webseed', function (done) {
    simpleGet.concat(base + 'foobar.txt.torrent', function (err, res, data) {
      assert.equal(err, null)
      assert.equal(res.statusCode, 200)

      var pt = new AetherTorrent({namespace: random()})
      var meta = parseTorrent(data)
      meta.urlList.push(new URL(base + 'foobar.txt', location.origin).toString())
      pt.add(parseTorrent.toTorrentFile(meta), function (err, t) {
        assert.equal(err, null)
        nodeStreamToString(t.files[0].getStream(), function (err, text) {
          assert.equal(err, null)
          assert.equal(text, 'foobar\n')
          pt.destroy()
          done()
        })
      })
    })
  })

  it('file.getStream() - ranged', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)
      var stream = torrent.getFile('foobar.txt').getStream({start: 2, end: 4})
      assert.equal(stream.length, 3)
      nodeStreamToString(stream, function (err, text) {
        assert.equal(err, null)
        assert.equal(text, 'oba')
        pt.destroy()
        done()
      })
    })
  })

  it('file.getStream() - bad range', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)
      var file = torrent.getFile('foobar.txt')
      assert.throws(() => file.getStream({start: -1, end: 4}))
      assert.throws(() => file.getStream({start: 1, end: 0}))
      assert.throws(() => file.getStream({start: 8, end: 9}))
      pt.destroy()
      done()
    })
  })

  it('file.getStream() - full range', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)
      var stream = torrent.getFile('foobar.txt').getStream({start: 0, end: 6})
      assert.equal(stream.length, 7)
      nodeStreamToString(stream, function (err, text) {
        assert.equal(err, null)
        assert.equal(text, 'foobar\n')
        pt.destroy()
        done()
      })
    })
  })

  it('file.getStream() - zero range', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)
      var stream = torrent.getFile('foobar.txt').getStream({start: 0, end: 0})
      assert.equal(stream.length, 1)
      nodeStreamToString(stream, function (err, text) {
        assert.equal(err, null)
        assert.equal(text, 'f')
        pt.destroy()
        done()
      })
    })
  })

  it('file.getBlob()', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)
      torrent.getFile('foobar.txt').getBlob(function (err, blob) {
        assert.equal(err, null)
        assert.equal(blob.type, 'text/plain')
        blobToString(blob, function (err, text) {
          assert.equal(err, null)
          assert.equal(text, 'foobar\n')
          pt.destroy()
          done()
        })
      })
    })
  })

  it('file.getBlob() - ranged', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)
      torrent.getFile('foobar.txt').getBlob({start: 2, end: 4}, function (err, blob) {
        assert.equal(err, null)
        assert.equal(blob.type, 'text/plain')
        blobToString(blob, function (err, text) {
          assert.equal(err, null)
          assert.equal(text, 'oba')
          pt.destroy()
          done()
        })
      })
    })
  })

  it('file.getWebStream()', function (done) {
    if (typeof ReadableStream === 'undefined') return done()

    var opts = {webseeds: base + 'foobar.txt'}
    var pt = new AetherTorrent({namespace: random()})
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)
      var webStream = torrent.getFile('foobar.txt').getWebStream()
      assert.equal(webStream.length, 7)
      webStreamToString(webStream, function (err, text) {
        assert.equal(err, null)
        assert.equal(text, 'foobar\n')
        pt.destroy()
        done()
      })
    })
  })

  it('file.getWebStream() - ranged', function (done) {
    if (typeof ReadableStream === 'undefined') return done()

    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)
      var webStream = torrent.getFile('foobar.txt').getWebStream({start: 2, end: 4})
      assert.equal(webStream.length, 3)
      webStreamToString(webStream, function (err, text) {
        assert.equal(err, null)
        assert.equal(text, 'oba')
        pt.destroy()
        done()
      })
    })
  })

  it('file.renderTo()', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)

      var tempElem = document.createElement('iframe')
      document.body.append(tempElem)

      torrent.getFile('foobar.txt').renderTo(tempElem, function (err) {
        assert.equal(err, null)
        done()
      })
    })
  })

  it('file.appendTo()', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)

      var tempElem = document.createElement('div')
      document.body.append(tempElem)

      torrent.getFile('foobar.txt').appendTo(tempElem, function (err) {
        assert.equal(err, null)
        done()
      })
    })
  })

  it('file.getBuffer()', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)

      torrent.getFile('foobar.txt').getBuffer(function (err, buffer) {
        assert.equal(err, null)
        assert.ok(buffer.equals(Buffer.from('foobar\n')))
        done()
      })
    })
  })

  it('file.getBlobURL()', function (done) {
    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts, function (err, torrent) {
      assert.equal(err, null)

      torrent.getFile('foobar.txt').getBlobURL(function (err, url) {
        assert.equal(err, null)
        assert.ok(typeof url === 'string')
        done()
      })
    })
  })

  it('promises', function (done) {
    if (typeof Promise === 'undefined') return done()

    var pt = new AetherTorrent({namespace: random()})
    var opts = {webseeds: base + 'foobar.txt'}
    pt.add(base + 'foobar.txt.torrent', opts)
    .then(function (torrent) { return torrent.files[0].getBlob() })
    .then(function (blob) {
      return new Promise(function (resolve, reject) {
        blobToString(blob, function (err, text) {
          if (err) reject(err)
          else resolve(text)
        })
      })
    })
    .then(text => {
      assert.equal(text, 'foobar\n')
      return pt.remove(pt.torrents[0].infoHash)
    })
    .then(done)
    .catch(done)
  })
})

it.skip('add(magnetURI) and stream file', function (done) {
  var pt = new AetherTorrent({namespace: random()})
  var seeder = new WebTorrent()
  simpleGet.concat(base + 'foobar.txt', function (err, res, data) {
    assert.equal(err, null)
    assert.equal(res.statusCode, 200)
    data.name = 'foobar.txt'
    seeder.seed(data, function (torrent) {
      pt.add(torrent.magnetURI, function (err, t) {
        assert.equal(err, null)
        var stream = t.files[0].getStream()
        assert.equal(stream.length, 7)
        nodeStreamToString(stream, function (err, text) {
          assert.equal(err, null)
          assert.equal(text, 'foobar\n')
          pt.destroy()
          seeder.destroy()
          done()
        })
      })
    })
  })
})

function nodeStreamToString (stream, cb) {
  var buffer = ''
  stream.on('data', chunk => {
    buffer += chunk.toString()
  })
  stream.on('end', (c) => {
    cb(null, buffer)
  })
  stream.on('error', (err) => {
    cb(err)
  })
}

function blobToString (blob, cb) {
  var fr = new window.FileReader()
  fr.onload = onload
  fr.onerror = onerror
  fr.readAsText(blob)

  function onload () {
    cb(null, fr.result)
  }

  function onerror () {
    cb(fr.error)
  }
}

function webStreamToString (stream, cb) {
  var reader = stream.getReader()
  var buffer = ''
  reader.read().then(onRead)

  function onRead (result) {
    if (result.done) return cb(null, buffer)

    buffer += result.value.toString()
    reader.read().then(onRead)
  }
}

function random () {
  return Math.random().toString(16).substr(2)
}
