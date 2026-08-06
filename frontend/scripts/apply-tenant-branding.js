#!/usr/bin/env node
/**
 * Copy tenant-specific public branding (index.html, manifest, logos, firm-logo)
 * into the CRA public/ and src assets before a production build.
 */
const fs = require("fs");
const path = require("path");

const tenant = process.argv[2];
if (!tenant) {
  console.error("Usage: node scripts/apply-tenant-branding.js <melamedlaw|morlevy|ashrafessa>");
  process.exit(1);
}

const root = path.join(__dirname, "..");
const src = path.join(root, "public", "tenants", tenant);
const logosSrc = path.join(src, "logos");
const logosDst = path.join(root, "src", "assets", "images", "logos");

function mustExist(p) {
  if (!fs.existsSync(p)) {
    console.error(`[apply-tenant-branding] missing ${p}`);
    process.exit(1);
  }
}

mustExist(path.join(src, "index.html"));
mustExist(path.join(src, "firm-logo.png"));
mustExist(logosSrc);

fs.copyFileSync(path.join(src, "index.html"), path.join(root, "public", "index.html"));
if (fs.existsSync(path.join(src, "manifest.json"))) {
  fs.copyFileSync(path.join(src, "manifest.json"), path.join(root, "public", "manifest.json"));
}
fs.copyFileSync(path.join(src, "firm-logo.png"), path.join(root, "public", "firm-logo.png"));

for (const f of fs.readdirSync(logosSrc)) {
  fs.copyFileSync(path.join(logosSrc, f), path.join(logosDst, f));
}

console.log(`[apply-tenant-branding] applied branding for ${tenant}`);
