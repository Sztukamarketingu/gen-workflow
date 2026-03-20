#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let sha = 'unknown';
try {
  sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (_) {}

const version = {
  sha,
  date: new Date().toISOString(),
};

const outDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify(version, null, 0));
console.log('version.json:', version);
