module.exports = File

/* global ReadableStream */

const ChunkStream = require('chunk-store-read-stream')
const toBlob = require('stream-to-blob')

File.WEBSTREAM_SUPPORT = typeof ReadableStream !== 'undefined'

function File (torrent, fileInfo) {
  this.name = fileInfo.name
  this.path = fileInfo.path
  this.length = fileInfo.length
  this.offset = fileInfo.offset
  this._torrent = torrent
}

File.prototype.getStream = function (opts) {
  opts = opts || {}
  let start = opts.start != null ? opts.start : 0
  let end = opts.end != null ? opts.end : this.length - 1

  if (start < 0 || end > this.length - 1 || start > end) {
    throw new Error('Range out of bounds')
  }

  if (this.length === 0) throw new Error('Cannot read empty file')

  // Add in the file's byte offset inside the torrent
  start += this.offset
  end += this.offset

  this._torrent._priority.add({ start: start, end: end }) // TODO only add if necessary

  let stream = new ChunkStream(this._torrent._chunkStore, {
    start: start,
    end: end,
    onmiss: this._onChunkMiss.bind(this)
  })
  stream.length = end - start + 1
  return stream
}

File.prototype.getWebStream = function (opts) {
  if (!File.WEBSTREAM_SUPPORT) throw new Error('No web ReadableStream support')
  opts = opts || {}

  let stream = this.getStream(opts)
  let webStream = new ReadableStream({start: start, pull: pull, cancel: cancel})
  webStream.length = stream.length
  return webStream

  function start (controller) {
    stream.on('data', chunk => {
      controller.enqueue(chunk)
      stream.pause()
    })
    stream.on('end', () => controller.close())
    stream.on('error', (e) => controller.error(e))
    stream.pause()
  }

  function pull () {
    stream.resume()
  }

  function cancel () {
    stream.destroy()
  }
}

File.prototype.getBlob = function (opts) {
  let self = this
  return new Promise(function (resolve, reject) {
    let stream = self.getStream(opts)
    toBlob(stream, function (err, blob) {
      if (err) return reject(err)
      resolve(blob)
    })
  })
}

File.prototype._onChunkMiss = function (err, index, cb) {
  if (err.name === 'MissingChunkError') {
    this._torrent._notifyOnChunkPut(index, cb)
  } else {
    cb(err)
  }
}
