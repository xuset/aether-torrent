# Perma-Torrent

#### Persistent torrent client for web browsers and web workers

Perma-Torrent persists everything to IndexedDB so the torrent data does not disappear when the web page is closed. This also means that the torrent data is shared across all web pages so only one page has to do the downloading while any number of web pages can stream the downloaded data. The torrent data is even accessible from within web workers!

## Why

Perma-Torrent makes extensive use of [WebTorrent](https://webtorrent.io/) so why not just use WebTorrent? The main reason Perma-Torrent was created was because Service Workers and other Web Workers do not have access to the WebRTC api so they cannot use WebTorrent to download torrents. Perma-Torrent bridges this gap by allowing the downloaded torrent data to be streamed from all web workers and web pages.

## Usage

Add a torrent then stream a file
```js
var pt = new PermaTorrent()
pt.startSeeder()

return pt.add('http://example.com/foobar.torrent')
.then(torrent => {
  let file = torrent.getFile('foobar.txt')
  let stream = file.getStream()
})
```

Add a torrent then stream a file in a web worker

In a web page:
```js
var pt = new PermaTorrent()

// Only web pages can download torrents since
// web workers do not have access to the WebRTC api
pt.startSeeder()
```

In a web worker:
```js
var pt = new PermaTorrent()

return pt.add('http://example.com/foobar.torrent')
.then(torrent => {
  let file = torrent.getFile('foobar.txt')
  let stream = file.getStream()
})
```

## API

### `var pt = new PermaTorrent([opts])`

All instances by default share the same underlying storage so adding a torrent to one instance adds it to all instances. To separate instances from one other define `opts.namespace`. The `opts` argument can take the following properties:

 * `opts.namespace` - Unique string used to insulate instances from each other. Defaults to 'permatorrent'

### `pt.add(torrentBuffer).then(torrent => {})`

Adds the given torrent to the instance and all other instances within the same namespace. `torrentBuffer` must be a buffer of the .torrent file. `torrent` is an instance of `Torrent` which is documented below.

### `pt.getAll().then(torrents => {})`

Returns all the torrents that PermaTorrent holds. `torrents` is an array of `Torrent` instances.

### `pt.startSeeder()`

Starts the seeder which does the actual downloading and uploading of torrents. This method can only be called in web pages and not in web workers.

### `pt.remove(infoHash).then(() => {})`

Removes the given torrent with the given `infoHash`

### `pt.destroy()`

Frees the internal resources of the instance.

## API - Torrent

### `torrent.name`

The name of the torrent

### `torrent.length`

The size of the torrent in bytes

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

The path of the fileInfo

### `file.length`

The size of the file

### `var stream = file.getStream([opts])`

Returns a [NodeJS Readable stream](https://nodejs.org/api/stream.html#stream_readable_streams) for the file. The file can be streamed while it is being downloaded and be sure to call `pt.startSeeder()` in at least one instance. `opts` can take the following properties:

* `opts.start` - The byte offset to start streaming from within the file
* `opts.end` - The byte offset to end the streaming

### `var webStream = file.getWebStream([opts])`

Returns a [WhatWG Readable stream](https://streams.spec.whatwg.org/) for the file. This type of stream is new and only available in a few browser; this method throws if it is called and the browser does not support this type of stream. `opts` can take the following properties:

* `opts.start` - The byte offset to start streaming from within the file
* `opts.end` - The byte offset to end the streaming

### `file.getBlob([opts]).then(blob => {})``

  Returns a [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob) of the file's data. `opts` can take the following properties:

  * `opts.start` - The byte offset to start the blob from
  * `opts.end` - The byte offset to end at
