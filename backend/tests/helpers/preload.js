/**
 * Test preload — billing stub + rate limits only (no production billing bypass).
 * Used via: node --import ./tests/helpers/preload.js --test ...
 */
const { applyBaseTestEnv, stubBillingSnapshotUnlocked } = require('./integrationEnv');

applyBaseTestEnv();
stubBillingSnapshotUnlocked();
