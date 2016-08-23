#!/usr/bin/env node

var cmd = process.argv[2]

process.argv.splice(2, 1)

if (cmd === 'import') require('./bin/import')
else if (cmd === 'run') require('./bin/run')
else if (cmd === 'seed') require('./bin/seed')
else if (cmd === 'list') require('./bin/list')
else if (cmd === 'commit') require('./bin/commit')
else if (cmd === 'start-daemon') require('./bin/start-daemon')
else if (cmd === 'stop-daemon') require('./bin/stop-daemon')
else require('./help')()
