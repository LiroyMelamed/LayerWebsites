'use strict';
function deliveryAllowed(env) {
    return env.WHATSAPP_LIVE_ENABLED === 'true' && env.WHATSAPP_DEMO_ONLY !== 'true' &&
        env.WHATSAPP_CONNECT_ONLY !== 'true' && env.QA_OUTBOUND_MODE !== 'noop';
}
module.exports = { deliveryAllowed };
