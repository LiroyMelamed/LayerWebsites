#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const tenant = process.argv[2];
const frontend = path.join(root, 'frontend');
if (tenant && !/^(morlevy|ashrafessa|melamedlaw|melamedia|idm|lawyer)$/.test(tenant)) throw new Error('Unknown tenant');
const destination = path.join(frontend, '.env');
if (!tenant && fs.existsSync(destination)) process.exit(0);
const variant = tenant ? path.join(frontend, `.env.production.${tenant}`) : destination;
const source = tenant && fs.existsSync(variant) ? variant : variant + '.example';
fs.copyFileSync(source, destination);
console.log('Prepared frontend public configuration from ' + path.basename(source));
