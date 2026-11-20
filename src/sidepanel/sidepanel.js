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
  var langSel = document.getElementById('lang');
  var scriptSel = document.getElementById('script');
  var lyricsButton = document.getElementById('lyrics');
  var statusEl = document.getElementById('status');
  var linesEl = document.getElementById('lines');
  var dlEl = document.getElementById('dl');
  var speechEl = document.getElementById('speech');
  var speakButton = document.getElementById('speak');
  var player = document.getElementById('player');
  var optionsLink = document.getElementById('optionsLink');

  var picked = null;
  var engineUrl = DEFAULT_ENGINE;
  var lyricText = '';
  var audioUrl = null;

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
  // the local engine
  // ---------------------------------------------------------------------------

  async function checkEngine() {
    engineDot.className = 'dot';
    engineText.textContent = 'Looking for the local engine';
    engineHint.textContent = '';
    try {
      var response = await fetch(engineUrl + '/api/health', { cache: 'no-store' });
      if (!response.ok) throw new Error('status ' + response.status);
      var info = await response.json();
      engineDot.className = 'dot on';
      engineText.textContent = 'Local engine ' + (info.version || '') + ' at ' + engineUrl;
      lyricsButton.disabled = !picked;
    } catch (err) {
      engineDot.className = 'dot off';
      engineText.textContent = 'No local engine at ' + engineUrl;
      engineHint.innerHTML = 'Start it with <code>mash-mix serve --host 127.0.0.1 --port 8000</code>. ' +
        'The measurements work without it.';
      lyricsButton.disabled = true;
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
      var response = await fetch(engineUrl + '/api/lyrics', { method: 'POST', body: form });
      var data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'The engine failed.');
      renderLyrics(data);
      fcBadge.textContent = 'done';
      fcBadge.className = 'badge ready';
      statusEl.textContent = 'Done. ' + ((data.lines && data.lines.length) || 0) + ' lines ready.';
      statusEl.className = 'status ok';
    } catch (err) {
      fcBadge.textContent = 'failed';
      fcBadge.className = 'badge busy';
      statusEl.textContent = String(err.message || err);
      statusEl.className = 'status err';
    } finally {
      lyricsButton.disabled = !picked;
    }
  }

  function renderLyrics(data) {
    lyricText = data.text || '';
    linesEl.innerHTML = '';
    linesEl.hidden = false;
    var lines = data.lines || [];
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
      linesEl.appendChild(rowEl);
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
  optionsLink.addEventListener('click', function (e) {
    e.preventDefault();
    if (globalThis.chrome && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });

  loadSettings().then(function (settings) {
    engineUrl = String(settings.engine || DEFAULT_ENGINE).replace(/\/+$/, '');
    checkEngine();
  });
})();
