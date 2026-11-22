/**
 * MASH-Mix-Audio-and-Text, dump the chroma and the tempo intermediates.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * Run: node tools/dump-analysis.mjs <file.wav>
 */
import { readWav } from './wav-reader.mjs';

await import('../src/core/core.js');
const { dsp } = globalThis.MASH_MIX;

const path = process.argv[2];
const { channels, sampleRate } = readWav(path);
const mix = dsp.mixdown(channels);

const vector = dsp.chroma(mix, sampleRate);
console.log('chroma', Array.from(vector).map((v) => v.toFixed(4)).join(' '));

const built = dsp.onsetEnvelope(mix, sampleRate);
console.log('envelope length', built.envelope.length, 'hop', built.hopSeconds.toFixed(6));
console.log('envelope head', Array.from(built.envelope.slice(0, 12)).map((v) => v.toFixed(4)).join(' '));

const centred = new Float64Array(built.envelope.length);
let mean = 0;
for (const v of built.envelope) mean += v;
mean /= built.envelope.length;
for (let i = 0; i < built.envelope.length; i++) centred[i] = built.envelope[i] - mean;
const ac = dsp.autocorrelation(centred);
const frameRate = 1 / built.hopSeconds;
const minLag = Math.max(2, Math.trunc((frameRate * 60) / 200));
const maxLag = Math.min(ac.length - 1, Math.trunc((frameRate * 60) / 40));
console.log('frame rate', frameRate.toFixed(4), 'min lag', minLag, 'max lag', maxLag);

const positive = Array.from(centred).map((v) => (v > 0 ? v : 0));
const avg = positive.reduce((a, b) => a + b, 0) / positive.length;
const dev = Math.sqrt(positive.reduce((a, b) => a + b * b, 0) / positive.length - avg * avg);
const threshold = avg + 0.5 * dev;
const times = [];
const weights = [];
for (let i = 0; i < positive.length; i++) {
  if (positive[i] > threshold) {
    times.push(i * built.hopSeconds);
    weights.push(positive[i]);
  }
}
console.log('onsets', times.length, 'threshold', threshold.toFixed(4));

const top = [];
for (let lag = minLag; lag <= maxLag; lag++) {
  top.push([ac[lag], lag, (60 * frameRate) / lag]);
}
top.sort((a, b) => b[0] - a[0]);
console.log('top autocorrelation peaks:');
for (const [value, lag, bpm] of top.slice(0, 6)) console.log('  lag', lag, 'bpm', bpm.toFixed(2), 'ac', value.toFixed(4));

const best = dsp.pickPeriod(ac, minLag, maxLag, frameRate, times, weights, built.hopSeconds);
console.log('picked frame', best, 'bpm', (60 * frameRate / best).toFixed(2));
console.log('tempo', JSON.stringify(dsp.detectTempo(channels, sampleRate)));
