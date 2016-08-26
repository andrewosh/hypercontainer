var conf = require('./conf')

module.exports = function help () {
  console.log(`Usage: ${conf.name} [cmd]

  Available commands are

    import           import a Hyperimage from a local Docker image
    run              boot a container an image
    attach           attach to a running container
    list-images       list all available images  that can be attached tothat can be booted
    list-containers  list all running containers
    seed             seed a image
    start-daemon     start the daemon process
    stop-daemon      stop the daemon process

  Add --help after any command for detailed help`)
}
