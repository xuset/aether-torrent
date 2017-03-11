/* eslint-env mocha, browser */
/* global TorrentWorker */

const assert = require('assert')
const torrentURL = '/base/test/a.torrent'

localStorage.debug = 'webtorrent*'

describe('TorrentWorker', function () {
  this.timeout(8000)

  it('getAll() empty', function () {
    var tw = new TorrentWorker({namespace: Math.random()})
    return tw.getAll()
    .then(torrents => assert.equal(torrents.length, 0))
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
  })

  it('add(url) then remove()', function () {
    var tw = new TorrentWorker({namespace: Math.random()})
    return tw.add(torrentURL)
    .then(t => tw.remove(t.hash))
    .then(() => tw.getAll())
    .then(torrents => assert.equal(torrents.length, 0))
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
  })

  // it('file.getStream()', function () {
  //   var tw = new TorrentWorker({namespace: Math.random()})
  //   tw.startSeeder()
  //   return tw.add(torrentURL)
  //   .then(torrent => torrent.getFile('foobar.txt').getStream())
  //   .then(stream => nodeStreamToString(stream))
  //   .then(text => assert.equals(text, 'foobar\n'))
  // })
})

// function nodeStreamToString (stream) {
//   return new Promise(function (resolve, reject) {
//     let buffer = ''
//     stream.on('data', chunk => {
//       buffer += chunk.toString()
//     })
//     stream.on('end', (c) => {
//       resolve(buffer)
//     })
//     stream.on('error', (err) => {
//       reject(err)
//     })
//   })
// }
