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
  var ed = globalThis.MASH_MIX.editor;

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
  var toTop = document.getElementById('toTop');
  var songWrap = document.getElementById('songplay');
  var songPlay = document.getElementById('songPlay');
  var songPause = document.getElementById('songPause');
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
  var songBack = document.getElementById('songBack');
  var songFwd = document.getElementById('songFwd');
  var editorCard = document.getElementById('editorCard');
  var editorHint = document.getElementById('editorHint');
  var editorList = document.getElementById('edList');
  var editorTxt = document.getElementById('edTxt');
  var editorSrt = document.getElementById('edSrt');
  var editorNote = document.getElementById('edNote');
  var editorAdd = document.getElementById('edAdd');
  var editorAddUp = document.getElementById('edAddUp');
  var editorAddDown = document.getElementById('edAddDown');
  var editorSplit = document.getElementById('edSplit');
  var editorMerge = document.getElementById('edMerge');
  var editorRemove = document.getElementById('edRemove');
  var editorCut = document.getElementById('edCut');
  var editorCopy = document.getElementById('edCopy');
  var editorPaste = document.getElementById('edPaste');
  var editorDownloadSrt = document.getElementById('edDownloadSrt');
  var editorDownloadTxt = document.getElementById('edDownloadTxt');
  var editorPreview = document.getElementById('edPreview');
  var editorPreviewNum = document.getElementById('edPreviewNum');
  var editorPreviewStart = document.getElementById('edPreviewStart');
  var editorPreviewEnd = document.getElementById('edPreviewEnd');
  var editorPreviewWords = document.getElementById('edPreviewWords');
  var editorPreviewPlay = document.getElementById('edPreviewPlay');
  var editorPreviewPause = document.getElementById('edPreviewPause');
  var editorTrackSeek = document.getElementById('edTrackSeek');
  var editorTrackNow = document.getElementById('edTrackNow');
  var editorTrackTotal = document.getElementById('edTrackTotal');

  // The version in the footer comes from the manifest that is loaded, so the
  // number on the page is always the number of the extension in the browser.
  function paintVersion() {
    var node = document.getElementById('licenceVersion');
    if (!node) return;
    var api = globalThis.chrome;
    if (api && api.runtime && typeof api.runtime.getManifest === 'function') {
      var manifest = api.runtime.getManifest();
      if (manifest && manifest.version) node.textContent = 'V' + manifest.version;
    }
  }

  paintVersion();

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

  // The cues the editor holds. They are the same lines the player marks, so an
  // edit in the editor moves the line in the player too.
  var cues = [];
  var cueSelected = -1;
  var cueClipboard = '';
  var cueClipboardSrt = '';

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
    ne: [{ id: 'ne-native', engine: 'bangla', label: 'Nepali (Devanagari script)' }],
    si: [{ id: 'si-native', engine: 'bangla', label: 'Sinhala (Sinhala script)' }],
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
    'kn', 'ml', 'mr', 'ne', 'si', 'gu', 'pa', 'cs', 'pl', 'hu', 'ka', 'lv'
  ];

  // The table is put on the namespace, the same way the analysis is, so the
  // test suite can hold the panel to the rule the table says. The panel reads
  // its own copy and never goes looking for this one.
  var root = (globalThis.MASH_MIX = globalThis.MASH_MIX || {});
  root.panel = {
    languageScripts: LANGUAGE_SCRIPTS,
    languageOrder: LANGUAGE_ORDER,
    allScripts: allScripts,
    scriptsOfLanguage: scriptsOfLanguage,
    nativeScript: nativeScript,
    setBusy: setBusy,
    cues: function () { return cues; },
    editorCues: function () { return cues; },
    renderEditor: renderEditor,
    refreshEditor: refreshEditor,
    addCue: addCue,
    addCueAbove: addCueAbove,
    addCueBelow: addCueBelow,
    renderPreview: renderPreview,
    splitSelected: splitSelected,
    mergeSelected: mergeSelected,
    removeSelected: removeSelected,
    cutSelected: cutSelected,
    copySelected: copySelected,
    pasteSelected: pasteSelected,
    selectCue: selectCue,
    toggleSong: toggleSong,
    setPlaying: setPlaying,
    stepSong: stepSong,
    startSeekHold: startSeekHold,
    stopSeekHold: stopSeekHold
  };

  /**
   * The script the user chose, and the script that is chosen now.
   *
   * The choice is one, not one per language, because the box holds every
   * script of every language and the script that is picked is the script that
   * is used, whatever language the words turn out to be in.
   */
  var scriptChoice = null;
  var currentScript = null;

  /** The language code of a choice of the language box. */
  function languageCode(value) {
    return String(value || 'auto').split('-')[0].toLowerCase();
  }

  /**
   * The choice that lets the engine decide the script of every language.
   *
   * The engine already knows what a script is: `auto` leaves the words in the
   * script they were heard in, so nothing is converted that did not need to be.
   */
  var AUTO_SCRIPT = { id: 'auto', engine: 'auto', label: 'Auto, any script' };

  /**
   * Every script on offer: the automatic one first, then the script of every
   * language of the language box, and Banglish at the end.
   *
   * The list is never cut down to the language that is chosen. A language the
   * engine found later does not take the other scripts away, so the language
   * that was tracked and the language that was extracted stay in play together.
   */
  function allScripts() {
    var out = [AUTO_SCRIPT];
    for (var i = 0; i < LANGUAGE_ORDER.length; i++) {
      out.push(LANGUAGE_SCRIPTS[LANGUAGE_ORDER[i]][0]);
    }
    // Banglish is the one other script the engine can write.
    out.push(LANGUAGE_SCRIPTS.bn[1]);
    return out;
  }

  /**
   * The scripts that belong to one language.
   */
  function scriptsOfLanguage(language) {
    var code = languageCode(language);
    if (!LANGUAGE_SCRIPTS[code]) return [];
    return LANGUAGE_SCRIPTS[code].slice();
  }

  /**
   * The script of a language that is its own, which is the first of its list.
   */
  function nativeScript(language) {
    var list = scriptsOfLanguage(language);
    return list.length ? list[0] : AUTO_SCRIPT;
  }

  function hasScript(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return true;
    }
    return false;
  }

  /**
   * Put every script into the box and choose one of them.
   *
   * The box holds the script of every language, so the list does not change
   * when the language changes and the language the engine finds does not take
   * the other scripts away. The choice the user made is kept, and a panel
   * that has not been touched starts on the automatic one.
   */
  function applyScripts(keep) {
    var list = allScripts();
    var wanted = keep && currentScript ? currentScript.id : scriptChoice;
    if (!wanted || !hasScript(list, wanted)) wanted = AUTO_SCRIPT.id;

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
   * Go back to the top of the panel.
   *
   * The panel is a long page and the button in the footer carries the reader
   * back up. The scroll of the page is taken, and the scroll of the page
   * itself is taken as well, because the two are not the same thing in every
   * browser.
   */
  function goToTop() {
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0);
    }
    if (typeof document !== 'undefined') {
      var root = document.documentElement;
      if (root) root.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    }
  }

  /**
   * Say what the script box is for, so the rule behind it is not a mystery.
   */
  function updateLangHint() {
    if (currentScript && currentScript.id === AUTO_SCRIPT.id) {
      langHint.textContent = 'Auto lets the engine find the language of the audio, ' +
        'and it leaves the words in the script they were heard in. The script box ' +
        'holds every script of every language, so a script can be picked by hand ' +
        'when one is wanted.';
      return;
    }
    langHint.textContent = 'The script you picked is used for every language, ' +
      'whatever language the words turn out to be in: ' + currentScript.label + '. ' +
      'The script box holds every script of every language.';
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
    cues = [];
    cueSelected = -1;
    renderEditor();
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
    cues = [];
    cueSelected = -1;
    renderEditor();
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
    setPlaying(false);
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

  /**
   * True when there is a song to play or to move.
   *
   * The address on the audio element is asked as well as the two the panel
   * keeps, because that element is where the address really is, whatever put
   * it there.
   */
  function hasSong() {
    if (songUrl || engineAudioUrl) return true;
    return !!(songAudio && songAudio.src);
  }

  function toggleSong() {
    if (!hasSong()) return;
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

  /**
   * Stop the song where it is.
   *
   * Every play button in the panel has a pause button beside it, so the song
   * can be stopped from wherever the panel happens to be. The song carries on
   * from the moment it was paused at, so a pause is a pause and not a jump.
   */
  function pauseSong() {
    if (!hasSong()) return;
    if (songAudio.paused) return;
    songAudio.pause();
  }

  /**
   * Say that the song is playing, or that it is not.
   *
   * The button shows the state of the song and not the state of the last
   * thing that was done, so the two can never disagree. The song carries on
   * from the moment it was paused at, so a pause is a pause and not a jump.
   */
  function setPlaying(playing) {
    if (playing) {
      songWrap.classList.add('playing');
      songPlay.setAttribute('aria-label', 'Pause the song');
      songPlay.setAttribute('title', 'Pause the song');
      return;
    }
    songWrap.classList.remove('playing');
    songPlay.setAttribute('aria-label', 'Play the song');
    songPlay.setAttribute('title', 'Play the song');
  }

  /**
   * True when the key is going into a box that a person is typing in.
   *
   * A space is a word in a box of words, so the box keeps the space bar and
   * the song is not started or stopped by it.
   */
  function isTyping(target) {
    if (!target) return false;
    var tag = String(target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  /**
   * The space bar starts and stops the song.
   *
   * The key is taken by the panel, so the song can be stopped and started
   * without reaching for the mouse, and the button says which of the two it
   * will do next. A button has the space bar already, and a box that is being
   * typed into keeps it.
   */
  function onKeyDown(e) {
    if (!e) return;
    // The two keys of the editor: alt and the arrow keys put a line above or
    // under the line that is being worked on.
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.key === 'ArrowUp' || e.key === 'Up') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        addCueAbove();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'Down') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        addCueBelow();
        return;
      }
    }
    if (e.key !== ' ' && e.code !== 'Space') return;
    if (e.repeat) return;
    if (isTyping(e.target)) return;
    var tag = String((e.target && e.target.tagName) || '').toUpperCase();
    if (tag === 'BUTTON' || tag === 'A') return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    toggleSong();
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', onKeyDown);
  }

  /** Move the song to a moment in seconds and carry on playing. */
  function seekSong(seconds) {
    if (!hasSong()) return;
    var at = Math.max(0, Number(seconds) || 0);
    if (isFinite(songAudio.duration)) {
      at = Math.min(at, songAudio.duration);
    }
    songAudio.currentTime = at;
    songNow.textContent = mmss(at);
    // The track controller of the editor shows the same moment.
    if (editorTrackNow) editorTrackNow.textContent = ed.formatTime(at);
    if (editorTrackSeek && !trackDragging) editorTrackSeek.value = String(at);
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
    setPlaying(true);
  });
  songAudio.addEventListener('pause', function () {
    setPlaying(false);
  });
  songAudio.addEventListener('loadedmetadata', function () {
    songTotal.textContent = mmss(songAudio.duration);
    songSeek.max = String(isFinite(songAudio.duration) ? songAudio.duration : 1);
    paintTrackTotal();
  });
  songAudio.addEventListener('durationchange', function () {
    songTotal.textContent = mmss(songAudio.duration);
    paintTrackTotal();
  });
  songAudio.addEventListener('timeupdate', function () {
    songNow.textContent = mmss(songAudio.currentTime);
    // The bar is only moved by the song itself, so a drag is never fought.
    if (!songSeekDragging) {
      songSeek.value = String(songAudio.currentTime);
    }
    // The track controller of the editor runs like a stopwatch: it shows the
    // moment of the song in the format a subtitle file uses.
    editorTrackNow.textContent = ed.formatTime(songAudio.currentTime);
    if (!trackDragging) {
      editorTrackSeek.value = String(songAudio.currentTime);
    }
    markActiveLine(songAudio.currentTime);
  });
  songAudio.addEventListener('ended', function () {
    setPlaying(false);
    songSeek.value = '0';
    songNow.textContent = '0:00';
    editorTrackNow.textContent = ed.formatTime(0);
    editorTrackSeek.value = '0';
  });

  /**
   * The length of the song in the track controller of the editor.
   *
   * The moment is written the way a subtitle file writes it, so the number
   * under the bar can be copied straight into a line of the file.
   */
  function paintTrackTotal() {
    if (!editorTrackTotal) return;
    editorTrackTotal.textContent = ed.formatTime(
      isFinite(songAudio.duration) ? songAudio.duration : 0
    );
    if (editorTrackSeek) {
      editorTrackSeek.max = String(isFinite(songAudio.duration) ? songAudio.duration : 1);
    }
  }

  var trackDragging = false;
  if (editorTrackSeek) {
    editorTrackSeek.addEventListener('pointerdown', function () { trackDragging = true; });
    editorTrackSeek.addEventListener('input', function () {
      trackDragging = true;
      editorTrackNow.textContent = ed.formatTime(Number(editorTrackSeek.value));
    });
    editorTrackSeek.addEventListener('change', function () {
      trackDragging = false;
      seekSong(Number(editorTrackSeek.value));
    });
    editorTrackSeek.addEventListener('pointerup', function () { trackDragging = false; });
    editorTrackSeek.addEventListener('blur', function () { trackDragging = false; });
  }

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
  // the five second buttons
  // ---------------------------------------------------------------------------

  /**
   * Move the song five seconds forward or back.
   *
   * The button is held down and the song keeps moving in steps of five
   * seconds until the button is let go, so a reader can find the exact moment
   * a line is sung without having to aim at the bar.
   */
  var SEEK_STEP = 5;
  var SEEK_HOLD_DELAY = 400;
  var SEEK_HOLD_RATE = 120;
  var seekHoldTimer = null;
  var seekHoldRate = null;

  function stopSeekHold() {
    if (seekHoldTimer !== null) {
      clearTimeout(seekHoldTimer);
      seekHoldTimer = null;
    }
    if (seekHoldRate !== null) {
      clearInterval(seekHoldRate);
      seekHoldRate = null;
    }
  }

  function stepSong(seconds) {
    if (!hasSong()) return;
    seekSong(Number(songAudio.currentTime || 0) + seconds);
  }

  function startSeekHold(seconds) {
    stopSeekHold();
    stepSong(seconds);
    seekHoldTimer = setTimeout(function () {
      seekHoldTimer = null;
      seekHoldRate = setInterval(function () {
        stepSong(seconds);
      }, SEEK_HOLD_RATE);
    }, SEEK_HOLD_DELAY);
  }

  function bindSeekHold(button, seconds) {
    button.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      startSeekHold(seconds);
    });
    // The button is let go of, or the pointer leaves it, or the window loses
    // the pointer, and the song stops moving in steps.
    button.addEventListener('pointerup', stopSeekHold);
    button.addEventListener('pointercancel', stopSeekHold);
    button.addEventListener('pointerleave', stopSeekHold);
    button.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (e.repeat) {
        stepSong(seconds);
        return;
      }
      startSeekHold(seconds);
    });
    button.addEventListener('keyup', stopSeekHold);
    button.addEventListener('blur', stopSeekHold);
  }

  bindSeekHold(songBack, -SEEK_STEP);
  bindSeekHold(songFwd, SEEK_STEP);
  if (typeof window !== 'undefined' && window.addEventListener) {
    // The pointer is let go of anywhere in the window, and the song stops
    // moving in steps.
    window.addEventListener('pointerup', stopSeekHold);
  }

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
    form.append('script', currentScript ? currentScript.engine : 'auto');
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
    form.append('script', currentScript ? currentScript.engine : 'auto');
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
      // The language is known now. The script box keeps every script and the
      // choice that was made in it, so the language that was found and the
      // language that was asked for stay in play together.
      applyScripts(true);
    }
    // A link brings facts of its own, so they are shown in the panel.
    if (data.source && data.source.url) {
      showSource(data.source, data.meta);
      // The audio of the link is on this machine, so the player can play it.
      if (data.audio) attachEngineAudio(data.audio);
    }
    var lines = data.lines || [];
    // The editor takes the same lines, so a change in one is a change in the
    // other. The panel never keeps two truths about the words of a song.
    cues = [];
    for (var c = 0; c < lines.length; c++) {
      cues.push({
        start: Number(lines[c].start) || 0,
        end: Number(lines[c].end) || 0,
        text: String(lines[c].text == null ? '' : lines[c].text)
      });
    }
    cueSelected = cues.length ? 0 : -1;
    // The editor draws the lines the player marks, because both come from the
    // same list of cues.
    renderEditor();
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

  // ---------------------------------------------------------------------------
  // the editor
  // ---------------------------------------------------------------------------

  /**
   * Draw the editor.
   *
   * Every row is a cue: its moment, the moment it ends, and the words. The
   * words are written in a box of their own so that a keyboard of any layout
   * can type into it, including the ones that write Bangla.
   */
  function renderEditor() {
    editorList.innerHTML = '';
    editorCard.hidden = !cues.length;
    for (var i = 0; i < cues.length; i++) {
      editorList.appendChild(cueRow(i));
    }
    refreshEditor();
  }

  /** One row of the editor: the number, the two moments and the words. */
  function cueRow(index) {
    var cue = cues[index];
    var row = document.createElement('div');
    row.className = 'ed-row' + (index === cueSelected ? ' ed-sel' : '');

    var head = document.createElement('div');
    head.className = 'ed-head';

    var number = document.createElement('button');
    number.type = 'button';
    number.className = 'ed-num';
    number.textContent = String(index + 1);
    number.setAttribute('aria-label', 'Select line ' + (index + 1));
    number.addEventListener('click', function () {
      selectCue(index);
    });
    head.appendChild(number);

    var start = document.createElement('input');
    start.type = 'text';
    start.className = 'ed-time';
    start.value = ed.formatTime(ed.cueStart(cue));
    start.setAttribute('aria-label', 'Start of line ' + (index + 1));
    start.setAttribute('inputmode', 'decimal');
    start.addEventListener('input', function () {
      // The strict form only, so the file on the screen does not jump about
      // while the field is still being typed.
      var at = ed.parseTime(start.value, true);
      if (at === null) return;
      cues[index] = ed.setStart(cues[index], at);
      refreshEditor();
    });
    start.addEventListener('change', function () {
      var at = ed.parseTime(start.value, false);
      if (at === null) {
        start.value = ed.formatTime(ed.cueStart(cues[index]));
        editorNote.textContent = 'That time could not be read, so the line kept the time it had.';
        return;
      }
      cues[index] = ed.setStart(cues[index], at);
      start.value = ed.formatTime(ed.cueStart(cues[index]));
      refreshEditor();
    });
    head.appendChild(start);

    var arrow = document.createElement('span');
    arrow.className = 'ed-arrow';
    arrow.textContent = 'to';
    head.appendChild(arrow);

    var end = document.createElement('input');
    end.type = 'text';
    end.className = 'ed-time';
    end.value = ed.formatTime(ed.cueEnd(cue));
    end.setAttribute('aria-label', 'End of line ' + (index + 1));
    end.setAttribute('inputmode', 'decimal');
    end.addEventListener('input', function () {
      var at = ed.parseTime(end.value, true);
      if (at === null) return;
      cues[index] = ed.setEnd(cues[index], at);
      refreshEditor();
    });
    end.addEventListener('change', function () {
      var at = ed.parseTime(end.value, false);
      if (at === null) {
        end.value = ed.formatTime(ed.cueEnd(cues[index]));
        editorNote.textContent = 'That time could not be read, so the line kept the time it had.';
        return;
      }
      cues[index] = ed.setEnd(cues[index], at);
      end.value = ed.formatTime(ed.cueEnd(cues[index]));
      refreshEditor();
    });
    head.appendChild(end);

    var play = document.createElement('button');
    play.type = 'button';
    play.className = 'ed-play';
    play.textContent = 'play';
    play.setAttribute('aria-label', 'Play the song from line ' + (index + 1));
    play.addEventListener('click', function () {
      seekSong(ed.cueStart(cues[index]));
      if (songAudio.paused) toggleSong();
    });
    head.appendChild(play);

    // Every line carries a pause button as well as a play button, so the song
    // can be stopped without leaving the line that is being worked on.
    var pause = document.createElement('button');
    pause.type = 'button';
    pause.className = 'ed-play ed-pause';
    pause.textContent = 'pause';
    pause.setAttribute('aria-label', 'Pause the song at line ' + (index + 1));
    pause.addEventListener('click', function () {
      pauseSong();
    });
    head.appendChild(pause);

    row.appendChild(head);

    var words = document.createElement('textarea');
    words.className = 'ed-words';
    words.rows = 2;
    words.value = cue.text;
    words.spellcheck = false;
    words.setAttribute('aria-label', 'The words of line ' + (index + 1));
    words.addEventListener('focus', function () {
      cueSelected = index;
      markSelected();
    });
    words.addEventListener('input', function () {
      // What was typed is kept as it was typed. Nothing here rewrites the
      // letters, so a Bangla word, a Tamil word or an Arabic word is carried
      // through whole and in the order the keyboard wrote it.
      cues[index].text = words.value;
      refreshEditor();
    });
    row.appendChild(words);

    return row;
  }

  /** Mark the row that is the one being worked on. */
  function markSelected() {
    var rows = editorList.children;
    for (var i = 0; i < rows.length; i++) {
      rows[i].className = 'ed-row' + (i === cueSelected ? ' ed-sel' : '');
    }
  }

  function selectCue(index) {
    cueSelected = index;
    markSelected();
    renderPreview();
  }

  /**
   * Write the cues out again, everywhere they are shown.
   *
   * The text file and the subtitle file are both written from the same list of
   * cues, so they can never disagree with each other, and the lines the player
   * marks are read from the same list too.
   */
  function refreshEditor() {
    editorTxt.textContent = ed.buildTxt(cues);
    editorSrt.textContent = ed.buildSrt(cues);
    lyricText = ed.buildTxt(cues);
    outcomeText.textContent = lyricText;
    renderLines();
    renderPreview();
    refreshEditorMeta();
  }

  /**
   * Show the line that is being worked on.
   *
   * The two moments are written the way a subtitle file writes them, so what
   * is on the screen is exactly what the file will carry. The panel is drawn
   * again every time a line is changed, so the preview follows the line that
   * is being worked on as it is worked on.
   */
  function renderPreview() {
    var cue = cueSelected >= 0 && cueSelected < cues.length ? cues[cueSelected] : null;
    if (!cue) {
      editorPreviewNum.textContent = '-';
      editorPreviewStart.textContent = ed.formatTime(0);
      editorPreviewEnd.textContent = ed.formatTime(0);
      editorPreviewWords.textContent = 'Choose a line and it is shown here.';
      editorPreviewPlay.disabled = true;
      return;
    }
    editorPreviewNum.textContent = String(cueSelected + 1);
    editorPreviewStart.textContent = ed.formatTime(ed.cueStart(cue));
    editorPreviewEnd.textContent = ed.formatTime(ed.cueEnd(cue));
    editorPreviewWords.textContent = String(cue.text == null ? '' : cue.text);
    editorPreviewPlay.disabled = false;
  }

  /** The count of the lines and the words, under the editor. */
  function refreshEditorMeta() {
    var count = 0;
    for (var i = 0; i < cues.length; i++) {
      if (String(cues[i].text || '').trim()) count = count + 1;
    }
    editorHint.textContent = count + (count === 1 ? ' line' : ' lines') +
      ' in the editor. Every change here is written to the text and the SRT at once, ' +
      'and the file you download carries your edits.';
  }

  /**
   * Draw the lines the player marks.
   *
   * The lines come from the cues, so an edit in the editor is an edit in the
   * player as well.
   */
  function renderLines() {
    linesEl.innerHTML = '';
    lyricTimes = [];
    activeLine = -1;
    for (var i = 0; i < cues.length; i++) {
      var at = ed.cueStart(cues[i]);
      var rowEl = document.createElement('div');
      rowEl.className = 'ln ln-seek';
      var t = document.createElement('div');
      t.className = 't';
      t.textContent = clock(at);
      var x = document.createElement('div');
      x.className = 'x';
      x.textContent = cues[i].text;
      rowEl.appendChild(t);
      rowEl.appendChild(x);
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
      lyricTimes.push({ start: at, end: ed.cueEnd(cues[i]) });
    }
  }

  /**
   * Put a new line into the list of cues and draw the editor again.
   *
   * The plain add has no line to sit against, so the new line goes at the end
   * of the list. The two other buttons put a line above or under the line that
   * is being worked on.
   */
  function addCue() {
    var before = cues.length ? cues[cues.length - 1] : null;
    var cue = ed.blankCue(before, null);
    var at = cues.length;
    cues.splice(at, 0, cue);
    cueSelected = at;
    renderEditor();
    editorNote.textContent = 'A new line was added at the end. Type the words into it.';
  }

  /**
   * Put a new line above the line that is being worked on.
   *
   * With no line chosen, the new line goes to the top of the list, because
   * up means towards the start of the song.
   */
  function addCueAbove() {
    var at = cueSelected >= 0 ? cueSelected : 0;
    var before = at > 0 ? cues[at - 1] : null;
    var after = at < cues.length ? cues[at] : null;
    var cue = ed.blankCue(before, after);
    cues.splice(at, 0, cue);
    cueSelected = at;
    renderEditor();
    editorNote.textContent = 'A new line was added above the line you were on.';
  }

  /**
   * Put a new line under the line that is being worked on.
   *
   * With no line chosen, the new line goes to the end of the list, because
   * down means towards the end of the song.
   */
  function addCueBelow() {
    var at = cueSelected >= 0 ? cueSelected + 1 : cues.length;
    var before = at > 0 ? cues[at - 1] : null;
    var after = at < cues.length ? cues[at] : null;
    var cue = ed.blankCue(before, after);
    cues.splice(at, 0, cue);
    cueSelected = at;
    renderEditor();
    editorNote.textContent = 'A new line was added under the line you were on.';
  }

  /**
   * Cut the selected line in half at the place the caret is in.
   *
   * The caret is read from the box of words that has the focus, so the reader
   * puts it where they want the line broken.
   */
  function splitSelected() {
    if (cueSelected < 0 || cueSelected >= cues.length) {
      editorNote.textContent = 'Choose a line first.';
      return;
    }
    var cue = cues[cueSelected];
    var at = caretIn(cueSelected);
    var parts = ed.splitCue(cue, at);
    cues.splice(cueSelected, 1, parts[0], parts[1]);
    cueSelected = cueSelected + 1;
    renderEditor();
    editorNote.textContent = 'The line was cut in two.';
  }

  /**
   * Join the selected line with the one after it.
   */
  function mergeSelected() {
    if (cueSelected < 0 || cueSelected >= cues.length - 1) {
      editorNote.textContent = 'The last line has nothing after it to join with.';
      return;
    }
    var joined = ed.mergeCues(cues[cueSelected], cues[cueSelected + 1]);
    cues.splice(cueSelected, 2, joined);
    renderEditor();
    editorNote.textContent = 'The two lines were joined into one.';
  }

  /** Take the selected line out of the list. */
  function removeSelected() {
    if (cueSelected < 0 || cueSelected >= cues.length) {
      editorNote.textContent = 'Choose a line first.';
      return;
    }
    cues.splice(cueSelected, 1);
    if (cueSelected >= cues.length) cueSelected = cues.length - 1;
    renderEditor();
    editorNote.textContent = 'The line was removed.';
  }

  /**
   * Cut the selected line to the clipboard of the editor.
   *
   * The words are also written to the clipboard of the browser, so the line
   * can be pasted into another program as well.
   */
  function cutSelected() {
    if (cueSelected < 0 || cueSelected >= cues.length) {
      editorNote.textContent = 'Choose a line first.';
      return;
    }
    cueClipboard = cues[cueSelected].text;
    cueClipboardSrt = ed.buildSrt([cues[cueSelected]]);
    copyToBrowser(cueClipboardSrt);
    removeSelected();
    editorNote.textContent = 'The line was cut. Paste it where you want it.';
  }

  /**
   * Copy the selected line to the clipboard of the editor.
   */
  function copySelected() {
    if (cueSelected < 0 || cueSelected >= cues.length) {
      editorNote.textContent = 'Choose a line first.';
      return;
    }
    cueClipboard = cues[cueSelected].text;
    cueClipboardSrt = ed.buildSrt([cues[cueSelected]]);
    copyToBrowser(cueClipboardSrt);
    editorNote.textContent = 'The line was copied.';
  }

  /**
   * Paste the line that was cut or copied.
   *
   * The line is put in after the one that is selected, so a line can be moved
   * by cutting it and pasting it somewhere else.
   */
  function pasteSelected() {
    if (!cueClipboard) {
      editorNote.textContent = 'There is nothing to paste.';
      return;
    }
    var cue = {
      start: 0,
      end: 0,
      text: cueClipboard
    };
    if (cueSelected >= 0) {
      cue.start = ed.cueStart(cues[cueSelected]);
      cue.end = ed.cueEnd(cues[cueSelected]);
    }
    var at = cueSelected >= 0 ? cueSelected + 1 : cues.length;
    cues.splice(at, 0, cue);
    cueSelected = at;
    renderEditor();
    editorNote.textContent = 'The line was pasted.';
  }

  /** Write text to the clipboard of the browser, when it is allowed. */
  function copyToBrowser(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    try {
      navigator.clipboard.writeText(text).catch(function () {});
    } catch (err) {
      // The clipboard of the browser is not always there, and the editor does
      // not need it.
    }
  }

  /**
   * The place the caret is in, in the words of a line.
   *
   * The box of words that has the focus is the one that is read, so the
   * reader puts the caret where they want the line broken.
   */
  function caretIn(index) {
    var boxes = editorList.querySelectorAll ? editorList.querySelectorAll('.ed-words') : [];
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i] === document.activeElement) {
        var at = Number(boxes[i].selectionStart);
        return isFinite(at) ? at : 0;
      }
    }
    return Math.floor(String(cues[index].text || '').length / 2);
  }

  /**
   * Save the edited subtitle file.
   *
   * The file is built in the browser from the cues, so it holds the edits and
   * not the words the engine first wrote.
   */
  function downloadEditedSrt() {
    var text = ed.buildSrt(cues);
    if (!text) {
      editorNote.textContent = 'There are no lines to save yet.';
      return;
    }
    saveFile(text, 'application/x-subrip;charset=utf-8', editorFileName('srt'));
    editorNote.textContent = 'Saved as ' + editorFileName('srt') + '.';
  }

  /** Save the edited text file. */
  function downloadEditedTxt() {
    var text = ed.buildTxt(cues);
    if (!text) {
      editorNote.textContent = 'There are no lines to save yet.';
      return;
    }
    saveFile(text, 'text/plain;charset=utf-8', editorFileName('txt'));
    editorNote.textContent = 'Saved as ' + editorFileName('txt') + '.';
  }

  /** Write a file into the downloads of the browser. */
  function saveFile(text, type, name) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  /** The name of the saved file, taken from the title of the song. */
  function editorFileName(suffix) {
    var title = outcomeTitle.textContent || 'lyrics';
    var clean = title.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) clean = 'lyrics';
    return clean.slice(0, 80) + '.' + suffix;
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
    // The script box holds every script of every language, so the language
    // that is chosen does not change it. The choice that was made in it is
    // kept, and it is used for the language that is chosen.
    applyScripts(true);
  });
  scriptSel.addEventListener('change', function () {
    // The choice is one, and it is used for every language.
    var list = allScripts();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === scriptSel.value) {
        currentScript = list[i];
        scriptChoice = list[i].id;
        updateLangHint();
        break;
      }
    }
  });
  outcomeCopy.addEventListener('click', copyOutcome);
  outcomeDownload.addEventListener('click', downloadOutcome);
  editorAdd.addEventListener('click', addCue);
  editorAddUp.addEventListener('click', addCueAbove);
  editorAddDown.addEventListener('click', addCueBelow);
  editorSplit.addEventListener('click', splitSelected);
  editorMerge.addEventListener('click', mergeSelected);
  editorRemove.addEventListener('click', removeSelected);
  editorCut.addEventListener('click', cutSelected);
  editorCopy.addEventListener('click', copySelected);
  editorPaste.addEventListener('click', pasteSelected);
  editorDownloadSrt.addEventListener('click', downloadEditedSrt);
  editorDownloadTxt.addEventListener('click', downloadEditedTxt);
  editorPreviewPlay.addEventListener('click', function () {
    if (cueSelected < 0 || cueSelected >= cues.length) return;
    seekSong(ed.cueStart(cues[cueSelected]));
    if (songAudio.paused) toggleSong();
  });
  editorPreviewPause.addEventListener('click', function () {
    pauseSong();
  });
  songPause.addEventListener('click', function () {
    pauseSong();
  });
  engineRetry.addEventListener('click', function () {
    checkEngine();
  });
  optionsLink.addEventListener('click', function (e) {
    e.preventDefault();
    if (globalThis.chrome && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });
  toTop.addEventListener('click', function (e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    goToTop();
  });

  loadSettings().then(function (settings) {
    engineUrl = String(settings.engine || DEFAULT_ENGINE).replace(/\/+$/, '');
    savedEngine = engineUrl;
    // The script box holds every script of every language and it starts on
    // the automatic one.
    applyScripts(false);
    checkEngine();
  });
})();
