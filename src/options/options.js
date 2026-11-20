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
})();
