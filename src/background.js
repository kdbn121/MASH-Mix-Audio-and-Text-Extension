/*!
 * MASH-Mix-Audio-and-Text, the service worker.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * The worker opens the side panel when the toolbar button is pressed. It does
 * nothing else: the measurement runs in the panel, on the machine, and the
 * panel talks to the local engine directly.
 */
chrome.runtime.onInstalled.addListener(function () {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(function () {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// the panel may be opened before the worker has seen an install event
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {
  /* the panel still opens by hand from the extensions page */
});
