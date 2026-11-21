/**
 * The side panel, driven for real.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * Run: node --test tests/
 *
 * The panel is loaded into a small stand in for the browser, with the page
 * itself as the source of the language box, and then it is driven the way a
 * reader drives it: the language is chosen, the script box is read, a link is
 * fetched and the text is copied and saved.
 *
 * Nothing here reaches the network. The engine is stood in for.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PANEL = readFileSync(join(ROOT, 'src/sidepanel/sidepanel.js'), 'utf8');
const PAGE = readFileSync(join(ROOT, 'src/sidepanel/sidepanel.html'), 'utf8');

/** The languages the page offers, read out of the page itself. */
function languagesOfPage() {
  const block = PAGE.match(/<select id="lang">([\s\S]*?)<\/select>/);
  assert.ok(block, 'the page has a language box');
  const values = [];
  const pattern = /<option value="([^"]+)"([^>]*)>/g;
  let match = pattern.exec(block[1]);
  while (match) {
    values.push({ value: match[1], selected: /selected/.test(match[2]) });
    match = pattern.exec(block[1]);
  }
  return values;
}

/** The ids the page marks as hidden when it opens. */
function hiddenIdsOfPage() {
  const ids = [];
  const pattern = /<[a-zA-Z][^>]*>/g;
  let match = pattern.exec(PAGE);
  while (match) {
    const tag = match[0];
    if (/\shidden(\s|=|>|$)/.test(tag)) {
      const id = tag.match(/\bid="([^"]+)"/);
      if (id) ids.push(id[1]);
    }
    match = pattern.exec(PAGE);
  }
  return ids;
}

/** A small element that behaves enough like the real one. */
class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.hidden = false;
    this.children = [];
    this.handlers = {};
    this.attributes = {};
    this.style = {};
    this.selected = false;
    this._html = '';
  }

  set innerHTML(value) {
    this._html = String(value);
    this.children = [];
  }

  get innerHTML() {
    return this._html;
  }

  addEventListener(type, fn) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(fn);
  }

  dispatch(type, event) {
    const list = this.handlers[type] || [];
    const ev = event || { preventDefault() {}, stopPropagation() {} };
    for (const fn of list) fn(ev);
  }

  click() {
    this.dispatch('click', { preventDefault() {} });
  }

  select() {
    this.selected = true;
  }

  focus() {}

  setAttribute(key, value) {
    this.attributes[key] = String(value);
  }

  getAttribute(key) {
    return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((one) => one !== child);
  }

  querySelector() {
    return null;
  }
}

/** The lyrics the stood in engine answers with. */
const LYRICS = {
  job_id: 'abc123456789',
  language: 'bn-BD',
  script: 'bangla',
  duration: 232.0,
  title: 'Bolte Bolte Cholte Cholte',
  artist: 'IMRAN MAHMUDUL',
  text: 'বলতে যে মনে হয়\nবলতে তবু দেয় না হৃদয়',
  lines: [
    { start: 14.88, end: 22.88, text: 'বলতে যে মনে হয়' },
    { start: 22.88, end: 28.36, text: 'বলতে তবু দেয় না হৃদয়' }
  ],
  meta: {
    output_script: 'bangla',
    language_effective: 'bn',
    language_source: 'declared',
    lyrics_source: 'site subtitles'
  },
  downloads: {
    srt: '/api/lyrics/abc123456789/download/srt',
    txt: '/api/lyrics/abc123456789/download/txt',
    vtt: '/api/lyrics/abc123456789/download/vtt',
    lrc: '/api/lyrics/abc123456789/download/lrc'
  },
  source: {
    url: 'https://www.youtube.com/watch?v=296Gi_nnbho',
    title: 'Bolte Bolte Cholte Cholte',
    uploader: 'IMRAN MAHMUDUL',
    duration: 232.0,
    extractor: 'Youtube',
    language_source: 'declared',
    language: 'bn'
  }
};

/**
 * Load the panel into a stand in for the browser.
 *
 * The page is read for the language box, the engine is stood in for, and the
 * clipboard and the file save are recorded so the test can look at them.
 */
function loadPanel(options) {
  const settings = options || {};
  const elements = new Map();
  const calls = [];
  const clipboard = { text: '' };
  const saved = [];
  const copied = [];

  // The answer of the engine can be held back, so the panel can be looked at
  // while it is still working.
  let release = null;
  const held = new Promise((resolve) => {
    release = resolve;
  });

  const document = {
    body: new El('body'),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new El('div'));
      return elements.get(id);
    },
    createElement(tag) {
      return new El(tag);
    },
    execCommand(command) {
      if (command !== 'copy') return false;
      const area = document.body.children[document.body.children.length - 1];
      copied.push(area ? area.value : '');
      return true;
    }
  };

  // The language box of the page, with the options the page gives it.
  const languages = languagesOfPage();
  const langSel = document.getElementById('lang');
  for (const one of languages) {
    const opt = new El('option');
    opt.value = one.value;
    opt.selected = one.selected;
    opt.textContent = one.value;
    langSel.appendChild(opt);
  }
  langSel.value = (languages.find((one) => one.selected) || languages[0]).value;

  // The parts of the page that start out of sight start out of sight here too.
  for (const id of hiddenIdsOfPage()) {
    document.getElementById(id).hidden = true;
  }

  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = (options && options.type) || '';
    }

    text() {
      return this.parts.join('');
    }
  }

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    Promise,
    FormData,
    Blob: FakeBlob,
    document,
    navigator: {
      clipboard: {
        async writeText(text) {
          clipboard.text = text;
        }
      }
    },
    URL: {
      createObjectURL(blob) {
        saved.push({ blob, name: null });
        return 'blob:stand-in';
      },
      revokeObjectURL() {}
    },
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).indexOf('/api/health') >= 0) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { status: 'ok', version: '0.4.0' };
          }
        };
      }
      if (settings.hold) await held;
      return {
        ok: true,
        status: 200,
        async json() {
          return LYRICS;
        }
      };
    },
    MASH_MIX: { dsp: { measure: () => ({}) } }
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  vm.runInContext(PANEL, context, { filename: 'sidepanel.js' });

  return {
    document,
    elements,
    calls,
    clipboard,
    saved,
    copied,
    langSel,
    scriptSel: elements.get('script') || document.getElementById('script'),
    panel: sandbox.MASH_MIX.panel,
    release: () => release()
  };
}

/** Let the promises of the panel settle. */
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The options of the script box, as a plain list. */
function scriptOptions(scriptSel) {
  return scriptSel.children.map((one) => ({ value: one.value, label: one.textContent }));
}

test('the script box follows the language, for every language on offer', async () => {
  const dom = loadPanel();
  await tick();

  for (const one of languagesOfPage()) {
    dom.langSel.value = one.value;
    dom.langSel.dispatch('change', { preventDefault() {} });

    const shown = scriptOptions(dom.scriptSel);
    const expected = dom.panel.scriptsFor(one.value);

    assert.equal(shown.length, expected.length, `${one.value} shows every script it has`);
    for (let i = 0; i < expected.length; i++) {
      assert.equal(shown[i].value, expected[i].id, `${one.value} shows the right script`);
      assert.equal(shown[i].label, expected[i].label, `${one.value} shows the right name`);
    }
    assert.equal(
      dom.scriptSel.value,
      dom.panel.nativeScript(one.value).id,
      `${one.value} starts on its own script`
    );
  }
});

test('a language the panel offers has scripts of its own', () => {
  const dom = loadPanel();
  const table = dom.panel.languageScripts;
  for (const one of languagesOfPage()) {
    const code = one.value.split('-')[0].toLowerCase();
    if (code === 'auto') continue;
    assert.ok(table[code], `${one.value} is in the table`);
    assert.ok(table[code][0].label.indexOf('(') > 0, `${one.value} names its script`);
  }
});

test('the native script is the default until the user asks for another one', async () => {
  const dom = loadPanel();
  await tick();

  dom.langSel.value = 'en';
  dom.langSel.dispatch('change', { preventDefault() {} });
  assert.equal(dom.scriptSel.value, dom.panel.nativeScript('en').id);

  dom.langSel.value = 'ru';
  dom.langSel.dispatch('change', { preventDefault() {} });
  assert.equal(dom.scriptSel.value, dom.panel.nativeScript('ru').id);
  assert.equal(scriptOptions(dom.scriptSel).length, 1);
});

test('a script the user chose by hand is kept for that language', async () => {
  const dom = loadPanel();
  await tick();

  dom.langSel.value = 'bn';
  dom.langSel.dispatch('change', { preventDefault() {} });
  assert.equal(dom.scriptSel.value, 'bn-native');

  // the user picks the other script of that language
  dom.scriptSel.value = 'bn-latin';
  dom.scriptSel.dispatch('change', { preventDefault() {} });
  assert.equal(dom.scriptSel.value, 'bn-latin');

  // another language takes its own script
  dom.langSel.value = 'hi';
  dom.langSel.dispatch('change', { preventDefault() {} });
  assert.equal(dom.scriptSel.value, dom.panel.nativeScript('hi').id);

  // and the choice of the user comes back with the language
  dom.langSel.value = 'bn';
  dom.langSel.dispatch('change', { preventDefault() {} });
  assert.equal(dom.scriptSel.value, 'bn-latin');
});

test('a script that is not valid for the language is never offered', async () => {
  const dom = loadPanel();
  await tick();

  for (const one of languagesOfPage()) {
    dom.langSel.value = one.value;
    dom.langSel.dispatch('change', { preventDefault() {} });
    const valid = dom.panel.scriptsFor(one.value).map((entry) => entry.id);
    for (const shown of scriptOptions(dom.scriptSel)) {
      assert.ok(valid.indexOf(shown.value) >= 0, `${one.value} never shows ${shown.value}`);
    }
    assert.ok(valid.indexOf(dom.scriptSel.value) >= 0, `${one.value} never keeps a wrong script`);
  }
});

test('a language found by the engine narrows the script box to it', async () => {
  const dom = loadPanel();
  await tick();

  dom.langSel.value = 'auto';
  dom.langSel.dispatch('change', { preventDefault() {} });
  assert.ok(scriptOptions(dom.scriptSel).length > 1, 'auto holds every script');

  // the link is fetched and the engine finds the language
  dom.document.getElementById('url').value = 'https://www.youtube.com/watch?v=296Gi_nnbho';
  dom.document.getElementById('url').dispatch('input', {});
  dom.document.getElementById('urlFetch').click();
  await tick();
  await tick();

  const shown = scriptOptions(dom.scriptSel);
  assert.deepEqual(shown.map((one) => one.value), ['bn-native', 'bn-latin']);
  assert.equal(dom.scriptSel.value, 'bn-native');
});

test('the outcome holds the text that was written', async () => {
  const dom = loadPanel();
  await tick();

  dom.document.getElementById('url').value = 'https://www.youtube.com/watch?v=296Gi_nnbho';
  dom.document.getElementById('url').dispatch('input', {});
  dom.document.getElementById('urlFetch').click();
  await tick();
  await tick();

  const outcome = dom.document.getElementById('outcome');
  assert.equal(outcome.hidden, false, 'the outcome is shown');
  assert.equal(
    dom.document.getElementById('outcomeText').textContent,
    LYRICS.text,
    'the outcome holds the text'
  );
  assert.equal(dom.document.getElementById('outcomeTitle').textContent, LYRICS.title);
  assert.match(dom.document.getElementById('outcomeMeta').textContent, /bn-BD/);
  assert.match(dom.document.getElementById('outcomeMeta').textContent, /2 lines/);
});

test('the text is copied to the clipboard with one action', async () => {
  const dom = loadPanel();
  await tick();

  dom.document.getElementById('url').value = 'https://www.youtube.com/watch?v=296Gi_nnbho';
  dom.document.getElementById('url').dispatch('input', {});
  dom.document.getElementById('urlFetch').click();
  await tick();
  await tick();

  dom.document.getElementById('outcomeCopy').click();
  await tick();

  assert.equal(dom.clipboard.text, LYRICS.text, 'the text is on the clipboard');
  assert.match(dom.document.getElementById('outcomeNote').textContent, /clipboard/i);
});

test('the text is saved as a file with one action', async () => {
  const dom = loadPanel();
  await tick();

  dom.document.getElementById('url').value = 'https://www.youtube.com/watch?v=296Gi_nnbho';
  dom.document.getElementById('url').dispatch('input', {});
  dom.document.getElementById('urlFetch').click();
  await tick();
  await tick();

  dom.document.getElementById('outcomeDownload').click();
  await tick();

  assert.equal(dom.saved.length, 1, 'one file is saved');
  assert.equal(dom.saved[0].blob.text(), LYRICS.text, 'the file holds the text');
  assert.equal(dom.saved[0].blob.type, 'text/plain;charset=utf-8');
  assert.match(dom.document.getElementById('outcomeNote').textContent, /\.txt/);
});

test('the engine is asked for the script that was chosen', async () => {
  const dom = loadPanel();
  await tick();

  dom.langSel.value = 'bn';
  dom.langSel.dispatch('change', { preventDefault() {} });
  dom.scriptSel.value = 'bn-latin';
  dom.scriptSel.dispatch('change', { preventDefault() {} });

  dom.document.getElementById('url').value = 'https://www.youtube.com/watch?v=296Gi_nnbho';
  dom.document.getElementById('url').dispatch('input', {});
  dom.document.getElementById('urlFetch').click();
  await tick();
  await tick();

  const asked = dom.calls.find((one) => one.url.indexOf('/api/lyrics/url') >= 0);
  assert.ok(asked, 'the engine was asked for the lyrics of the link');
  const sent = asked.options.body.get('script');
  assert.equal(sent, 'banglish', 'the engine is asked for the script that was chosen');
  assert.equal(asked.options.body.get('language'), 'bn');
});

test('the button says what it gets', () => {
  assert.match(PAGE, /Get the Lyrics \/ Text/);
});

test('a bar moves under the line that says what the engine is doing', async () => {
  const dom = loadPanel({ hold: true });
  await tick();

  const progress = dom.document.getElementById('progress');
  assert.equal(progress.hidden, true, 'the bar is away when nothing is going on');

  dom.document.getElementById('url').value = 'https://www.youtube.com/watch?v=296Gi_nnbho';
  dom.document.getElementById('url').dispatch('input', {});
  dom.document.getElementById('urlFetch').click();
  await tick();

  assert.equal(progress.hidden, false, 'the bar is there while the engine works');
  assert.equal(
    dom.document.getElementById('status').textContent,
    'The engine is fetching the link and writing the lyrics.',
    'the line under the bar says what is going on'
  );

  dom.release();
  await tick();
  await tick();

  assert.equal(progress.hidden, true, 'the bar is away when the work is done');
});

test('the bar is away when the engine fails', async () => {
  const dom = loadPanel();
  await tick();

  const progress = dom.document.getElementById('progress');
  dom.panel.setBusy(true);
  assert.equal(progress.hidden, false, 'the bar is there while the engine works');

  dom.panel.setBusy(false);
  assert.equal(progress.hidden, true, 'the bar is away when the work stops');
});
