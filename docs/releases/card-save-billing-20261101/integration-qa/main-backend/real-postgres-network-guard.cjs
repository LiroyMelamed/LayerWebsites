'use strict';
// This fixture owns one pre-existing local billing cluster and no other DB.
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    let first = args[0];
    if (Array.isArray(first)) first = first[0];
    let host, port;
    if (typeof first === 'object' && first !== null && !first.path) {
        host = first.host || first.hostname; port = Number(first.port);
    } else if (typeof first === 'number') {
        port = first; host = typeof args[1] === 'string' ? args[1] : undefined;
    }
    if (host !== '127.0.0.1' || port !== 55449) throw Error('ISOLATED_BILLING_POSTGRES_ONLY');
    return connect.apply(this, args);
};
global.fetch = () => Promise.reject(Error('NO_PROVIDER_OR_HTTP_IN_SQL_GATE'));
