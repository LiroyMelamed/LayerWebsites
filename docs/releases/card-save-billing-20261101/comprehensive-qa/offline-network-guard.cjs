'use strict';

// Test-process boundary only. Synthetic provider functions may replace fetch;
// any unmocked outbound fetch/TCP operation must fail before opening a socket.
const net = require('node:net');
const local = host => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(host || '').toLowerCase());
const blockedDatabasePorts = new Set([5432, 55440, 55449]);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    let input = args[0];
    if (Array.isArray(input)) input = input[0];
    if (typeof input === 'object' && input !== null && !input.path) {
        const host = input.host || input.hostname || 'localhost';
        if (!local(host) || blockedDatabasePorts.has(Number(input.port))) throw Error('OFFLINE_QA_NETWORK_BLOCKED');
    } else if (typeof input === 'number') {
        const host = typeof args[1] === 'string' ? args[1] : 'localhost';
        if (!local(host) || blockedDatabasePorts.has(input)) throw Error('OFFLINE_QA_NETWORK_BLOCKED');
    }
    return connect.apply(this, args);
};
const fetch = global.fetch;
global.fetch = function (input, options) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!local(url.hostname) || blockedDatabasePorts.has(Number(url.port))) return Promise.reject(Error('OFFLINE_QA_NETWORK_BLOCKED'));
    return fetch(input, options);
};
