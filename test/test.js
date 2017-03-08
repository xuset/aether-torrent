/* eslint-env mocha, browser */
/* global TorrentWorker */

const assert = require('assert')
const torrentURL = '/base/test/a.torrent'

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
})
