# hypercontainer
[![Build Status](https://travis-ci.org/andrewosh/hypercontainer.svg?branch=master)](https://travis-ci.org/andrewosh/hypercontainer)

Seed and boot versioned containers from a hyperdrive. Hypercontainer makes it simple to boot Docker containers from other peers hosting an image, without needing to have the complete image contents stored locally on your machine. Image layers are dynamically fetched from seeders once requested, allowing users to live-boot very large images while loading the image loading process is in progress.

**WIP**: This is a work-in-progress and will likely not work immediately!

### install
A CLI component is in progress, but the module can be imported/used as a library:
```
npm install hypercontainer
```

### api
The API is still **WIP** and is subject to lots of change. Specifically, a "hyperimage" should be represented as a particular archive format that's independent of any runtime (i.e. Docker).

#### `Hyperimage.create(id, opts, function (err, image) {} )`
Creates a hyperimage (stored in a hyperdrive archive) from a Docker container. The image is assigned a unique identifier that is also its archive key, which can be used to start a container using `run`.

#### `Hyperimage.seed(id, opts, function (err) {} )`
Seeds an existing hyperimage so that it can be booted by other peers.

#### `Hyperimage.run(id, function (err, container) {} )`
Boots a hyperimage, and returns a hypercontainer instance.

#### `Hyperimage.ps()`
**TODO: will remove** Lists Docker containers that can be converted into hyperimages using `create`

#### `Hypercontainer.commit(function (err, image))`
Creates a hyperimage from a running hypercontainer.

#### `Hypercontainer.on('stop', function (err) {})`

### testing
```
npm test
```

### license
MIT
