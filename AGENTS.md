# MASH-Mix-Audio-and-Text, the extension. Notes for AI agents.

## What this is

The browser face of the MASH-Mix-Audio-and-Text engine. A Manifest V3 side
panel that measures a song in the browser and, when the local engine is
running, writes the lyrics of it.

- **Extension** (MV3): a side panel. Drop in a file, the panel measures it.
- **Engine**: the Python package `mash-mix-audio-and-text`, which is a separate
  repository. The extension reaches it over `http://127.0.0.1`.

The extension has no build step and no dependencies. The `package.json` only
exists for the node test and audit tooling.

## Hard rules for any change here

1. **No analytics, no vendor server, no remote code.** No `eval`, no
   `new Function`, no remote script or style, no telemetry. The permissions
   stay at `storage` and `sidePanel`, plus the two local hosts.
2. **The measurement never leaves the browser.** The file is decoded in the
   page and measured there. Only the lyrics and the voice go to the local
   engine, and only when the user presses the button.
3. **One copy of the analysis.** Every measurement lives in `src/core/core.js`.
   The panel reads the numbers from there and never computes one of its own.
4. **The browser and the engine must agree.** The Python engine measures the
   same file on the command line, and the two must give the same answer. A
   change to the analysis that moves a number has to move it in the engine as
   well, and `tools/check-song.mjs` is how you prove it.
5. **Say what the numbers are.** The panel labels every measurement, and the
   loudness is LUFS, not dB. Do not call a LUFS figure a decibel figure.
6. **The extension is honest about what it cannot do.** It has no speech model,
   so the panel says the lyrics need the engine, and it never pretends to have
   done the transcription.
7. **The panel looks for the engine on more than one port.** The saved address
   is asked first, then 8000, 8001, 8080 and 8123. The one that answers is
   saved. A reader must never have to hunt for the engine that is already
   running.
8. **The guide may link out, but nothing loads from the web.** The links in
   the panel and in the settings page are anchors the reader has to click.
   No script, no style, no picture and no call comes from the web, and the
   audit holds that line.
9. **The engine needs CORS for the local origins.** The browser holds the
   extension to its own rules for a call that comes from another origin, so
   the engine answers with the header for the local origins only.
10. **The player plays what is on this machine.** The song is handed to the
    player as an object address made from the file the user attached, so it
    plays in the browser without anything being sent anywhere. When the song
    came from a link, the engine downloaded it onto this machine and the
    player asks the engine on this machine for that copy. The address is let
    go of when the source is replaced or removed, or the browser holds on to
    it for the life of the panel.
11. **A lyric line carries the song to its moment.** The lines carry the time
    they start at, so clicking one takes the song there and marks the line
    under the playhead while the song runs.
12. **The browser never visits the site.** The link the user pastes is data.
    The panel hands it to the engine on this machine and the engine does the
    fetching, so the extension names no host but the local one and the audit
    rule holds. The permission list does not grow for a link.
13. **A guess about the language is shown as a guess.** The panel says where
    the language came from: the page named it, the title was read, or the
    model found it.
14. **The panel says where the words came from.** The engine writes the
    subtitles the page carries when the page has them, and reads the audio
    with a model when it does not. The panel shows which of the two happened,
    because the words of a page and the words of a model are not the same
    claim.
15. **The script box follows the language box.** It is built from the table
    of the scripts the engine can write, and it is rebuilt whenever the
    language changes or the engine reports the language it found. A script
    that is not valid for the language is never offered and never left
    selected, and a language the user has never touched keeps its own script
    while a language they have touched keeps the script they picked.
16. **The panel only offers a script the engine can really write.** Bangla
    has Bangla and Banglish. Every other language has the script it is
    written in, because the engine cannot transliterate Devanagari, Tamil or
    the rest into Latin. An option that does nothing is worse than no option.
17. **The outcome is shown at the foot of the panel.** The final text, the
    language, the script it was written in and the number of lines, with a
    copy and a download that need no permission the extension did not have.

## The analysis rules that were bugs once

- **The key is read from the peaks of the average spectrum.** Summing every
  bin counts the broadband skirt of a loud note as if it belonged to the
  pitch classes next door. A C major triad that carries a few harmonics reads
  as E minor that way, and a whole song reads as the wrong key.
- **The frequency of a peak is fitted, not read from the bin.** A tone of
  220 Hz falls between two bins of the transform, and at the bottom of the
  range a semitone is narrower than a bin, so the bin of a peak can be a
  quarter of a semitone away from the note it belongs to. The peak is fitted
  with a parabola on the three bins around it. Without that fit a C major
  triad reads as E minor at 48 kHz and as C major at 44.1 kHz. The engine
  fits the peak the same way, so the two agree.
- **The beat period is searched in steps of a fraction of a frame.** The beat
  of a real track does not land on a whole frame, and a search that only looks
  at whole frames picks the wrong tempo whenever it does not. A track at 120
  beats a minute used to be reported at 60.
- **The onsets are folded onto the beat grid to tell a beat from two beats.**
  Every onset is folded onto a circle of the circumference of the candidate
  period. At the real beat they all land on the same point. At twice the beat
  every second onset lands on the opposite point and the two halves cancel.
- **The fft starts its twiddle at one.** The twiddle of the first element of a
  block is `w^0`, not `w`. Starting it at `w` shifts every frequency bin by
  one, and an impulse at the start of the signal still looks right, so the
  mistake survives a careless test.
- **The loudness is measured per channel.** The peak of a stereo master is the
  loudest channel of it and not the average of the two. The panel and the
  command line of the engine must report the same numbers for the same file.
- **The window is the symmetric Hann.** `numpy.hanning` divides by `n - 1`,
  not by `n`. The engine and the extension have to use the same window.

## Layout

```
manifest.json            the extension manifest
src/core/core.js         all the analysis: levels, loudness, key, tempo
src/sidepanel/           the side panel page, its script and its style
src/background.js        the service worker, it opens the panel
src/options/             the address of the local engine
tools/audit.mjs          the static audit of the source
tools/check-song.mjs     the cross check against the engine
tools/wav-reader.mjs     a small WAV reader for the checks
tools/make-icons.py      the icons
tools/make-screenshot.py trims a browser screenshot down to the panel
tests/                   node:test suites
```

## Before you call it done

```
node --test tests/          # the analysis and the panel
node tools/audit.mjs        # the static audit
```

Then load the folder as an unpacked extension in Chrome or Edge, drop in a
song and check that the panel shows the same numbers as
`mash-mix analyze` on the command line.

## Packaging

Every release is a new version number and a new file name:
`MASH-Mix-Audio-and-Text-Extension-KDBN-v<n>-<change>.zip` in the workspace
root. Old zips stay on disk.

The release number lives in two places and they must agree: `manifest.json`
and `package.json`.
