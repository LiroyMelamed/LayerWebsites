#!/usr/bin/env node
/* eslint-disable no-console */

// Thin wrapper so you can run: node scripts/retentionCleanup.js
// The actual implementation lives in backend/scripts/retentionCleanup.js so dependencies resolve from backend/node_modules.

const { run } = require('../backend/scripts/retentionCleanup');

run(process.argv).catch((e) => {
    console.error('[retention] Fatal:', e?.stack || e);
    process.exit(1);
});
