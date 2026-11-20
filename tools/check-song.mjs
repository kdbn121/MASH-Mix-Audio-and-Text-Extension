/**
 * MASH-Mix-Audio-and-Text, the cross check against the Python engine.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * The extension measures a file in the browser and the engine measures it in
 * Python. The two must agree, or the panel shows numbers that the command
 * line contradicts. This script runs the browser side on a WAV file and
 * prints the numbers to compare.
 *
 * Run: node tools/check-song.mjs <file.wav>
 */
import { readWav } from './wav-reader.mjs';

await import('../src/core/core.js');
const { dsp } = globalThis.MASH_MIX;

const path = process.argv[2];
if (!path) {
  console.error('usage: node tools/check-song.mjs <file.wav>');
  process.exit(2);
}

const { channels, sampleRate } = readWav(path);
const started = Date.now();
const result = dsp.analyze(channels, sampleRate);
const seconds = (Date.now() - started) / 1000;

const rows = [
  ['duration', result.duration.toFixed(2) + ' s'],
  ['sample rate', result.sampleRate + ' Hz'],
  ['channels', String(result.channels)],
  ['peak', result.peakDbfs.toFixed(2) + ' dB'],
  ['rms', result.rmsDbfs.toFixed(2) + ' dB'],
  ['loudness', result.loudnessLufs.toFixed(2) + ' LUFS'],
  ['clipped', String(result.clippedSamples)],
  ['dc offset', result.dcOffsetPercent.toFixed(4) + ' %'],
  ['head silence', result.headSilenceSeconds.toFixed(5) + ' s'],
  ['crest', result.crestDb.toFixed(2) + ' dB'],
  ['key', (result.key.key + ' ' + result.key.mode).trim()],
  ['bpm', result.tempo.bpm.toFixed(2)]
];
for (const [label, value] of rows) console.log(label.padEnd(14), value);
console.log('elapsed'.padEnd(14), seconds.toFixed(2) + ' s');
