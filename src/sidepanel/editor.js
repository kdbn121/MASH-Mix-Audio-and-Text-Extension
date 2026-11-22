/*!
 * MASH-Mix-Audio-and-Text, the subtitle editor.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * The rules of the editor, with nothing of the page in them.
 *
 * A cue is a moment and the words that are said in it. The editor holds a list
 * of cues and can do four things with them: write them out as a subtitle file,
 * write them out as plain text, cut one in half, and join two of them. The page
 * above does the rest.
 *
 * The words are held as they were typed. Nothing here changes the letters, so
 * a word in Bangla, in Tamil, in Arabic or in Latin is carried through whole.
 */
'use strict';

(function () {
  var root = (globalThis.MASH_MIX = globalThis.MASH_MIX || {});

  /**
   * A timestamp as it is written in a subtitle file: HH:MM:SS,mmm.
   *
   * The hours are always two digits and the milliseconds always three, because
   * that is what a player reads. A file written any other way is read by some
   * players and not by others.
   */
  function formatTime(seconds) {
    var total = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
    var millis = total % 1000;
    var all = Math.floor(total / 1000);
    var secs = all % 60;
    var mins = Math.floor(all / 60) % 60;
    var hours = Math.floor(all / 3600);
    function pad(value, size) {
      var out = String(value);
      while (out.length < size) out = '0' + out;
      return out;
    }
    return pad(hours, 2) + ':' + pad(mins, 2) + ':' + pad(secs, 2) + ',' + pad(millis, 3);
  }

  /**
   * Read a timestamp a person typed.
   *
   * The strict form is the one the file uses, `HH:MM:SS,mmm`, and a full stop
   * is taken for a comma. The lenient form also takes `MM:SS.mmm` and a plain
   * number of seconds, because a person in a hurry writes that.
   *
   * The strict form is what the editor applies while the field is being
   * typed, so the file on the screen never jumps about under the caret. The
   * lenient form is what it applies when the field is finished with.
   */
  function parseTime(value, strict) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return null;
    var full = /^(\d{1,3}):(\d{1,2}):(\d{1,2})([.,])(\d{1,3})$/.exec(text);
    if (full) {
      var ms = full[5];
      while (ms.length < 3) ms = ms + '0';
      return Number(full[1]) * 3600 + Number(full[2]) * 60 + Number(full[3]) +
        Number(ms) / 1000;
    }
    if (strict) return null;
    var short = /^(\d{1,3}):(\d{1,2})([.,])(\d{1,3})$/.exec(text);
    if (short) {
      var ms2 = short[4];
      while (ms2.length < 3) ms2 = ms2 + '0';
      return Number(short[1]) * 60 + Number(short[2]) + Number(ms2) / 1000;
    }
    var plain = /^(\d+)([.,]\d+)?$/.exec(text);
    if (plain) return Number(text.replace(',', '.'));
    return null;
  }

  /** The moment a cue starts, as a number of seconds. */
  function cueStart(cue) {
    return Number(cue && cue.start) || 0;
  }

  /** The moment a cue ends, as a number of seconds. */
  function cueEnd(cue) {
    var end = Number(cue && cue.end) || 0;
    var start = cueStart(cue);
    return end < start ? start : end;
  }

  /**
   * The subtitle file of a list of cues.
   *
   * The cues are numbered in the order they are in, from one, and each one is
   * written as its number, its moment, and its words. A blank line separates
   * one cue from the next, which is what a player reads.
   */
  function buildSrt(cues) {
    var blocks = [];
    var number = 0;
    for (var i = 0; i < cues.length; i++) {
      var cue = cues[i];
      var text = String(cue.text == null ? '' : cue.text).replace(/[ \t]+$/gm, '');
      if (!text.trim()) continue;
      number = number + 1;
      blocks.push(
        number + '\n' +
        formatTime(cueStart(cue)) + ' --> ' + formatTime(cueEnd(cue)) + '\n' +
        text.replace(/\r\n/g, '\n').replace(/\n+$/, '')
      );
    }
    return blocks.join('\n\n') + (blocks.length ? '\n' : '');
  }

  /**
   * The plain text of a list of cues.
   *
   * One cue to a line, which is what the engine writes as the text file.
   */
  function buildTxt(cues) {
    var lines = [];
    for (var i = 0; i < cues.length; i++) {
      var text = String(cues[i].text == null ? '' : cues[i].text).trim();
      if (!text) continue;
      lines.push(text);
    }
    return lines.join('\n');
  }

  /**
   * Move the start of a cue, and take the end with it when it has to.
   *
   * A cue that ends before it starts is a broken cue, and a broken cue is not
   * written to the file. So when the start goes past the end, the end goes
   * with it and the line keeps the length it had. The same is true the other
   * way round, for the end.
   */
  function setStart(cue, at) {
    var start = Math.max(0, Number(at) || 0);
    var length = cueEnd(cue) - cueStart(cue);
    var out = { start: start, end: cueEnd(cue), text: cue.text };
    if (out.end < start) out.end = start + length;
    return out;
  }

  /**
   * Move the end of a cue, and take the start with it when it has to.
   */
  function setEnd(cue, at) {
    var end = Math.max(0, Number(at) || 0);
    var length = cueEnd(cue) - cueStart(cue);
    var out = { start: cueStart(cue), end: end, text: cue.text };
    if (end < out.start) {
      out.start = Math.max(0, end - length);
      if (out.start > end) out.start = end;
    }
    return out;
  }

  /**
   * Cut a cue in half at a place in its words.
   *
   * The moment of the cut is shared out in the same proportion as the words,
   * so the first half keeps the time it had and the second half starts where
   * the first one ends.
   */
  function splitCue(cue, at) {
    var text = String(cue.text == null ? '' : cue.text);
    var cut = Number(at);
    if (!isFinite(cut) || cut < 0) cut = 0;
    if (cut > text.length) cut = text.length;
    var first = text.slice(0, cut).replace(/\s+$/, '');
    var second = text.slice(cut).replace(/^\s+/, '');
    var start = cueStart(cue);
    var end = cueEnd(cue);
    var total = text.length || 1;
    var middle = start + (end - start) * (first.length / total);
    if (middle < start) middle = start;
    if (middle > end) middle = end;
    return [
      { start: start, end: middle, text: first },
      { start: middle, end: end, text: second }
    ];
  }

  /**
   * Join two cues into one.
   *
   * The joined cue starts when the first one started and ends when the second
   * one ended, and the words are put side by side.
   */
  function mergeCues(one, two) {
    var first = String(one && one.text == null ? '' : one.text).trim();
    var second = String(two && two.text == null ? '' : two.text).trim();
    var text = first ? (second ? first + ' ' + second : first) : second;
    var start = cueStart(one);
    var end = cueEnd(two);
    if (end < start) end = start;
    return { start: start, end: end, text: text };
  }

  /**
   * A new empty cue that fits between the ones around it.
   *
   * It starts where the cue before it ends and it lasts three seconds, which
   * is long enough to type a line into.
   */
  function blankCue(before, after) {
    var start = before ? cueEnd(before) : 0;
    var end = start + 3;
    if (after && cueStart(after) > start) end = cueStart(after);
    return { start: start, end: end, text: '' };
  }

  root.editor = {
    formatTime: formatTime,
    parseTime: parseTime,
    cueStart: cueStart,
    cueEnd: cueEnd,
    buildSrt: buildSrt,
    buildTxt: buildTxt,
    splitCue: splitCue,
    mergeCues: mergeCues,
    blankCue: blankCue,
    setStart: setStart,
    setEnd: setEnd
  };
})();
