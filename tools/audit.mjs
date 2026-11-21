/**
 * MASH-Mix-Audio-and-Text, the static audit of the extension.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * Run: node tools/audit.mjs
 *
 * The audit reads the extension as it is packaged and checks the rules the
 * project holds itself to: no remote code, no analytics, no permission that
 * is not needed, no host but the engine on this machine, and the licence on
 * every file.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.pytest_cache', '.ruff_cache']);

let checks = 0;
let failures = 0;

function check(condition, message) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.log(`FAIL  ${message}`);
}

function walk(folder, found = []) {
  for (const name of readdirSync(folder)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(folder, name);
    if (statSync(full).isDirectory()) {
      walk(full, found);
    } else {
      found.push(full);
    }
  }
  return found;
}

const files = walk(ROOT);
const source = files.filter((f) => f.includes(`${sep}src${sep}`));

/**
 * The path of a file relative to the root of the project, always with the
 * forward slash. The manifest writes its paths the way the web does, so the
 * audit has to compare them the same way on every operating system.
 */
function rel(file) {
  return relative(ROOT, file).split(sep).join('/');
}
const scripts = source.filter((f) => f.endsWith('.js'));
const pages = source.filter((f) => f.endsWith('.html'));
const styles = source.filter((f) => f.endsWith('.css'));

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// the manifest
check(manifest.manifest_version === 3, 'the manifest is a Manifest V3 one');
check(Boolean(manifest.name && manifest.version), 'the manifest is named and numbered');
check(manifest.version === packageJson.version, 'the manifest and the package agree on the version');
check(Boolean(manifest.side_panel && manifest.side_panel.default_path), 'the side panel is declared');
check(Boolean(manifest.background && manifest.background.service_worker), 'the service worker is declared');
check(Boolean(manifest.options_page), 'the options page is declared');

// the permissions
const wanted = new Set(['sidePanel', 'storage']);
for (const permission of manifest.permissions || []) {
  check(wanted.has(permission), `the permission ${permission} is needed and allowed`);
}
check((manifest.permissions || []).length === wanted.size, 'no permission beyond the two needed');
check((manifest.content_scripts || []).length === 0, 'the extension reads no website');
for (const host of manifest.host_permissions || []) {
  check(
    host.startsWith('http://127.0.0.1') || host.startsWith('http://localhost'),
    `the host ${host} is on this machine`
  );
}

// the content security policy
const csp = manifest.content_security_policy || {};
check(/script-src 'self'/.test(csp.extension_pages || ''), 'the policy allows no remote script');
check(/object-src 'self'/.test(csp.extension_pages || ''), 'the policy allows no remote object');

// every file the manifest points at
const pointed = [
  manifest.side_panel && manifest.side_panel.default_path,
  manifest.background && manifest.background.service_worker,
  manifest.options_page,
  ...Object.values(manifest.icons || {})
].filter(Boolean);
for (const file of pointed) {
  check(files.some((f) => rel(f) === file), `the file ${file} is in the package`);
}

// the source
for (const file of scripts) {
  const name = rel(file);
  const code = readFileSync(file, 'utf8');
  check(!/\beval\s*\(/.test(code), `${name} has no eval`);
  check(!/new\s+Function\s*\(/.test(code), `${name} has no new Function`);
  check(!/importScripts\s*\(/.test(code), `${name} loads no remote script`);
  check(!/posthog|mixpanel|google-analytics|segment\.io|amplitude/i.test(code), `${name} has no analytics`);
  check(!/https?:\/\/(?!127\.0\.0\.1|localhost)/.test(code), `${name} names no host but the local one`);
  check(/SPDX-License-Identifier: MIT/.test(code), `${name} carries the licence identifier`);
  check(/Copyright \(c\) 2026 MASH \(Khaled Bhuiyan\)/.test(code), `${name} names the right holder`);
  check(!/[\u2013\u2014]/.test(code), `${name} has no em dash and no en dash`);
}

// The pages. A link that the reader has to click is not remote code, so the
// links of the setup guide are allowed, and the address of the engine in the
// guide may be written out as text. Everything that loads on its own is not:
// no remote script, no remote style, no remote picture, no remote call.
for (const file of pages) {
  const name = rel(file);
  const code = readFileSync(file, 'utf8');
  check(!/<script[^>]+src="https?:/i.test(code), `${name} loads no remote script`);
  check(!/<link[^>]+href="https?:/i.test(code), `${name} loads no remote style`);
  check(!/url\(\s*['"]?https?:/i.test(code), `${name} loads no remote file`);
  check(!/fetch\s*\(\s*['"`]https?:/i.test(code), `${name} calls no remote host`);
  const withoutAnchors = code.replace(/<a\b[^>]*>/gi, '');
  check(
    !/\b(?:src|href|action|data|poster)\s*=\s*['"`]https?:/i.test(withoutAnchors),
    `${name} loads nothing from the web`
  );
  check(!/[\u2013\u2014]/.test(code), `${name} has no em dash and no en dash`);
}

for (const file of styles) {
  const name = rel(file);
  const code = readFileSync(file, 'utf8');
  check(!/url\(\s*['"]?https?:/i.test(code), `${name} loads no remote file`);
  check(!/https?:\/\/(?!127\.0\.0\.1|localhost)/.test(code), `${name} names no host but the local one`);
  check(!/[\u2013\u2014]/.test(code), `${name} has no em dash and no en dash`);
}

// the licence and the privacy note
const licence = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
check(/MIT License/.test(licence), 'the licence is the MIT one');
check(/Copyright \(c\) 2026 MASH \(Khaled Bhuiyan\)/.test(licence), 'the licence names the right holder');
const privacy = readFileSync(join(ROOT, 'PRIVACY.md'), 'utf8');
check(/leaves your machine/i.test(privacy), 'the privacy note says that nothing leaves the machine');

// the icons
for (const size of [16, 32, 48, 128]) {
  check(
    files.some((f) => rel(f) === `icons/icon${size}.png`),
    `the icon of ${size} pixels is there`
  );
}

console.log(`checks: ${checks}`);
console.log(`failures: ${failures}`);
if (failures) process.exit(1);
