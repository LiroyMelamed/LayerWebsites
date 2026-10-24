'use strict';
const { isLinkedDevice } = require('./linkedDevicePolicy');
function createProviderRouter(meta, linked) {
    return {
        completeSignup: (...args) => meta.completeSignup(...args),
        connectionHealth: (...args) => meta.connectionHealth(...args),
        syncBusinessApp: (...args) => meta.syncBusinessApp(...args),
        readiness: (...args) => meta.readiness(...args),
        createGroup: (c, ...args) => (isLinkedDevice(c) ? linked : meta).createGroup(c, ...args),
        invite: (c, ...args) => (isLinkedDevice(c) ? linked : meta).invite(c, ...args),
    };
}
module.exports = { createProviderRouter };
