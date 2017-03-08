#!/bin/bash

set -e

PATH=$PATH:./node_modules/.bin

mkdir -p build
rm build/* || true

# Build lib

browserify index.js --debug -s TorrentWorker \
 | exorcist build/torrentworker.js.map \
 > build/torrentworker.js

uglifyjs build/torrentworker.js --mangle --compress warnings=false \
  --in-source-map build/torrentworker.js.map \
  --source-map build/torrentworker.min.js.map \
  --source-map-url torrentworker.min.js.map \
 > build/torrentworker.min.js

# Build tests

browserify test/test.js --debug \
 > build/test.js
