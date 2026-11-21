/**
 * MASH-Mix-Audio-and-Text, the tests of the packaged extension.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * These tests look at the extension as it is shipped: the manifest, the
 * permissions, the files it points at and the rules the project holds itself
 * to. Run: node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function walk(folder, found = []) {
  for (const name of readdirSync(folder)) {
    const full = join(folder, name);
    if (statSync(full).isDirectory()) {
      walk(full, found);
    } else {
      found.push(full);
    }
  }
  return found;
}

const manifest = JSON.parse(read('manifest.json'));
const packageJson = JSON.parse(read('package.json'));

test('the manifest is a Manifest V3 one', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name);
  assert.ok(manifest.version);
  assert.ok(manifest.description.length > 20);
});

test('the release number is the same in the manifest and in the package', () => {
  assert.equal(manifest.version, packageJson.version);
});

test('the extension asks for nothing it does not need', () => {
  assert.deepEqual(manifest.permissions.sort(), ['sidePanel', 'storage']);
  assert.deepEqual(manifest.host_permissions.sort(), ['http://127.0.0.1/*', 'http://localhost/*']);
  assert.equal(manifest.content_scripts, undefined);
});

test('the extension can only reach the engine on this machine', () => {
  for (const host of manifest.host_permissions) {
    assert.ok(host.startsWith('http://127.0.0.1') || host.startsWith('http://localhost'), host);
  }
});

test('the content security policy forbids remote code', () => {
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
  assert.match(manifest.content_security_policy.extension_pages, /object-src 'self'/);
});

test('every file the manifest points at is there', () => {
  const files = [
    manifest.side_panel.default_path,
    manifest.background.service_worker,
    manifest.options_page,
    ...Object.values(manifest.icons)
  ];
  for (const file of files) {
    statSync(join(ROOT, file));
  }
});

test('the panel loads the core and the core is the only analysis', () => {
  const panel = read('src/sidepanel/sidepanel.html');
  assert.match(panel, /src="\.\.\/core\/core\.js"/);
  assert.match(panel, /src="sidepanel\.js"/);
  const script = read('src/sidepanel/sidepanel.js');
  assert.match(script, /MASH_MIX\.dsp/);
});

test('the panel shows the measurements and the own pitch and speed', () => {
  const panel = read('src/sidepanel/sidepanel.html');
  assert.match(panel, /Own pitch and speed/);
  for (const label of ['Peak', 'Loudness', 'Clipped', 'DC offset', 'Head silence', 'Crest']) {
    assert.match(panel, new RegExp(label));
  }
});

test('the panel can look for the engine again without being reloaded', () => {
  const panel = read('src/sidepanel/sidepanel.html');
  assert.match(panel, /id="engineRetry"/);
  assert.match(panel, /Check again/);
  const script = read('src/sidepanel/sidepanel.js');
  assert.match(script, /engineRetry\.addEventListener/);
  assert.match(script, /checkEngine\(\)/);
});

test('the panel looks for the engine on more than one port', () => {
  const script = read('src/sidepanel/sidepanel.js');
  assert.match(script, /FALLBACK_ENGINES/);
  for (const port of [8000, 8001, 8080, 8123]) {
    assert.match(script, new RegExp(`127\\.0\\.0\\.1:${port}`), `port ${port}`);
  }
});

test('the panel tells a new user what to install on another computer', () => {
  const panel = read('src/sidepanel/sidepanel.html');
  assert.match(panel, /id="engineSetup"/);
  assert.match(panel, /python\.org\/downloads/);
  assert.match(panel, /github\.com\/kdbn121\/MASH-Mix-Audio-and-Text-Extension/);
  assert.match(panel, /mash-mix serve --host 127\.0\.0\.1 --port 8000/);
});

test('the settings page carries the same guide and can test the engine', () => {
  const page = read('src/options/options.html');
  assert.match(page, /id="test"/);
  assert.match(page, /Test the engine/);
  assert.match(page, /python\.org\/downloads/);
  assert.match(page, /github\.com\/kdbn121\/MASH-Mix-Audio-and-Text/);
  const script = read('src/options/options.js');
  assert.match(script, /api\/health/);
  assert.match(script, /test\.addEventListener/);
});

test('the pages load nothing from the web and only link to it', () => {
  for (const page of ['src/sidepanel/sidepanel.html', 'src/options/options.html']) {
    const code = read(page);
    assert.doesNotMatch(code, /<script[^>]+src="https?:/i, page);
    assert.doesNotMatch(code, /<link[^>]+href="https?:/i, page);
    assert.doesNotMatch(code, /<img[^>]+src="https?:/i, page);
    assert.doesNotMatch(code, /fetch\s*\(\s*['"`]https?:/i, page);
    // every address outside this machine has to sit inside an anchor
    const withoutAnchors = code.replace(/<a\b[^>]*>/gi, '');
    assert.doesNotMatch(withoutAnchors, /\b(?:src|href|action|data|poster)\s*=\s*['"`]https?:/i, page);
  }
});

test('the source has no remote code and no analytics', () => {
  const files = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 4);
  // the names of the services a project would report usage to. The word
  // analytics in a comment is not a service, so only the names are looked for.
  const vendors = /posthog|mixpanel|google-analytics|googletagmanager|gtag\b|segment\.io|amplitude|hotjar|plausible|matomo|sentry/i;
  for (const file of files) {
    const code = read(relative(ROOT, file));
    assert.doesNotMatch(code, /\beval\s*\(/, file);
    assert.doesNotMatch(code, /new\s+Function\s*\(/, file);
    assert.doesNotMatch(code, /importScripts\s*\(/, file);
    assert.doesNotMatch(code, vendors, file);
    assert.doesNotMatch(code, /https?:\/\/(?!127\.0\.0\.1|localhost)/, file);
  }
});

test('every script carries the licence of the project', () => {
  const files = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const code = read(relative(ROOT, file));
    assert.match(code, /SPDX-License-Identifier: MIT/, file);
    assert.match(code, /Copyright \(c\) 2026 MASH \(Khaled Bhuiyan\)/, file);
  }
});

test('nothing in the project carries an em dash or an en dash', () => {
  const files = walk(join(ROOT, 'src')).filter((f) => /\.(js|html|css)$/.test(f));
  for (const file of files) {
    const code = read(relative(ROOT, file));
    assert.doesNotMatch(code, /[\u2013\u2014]/, file);
  }
});

test('the licence of the project names the right holder', () => {
  const licence = read('LICENSE');
  assert.match(licence, /MIT License/);
  assert.match(licence, /Copyright \(c\) 2026 MASH \(Khaled Bhuiyan\)/);
});
