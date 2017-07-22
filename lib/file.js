module.exports = File

/* global ReadableStream */

var toBlob = require('stream-to-blob')
var mime = require('mime')
var promisize = require('promisize')
var render = require('render-media')
var streamToBuffer = require('stream-with-known-length-to-buffer')

File.WEBSTREAM_SUPPORT = typeof ReadableStream !== 'undefined'

function File (torrent, fileInfo) {
  this.name = fileInfo.name
  this.path = fileInfo.path
  this.length = fileInfo.length
  this.offset = fileInfo.offset

  this.mime = mime.lookup(fileInfo.path)

  this._torrent = torrent
}

File.prototype.getStream = function (opts) {
  opts = opts || {}
  var start = opts.start != null ? opts.start : 0
  var end = opts.end != null ? opts.end : this.length - 1

  if (end > this.length - 1) end = this.length - 1

  if (start < 0 || start > end) {
    throw new Error('Range out of bounds')
  }

  // Add in the file's byte offset inside the torrent
  start += this.offset
  end += this.offset

  return this._torrent.getStream({ start: start, end: end })
}

File.prototype.createReadStream = File.prototype.getStream

File.prototype.getWebStream = function (opts) {
  if (!File.WEBSTREAM_SUPPORT) throw new Error('No web ReadableStream support')
  opts = opts || {}

  var stream = this.getStream(opts)
  var webStream = new ReadableStream({start: start, pull: pull, cancel: cancel})
  webStream.length = stream.length
  return webStream

  function start (controller) {
    stream.on('data', function (chunk) {
      controller.enqueue(chunk)
      stream.pause()
    })
    stream.on('end', function () { controller.close() })
    stream.on('error', function (err) { controller.error(err) })
    stream.pause()
  }

  function pull () {
    stream.resume()
  }

  function cancel () {
    stream.destroy()
  }
}

File.prototype.getBlob = function (opts, cb) {
  var self = this
  if (typeof opts === 'function') return self.getBlob(null, opts)

  cb = promisize(cb)
  var stream = self.getStream(opts)
  toBlob(stream, self.mime, cb)
  return cb.promise
}

File.prototype.renderTo = function (elem, opts, cb) {
  cb = promisize(cb)
  render.render(this, elem, opts, cb)
  return cb.promise
}

File.prototype.appendTo = function (elem, opts, cb) {
  cb = promisize(cb)
  render.append(this, elem, opts, cb)
  return cb.promise
}

File.prototype.getBuffer = function (cb) {
  cb = promisize(cb)
  streamToBuffer(this.getStream(), this.length, cb)
  return cb.promise
}
