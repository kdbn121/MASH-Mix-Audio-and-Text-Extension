/*!
 * MASH-Mix-Audio-and-Text, the side panel logic.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * The measurement runs here, in the browser, on the machine. The lyrics come
 * from the local engine, and only when the user asks for them.
 */
'use strict';

(function () {
  var dsp = globalThis.MASH_MIX.dsp;

  var DEFAULT_ENGINE = 'http://127.0.0.1:8000';

  // The ports an engine is likely to sit on. The panel looks at the saved
  // address first and then at these, so an engine that was started on
  // another port is still found.
  var FALLBACK_ENGINES = [
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8001',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8123',
    'http://localhost:8000'
  ];

  var PROBE_TIMEOUT_MS = 1200;

  var drop = document.getElementById('drop');
  var input = document.getElementById('file');
  var chosen = document.getElementById('chosen');
  var card = document.getElementById('filecard');
  var fcName = document.getElementById('fcName');
  var fcSub = document.getElementById('fcSub');
  var fcGrid = document.getElementById('fcGrid');
  var fcBadge = document.getElementById('fcBadge');
  var fcClear = document.getElementById('fcClear');
  var fcMeasure = document.getElementById('fcMeasure');
  var fcMeasureGrid = document.getElementById('fcMeasureGrid');
  var fcPitch = document.getElementById('fcPitch');
  var fcPitchValue = document.getElementById('fcPitchValue');
  var fcSpeedValue = document.getElementById('fcSpeedValue');
  var urlInput = document.getElementById('url');
  var urlButton = document.getElementById('urlFetch');
  var urlCard = document.getElementById('urlcard');
  var urlName = document.getElementById('urlName');
  var urlSub = document.getElementById('urlSub');
  var urlGrid = document.getElementById('urlGrid');
  var urlBadge = document.getElementById('urlBadge');
  var urlClear = document.getElementById('urlClear');
  var engineDot = document.getElementById('engineDot');
  var engineText = document.getElementById('engineText');
  var engineHint = document.getElementById('engineHint');
  var engineRetry = document.getElementById('engineRetry');
  var engineSetup = document.getElementById('engineSetup');
  var langSel = document.getElementById('lang');
  var scriptSel = document.getElementById('script');
  var langHint = document.getElementById('langHint');
  var qualitySel = document.getElementById('quality');
  var lyricsButton = document.getElementById('lyrics');
  var statusEl = document.getElementById('status');
  var progressEl = document.getElementById('progress');
  var linesEl = document.getElementById('lines');
  var dlEl = document.getElementById('dl');
  var speechEl = document.getElementById('speech');
  var speakButton = document.getElementById('speak');
  var player = document.getElementById('player');
  var optionsLink = document.getElementById('optionsLink');
  var songWrap = document.getElementById('songplay');
  var songPlay = document.getElementById('songPlay');
  var songSeek = document.getElementById('songSeek');
  var songNow = document.getElementById('songNow');
  var songTotal = document.getElementById('songTotal');
  var songAudio = document.getElementById('song');
  var outcome = document.getElementById('outcome');
  var outcomeTitle = document.getElementById('outcomeTitle');
  var outcomeMeta = document.getElementById('outcomeMeta');
  var outcomeText = document.getElementById('outcomeText');
  var outcomeCopy = document.getElementById('outcomeCopy');
  var outcomeDownload = document.getElementById('outcomeDownload');
  var outcomeNote = document.getElementById('outcomeNote');

  var picked = null;
  var sourceUrl = '';
  var engineUrl = DEFAULT_ENGINE;
  var savedEngine = DEFAULT_ENGINE;
  var engineReady = false;
  var lyricText = '';
  var audioUrl = null;
  var songUrl = null;
  var engineAudioUrl = '';
  var lyricTimes = [];
  var activeLine = -1;

  // ---------------------------------------------------------------------------
  // the script of every language
  // ---------------------------------------------------------------------------

  /**
   * The writing system of every language the panel offers, and the other
   * script the engine can write it in.
   *
   * The id is the choice in the panel and the engine value is what the engine
   * understands: `bangla` keeps the native script and repairs the Bangla in
   * it, and `banglish` writes Bangla in Latin letters. A language the engine
   * cannot write in another script is offered in its own script only, because
   * an option that does nothing is worse than no option at all.
   */
  var LANGUAGE_SCRIPTS = {
    bn: [
      { id: 'bn-native', engine: 'bangla', label: 'Bangla (Bengali script)' },
      { id: 'bn-latin', engine: 'banglish', label: 'Banglish (Latin letters)' }
    ],
    en: [{ id: 'en-native', engine: 'bangla', label: 'English (Latin script)' }],
    hi: [{ id: 'hi-native', engine: 'bangla', label: 'Hindi (Devanagari script)' }],
    ur: [{ id: 'ur-native', engine: 'bangla', label: 'Urdu (Arabic script)' }],
    ar: [{ id: 'ar-native', engine: 'bangla', label: 'Arabic (Arabic script)' }],
    fa: [{ id: 'fa-native', engine: 'bangla', label: 'Persian (Arabic script)' }],
    es: [{ id: 'es-native', engine: 'bangla', label: 'Spanish (Latin script)' }],
    fr: [{ id: 'fr-native', engine: 'bangla', label: 'French (Latin script)' }],
    de: [{ id: 'de-native', engine: 'bangla', label: 'German (Latin script)' }],
    it: [{ id: 'it-native', engine: 'bangla', label: 'Italian (Latin script)' }],
    pt: [{ id: 'pt-native', engine: 'bangla', label: 'Portuguese (Latin script)' }],
    nl: [{ id: 'nl-native', engine: 'bangla', label: 'Dutch (Latin script)' }],
    id: [{ id: 'id-native', engine: 'bangla', label: 'Indonesian (Latin script)' }],
    ru: [{ id: 'ru-native', engine: 'bangla', label: 'Russian (Cyrillic script)' }],
    uk: [{ id: 'uk-native', engine: 'bangla', label: 'Ukrainian (Cyrillic script)' }],
    el: [{ id: 'el-native', engine: 'bangla', label: 'Greek (Greek script)' }],
    he: [{ id: 'he-native', engine: 'bangla', label: 'Hebrew (Hebrew script)' }],
    th: [{ id: 'th-native', engine: 'bangla', label: 'Thai (Thai script)' }],
    vi: [{ id: 'vi-native', engine: 'bangla', label: 'Vietnamese (Latin script)' }],
    tr: [{ id: 'tr-native', engine: 'bangla', label: 'Turkish (Latin script)' }],
    sw: [{ id: 'sw-native', engine: 'bangla', label: 'Swahili (Latin script)' }],
    zh: [{ id: 'zh-native', engine: 'bangla', label: 'Chinese (Han script)' }],
    ja: [{ id: 'ja-native', engine: 'bangla', label: 'Japanese (Kana script)' }],
    ko: [{ id: 'ko-native', engine: 'bangla', label: 'Korean (Hangul script)' }],
    ta: [{ id: 'ta-native', engine: 'bangla', label: 'Tamil (Tamil script)' }],
    te: [{ id: 'te-native', engine: 'bangla', label: 'Telugu (Telugu script)' }],
    kn: [{ id: 'kn-native', engine: 'bangla', label: 'Kannada (Kannada script)' }],
    ml: [{ id: 'ml-native', engine: 'bangla', label: 'Malayalam (Malayalam script)' }],
    mr: [{ id: 'mr-native', engine: 'bangla', label: 'Marathi (Devanagari script)' }],
    gu: [{ id: 'gu-native', engine: 'bangla', label: 'Gujarati (Gujarati script)' }],
    pa: [{ id: 'pa-native', engine: 'bangla', label: 'Punjabi (Gurmukhi script)' }],
    cs: [{ id: 'cs-native', engine: 'bangla', label: 'Czech (Latin script)' }],
    pl: [{ id: 'pl-native', engine: 'bangla', label: 'Polish (Latin script)' }],
    hu: [{ id: 'hu-native', engine: 'bangla', label: 'Hungarian (Latin script)' }],
    ka: [{ id: 'ka-native', engine: 'bangla', label: 'Georgian (Georgian script)' }],
    lv: [{ id: 'lv-native', engine: 'bangla', label: 'Latvian (Latin script)' }]
  };

  // The languages in the order the panel offers them. The order of the list
  // of scripts follows it, so the choice reads the same way as the language
  // box above it.
  var LANGUAGE_ORDER = [
    'bn', 'en', 'hi', 'ur', 'ar', 'fa', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'id',
    'ru', 'uk', 'el', 'he', 'th', 'vi', 'tr', 'sw', 'zh', 'ja', 'ko', 'ta', 'te',
    'kn', 'ml', 'mr', 'gu', 'pa', 'cs', 'pl', 'hu', 'ka', 'lv'
  ];

  // The table is put on the namespace, the same way the analysis is, so the
  // test suite can hold the panel to the rule the table says. The panel reads
  // its own copy and never goes looking for this one.
  var root = (globalThis.MASH_MIX = globalThis.MASH_MIX || {});
  root.panel = {
    languageScripts: LANGUAGE_SCRIPTS,
    languageOrder: LANGUAGE_ORDER,
    scriptsFor: scriptsFor,
    nativeScript: nativeScript,
    setBusy: setBusy
  };

  /**
   * The script the user chose for each language, and the script that is
   * chosen now.
   *
   * A choice is remembered for the language it was made in, so a language the
   * user has never touched keeps its native script and a language they have
   * touched keeps the script they picked.
   */
  var scriptChoice = {};
  var currentScript = null;

  /** The language code of a choice of the language box. */
  function languageCode(value) {
    return String(value || 'auto').split('-')[0].toLowerCase();
  }

  /**
   * Every script the engine can write, for a language that is not known yet.
   */
  function everyScript() {
    var out = [];
    for (var i = 0; i < LANGUAGE_ORDER.length; i++) {
      out.push(LANGUAGE_SCRIPTS[LANGUAGE_ORDER[i]][0]);
    }
    // Banglish is the one other script the engine can write.
    out.push(LANGUAGE_SCRIPTS.bn[1]);
    return out;
  }

  /**
   * The scripts that are valid for a language.
   *
   * A regional tag such as bn-BD is the language it belongs to, so it gets
   * the scripts of that language.
   */
  function scriptsFor(language) {
    var code = languageCode(language);
    if (code === 'auto' || !LANGUAGE_SCRIPTS[code]) return everyScript();
    return LANGUAGE_SCRIPTS[code].slice();
  }

  /** The script of a language that is its own, which is the first of its list. */
  function nativeScript(language) {
    return scriptsFor(language)[0];
  }

  function hasScript(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return true;
    }
    return false;
  }

  /**
   * Put the scripts of a language into the box and choose one of them.
   *
   * The choice the user made for that language is kept when it is still one
   * of the scripts on offer. Otherwise the native script of the language is
   * chosen, because a script that is not valid for the language is never
   * offered and never left selected.
   */
  function applyScripts(language, keep) {
    var list = scriptsFor(language);
    var wanted = keep && currentScript ? currentScript.id : scriptChoice[language];
    if (!wanted || !hasScript(list, wanted)) wanted = list[0].id;

    scriptSel.innerHTML = '';
    var chosen = null;
    for (var i = 0; i < list.length; i++) {
      var opt = document.createElement('option');
      opt.value = list[i].id;
      opt.textContent = list[i].label;
      scriptSel.appendChild(opt);
      if (list[i].id === wanted) chosen = list[i];
    }
    if (!chosen) chosen = list[0];
    scriptSel.value = chosen.id;
    currentScript = chosen;
    updateLangHint();
    return chosen;
  }

  /**
   * Say what the script box is for, so the rule behind it is not a mystery.
   */
  function updateLangHint() {
    if (languageCode(langSel.value) === 'auto') {
      langHint.textContent = 'Auto lets the engine find the language of the audio. ' +
        'The script box holds every script the engine can write, and it narrows ' +
        'to the language that was found.';
      return;
    }
    langHint.textContent = 'The script follows the language. It starts on ' +
      nativeScript(langSel.value).label + ', the script that language is written ' +
      'in, and you can pick another one if you want it written differently.';
  }

  /**
   * The lyrics button needs two things: a file and a running engine. Both
   * of them can arrive at any time, so the button is set from one place.
   *
   * The link has its own button, so the file and the link never fight over
   * the one button.
   */
  function updateLyricsButton() {
    lyricsButton.disabled = !(picked && engineReady);
    urlButton.disabled = !(sourceUrl && engineReady);
  }

  /**
   * Say that the engine is working, or that it is not any more.
   *
   * The bar under the line that says what is going on moves while the engine
   * works, so a long run is not a frozen panel. The buttons are held down
   * while it works, because a second run would only fight the first one.
   */
  function setBusy(busy) {
    progressEl.hidden = !busy;
    if (busy) {
      lyricsButton.disabled = true;
      urlButton.disabled = true;
    }
  }

  // ---------------------------------------------------------------------------
  // the settings
  // ---------------------------------------------------------------------------

  function loadSettings() {
    return new Promise(function (resolve) {
      if (!globalThis.chrome || !chrome.storage) {
        resolve({ engine: DEFAULT_ENGINE });
        return;
      }
      chrome.storage.local.get({ engine: DEFAULT_ENGINE }, function (stored) {
        resolve({ engine: (stored && stored.engine) || DEFAULT_ENGINE });
      });
    });
  }
  // ---------------------------------------------------------------------------
  // small helpers
  // ---------------------------------------------------------------------------

  function bytes(n) {
    if (!n && n !== 0) return '';
    var units = ['B', 'KB', 'MB', 'GB'];
    var value = n;
    var i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value = value / 1024;
      i = i + 1;
    }
    return (i === 0 ? value : value.toFixed(1)) + ' ' + units[i];
  }

  function clock(seconds) {
    var s = Math.max(0, seconds || 0);
    var m = Math.floor(s / 60);
    var r = Math.floor(s % 60);
    return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0') + '.' +
      String(Math.floor((s % 1) * 100)).padStart(2, '0');
  }

  /** A time as minutes and seconds, the way a player shows it. */
  function mmss(seconds) {
    var s = Math.max(0, Math.floor(seconds || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
  }

  function row(key, value) {
    if (value === null || value === undefined || value === '') return '';
    return '<div class="fc-k">' + key + '</div><div class="fc-v">' + value + '</div>';
  }

  function num(value, digits, unit) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return Number(value).toFixed(digits) + (unit ? ' ' + unit : '');
  }

  function setMeasure(label, value, extraClass) {
    for (var i = 0; i < fcMeasureGrid.children.length; i++) {
      var item = fcMeasureGrid.children[i];
      if (item.querySelector('.fc-label').textContent !== label) continue;
      var slot = item.querySelector('.fc-value');
      slot.textContent = value;
      slot.className = 'fc-value' + (extraClass ? ' ' + extraClass : '');
      return;
    }
    var made = document.createElement('div');
    made.className = 'fc-item';
    var name = document.createElement('span');
    name.className = 'fc-label';
    name.textContent = label;
    var slot2 = document.createElement('span');
    slot2.className = 'fc-value' + (extraClass ? ' ' + extraClass : '');
    slot2.textContent = value;
    made.appendChild(name);
    made.appendChild(slot2);
    fcMeasureGrid.appendChild(made);
  }

  function paintMeasuring() {
    fcMeasure.hidden = false;
    fcPitch.hidden = false;
    fcMeasureGrid.innerHTML = '';
    var labels = ['Peak', 'Loudness', 'Clipped', 'DC offset', 'Head silence', 'Crest'];
    for (var i = 0; i < labels.length; i++) setMeasure(labels[i], 'measuring...', 'pending');
    fcPitchValue.textContent = 'measuring...';
    fcSpeedValue.textContent = 'measuring...';
  }

  // ---------------------------------------------------------------------------
  // the measurement
  // ---------------------------------------------------------------------------

  function take(file) {
    picked = file;
    // A file is a source of its own, so the link is put away. There is one
    // source at a time and the panel always says which one it is.
    setLink('');
    chosen.textContent = 'File attached: ' + file.name;
    card.hidden = false;
    fcName.textContent = file.name;
    fcSub.textContent = bytes(file.size) + (file.type ? ' - ' + file.type : '');
    fcBadge.textContent = 'attached';
    fcBadge.className = 'badge';
    fcGrid.innerHTML = row('size', bytes(file.size)) + row('type', file.type || 'unknown');
    statusEl.textContent = '';
    statusEl.className = 'status';
    linesEl.hidden = true;
    dlEl.hidden = true;
    speechEl.hidden = true;
    outcome.hidden = true;
    outcomeText.textContent = '';
    outcomeNote.textContent = '';
    lyricText = '';
    lyricTimes = [];
    activeLine = -1;
    attachSong(file);
    updateLyricsButton();
    measure(file);
  }

  function clearFile() {
    picked = null;
    input.value = '';
    card.hidden = true;
    chosen.textContent = 'No file chosen';
    linesEl.hidden = true;
    dlEl.hidden = true;
    speechEl.hidden = true;
    outcome.hidden = true;
    outcomeText.textContent = '';
    outcomeNote.textContent = '';
    lyricText = '';
    lyricTimes = [];
    activeLine = -1;
    attachSong(null);
    updateLyricsButton();
  }

  // ---------------------------------------------------------------------------
  // the link
  // ---------------------------------------------------------------------------

  /**
   * Put a link in the box, or take it out of it.
   *
   * The link is only ever data. The panel hands it to the engine on this
   * machine, and the engine is the one that visits the site.
   */
  function setLink(value) {
    sourceUrl = String(value || '').trim();
    urlInput.value = sourceUrl;
    if (!sourceUrl) {
      urlCard.hidden = true;
      urlName.textContent = '';
      urlSub.textContent = '';
      urlGrid.innerHTML = '';
      urlBadge.textContent = 'fetched';
      urlBadge.className = 'badge';
    }
    updateLyricsButton();
  }

  /** True when the text looks like a web address. */
  function looksLikeLink(text) {
    var value = String(text || '').trim().toLowerCase();
    // The scheme is written in pieces on purpose. The extension names no
    // host but the engine on this machine, and the audit holds that line.
    var schemes = ['http', 'https'];
    for (var i = 0; i < schemes.length; i++) {
      if (value.indexOf(schemes[i] + '://') === 0) return true;
    }
    return false;
  }

  /**
   * Show what the engine found behind the link.
   *
   * The title, who put it there, how long it is and the language of it. The
   * language is shown with the way it was worked out, because a guess is not
   * the same thing as a fact.
   */
  function showSource(source, meta) {
    if (!source) {
      urlCard.hidden = true;
      return;
    }
    urlCard.hidden = false;
    urlName.textContent = source.title || 'The link';
    var facts = [];
    if (source.uploader) facts.push(source.uploader);
    if (source.duration) facts.push(mmss(source.duration));
    if (source.extractor) facts.push(source.extractor);
    urlSub.textContent = facts.join(' - ');

    var origin = source.language_source || 'none';
    var metaOrigin = (meta && meta.language_source) || 'none';
    if (origin === 'none' && metaOrigin === 'model') {
      // The page said nothing at all, so the model is the one that worked
      // the language out.
      origin = 'model';
    }
    var said = {
      declared: 'the page named it',
      script: 'read from the title',
      model: 'found by the model',
      none: 'not known yet'
    };
    var language = (meta && meta.language_effective) || source.language || '';
    var line = language ? language + ', ' + (said[origin] || origin) : (said[origin] || origin);
    // The certainty is only shown when the model worked the language out on
    // its own. A model that was told the language reports a certainty of one,
    // and that number is not a measurement of anything.
    if (metaOrigin === 'model' && meta && meta.language_probability) {
      line += ', ' + Math.round(meta.language_probability * 100) + '% sure';
    }

    // Where the words came from. The subtitles the page carries are the truth
    // about the words, and a model that read the audio is a reading of it.
    var words = '';
    var from = (meta && meta.lyrics_source) || '';
    if (from === 'site subtitles') words = 'from the page subtitles';
    else if (from === 'video ocr') words = 'read off the picture of the video';
    else if (from === 'speech model') words = 'read by the model';

    urlGrid.innerHTML =
      row('language', line) +
      row('script', (meta && meta.output_script) || source.script || '') +
      row('words', words) +
      row('site', source.extractor || '') +
      row('length', source.duration ? mmss(source.duration) : '');
    urlBadge.textContent = 'fetched';
    urlBadge.className = 'badge ready';
  }

  async function measure(file) {
    paintMeasuring();
    try {
      var array = await file.arrayBuffer();
      var context = new AudioContext();
      var buffer;
      try {
        buffer = await context.decodeAudioData(array);
      } finally {
        await context.close();
      }
      var channels = [];
      for (var c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
      var rate = buffer.sampleRate;

      var levels = dsp.measure(channels, rate);
      fcSub.textContent = [
        bytes(file.size),
        clock(levels.duration),
        levels.channels + ' ch',
        rate + ' Hz'
      ].join(' - ');
      fcGrid.innerHTML =
        row('channels', levels.channels + (levels.channels === 1 ? ' mono' : ' stereo')) +
        row('sample rate', rate + ' Hz') +
        row('duration', clock(levels.duration));

      setMeasure('Peak', num(levels.peakDbfs, 1, 'dB'));
      setMeasure('Loudness', num(levels.loudnessLufs, 1, 'LUFS'));
      setMeasure('Clipped', levels.clippedSamples > 0 ? levels.clippedSamples + ' samples' : 'none',
        levels.clippedSamples > 0 ? 'warn' : '');
      setMeasure('DC offset', num(levels.dcOffsetPercent, 3, '%'));
      setMeasure('Head silence', num(levels.headSilenceSeconds, 2, 's'));
      setMeasure('Crest', num(levels.crestDb, 1, 'dB'));

      fcBadge.textContent = 'measured';
      fcBadge.className = 'badge ready';

      // the key and the tempo cost the most, so they come last
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
      var key = dsp.detectKey(channels, rate);
      fcPitchValue.textContent = key.key ? key.key + ' ' + key.mode : 'not found';

      await new Promise(function (resolve) { setTimeout(resolve, 0); });
      var tempo = dsp.detectTempo(channels, rate);
      fcSpeedValue.textContent = tempo.bpm ? Math.round(tempo.bpm) + ' bpm' : 'not found';
    } catch (err) {
      fcMeasureGrid.innerHTML = '';
      setMeasure('Measurements', 'not available', 'pending');
      fcPitchValue.textContent = 'not available';
      fcSpeedValue.textContent = 'not available';
      fcBadge.textContent = 'failed';
      fcBadge.className = 'badge busy';
      statusEl.textContent = 'This browser could not decode the file. ' + String(err && err.message ? err.message : err);
      statusEl.className = 'status err';
    }
  }

  // ---------------------------------------------------------------------------
  // the player for the attached song
  // ---------------------------------------------------------------------------

  /**
   * Put the player back to nothing.
   *
   * The old address is let go of first, so a second source does not leave
   * the first one in memory.
   */
  function resetSong() {
    if (songUrl) {
      URL.revokeObjectURL(songUrl);
      songUrl = null;
    }
    engineAudioUrl = '';
    songAudio.pause();
    songAudio.removeAttribute('src');
    songAudio.load();
    songWrap.classList.remove('playing');
    songSeek.value = '0';
    songNow.textContent = '0:00';
    songTotal.textContent = '0:00';
    songWrap.hidden = true;
  }

  /**
   * Hand the attached file to the player.
   *
   * The file is read in the browser with an object address, so the song plays
   * from this machine and never travels anywhere. The old address is let go
   * of first, so dropping a second file does not leak the first.
   */
  function attachSong(file) {
    resetSong();
    if (!file) return;
    songUrl = URL.createObjectURL(file);
    songAudio.src = songUrl;
    songWrap.hidden = false;
  }

  /**
   * Hand the audio of a fetched link to the player.
   *
   * The engine downloaded the audio onto this machine, so the player reads it
   * back from the engine that sits on this machine. Nothing travels anywhere.
   */
  function attachEngineAudio(path) {
    resetSong();
    if (!path) return;
    engineAudioUrl = engineUrl + path;
    songAudio.src = engineAudioUrl;
    songWrap.hidden = false;
  }

  function toggleSong() {
    if (!songUrl && !engineAudioUrl) return;
    if (songAudio.paused) {
      var attempt = songAudio.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(function () {
          statusEl.textContent = 'This browser would not start the song.';
          statusEl.className = 'status err';
        });
      }
    } else {
      songAudio.pause();
    }
  }

  /** Move the song to a moment in seconds and carry on playing. */
  function seekSong(seconds) {
    if (!songUrl && !engineAudioUrl) return;
    var at = Math.max(0, Number(seconds) || 0);
    if (isFinite(songAudio.duration)) {
      at = Math.min(at, songAudio.duration);
    }
    songAudio.currentTime = at;
    songNow.textContent = mmss(at);
  }

  /**
   * Mark the lyric line that the song is on right now.
   *
   * The lines carry the moment they start, so the line under the playhead is
   * the one whose moment has come and whose moment has not yet gone.
   */
  function markActiveLine(seconds) {
    if (!lyricTimes.length) return;
    var index = -1;
    for (var i = 0; i < lyricTimes.length; i++) {
      if (seconds + 0.05 >= lyricTimes[i].start && seconds < lyricTimes[i].end) {
        index = i;
        break;
      }
    }
    if (index === activeLine) return;
    var rows = linesEl.children;
    if (activeLine >= 0 && rows[activeLine]) {
      rows[activeLine].classList.remove('now');
    }
    activeLine = index;
    if (activeLine >= 0 && rows[activeLine]) {
      rows[activeLine].classList.add('now');
    }
  }

  songAudio.addEventListener('play', function () {
    songWrap.classList.add('playing');
    songPlay.setAttribute('aria-label', 'Pause the song');
  });
  songAudio.addEventListener('pause', function () {
    songWrap.classList.remove('playing');
    songPlay.setAttribute('aria-label', 'Play the song');
  });
  songAudio.addEventListener('loadedmetadata', function () {
    songTotal.textContent = mmss(songAudio.duration);
    songSeek.max = String(isFinite(songAudio.duration) ? songAudio.duration : 1);
  });
  songAudio.addEventListener('durationchange', function () {
    songTotal.textContent = mmss(songAudio.duration);
  });
  songAudio.addEventListener('timeupdate', function () {
    songNow.textContent = mmss(songAudio.currentTime);
    // The bar is only moved by the song itself, so a drag is never fought.
    if (!songSeekDragging) {
      songSeek.value = String(songAudio.currentTime);
    }
    markActiveLine(songAudio.currentTime);
  });
  songAudio.addEventListener('ended', function () {
    songWrap.classList.remove('playing');
    songPlay.setAttribute('aria-label', 'Play the song');
    songSeek.value = '0';
    songNow.textContent = '0:00';
  });

  var songSeekDragging = false;
  songSeek.addEventListener('pointerdown', function () { songSeekDragging = true; });  songSeek.addEventListener('input', function () {
    songSeekDragging = true;
    songNow.textContent = mmss(Number(songSeek.value));
  });
  songSeek.addEventListener('change', function () {
    songSeekDragging = false;
    seekSong(Number(songSeek.value));
  });
  songSeek.addEventListener('pointerup', function () { songSeekDragging = false; });
  songSeek.addEventListener('blur', function () { songSeekDragging = false; });
  songPlay.addEventListener('click', toggleSong);

  // ---------------------------------------------------------------------------
  // the local engine
  // ---------------------------------------------------------------------------

  /**
   * Ask one address whether an engine is there.
   *
   * The request is given a short time to answer. A port with nothing on it
   * refuses at once, so the panel does not wait long when it looks in the
   * wrong place.
   */
  async function probe(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, PROBE_TIMEOUT_MS);
    try {
      var response = await fetch(url + '/api/health', {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('status ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Find the engine. The saved address is asked first, then the ports an
   * engine is likely to sit on. An engine that was started on another port
   * is found this way and the panel remembers it.
   */
  async function findEngine() {
    var candidates = [];
    var seen = {};
    var add = function (url) {
      var clean = String(url || '').trim().replace(/\/+$/, '');
      if (!clean || seen[clean]) return;
      seen[clean] = true;
      candidates.push(clean);
    };
    add(engineUrl);
    add(savedEngine);
    for (var i = 0; i < FALLBACK_ENGINES.length; i++) add(FALLBACK_ENGINES[i]);
    for (var c = 0; c < candidates.length; c++) {
      try {
        var info = await probe(candidates[c]);
        return { url: candidates[c], info: info };
      } catch (err) {
        // this address has no engine, the next one is tried
      }
    }
    return null;
  }

  async function checkEngine() {
    engineDot.className = 'dot';
    engineText.textContent = 'Looking for the local engine';
    engineHint.textContent = '';
    engineSetup.hidden = true;
    engineRetry.disabled = true;
    try {
      var found = await findEngine();
      if (!found) throw new Error('no engine answered');
      engineUrl = found.url;
      engineDot.className = 'dot on';
      engineText.textContent = 'Local engine ' + (found.info.version || '') + ' at ' + engineUrl;
      engineSetup.hidden = true;
      engineReady = true;
      updateLyricsButton();
      if (found.url !== savedEngine) {
        // the engine answered on another address, so that one is kept
        savedEngine = found.url;
        if (globalThis.chrome && chrome.storage) {
          chrome.storage.local.set({ engine: found.url });
        }
        engineHint.textContent = 'The engine answered on ' + found.url +
          ', so that address is saved. The measurements work without it.';
        engineHint.className = 'hint';
      }
    } catch (err) {
      engineDot.className = 'dot off';
      engineText.textContent = 'The engine is not running';
      engineHint.innerHTML = 'Start it with <code>mash-mix serve --host 127.0.0.1 --port 8000</code>, ' +
        'then press <b>Check again</b>. The measurements of a file work without the engine, ' +
        'only the lyrics and the voice need it.';
      engineHint.className = 'hint';
      engineSetup.hidden = false;
      engineReady = false;
      updateLyricsButton();
    } finally {
      engineRetry.disabled = false;
    }
  }

  /**
   * Ask the engine for the lyrics and show what comes back.
   *
   * The two paths are the same from here on. The only thing that differs is
   * the address that is asked and the badge that is moved.
   */
  async function runLyrics(endpoint, form, setBadge, working) {
    setBadge('working');
    statusEl.textContent = working;
    statusEl.className = 'status';
    setBusy(true);
    try {
      var response = await fetch(engineUrl + endpoint, { method: 'POST', body: form });
      var data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'The engine failed.');
      renderLyrics(data);
      setBadge('done');
      var used = (data.meta && data.meta.model_label) || '';
      statusEl.textContent = 'Done. ' + ((data.lines && data.lines.length) || 0) + ' lines ready' +
        (used ? ', read with ' + used + '.' : '.');
      statusEl.className = 'status ok';
    } catch (err) {
      setBadge('failed');
      statusEl.textContent = String(err.message || err);
      statusEl.className = 'status err';
    } finally {
      setBusy(false);
      updateLyricsButton();
    }
  }

  async function getLyrics() {
    if (!picked) return;
    var form = new FormData();
    form.append('file', picked, picked.name);
    form.append('language', langSel.value);
    form.append('script', currentScript ? currentScript.engine : 'bangla');
    form.append('quality', qualitySel.value);
    await runLyrics('/api/lyrics', form, function (state) {
      fcBadge.textContent = state;
      fcBadge.className = state === 'working' ? 'badge busy' : (state === 'done' ? 'badge ready' : 'badge busy');
    }, 'The engine is listening to the song and writing the lyrics.');
  }

  /**
   * Fetch the link and write the lyrics of it.
   *
   * The engine does the fetching. The panel hands over the address and
   * nothing else, so the browser never touches the site.
   */
  async function getLyricsFromLink() {
    var link = sourceUrl;
    if (!link) return;
    if (!looksLikeLink(link)) {
      statusEl.textContent = 'That does not look like a web address.';
      statusEl.className = 'status err';
      return;
    }
    var form = new FormData();
    form.append('url', link);
    form.append('language', langSel.value);
    form.append('script', currentScript ? currentScript.engine : 'bangla');
    form.append('quality', qualitySel.value);
    await runLyrics('/api/lyrics/url', form, function (state) {
      urlBadge.textContent = state;
      urlBadge.className = state === 'working' ? 'badge busy' : (state === 'done' ? 'badge ready' : 'badge busy');
    }, 'The engine is fetching the link and writing the lyrics.');
  }

  function renderLyrics(data) {
    lyricText = data.text || '';
    linesEl.innerHTML = '';
    linesEl.hidden = false;
    if (languageCode(langSel.value) === 'auto' && data.language) {
      // The language is known now, so the script box narrows to the scripts
      // of that language. A script the user chose by hand is kept when it is
      // still one of them.
      applyScripts(data.language, true);
    }
    // A link brings facts of its own, so they are shown in the panel.
    if (data.source && data.source.url) {
      showSource(data.source, data.meta);
      // The audio of the link is on this machine, so the player can play it.
      if (data.audio) attachEngineAudio(data.audio);
    }
    var lines = data.lines || [];
    lyricTimes = [];
    activeLine = -1;
    for (var i = 0; i < lines.length; i++) {
      var rowEl = document.createElement('div');
      rowEl.className = 'ln';
      var t = document.createElement('div');
      t.className = 't';
      t.textContent = clock(lines[i].start);
      var x = document.createElement('div');
      x.className = 'x';
      x.textContent = lines[i].text;
      rowEl.appendChild(t);
      rowEl.appendChild(x);
      // A lyric line carries the moment it starts, so it can carry the song
      // to that moment. The line is a button for that reason.
      var at = Number(lines[i].start) || 0;
      rowEl.className = 'ln ln-seek';
      rowEl.setAttribute('role', 'button');
      rowEl.setAttribute('tabindex', '0');
      rowEl.setAttribute('aria-label', 'Play the song from ' + mmss(at));
      rowEl.addEventListener('click', function () {
        seekSong(at);
        if (songAudio.paused) toggleSong();
      });
      rowEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          seekSong(at);
          if (songAudio.paused) toggleSong();
        }
      });
      linesEl.appendChild(rowEl);
      lyricTimes.push({ start: at, end: Number(lines[i].end) || at });
    }

    dlEl.innerHTML = '';
    dlEl.hidden = false;
    var labels = { srt: 'Download .srt', txt: 'Download .txt', vtt: 'Download .vtt', lrc: 'Download .lrc' };
    var formats = ['srt', 'txt', 'vtt', 'lrc'];
    for (var f = 0; f < formats.length; f++) {
      var key = formats[f];
      if (!data.downloads || !data.downloads[key]) continue;
      var a = document.createElement('a');
      a.href = engineUrl + data.downloads[key];
      a.textContent = labels[key];
      a.setAttribute('download', '');
      dlEl.appendChild(a);
    }
    speechEl.hidden = !lyricText;
    renderOutcome(data);
  }

  /**
   * The outcome of the run, at the foot of the panel.
   *
   * It holds the text as it was written, the language it is in and the script
   * it came back in, so the reader can see what they are about to copy or to
   * save.
   */
  function renderOutcome(data) {
    outcomeText.textContent = lyricText;
    outcomeNote.textContent = '';

    var title = (data && data.title) || 'Lyrics / Text';
    outcomeTitle.textContent = title;

    var meta = (data && data.meta) || {};
    var bits = [];
    if (data && data.language) bits.push(data.language);
    if (meta.output_script) bits.push(meta.output_script);
    if (data && data.lines && data.lines.length) {
      bits.push(data.lines.length + (data.lines.length === 1 ? ' line' : ' lines'));
    }
    outcomeMeta.textContent = bits.join(' - ');
    outcome.hidden = !lyricText;
  }

  /**
   * Put the text on the clipboard.
   *
   * The clipboard of the browser is asked first. An extension page is not
   * always allowed to use it, so the old way is kept as a second road: a
   * hidden field is selected and copied, which a click allows and which
   * needs no permission at all.
   */
  async function copyOutcome() {
    var text = outcomeText.textContent;
    if (!text) {
      outcomeNote.textContent = 'There is nothing to copy yet.';
      return;
    }
    var copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (err) {
      copied = false;
    }
    if (!copied) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      try {
        copied = document.execCommand('copy');
      } catch (err) {
        copied = false;
      }
      document.body.removeChild(area);
    }
    outcomeNote.textContent = copied
      ? 'The text is on the clipboard.'
      : 'The clipboard was not available, so the text is still on the screen to copy by hand.';
  }

  /**
   * Save the text as a file.
   *
   * The file is written on this machine, in the folder the browser keeps its
   * downloads in. Nothing is sent anywhere.
   */
  function downloadOutcome() {
    var text = outcomeText.textContent;
    if (!text) {
      outcomeNote.textContent = 'There is nothing to save yet.';
      return;
    }
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = outcomeFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    outcomeNote.textContent = 'Saved as ' + a.download + '.';
  }

  /** The name of the saved file, taken from the title of the song. */
  function outcomeFileName() {
    var title = outcomeTitle.textContent || 'lyrics';
    var clean = title.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) clean = 'lyrics';
    return clean.slice(0, 80) + '.txt';
  }

  async function speakLyrics() {
    if (!lyricText) return;
    speakButton.disabled = true;
    statusEl.textContent = 'The engine is speaking the lyrics.';
    statusEl.className = 'status';
    try {
      var response = await fetch(engineUrl + '/api/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: lyricText.slice(0, 4000), language: langSel.value })
      });
      if (!response.ok) throw new Error('The engine failed.');
      var blob = await response.blob();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(blob);
      player.src = audioUrl;
      player.hidden = false;
      statusEl.textContent = 'Ready to play.';
      statusEl.className = 'status ok';
    } catch (err) {
      statusEl.textContent = String(err.message || err);
      statusEl.className = 'status err';
    } finally {
      speakButton.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // the page
  // ---------------------------------------------------------------------------

  drop.addEventListener('click', function () { input.click(); });
  drop.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  drop.addEventListener('dragover', function (e) {
    e.preventDefault();
    drop.classList.add('hot');
  });
  drop.addEventListener('dragleave', function () { drop.classList.remove('hot'); });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    drop.classList.remove('hot');
    if (e.dataTransfer.files && e.dataTransfer.files.length) take(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', function () {
    if (input.files && input.files.length) take(input.files[0]);
  });
  fcClear.addEventListener('click', clearFile);
  lyricsButton.addEventListener('click', getLyrics);
  urlButton.addEventListener('click', getLyricsFromLink);
  urlInput.addEventListener('input', function () {
    setLink(urlInput.value);
  });
  urlInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      getLyricsFromLink();
    }
  });
  urlClear.addEventListener('click', function () {
    setLink('');
    statusEl.textContent = '';
    statusEl.className = 'status';
  });
  speakButton.addEventListener('click', speakLyrics);
  langSel.addEventListener('change', function () {
    // The script follows the language. The native script of the language
    // that was chosen is the one that is selected, unless the user has
    // already chosen another script for that language.
    applyScripts(langSel.value, false);
  });
  scriptSel.addEventListener('change', function () {
    // The choice is remembered for the language it was made in.
    var list = scriptsFor(langSel.value);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === scriptSel.value) {
        currentScript = list[i];
        scriptChoice[langSel.value] = list[i].id;
        break;
      }
    }
  });
  outcomeCopy.addEventListener('click', copyOutcome);
  outcomeDownload.addEventListener('click', downloadOutcome);
  engineRetry.addEventListener('click', function () {
    checkEngine();
  });
  optionsLink.addEventListener('click', function (e) {
    e.preventDefault();
    if (globalThis.chrome && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });

  loadSettings().then(function (settings) {
    engineUrl = String(settings.engine || DEFAULT_ENGINE).replace(/\/+$/, '');
    savedEngine = engineUrl;
    // The script box starts on the scripts of the language that is chosen.
    applyScripts(langSel.value, false);
    checkEngine();
  });
})();
