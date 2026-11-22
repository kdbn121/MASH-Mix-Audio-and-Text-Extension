/**
 * The subtitle editor, driven for real.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * Run: node --test tests/
 *
 * The rules of the editor are loaded on their own, and the panel is loaded on
 * top of them in a small stand in for the browser. The lyrics the stood in
 * engine answers with are edited, cut, copied, pasted, split and merged, and
 * every change is looked for in the text and in the subtitle file.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EDITOR = readFileSync(join(ROOT, 'src/sidepanel/editor.js'), 'utf8');

/** Load the rules of the editor on their own. */
function loadEditor() {
  const sandbox = { console, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(EDITOR, context, { filename: 'editor.js' });
  return sandbox.MASH_MIX.editor;
}

const BANGLA = 'আমাদের কাছে ইমেইল করার ঠিকানা';
const TAMIL = 'எங்கள் அன்பின் சருக்கம்';
const ARABIC = 'أهلا وسهلا';

test('a timestamp is written the way a player reads it', () => {
  const ed = loadEditor();
  assert.equal(ed.formatTime(0), '00:00:00,000');
  assert.equal(ed.formatTime(14.88), '00:00:14,880');
  assert.equal(ed.formatTime(3661.5), '01:01:01,500');
  assert.equal(ed.formatTime(7322.25), '02:02:02,250');
});

test('a timestamp a person typed is read back', () => {
  const ed = loadEditor();
  assert.equal(ed.parseTime('00:00:14,880', true), 14.88);
  assert.equal(ed.parseTime('00:00:14.880', true), 14.88);
  assert.equal(ed.parseTime('01:01:01,500', true), 3661.5);
  assert.equal(ed.parseTime('00:14,880', false), 14.88);
  assert.equal(ed.parseTime('14.88', false), 14.88);
  assert.equal(ed.parseTime('nonsense', false), null);
});

test('the strict form is only the one the file uses', () => {
  const ed = loadEditor();
  // A moment with no milliseconds is not the strict form, so the file does
  // not jump about while the field is still being typed.
  assert.equal(ed.parseTime('00:00:14', true), null);
  assert.equal(ed.parseTime('00:00:14', false), null);
});

test('a subtitle file numbers its cues from one', () => {
  const ed = loadEditor();
  const srt = ed.buildSrt([
    { start: 0, end: 2.5, text: 'প্রথম লাইন' },
    { start: 2.5, end: 5.125, text: 'দ্বিতীয় লাইন' }
  ]);
  assert.equal(
    srt,
    '1\n' +
    '00:00:00,000 --> 00:00:02,500\n' +
    'প্রথম লাইন\n' +
    '\n' +
    '2\n' +
    '00:00:02,500 --> 00:00:05,125\n' +
    'দ্বিতীয় লাইন\n'
  );
});

test('a subtitle file holds a line of words in two lines', () => {
  const ed = loadEditor();
  const srt = ed.buildSrt([{ start: 0, end: 2, text: 'প্রথম\nদ্বিতীয়' }]);
  assert.match(srt, /প্রথম\nদ্বিতীয়/);
});

test('a cue with no words is left out of the file', () => {
  const ed = loadEditor();
  const srt = ed.buildSrt([
    { start: 0, end: 1, text: 'প্রথম' },
    { start: 1, end: 2, text: '   ' },
    { start: 2, end: 3, text: 'তৃতীয়' }
  ]);
  assert.equal(srt.match(/^\d+$/gm).length, 2, 'only the two lines with words are in the file');
  assert.match(srt, /^2\n00:00:02,000/m);
});

test('the plain text is one cue to a line', () => {
  const ed = loadEditor();
  assert.equal(
    ed.buildTxt([
      { start: 0, end: 1, text: 'প্রথম লাইন' },
      { start: 1, end: 2, text: 'দ্বিতীয় লাইন' }
    ]),
    'প্রথম লাইন\nদ্বিতীয় লাইন'
  );
});

test('the words of any script are carried through whole', () => {
  const ed = loadEditor();
  const cues = [
    { start: 0, end: 1, text: BANGLA },
    { start: 1, end: 2, text: TAMIL },
    { start: 2, end: 3, text: ARABIC }
  ];
  const srt = ed.buildSrt(cues);
  assert.match(srt, new RegExp(BANGLA));
  assert.match(srt, new RegExp(TAMIL));
  assert.match(srt, new RegExp(ARABIC));
  assert.equal(ed.buildTxt(cues), BANGLA + '\n' + TAMIL + '\n' + ARABIC);
});

test('a line is cut in half and the time is shared out', () => {
  const ed = loadEditor();
  const parts = ed.splitCue({ start: 10, end: 20, text: 'চারটি শব্দ হয়' }, 5);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].text, 'চারটি');
  assert.equal(parts[1].text, 'শব্দ হয়');
  assert.equal(parts[0].start, 10);
  assert.equal(parts[0].end, parts[1].start, 'the two halves meet at one moment');
  assert.equal(parts[1].end, 20);
});

test('two lines are joined into one', () => {
  const ed = loadEditor();
  const joined = ed.mergeCues(
    { start: 10, end: 20, text: 'প্রথম অংশ' },
    { start: 20, end: 30, text: 'দ্বিতীয় অংশ' }
  );
  assert.equal(joined.start, 10);
  assert.equal(joined.end, 30);
  assert.equal(joined.text, 'প্রথম অংশ দ্বিতীয় অংশ');
});

test('a new line fits between the ones around it', () => {
  const ed = loadEditor();
  const cue = ed.blankCue({ start: 10, end: 20, text: 'আগের' }, { start: 30, end: 40, text: 'পরের' });
  assert.equal(cue.start, 20);
  assert.ok(cue.end <= 30, 'the new line does not run over the next one');
  assert.equal(cue.text, '');
});

test('a cue that ends before it starts is held to its own start', () => {
  const ed = loadEditor();
  assert.equal(ed.cueEnd({ start: 10, end: 5 }), 10);
  const srt = ed.buildSrt([{ start: 10, end: 5, text: 'শব্দ' }]);
  assert.match(srt, /00:00:10,000 --> 00:00:10,000/);
});

test('a start that goes past the end takes the end with it', () => {
  const ed = loadEditor();
  const moved = ed.setStart({ start: 10, end: 20, text: 'শব্দ' }, 60);
  assert.equal(moved.start, 60);
  assert.equal(moved.end, 70, 'the line keeps the length it had');
  assert.equal(moved.text, 'শব্দ', 'the words are not touched');
});

test('an end that goes before the start takes the start with it', () => {
  const ed = loadEditor();
  const moved = ed.setEnd({ start: 10, end: 20, text: 'শব্দ' }, 5);
  assert.equal(moved.end, 5);
  assert.equal(moved.start, 0, 'the line keeps its length and never starts before zero');
});

test('a moment is never written as one that ends before it starts', () => {
  const ed = loadEditor();
  const srt = ed.buildSrt([
    ed.setStart({ start: 10, end: 20, text: 'প্রথম' }, 60),
    ed.setEnd({ start: 20, end: 30, text: 'দ্বিতীয়' }, 25)
  ]);
  const moments = srt.match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/g);
  assert.equal(moments.length, 2);
  for (const one of moments) {
    const pair = one.split(' --> ');
    assert.ok(pair[0] <= pair[1], `${one} starts before it ends`);
  }
});
