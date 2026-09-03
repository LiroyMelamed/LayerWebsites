#!/usr/bin/env node
/**
 * Copy tenant-specific public branding (index.html, manifest, logos, firm-logo)
 * into the CRA public/ and src assets before a production build.
 */
const fs = require("fs");
const path = require("path");

const tenant = process.argv[2];
if (!tenant) {
  console.error("Usage: node scripts/apply-tenant-branding.js <melamedlaw|morlevy|ashrafessa|melamedia|idm>");
  process.exit(1);
}

const ALLOWED = new Set(["melamedlaw", "morlevy", "ashrafessa", "melamedia", "idm"]);
if (!ALLOWED.has(tenant)) {
  console.error(`[apply-tenant-branding] unknown tenant: ${tenant}`);
  process.exit(1);
}

const { generateTenantIcons } = require("./generate-tenant-icons");

const root = path.join(__dirname, "..");
const src = path.join(root, "public", "tenants", tenant);
const logosSrc = path.join(src, "logos");
const logosDst = path.join(root, "src", "assets", "images", "logos");

const OPTIONAL_PUBLIC_ICONS = [
  "logo192.png",
  "logo512.png",
  "favicon.ico",
  "favicon.png",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "site.webmanifest",
];

function mustExist(p) {
  if (!fs.existsSync(p)) {
    console.error(`[apply-tenant-branding] missing ${p}`);
    process.exit(1);
  }
}

mustExist(path.join(src, "index.html"));
mustExist(path.join(src, "firm-logo.png"));
mustExist(logosSrc);

if (!fs.existsSync(path.join(src, "logo512.png"))) {
  generateTenantIcons(tenant);
}

fs.copyFileSync(path.join(src, "index.html"), path.join(root, "public", "index.html"));
if (fs.existsSync(path.join(src, "manifest.json"))) {
  fs.copyFileSync(path.join(src, "manifest.json"), path.join(root, "public", "manifest.json"));
}
fs.copyFileSync(path.join(src, "firm-logo.png"), path.join(root, "public", "firm-logo.png"));
for (const icon of OPTIONAL_PUBLIC_ICONS) {
  const iconSrc = path.join(src, icon);
  const iconDst = path.join(root, "public", icon);
  if (fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, iconDst);
  } else if (fs.existsSync(iconDst)) {
    fs.unlinkSync(iconDst);
  }
}

for (const f of fs.readdirSync(logosSrc)) {
  fs.copyFileSync(path.join(logosSrc, f), path.join(logosDst, f));
}

console.log(`[apply-tenant-branding] applied branding for ${tenant}`);
