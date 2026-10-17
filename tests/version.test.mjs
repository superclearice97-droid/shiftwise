import fs from 'node:fs';import assert from 'node:assert/strict';
// The Android/Linux packages read apps/package.json; the release tag reads package.json. They must match.
const root=JSON.parse(fs.readFileSync('package.json','utf8')).version,apps=JSON.parse(fs.readFileSync('apps/package.json','utf8')).version;
assert.equal(apps,root,'apps/package.json version must equal package.json version');
assert.match(fs.readFileSync('RELEASE-NOTES.md','utf8').split('\n')[0],new RegExp('v'+root.replace(/\./g,'\\.')+'\\b'),'release notes must start with the current version');
console.log('PASS: app package, release tag and release notes versions match ('+root+').');
