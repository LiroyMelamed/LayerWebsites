'use strict';
// Test-only opt-in boundary. No connections are opened while loading this file.
const net = require('node:net');
const socket = process.env.CLIENT_PROFILE_TEST_SOCKET;
if (!['/tmp/codex-client-profile-55487', '/tmp/codex-client-profile-55488'].includes(socket)) {
    throw Error('OWNED_PROFILE_SOCKET_REQUIRED');
}
const port = socket.endsWith('55488') ? 55488 : 55487;
const expected = `${socket}/.s.PGSQL.${port}`;
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    let first = args[0];
    if (Array.isArray(first)) first = first[0];
    const path = typeof first === 'string' ? first : first?.path;
    if (path !== expected) throw Error('OWNED_PROFILE_SOCKET_ONLY');
    return connect.apply(this, args);
};
global.fetch = () => Promise.reject(Error('NO_HTTP_OR_PROVIDER_IN_PROFILE_SQL_GATE'));
