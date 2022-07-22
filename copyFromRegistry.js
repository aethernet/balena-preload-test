var bunyan = require('bunyan');
var drc = require('docker-registry-client');

// This package uses https://github.com/trentm/node-bunyan for logging.
var log = bunyan.createLogger({
    name: 'regplay',
    // TRACE-level logging will show you all request/response activity
    // with the registry. This isn't suggested for production usage.
    level: 'trace'
});

var REPO = 'alpine';
var client = drc.createClientV2({
    name: REPO,
    log: log,
    // Optional basic auth to the registry
    username: <username>,
    password: <password>,
    // Optional, for a registry without a signed TLS certificate.
    insecure: <true|false>,
    // ... see the source code for other options
});