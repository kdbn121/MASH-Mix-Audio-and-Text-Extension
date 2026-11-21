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
  var engineDot = document.getElementById('engineDot');
  var engineText = document.getElementById('engineText');
  var engineHint = document.getElementById('engineHint');
  var engineRetry = document.getElementById('engineRetry');
  var engineSetup = document.getElementById('engineSetup');
  var langSel = document.getElementById('lang');
  var scriptSel = document.getElementById('script');
  var qualitySel = document.getElementById('quality');
  var lyricsButton = document.getElementById('lyrics');
  var statusEl = document.getElementById('status');
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

  var picked = null;
  var engineUrl = DEFAULT_ENGINE;
  var savedEngine = DEFAULT_ENGINE;
  var engineReady = false;
  var lyricText = '';
  var audioUrl = null;
  var songUrl = null;
  var lyricTimes = [];
  var activeLine = -1;

  /**
   * The lyrics button needs two things: a file and a running engine. Both
   * of them can arrive at any time, so the button is set from one place.
   */
  function updateLyricsButton() {
    lyricsButton.disabled = !(picked && engineReady);
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
    lyricText = '';
    lyricTimes = [];
    activeLine = -1;
    attachSong(null);
    updateLyricsButton();
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
   * Hand the attached file to the player.
   *
   * The file is read in the browser with an object address, so the song plays
   * from this machine and never travels anywhere. The old address is let go
   * of first, so dropping a second file does not leak the first.
   */
  function attachSong(file) {
    if (songUrl) {
      URL.revokeObjectURL(songUrl);
      songUrl = null;
    }
    songAudio.pause();
    songAudio.removeAttribute('src');
    songAudio.load();
    songWrap.classList.remove('playing');
    songSeek.value = '0';
    songNow.textContent = '0:00';
    songTotal.textContent = '0:00';
    if (!file) {
      songWrap.hidden = true;
      return;
    }
    songUrl = URL.createObjectURL(file);
    songAudio.src = songUrl;
    songWrap.hidden = false;
  }

  function toggleSong() {
    if (!songUrl) return;
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
    if (!songUrl) return;
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

  async function getLyrics() {
    if (!picked) return;
    lyricsButton.disabled = true;
    fcBadge.textContent = 'working';
    fcBadge.className = 'badge busy';
    statusEl.textContent = 'The engine is listening to the song and writing the lyrics.';
    statusEl.className = 'status';
    try {
      var form = new FormData();
      form.append('file', picked, picked.name);
      form.append('language', langSel.value);
      form.append('script', scriptSel.value);
      form.append('quality', qualitySel.value);
      var response = await fetch(engineUrl + '/api/lyrics', { method: 'POST', body: form });
      var data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'The engine failed.');
      renderLyrics(data);
      fcBadge.textContent = 'done';
      fcBadge.className = 'badge ready';
      var used = (data.meta && data.meta.model_label) || '';
      statusEl.textContent = 'Done. ' + ((data.lines && data.lines.length) || 0) + ' lines ready' +
        (used ? ', read with ' + used + '.' : '.');
      statusEl.className = 'status ok';
    } catch (err) {
      fcBadge.textContent = 'failed';
      fcBadge.className = 'badge busy';
      statusEl.textContent = String(err.message || err);
      statusEl.className = 'status err';
    } finally {
      updateLyricsButton();
    }
  }

  function renderLyrics(data) {
    lyricText = data.text || '';
    linesEl.innerHTML = '';
    linesEl.hidden = false;
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
  speakButton.addEventListener('click', speakLyrics);
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
    checkEngine();
  });
})();
