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
  var cloudField = document.getElementById('cloudEngines');
  var cloudSave = document.getElementById('saveCloud');
  var savedCloud = document.getElementById('savedCloud');

  var PROBE_TIMEOUT_MS = 2000;

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

  function store() {
    if (!globalThis.chrome || !chrome.storage) return null;
    return chrome.storage.local;
  }

  var area = store();
  if (area) {
    area.get({ engine: DEFAULT_ENGINE, cloudEngines: [] }, function (values) {
      field.value = (values && values.engine) || DEFAULT_ENGINE;
      if (cloudField && Array.isArray(values.cloudEngines)) {
        cloudField.value = values.cloudEngines.join('\n');
      }
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

  if (cloudSave) {
    cloudSave.addEventListener('click', function () {
      var raw = String(cloudField.value || '').trim();
      var urls = raw ? raw.split(/\r?\n/).map(function (u) {
        return String(u).trim().replace(/\/+$/, '');
      }).filter(function (u) { return u; }) : [];
      if (area) {
        area.set({ cloudEngines: urls }, function () {
          savedCloud.textContent = 'Saved';
          setTimeout(function () { savedCloud.textContent = ''; }, 2000);
        });
      } else {
        savedCloud.textContent = 'Saved';
      }
    });
  }

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
