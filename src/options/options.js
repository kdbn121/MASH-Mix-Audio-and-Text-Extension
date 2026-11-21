/*!
 * MASH-Mix-Audio-and-Text, the settings page.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 */
'use strict';

(function () {
  var DEFAULT_ENGINE = 'http://127.0.0.1:8000';
  var field = document.getElementById('engine');
  var save = document.getElementById('save');
  var saved = document.getElementById('saved');
  var test = document.getElementById('test');
  var tested = document.getElementById('tested');

  var PROBE_TIMEOUT_MS = 2000;

  function store() {
    if (!globalThis.chrome || !chrome.storage) return null;
    return chrome.storage.local;
  }

  var area = store();
  if (area) {
    area.get({ engine: DEFAULT_ENGINE }, function (values) {
      field.value = (values && values.engine) || DEFAULT_ENGINE;
    });
  } else {
    field.value = DEFAULT_ENGINE;
  }

  save.addEventListener('click', function () {
    var value = String(field.value || '').trim().replace(/\/+$/, '');
    if (!value) value = DEFAULT_ENGINE;
    field.value = value;
    if (area) {
      area.set({ engine: value }, function () {
        saved.textContent = 'Saved';
        setTimeout(function () {
          saved.textContent = '';
        }, 2000);
      });
    } else {
      saved.textContent = 'Saved';
    }
  });

  /**
   * Ask the address whether an engine is there, and say what came back.
   */
  async function probe(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, PROBE_TIMEOUT_MS);
    try {
      var response = await fetch(url + '/api/health', {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('the answer was ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  test.addEventListener('click', async function () {
    var url = String(field.value || '').trim().replace(/\/+$/, '') || DEFAULT_ENGINE;
    test.disabled = true;
    tested.className = 'saved';
    tested.textContent = 'Looking...';
    try {
      var info = await probe(url);
      tested.textContent = 'The engine answered, version ' + (info.version || 'unknown');
    } catch (err) {
      tested.className = 'saved bad';
      tested.textContent = 'No engine answered at ' + url;
    } finally {
      test.disabled = false;
    }
  });
})();
