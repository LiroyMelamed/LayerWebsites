#!/usr/bin/env node
/**
 * Generate PWA / favicon PNGs (+ favicon.ico) from public/tenants/<tenant>/firm-logo.png
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ICONS = [
  ['logo512.png', 512],
  ['logo192.png', 192],
  ['apple-touch-icon.png', 180],
  ['android-chrome-512x512.png', 512],
  ['android-chrome-192x192.png', 192],
  ['favicon-32x32.png', 32],
  ['favicon-16x16.png', 16],
  ['favicon.png', 32],
];

function generateTenantIcons(tenant) {
  const root = path.join(__dirname, '..');
  const dstDir = path.join(root, 'public', 'tenants', tenant);
  const src = path.join(dstDir, 'firm-logo.png');
  if (!fs.existsSync(src)) {
    throw new Error(`missing firm-logo.png for tenant ${tenant}`);
  }

  for (const [name, size] of ICONS) {
    const out = path.join(dstDir, name);
    execSync(`sips -z ${size} ${size} "${src}" --out "${out}"`, { stdio: 'pipe' });
  }

  const ico32 = path.join(dstDir, 'favicon-32x32.png');
  const ico16 = path.join(dstDir, 'favicon-16x16.png');
  const icoOut = path.join(dstDir, 'favicon.ico');
  execSync(
    `convert "${ico16}" "${ico32}" "${icoOut}"`,
    { stdio: 'pipe' }
  );

  console.log(`[generate-tenant-icons] wrote icons for ${tenant}`);
}

if (require.main === module) {
  const tenant = process.argv[2];
  if (!tenant) {
    console.error('Usage: node scripts/generate-tenant-icons.js <tenant>');
    process.exit(1);
  }
  generateTenantIcons(tenant);
}

module.exports = { generateTenantIcons, ICONS };
