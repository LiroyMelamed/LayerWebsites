'use strict';
const { webhookCallbackConfig } = require('./callbackConfiguration');
function deliveryAllowed(env) {
    return env.WHATSAPP_LIVE_ENABLED === 'true' && env.WHATSAPP_DEMO_ONLY !== 'true' &&
        env.WHATSAPP_CONNECT_ONLY !== 'true' && env.QA_OUTBOUND_MODE !== 'noop' && Boolean(webhookCallbackConfig(env));
}
module.exports = { deliveryAllowed };
