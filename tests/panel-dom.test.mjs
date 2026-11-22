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
const EDITOR = readFileSync(join(ROOT, 'src/sidepanel/editor.js'), 'utf8');

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
    // An audio element starts paused.
    this.paused = true;
    // The class list of a real element. The panel adds and removes names on
    // it, and the test reads it to see what is marked.
    const names = new Set();
    this.classList = {
      add: (name) => names.add(name),
      remove: (name) => names.delete(name),
      contains: (name) => names.has(name),
      toggle: (name) => {
        if (names.has(name)) names.delete(name);
        else names.add(name);
      }
    };
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

  removeAttribute(key) {
    delete this.attributes[key];
  }

  // The address of the song on the audio element.
  get src() {
    return this.attributes.src || '';
  }

  set src(value) {
    this.attributes.src = String(value);
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

  querySelectorAll() {
    return [];
  }

  // The audio element of the player. It is enough of a stand in for the
  // tests to move the song and to hold it.
  pause() {
    this.paused = true;
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  load() {}}

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
    handlers: {},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new El('div'));
      return elements.get(id);
    },
    createElement(tag) {
      return new El(tag);
    },
    addEventListener(type, fn) {
      if (!this.handlers[type]) this.handlers[type] = [];
      this.handlers[type].push(fn);
    },
    dispatch(type, event) {
      const list = this.handlers[type] || [];
      const ev = event || { preventDefault() {}, stopPropagation() {} };
      for (const fn of list) fn(ev);
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
    setInterval,
    clearInterval,
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

  // The browser can be told which extension is loaded, so the panel can show
  // the number of that extension in its footer.
  if (settings.chromeVersion) {
    sandbox.chrome = {
      runtime: {
        getManifest() {
          return { version: settings.chromeVersion };
        }
      }
    };
  }

  const context = vm.createContext(sandbox);
  // The editor is loaded first, because the panel reads its rules from there.
  vm.runInContext(EDITOR, context, { filename: 'editor.js' });
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

test('the script box holds every script of every language', async () => {
  const dom = loadPanel();
  await tick();

  const expected = dom.panel.allScripts();
  const shown = scriptOptions(dom.scriptSel);

  assert.equal(shown.length, expected.length, 'the box holds every script');
  for (let i = 0; i < expected.length; i++) {
    assert.equal(shown[i].value, expected[i].id, 'the right script is shown');
    assert.equal(shown[i].label, expected[i].label, 'the right name is shown');
  }

  // The automatic one comes first, so it is the one that is chosen.
  assert.equal(shown[0].value, 'auto');
  assert.equal(shown[0].label, 'Auto, any script');

  // The language that is chosen does not change the box.
  for (const one of languagesOfPage()) {
    dom.langSel.value = one.value;
    dom.langSel.dispatch('change', { preventDefault() {} });
    assert.equal(
      scriptOptions(dom.scriptSel).length,
      expected.length,
      `${one.value} still holds every script`
    );
  }
});

test('the script box starts on the automatic one', async () => {
  const dom = loadPanel();
  await tick();

  assert.equal(dom.scriptSel.value, 'auto', 'the box starts on Auto, any script');
  assert.equal(
    dom.document.getElementById('langHint').textContent.indexOf('Auto') >= 0,
    true,
    'the hint says what the automatic one is'
  );
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

test('the panel holds every language of the engine', () => {
  const dom = loadPanel();
  const table = dom.panel.languageScripts;
  // Nepali and Sinhala were in the engine and are in the panel again.
  assert.ok(table.ne, 'Nepali is on offer');
  assert.ok(table.si, 'Sinhala is on offer');

  const onOffer = languagesOfPage().map((one) => one.value.split('-')[0].toLowerCase());
  for (const code of Object.keys(table)) {
    assert.ok(onOffer.indexOf(code) >= 0, `${code} is in the language box`);
  }
  for (const code of onOffer) {
    if (code === 'auto') continue;
    assert.ok(table[code], `${code} has a script of its own`);
  }
});

test('a script the user chose by hand is used for every language', async () => {
  const dom = loadPanel();
  await tick();

  // the user picks the other script of Bangla
  dom.scriptSel.value = 'bn-latin';
  dom.scriptSel.dispatch('change', { preventDefault() {} });
  assert.equal(dom.scriptSel.value, 'bn-latin');

  // another language does not take it away
  dom.langSel.value = 'hi';
  dom.langSel.dispatch('change', { preventDefault() {} });
  assert.equal(dom.scriptSel.value, 'bn-latin', 'the script of the user is kept');

  // and the script is the one that is sent to the engine
  dom.document.getElementById('url').value = 'https://www.youtube.com/watch?v=296Gi_nnbho';
  dom.document.getElementById('url').dispatch('input', {});
  dom.document.getElementById('urlFetch').click();
  await tick();
  await tick();

  const asked = dom.calls.find((one) => one.url.indexOf('/api/lyrics/url') >= 0);
  assert.ok(asked, 'the engine was asked for the lyrics of the link');
  assert.equal(asked.options.body.get('script'), 'banglish', 'the script of the user was sent');
});

test('the engine is asked to choose the script when nothing was chosen', async () => {
  const dom = loadPanel();
  await tick();

  dom.document.getElementById('url').value = 'https://www.youtube.com/watch?v=296Gi_nnbho';
  dom.document.getElementById('url').dispatch('input', {});
  dom.document.getElementById('urlFetch').click();
  await tick();
  await tick();

  const asked = dom.calls.find((one) => one.url.indexOf('/api/lyrics/url') >= 0);
  assert.ok(asked, 'the engine was asked for the lyrics of the link');
  assert.equal(asked.options.body.get('script'), 'auto', 'the engine chooses the script');
});

test('a script the engine cannot write is never offered', async () => {
  const dom = loadPanel();
  await tick();

  const writable = ['bangla', 'banglish', 'auto'];
  for (const one of dom.panel.allScripts()) {
    assert.ok(writable.indexOf(one.engine) >= 0, `${one.id} is a script the engine can write`);
  }
});

test('a language found by the engine does not take the scripts away', async () => {
  const dom = loadPanel();
  await tick();

  dom.langSel.value = 'auto';
  dom.langSel.dispatch('change', { preventDefault() {} });
  const before = scriptOptions(dom.scriptSel).map((one) => one.value);
  assert.ok(before.length > 1, 'auto holds every script');

  // the link is fetched and the engine finds the language
  dom.document.getElementById('url').value = 'https://www.youtube.com/watch?v=296Gi_nnbho';
  dom.document.getElementById('url').dispatch('input', {});
  dom.document.getElementById('urlFetch').click();
  await tick();
  await tick();

  const shown = scriptOptions(dom.scriptSel).map((one) => one.value);
  assert.deepEqual(shown, before, 'the engine does not narrow the script box');
  assert.equal(dom.scriptSel.value, 'auto', 'the choice of the user is kept');
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

/** The rows of the editor, as they stand now. */
function editorRows(dom) {
  return dom.document.getElementById('edList').children;
}

/** The box of words of a row of the editor. */
function wordsBox(dom, index) {
  return editorRows(dom)[index].children[1];
}

/** The field of the moment a row starts at. */
function startField(dom, index) {
  return editorRows(dom)[index].children[0].children[1];
}

/** The field of the moment a row ends at. */
function endField(dom, index) {
  return editorRows(dom)[index].children[0].children[3];
}

/** Fetch the lyrics, so the editor has something to work on. */
async function withLyrics() {
  const dom = loadPanel();
  await tick();
  dom.document.getElementById('url').value = 'https://www.youtube.com/watch?v=296Gi_nnbho';
  dom.document.getElementById('url').dispatch('input', {});
  dom.document.getElementById('urlFetch').click();
  await tick();
  await tick();
  return dom;
}

test('the editor is there when the lyrics are', async () => {
  const dom = await withLyrics();

  const card = dom.document.getElementById('editorCard');
  assert.equal(card.hidden, false, 'the editor is shown');
  assert.equal(editorRows(dom).length, 2, 'both lines are in the editor');
  assert.equal(
    startField(dom, 0).value,
    '00:00:14,880',
    'the first line starts at the moment the engine gave'
  );
  assert.equal(endField(dom, 0).value, '00:00:22,880');
  assert.equal(wordsBox(dom, 0).value, LYRICS.lines[0].text);
});

test('a change of the words is written to the text and the SRT at once', async () => {
  const dom = await withLyrics();

  const box = wordsBox(dom, 0);
  box.value = 'আমাদের কাছে ইমেইল করার ঠিকানা';
  box.dispatch('input', {});

  const txt = dom.document.getElementById('edTxt').textContent;
  const srt = dom.document.getElementById('edSrt').textContent;

  assert.match(txt, /আমাদের কাছে ইমেইল করার ঠিকানা/, 'the text holds the new words');
  assert.match(srt, /আমাদের কাছে ইমেইল করার ঠিকানা/, 'the SRT holds the new words');
  assert.equal(
    dom.document.getElementById('outcomeText').textContent,
    txt,
    'the text at the foot of the panel is the same text'
  );
});

test('a change of a moment is written to the SRT at once', async () => {
  const dom = await withLyrics();

  const field = startField(dom, 0);
  field.value = '00:01:00,000';
  field.dispatch('input', {});

  const srt = dom.document.getElementById('edSrt').textContent;
  // The line keeps the length it had, so it never ends before it starts.
  assert.match(srt, /00:01:00,000 --> 00:01:08,000/, 'the SRT carries the new moment');
});

test('a line never ends before it starts', async () => {
  const dom = await withLyrics();

  const end = endField(dom, 0);
  end.value = '00:00:02,000';
  end.dispatch('input', {});

  const srt = dom.document.getElementById('edSrt').textContent;
  const moments = srt.match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
  assert.ok(moments, 'the SRT carries the moments');
  assert.ok(moments[1] <= moments[2], 'the line starts before it ends');
});

test('a moment that cannot be read leaves the line as it was', async () => {
  const dom = await withLyrics();

  const field = startField(dom, 0);
  field.value = 'not a time';
  field.dispatch('change', {});

  assert.equal(field.value, '00:00:14,880', 'the line kept the moment it had');
  assert.match(dom.document.getElementById('edNote').textContent, /could not be read/);
});

test('a line is added and taken away again', async () => {
  const dom = await withLyrics();

  dom.document.getElementById('edAdd').click();
  assert.equal(editorRows(dom).length, 3, 'a line was added');

  dom.document.getElementById('edRemove').click();
  assert.equal(editorRows(dom).length, 2, 'the line was taken away');
});

test('a line is cut in two and the two halves meet at one moment', async () => {
  const dom = await withLyrics();

  dom.panel.selectCue(0);
  dom.document.getElementById('edSplit').click();

  const rows = editorRows(dom);
  assert.equal(rows.length, 3, 'the line is now two lines');
  const srt = dom.document.getElementById('edSrt').textContent;
  const moments = srt.match(/00:00:14,880 --> ([\d:,]+)/);
  assert.ok(moments, 'the first half starts where the line started');
  assert.match(srt, new RegExp(moments[1] + ' --> 00:00:22,880'), 'the second half ends where the line ended');
});

test('two lines are joined into one', async () => {
  const dom = await withLyrics();

  dom.panel.selectCue(0);
  dom.document.getElementById('edMerge').click();

  assert.equal(editorRows(dom).length, 1, 'the two lines are one line now');
  const srt = dom.document.getElementById('edSrt').textContent;
  assert.match(srt, /00:00:14,880 --> 00:00:28,360/, 'the joined line keeps the whole time');
});

test('a line is cut to the clipboard and pasted back', async () => {
  const dom = await withLyrics();

  dom.panel.selectCue(0);
  dom.document.getElementById('edCut').click();
  assert.equal(editorRows(dom).length, 1, 'the line was cut away');

  dom.document.getElementById('edPaste').click();
  assert.equal(editorRows(dom).length, 2, 'the line was pasted back');
  assert.match(dom.document.getElementById('edSrt').textContent, /বলতে যে মনে হয়/);
});

test('a line is copied and pasted, so it can be put somewhere else', async () => {
  const dom = await withLyrics();

  dom.panel.selectCue(0);
  dom.document.getElementById('edCopy').click();
  assert.equal(editorRows(dom).length, 2, 'the copy left the line where it was');

  dom.panel.selectCue(1);
  dom.document.getElementById('edPaste').click();
  assert.equal(editorRows(dom).length, 3, 'the line was pasted after the one that was selected');
});

test('the edited file is saved as a subtitle file', async () => {
  const dom = await withLyrics();

  const box = wordsBox(dom, 0);
  box.value = 'সংশোধিত শব্দ';
  box.dispatch('input', {});

  dom.document.getElementById('edDownloadSrt').click();
  await tick();

  assert.equal(dom.saved.length, 1, 'one file was saved');
  const content = dom.saved[0].blob.text();
  assert.match(content, /^1\n00:00:14,880 --> 00:00:22,880\nসংশোধিত শব্দ\n/);
  assert.equal(dom.saved[0].blob.type, 'application/x-subrip;charset=utf-8');
  assert.match(dom.document.getElementById('edNote').textContent, /\.srt/);
});

test('the edited text is saved as a text file', async () => {
  const dom = await withLyrics();

  dom.document.getElementById('edDownloadTxt').click();
  await tick();

  assert.equal(dom.saved.length, 1, 'one file was saved');
  assert.equal(dom.saved[0].blob.text(), LYRICS.text);
  assert.equal(dom.saved[0].blob.type, 'text/plain;charset=utf-8');
});

/**
 * The player, with a song in it.
 *
 * The address is put on the audio element, which is where a real browser
 * keeps it, so the panel finds the song the same way it finds one in Chrome.
 */
function withSong(dom) {
  const song = dom.document.getElementById('song');
  song.src = 'blob:stand-in';
  song.duration = 300;
  song.currentTime = 100;
  return song;
}

test('the song moves five seconds at a time', async () => {
  const dom = await withLyrics();
  const song = withSong(dom);

  dom.panel.stepSong(5);
  assert.equal(song.currentTime, 105, 'the song moved forward five seconds');

  dom.panel.stepSong(-5);
  assert.equal(song.currentTime, 100, 'the song moved back five seconds');
});

test('the button is held down and the song keeps moving in steps', async (t) => {
  const dom = await withLyrics();
  const song = withSong(dom);

  // The timer that moves the song is always let go of, so a failure here
  // cannot leave the test runner with a timer that never stops.
  t.after(() => dom.panel.stopSeekHold());

  const forward = dom.document.getElementById('songFwd');
  forward.dispatch('pointerdown', { button: 0, preventDefault() {} });
  assert.equal(song.currentTime, 105, 'the song moved at once');

  await new Promise((resolve) => setTimeout(resolve, 700));
  const moved = song.currentTime;
  assert.ok(moved > 105, 'the song kept moving while the button was held down');

  forward.dispatch('pointerup', {});
  const held = song.currentTime;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(song.currentTime, held, 'the song stopped when the button was let go of');
});

test('the five second buttons sit over the line that says the song plays here', () => {
  const block = PAGE.match(/<div class="songplay"[\s\S]*?<\/div>\s*\n\s*<\/section>/);
  assert.ok(block, 'the player block is in the page');
  const nav = block[0].indexOf('id="songFwd"');
  const hint = block[0].indexOf('The song plays from this machine');
  assert.ok(nav > 0, 'the buttons are in the player block');
  assert.ok(nav < hint, 'the buttons are over the line that says the song plays here');
  assert.match(PAGE, /id="songBack"/);
  assert.match(PAGE, /id="songFwd"/);
});

test('the editor toolbar carries the buttons in the order they are needed', () => {
  const block = PAGE.match(/<div class="ed-tools">([\s\S]*?)<\/div>/);
  assert.ok(block, 'the editor has a toolbar');
  const ids = [...block[1].matchAll(/id="([^"]+)"/g)].map((one) => one[1]);
  assert.deepEqual(ids, [
    'edAdd',
    'edAddUp',
    'edAddDown',
    'edSplit',
    'edMerge',
    'edRemove',
    'edCut',
    'edCopy',
    'edPaste'
  ]);
});

test('the track preview sits under the toolbar of the editor', () => {
  const tools = PAGE.indexOf('class="ed-tools"');
  const preview = PAGE.indexOf('id="edPreview"');
  const list = PAGE.indexOf('id="edList"');
  assert.ok(tools > 0, 'the editor has a toolbar');
  assert.ok(preview > tools, 'the preview is under the toolbar');
  assert.ok(preview < list, 'the preview is over the list of lines');
});

test('the track preview shows the moments of the line being worked on', async () => {
  const dom = await withLyrics();

  dom.panel.selectCue(1);

  assert.equal(dom.document.getElementById('edPreviewNum').textContent, '2', 'the number of the line');
  assert.equal(
    dom.document.getElementById('edPreviewStart').textContent,
    '00:00:22,880',
    'the moment the line starts at'
  );
  assert.equal(
    dom.document.getElementById('edPreviewEnd').textContent,
    '00:00:28,360',
    'the moment the line ends at'
  );
  assert.match(dom.document.getElementById('edPreviewWords').textContent, /বলতে তবু/);
});

test('the track preview writes the moments the way the file writes them', async () => {
  const dom = await withLyrics();
  dom.panel.selectCue(0);

  const start = dom.document.getElementById('edPreviewStart').textContent;
  const end = dom.document.getElementById('edPreviewEnd').textContent;
  assert.match(start, /^\d{2}:\d{2}:\d{2},\d{3}$/, 'the start is in the form of the file');
  assert.match(end, /^\d{2}:\d{2}:\d{2},\d{3}$/, 'the end is in the form of the file');
});

test('the track preview follows the moments that are changed', async () => {
  const dom = await withLyrics();
  dom.panel.selectCue(0);

  const field = startField(dom, 0);
  field.value = '00:01:02,345';
  field.dispatch('change', {});

  assert.equal(
    dom.document.getElementById('edPreviewStart').textContent,
    '00:01:02,345',
    'the preview shows the moment that was typed'
  );
});

test('the track preview shows the line that is chosen', async () => {
  const dom = await withLyrics();

  dom.panel.selectCue(0);
  assert.match(dom.document.getElementById('edPreviewWords').textContent, /বলতে যে মনে হয়/);

  dom.panel.selectCue(1);
  assert.match(dom.document.getElementById('edPreviewWords').textContent, /বলতে তবু/);
});

test('a line is added above the line being worked on', async () => {
  const dom = await withLyrics();

  dom.panel.selectCue(0);
  dom.document.getElementById('edAddUp').click();

  assert.equal(editorRows(dom).length, 3, 'a line was added');
  assert.equal(startField(dom, 0).value, '00:00:00,000', 'the new line is at the top');
  assert.equal(endField(dom, 0).value, '00:00:14,880', 'the new line ends where the line below it starts');
  assert.equal(startField(dom, 1).value, '00:00:14,880', 'the line that was chosen is still there');
  assert.match(dom.document.getElementById('edNote').textContent, /above/);
});

test('a line is added under the line being worked on', async () => {
  const dom = await withLyrics();

  dom.panel.selectCue(0);
  dom.document.getElementById('edAddDown').click();

  assert.equal(editorRows(dom).length, 3, 'a line was added');
  assert.equal(startField(dom, 1).value, '00:00:22,880', 'the new line is under the line that was chosen');
  assert.equal(endField(dom, 1).value, '00:00:25,880', 'the new line lasts three seconds');
  assert.equal(startField(dom, 2).value, '00:00:22,880', 'the line that was chosen is still there');
  assert.match(dom.document.getElementById('edNote').textContent, /under/);
});

test('a line is added at the top and at the end with no line chosen', async () => {
  const dom = await withLyrics();

  dom.panel.selectCue(-1);
  dom.document.getElementById('edAddUp').click();
  assert.equal(editorRows(dom).length, 3, 'a line was added');
  assert.equal(startField(dom, 0).value, '00:00:00,000', 'the new line is at the top');

  dom.panel.selectCue(-1);
  dom.document.getElementById('edAddDown').click();
  assert.equal(editorRows(dom).length, 4, 'another line was added');
  assert.equal(startField(dom, 3).value, '00:00:28,360', 'the new line is at the end');
});

test('a line is added in the middle of the list', async () => {
  const dom = await withLyrics();

  dom.panel.selectCue(0);
  dom.document.getElementById('edAddUp').click();
  dom.panel.selectCue(2);
  dom.document.getElementById('edAddDown').click();

  assert.equal(editorRows(dom).length, 4, 'two lines were added');
  assert.equal(startField(dom, 3).value, '00:00:28,360', 'the new line is under the last line');
  assert.equal(endField(dom, 3).value, '00:00:31,360', 'the new line lasts three seconds');
});

test('the space bar starts and stops the song', async () => {
  const dom = await withLyrics();
  const song = withSong(dom);
  const wrap = dom.document.getElementById('songplay');
  const button = dom.document.getElementById('songPlay');

  dom.document.dispatch('keydown', { key: ' ', target: null, preventDefault() {} });
  assert.equal(song.paused, false, 'the space bar started the song');
  song.dispatch('play', {});
  assert.equal(wrap.classList.contains('playing'), true, 'the button shows that the song is playing');
  assert.equal(button.getAttribute('aria-label'), 'Pause the song', 'the button says it will stop the song');

  dom.document.dispatch('keydown', { key: ' ', target: null, preventDefault() {} });
  assert.equal(song.paused, true, 'the space bar stopped the song');
  song.dispatch('pause', {});
  assert.equal(wrap.classList.contains('playing'), false, 'the button shows that the song is stopped');
  assert.equal(button.getAttribute('aria-label'), 'Play the song', 'the button says it will start the song');
});

test('the song carries on from the moment it was paused at', async () => {
  const dom = await withLyrics();
  const song = withSong(dom);
  song.currentTime = 42;

  dom.document.dispatch('keydown', { key: ' ', target: null, preventDefault() {} });
  assert.equal(song.currentTime, 42, 'the song did not move when it was started');

  dom.document.dispatch('keydown', { key: ' ', target: null, preventDefault() {} });
  assert.equal(song.currentTime, 42, 'the song did not move when it was stopped');
});

test('a box of words keeps the space bar', async () => {
  const dom = await withLyrics();
  const song = withSong(dom);

  dom.document.dispatch('keydown', {
    key: ' ',
    target: wordsBox(dom, 0),
    preventDefault() {}
  });
  assert.equal(song.paused, true, 'a space in a box of words did not start the song');
});

test('the button of the player starts and stops the song as well', async () => {
  const dom = await withLyrics();
  const song = withSong(dom);
  const button = dom.document.getElementById('songPlay');

  button.click();
  assert.equal(song.paused, false, 'the button started the song');

  button.click();
  assert.equal(song.paused, true, 'the button stopped the song');
});

test('the keys of the editor put a line above and under', async () => {
  const dom = await withLyrics();

  dom.panel.selectCue(1);
  dom.document.dispatch('keydown', {
    key: 'ArrowUp',
    altKey: true,
    target: null,
    preventDefault() {}
  });
  assert.equal(editorRows(dom).length, 3, 'a line was added above');
  assert.equal(startField(dom, 1).value, '00:00:22,880', 'the new line is above the line that was chosen');

  dom.document.dispatch('keydown', {
    key: 'ArrowDown',
    altKey: true,
    target: null,
    preventDefault() {}
  });
  assert.equal(editorRows(dom).length, 4, 'a line was added under');
});

test('the footer of the panel shows the version of the extension that is loaded', () => {  const dom = loadPanel({ chromeVersion: '9.9.9' });

  assert.equal(
    dom.document.getElementById('licenceVersion').textContent,
    'V9.9.9',
    'the footer shows the version of the manifest that is loaded'
  );
});

test('the footer keeps its number when the browser says nothing', () => {
  const dom = loadPanel();

  assert.equal(
    dom.document.getElementById('licenceVersion').textContent,
    '',
    'the panel does not invent a number when there is no manifest to read'
  );
});

test('every line of the editor carries a pause button beside the play button', async () => {
  const dom = await withLyrics();
  const rows = editorRows(dom);

  assert.ok(rows.length >= 1, 'there are lines to work on');
  for (let i = 0; i < rows.length; i++) {
    const head = rows[i].children[0];
    const buttons = head.children.filter((one) => String(one.className).indexOf('ed-play') >= 0);
    assert.equal(buttons.length, 2, `line ${i + 1} carries a play button and a pause button`);
    assert.equal(buttons[0].textContent, 'play', `line ${i + 1} has the play button`);
    assert.equal(buttons[1].textContent, 'pause', `line ${i + 1} has the pause button`);
  }
});

test('the pause button of a line stops the song where it is', async () => {
  const dom = await withLyrics();
  const song = withSong(dom);
  song.currentTime = 42;

  // the song is playing
  dom.document.getElementById('songPlay').click();
  assert.equal(song.paused, false, 'the song is playing');

  // the pause button of the first line stops it
  const head = editorRows(dom)[0].children[0];
  const pause = head.children.filter((one) => String(one.className).indexOf('ed-pause') >= 0)[0];
  pause.click();

  assert.equal(song.paused, true, 'the song was stopped');
  assert.equal(song.currentTime, 42, 'the song did not move when it was stopped');
});

test('the track preview carries a pause button and a play button', async () => {
  const dom = await withLyrics();
  const song = withSong(dom);
  song.currentTime = 42;

  assert.match(PAGE, /id="edPreviewPlay"/, 'the preview has a play button');
  assert.match(PAGE, /id="edPreviewPause"/, 'the preview has a pause button');

  dom.document.getElementById('songPlay').click();
  dom.document.getElementById('edPreviewPause').click();
  assert.equal(song.paused, true, 'the preview stopped the song');
  assert.equal(song.currentTime, 42, 'the song did not move when it was stopped');
});

test('the player carries a pause button of its own', async () => {
  const dom = await withLyrics();
  const song = withSong(dom);

  dom.document.getElementById('songPlay').click();
  assert.equal(song.paused, false, 'the song is playing');

  dom.document.getElementById('songPause').click();
  assert.equal(song.paused, true, 'the pause button stopped the song');
});

test('the track controller of the editor runs like a stopwatch', async () => {
  const dom = await withLyrics();
  const song = withSong(dom);

  song.dispatch('loadedmetadata', {});
  assert.equal(
    dom.document.getElementById('edTrackTotal').textContent,
    '00:05:00,000',
    'the length of the song is written as a subtitle file writes it'
  );

  song.currentTime = 18.64;
  song.dispatch('timeupdate', {});
  assert.equal(
    dom.document.getElementById('edTrackNow').textContent,
    '00:00:18,640',
    'the moment of the song runs like a stopwatch'
  );

  // the bar of the controller follows the song
  assert.equal(
    Number(dom.document.getElementById('edTrackSeek').value),
    18.64,
    'the bar of the controller is at the moment of the song'
  );
});

test('the footer carries a button that goes back to the top', () => {
  const dom = loadPanel();

  assert.match(PAGE, /id="toTop"/, 'the button is in the footer');
  assert.match(PAGE, /Back to top/, 'the button says what it does');

  const button = dom.document.getElementById('toTop');
  button.click();
  assert.ok(true, 'the button does not throw when there is no page to scroll');
});
