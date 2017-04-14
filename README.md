# Perma-Torrent [![Build Status](https://travis-ci.org/xuset/perma-torrent.svg?branch=master)](https://travis-ci.org/xuset/perma-torrent) [![npm](https://img.shields.io/npm/v/perma-torrent.svg)](https://npmjs.org/package/perma-torrent)

#### A single webtorrent client shared by all web pages and workers

[![Sauce Test Status](https://saucelabs.com/browser-matrix/xuset-perma-torrent.svg)](https://saucelabs.com/u/xuset-perma-torrent)

Each Perma-Torrent instance shares a single [webtorrent](http://webtorrent.io) client between all web pages and workers. So when a torrent is added in one context all other contexts are able to see that this torrent was added and can stream the downloading torrent. The benefit of this is that through behind-the-scene delegation only one web page does the actual downloading and seeding of the torrent instead of each web page. Additionally web workers are able to add and stream torrents just as web pages can. This shared client architecture also inherently persists it's state to IndexedDB so when a web page is reponed after the browser closed, it still has access to all the added torrents and their data.

## Usage

#### Add a torrent then stream a file in a web page

```js
var pt = new PermaTorrent()

pt.add('//foobar.torrent', function (err, torrent) {
  if (err) throw err
  var stream = torrent.files[0].getStream()
})
```

#### Add a torrent then stream a file in a *web worker*

The exact same code above can be used in the web worker. The only caveat is that to download the torrent, there **must** be a web page that has instantiated PermaTorrent. This is because the actual torrent downloading must happen in a webpage since web workers do not have access to the WebRTC api.

In a web page:
```js
/* At least one web page has to have a PermaTorrent instance
   so the download can be delegated to a web page */
var pt = new PermaTorrent()
```

In a web worker:
```js
// Exact same code in the first example
var pt = new PermaTorrent()

pt.add('//foobar.torrent', function (err, torrent) {
  if (err) throw err
  // Returns NodeJS style stream
  var stream = torrent.files[0].getStream()
})
```

#### List all the torrents the shared client holds

```js
var pt = new PermaTorrent()

pt.on('ready', function() {
  console.log(pt.torrents)
})
```

#### Get notified when a new torrent is added to the shared client

```js
var pt = new PermaTorrent()

pt.on('torrent', function(torrent) {
  console.log(torrent)
  console.log(pt.torrents) // It is also added pt.torrents
})
```

#### Optional promises are supported alongside callbacks
```js
var pt = new PermaTorrent()

pt.add('//foobar.torrent')
.then(torrent => torrent.files[0].getBlob())
.then(blob => console.log(blob))
```

## API

The API uses NodeJS style callbacks but also supports promises in methods that accept a callback. If a callback is not given to one of these methods then the method will return a promise.

### `var pt = new PermaTorrent([opts])`

All instances by default share the same underlying storage and client so adding a torrent to one instance adds it to all instances. To separate instances from one another define `opts.namespace`. The `opts` argument can take the following properties:

 * `opts.namespace` - Unique string used to insulate instances from each other. Defaults to 'permatorrent'

### `pt.add(torrentId, [opts], [function callback (err, torrent) {}])`

Adds the given torrent to the instance and all other instances within the same namespace. `torrentId` must be a buffer of the '.torrent' file or a string url to the '.torrent' file. `torrent` is an instance of `Torrent` which is documented below.

`opts` can have the following properties:

* `opts.webseeds` - an array of webseed urls

### `pt.torrents`

The list of `Torrent` instances that are shared between all web pages and workers. Listen for the 'ready' event to be notified when the list is fully populated.


### `var torrent = pt.get(infoHash)`

Shorthand for iterating of the `pt.torrents` list and returning the torrent with the given `infoHash` or `undefined` if no torrent has that `infoHash`.

### `pt.on('ready', function onready () {})`

  `pt.torrents` is now fully populated with all the existing torrents

### `pt.on('torrent', function ontorrent (torrent) {})`

  Emitted when a PermaTorrent instance adds a new torrent

### `pt.remove(infoHash, [function callback (err) {}])`

Removes the given torrent with the given `infoHash`

### `pt.destroy()`

Frees the internal resources of the instance without destroying the underlying torrent data.

## API - Torrent

### `torrent.infoHash`

The content based hash of the torrent that uniquely identifies it

### `torrent.files`

An array of `File` instances that allow for the streaming of the file's data.

### `var file = torrent.getFile(filePath)`

Returns the `File` instance whose path in the torrent matches the given `filePath`. If no file is found then `undefined` is returned.

## API - File

### `file.name`

The file name

### `file.path`

The path of the file within the torrent

### `file.length`

The size of the file

### `var stream = file.getStream([opts])`

Returns a [NodeJS Readable stream](https://nodejs.org/api/stream.html#stream_readable_streams) for the file. The file can be streamed from any instance while it is being downloaded. `opts` can take the following properties:

* `opts.start` - The byte offset to start streaming from within the file
* `opts.end` - The byte offset to end the streaming

### `var webStream = file.getWebStream([opts])`

Returns a [WhatWG Readable stream](https://streams.spec.whatwg.org/) for the file. This type of stream is new and only available in a few browser; this method throws if it is called and the browser does not support this type of stream. `opts` can take the following properties:

* `opts.start` - The byte offset to start streaming from within the file
* `opts.end` - The byte offset to end the streaming

### `file.getBlob([opts], [function callback (err, blob) {}]``

  Returns a [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob) of the file's data. `opts` can take the following properties:

  * `opts.start` - The byte offset to start the blob from
  * `opts.end` - The byte offset to end at
