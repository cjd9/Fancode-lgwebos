#!/usr/bin/env node
// Regenerate the webosbrew repo files (repo/manifest.json + repo/api/apps.json)
// from the current app version and the built .ipk. Run after `ares-package`.
//
//   node scripts/update-repo.mjs
//
// Reads app/appinfo.json for id/version/title, hashes dist/<id>_<version>_all.ipk,
// and rewrites the manifest + apps.json with the correct ipkHash/ipkSize.

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const GH_USER = 'cjd9';
const GH_REPO = 'Fancode-lgwebos';
const RAW = `https://raw.githubusercontent.com/${GH_USER}/${GH_REPO}/main`;

const info = JSON.parse(readFileSync(new URL('../app/appinfo.json', import.meta.url)));
const id = info.id, version = info.version, title = info.title;
const ipkRel = `dist/${id}_${version}_all.ipk`;
const ipkPath = new URL('../' + ipkRel, import.meta.url);

const buf = readFileSync(ipkPath);
const sha256 = createHash('sha256').update(buf).digest('hex');
const size = statSync(ipkPath).size;

const iconUri = `${RAW}/repo/icon160.png`;
const description = 'Unofficial FanCode live sports client for LG webOS';

const manifest = {
  id, version, type: 'web', title,
  appDescription: description,
  iconUri,
  sourceUrl: `https://github.com/${GH_USER}/${GH_REPO}`,
  rootRequired: false,
  ipkUrl: `${RAW}/${ipkRel}`,
  ipkHash: { sha256 },
  ipkSize: size,
};

const appsJson = {
  paging: { page: 1, count: 50, maxPage: 1, itemsTotal: 1, prevUrl: null, nextUrl: null },
  packages: [{
    id, title, iconUri,
    manifestUrl: `${RAW}/repo/manifest.json`,
    manifest,
    pool: 'main',
    shortDescription: description,
  }],
};

writeFileSync(new URL('../repo/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(new URL('../repo/api/apps.json', import.meta.url), JSON.stringify(appsJson, null, 2) + '\n');
console.log(`Updated repo for ${id} ${version}`);
console.log(`  ipk: ${ipkRel}`);
console.log(`  sha256: ${sha256}`);
console.log(`  size: ${size}`);
console.log(`\nRepository URL (add this in Homebrew Channel → Settings → Add repository):`);
console.log(`  ${RAW}/repo/api/apps.json`);
