/**
 * MASH-Mix-Audio-and-Text, the tests of the analysis.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * Run: node --test tests/
 *
 * Every signal here is synthetic, so the expected answer is known in advance.
 * Nothing is downloaded, no model is loaded and the network is never touched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

await import('../src/core/core.js');
const { dsp } = globalThis.MASH_MIX;

const RATE = 48000;

/** A pure sine tone. */
function sine(seconds, freq, rate = RATE, amplitude = 0.5) {
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

/** A root triad with a few harmonics, so the chroma profile has something to read. */
function triad(root, minor, seconds = 4, rate = RATE) {
  const third = root * (minor ? 6 / 5 : 5 / 4);
  const fifth = root * 1.5;
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let value = 0;
    for (const [freq, weight] of [[root, 1], [third, 0.8], [fifth, 0.7]]) {
      for (let harmonic = 1; harmonic <= 3; harmonic++) {
        value += (weight / harmonic) * Math.sin((2 * Math.PI * freq * harmonic * i) / rate);
      }
    }
    out[i] = value;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] = (out[i] / peak) * 0.6;
  return out;
}

/** A click track at the given tempo, so the beat tracker has a known answer. */
function clicks(bpm, seconds = 14, rate = RATE) {
  const out = new Float32Array(Math.round(seconds * rate));
  const period = 60 / bpm;
  for (let time = 0; time < seconds; time += period) {
    const start = Math.round(time * rate);
    const length = Math.round(0.015 * rate);
    for (let i = 0; i < length && start + i < out.length; i++) {
      out[start + i] += 0.8 * Math.sin((2 * Math.PI * 2200 * i) / rate);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// the fft
// ---------------------------------------------------------------------------

test('the fft gives the original signal back', () => {
  const n = 64;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin(i) + 0.5 * Math.cos(3 * i);
  const before = Float64Array.from(re);
  dsp.fft(re, im, false);
  dsp.fft(re, im, true);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(re[i] - before[i]) < 1e-9);
});

test('the fft puts a tone in the right bin', () => {
  const n = 16;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = Math.cos((2 * Math.PI * 3 * i) / n);
    im[i] = Math.sin((2 * Math.PI * 3 * i) / n);
  }
  dsp.fft(re, im, false);
  let best = 0;
  for (let k = 1; k < n; k++) {
    if (Math.hypot(re[k], im[k]) > Math.hypot(re[best], im[best])) best = k;
  }
  assert.equal(best, 3);
});

test('the autocorrelation of an impulse train peaks at its period', () => {
  const x = new Float64Array(64);
  for (const at of [0, 10, 20, 30]) x[at] = 1;
  const ac = dsp.autocorrelation(x);
  assert.ok(Math.abs(ac[0] - 1) < 1e-9);
  assert.ok(ac[10] > ac[5]);
});

// ---------------------------------------------------------------------------
// the levels
// ---------------------------------------------------------------------------

test('the levels of a tone are the ones it was built with', () => {
  const tone = sine(1, 440, RATE, 0.5);
  const result = dsp.measure([tone], RATE);
  assert.equal(result.duration, 1);
  assert.equal(result.channels, 1);
  assert.ok(Math.abs(result.peakDbfs - 20 * Math.log10(0.5)) < 0.01);
  assert.ok(Math.abs(result.rmsDbfs - (20 * Math.log10(0.5) - 3.0103)) < 0.05);
  assert.equal(result.clippedSamples, 0);
  assert.ok(Math.abs(result.crestDb - 3.0103) < 0.05);
});

test('the clipped samples are counted', () => {
  const tone = sine(0.5, 440, RATE, 1.0);
  const result = dsp.measure([tone], RATE);
  assert.ok(result.clippedSamples > 0);
});

test('the dc offset of a centred signal is zero', () => {
  const tone = sine(1, 440, RATE, 0.5);
  const result = dsp.measure([tone], RATE);
  assert.ok(Math.abs(result.dcOffsetPercent) < 0.01);
});

test('the dc offset of a signal above zero is reported', () => {
  const tone = sine(1, 440, RATE, 0.5);
  for (let i = 0; i < tone.length; i++) tone[i] += 0.02;
  const result = dsp.measure([tone], RATE);
  assert.ok(Math.abs(result.dcOffsetPercent - 2) < 0.01);
});

test('the silence at the head of the file is measured', () => {
  const silence = new Float32Array(RATE / 2);
  const sound = sine(1, 440, RATE, 0.5);
  const joined = new Float32Array(silence.length + sound.length);
  joined.set(silence, 0);
  joined.set(sound, silence.length);
  const result = dsp.measure([joined], RATE);
  assert.ok(Math.abs(result.headSilenceSeconds - 0.5) < 0.01);
});

test('the loudness of a tone matches the reference of the engine', () => {
  const tone = sine(2, 1000, RATE, 0.1);
  const result = dsp.measure([tone], RATE);
  assert.ok(Math.abs(result.loudnessLufs - -23.0036) < 0.05);
});

test('the peak of a stereo file is the loudest channel of it', () => {
  const left = sine(1, 440, RATE, 0.5);
  const right = sine(1, 660, RATE, 0.1);
  const result = dsp.measure([left, right], RATE);
  assert.equal(result.channels, 2);
  assert.ok(Math.abs(result.peakDbfs - 20 * Math.log10(0.5)) < 0.01);
});

test('an empty signal is safe', () => {
  const result = dsp.measure([new Float32Array(0)], RATE);
  assert.equal(result.duration, 0);
  assert.equal(result.clippedSamples, 0);
});

// ---------------------------------------------------------------------------
// the key
// ---------------------------------------------------------------------------

test('the key of a C major triad is C major', () => {
  const key = dsp.detectKey([triad(130.81, false)], RATE);
  assert.equal(key.key, 'C');
  assert.equal(key.mode, 'major');
});

test('the key of a D minor triad is D minor', () => {
  const key = dsp.detectKey([triad(146.83, true)], RATE);
  assert.equal(key.key, 'D');
  assert.equal(key.mode, 'minor');
});

test('the key of a G major triad is G major', () => {
  const key = dsp.detectKey([triad(196.0, false)], RATE);
  assert.equal(key.key, 'G');
  assert.equal(key.mode, 'major');
});

test('the key of a F major triad is F major', () => {
  const key = dsp.detectKey([triad(174.61, false)], RATE);
  assert.equal(key.key, 'F');
  assert.equal(key.mode, 'major');
});

test('the key of an A minor triad is A minor', () => {
  const key = dsp.detectKey([triad(220.0, true)], RATE);
  assert.equal(key.key, 'A');
  assert.equal(key.mode, 'minor');
});

test('silence has no key', () => {
  const key = dsp.detectKey([new Float32Array(RATE)], RATE);
  assert.equal(key.key, '');
});

// ---------------------------------------------------------------------------
// the tempo
// ---------------------------------------------------------------------------

for (const bpm of [60, 75, 90, 100, 111, 120, 140, 180]) {
  test(`the tempo of a click track at ${bpm} is ${bpm}`, () => {
    const tempo = dsp.detectTempo([clicks(bpm)], RATE);
    assert.ok(Math.abs(tempo.bpm - bpm) < 3, `got ${tempo.bpm}`);
  });
}

test('the tempo of silence is nothing', () => {
  const tempo = dsp.detectTempo([new Float32Array(RATE * 2)], RATE);
  assert.equal(tempo.bpm, 0);
});

test('the onsets sit on the grid of the real beat and not on the grid of two beats', () => {
  const times = [0, 0.5, 1.0, 1.5, 2.0, 2.5];
  const weights = [1, 1, 1, 1, 1, 1];
  const onBeat = dsp.phaseConcentration(times, weights, 0.5);
  const onDouble = dsp.phaseConcentration(times, weights, 1.0);
  assert.ok(onBeat > 0.99);
  assert.ok(onDouble < 0.01);
});

test('the tempo prior pulls towards the range a listener expects', () => {
  assert.ok(dsp.tempoPrior(120) > dsp.tempoPrior(60));
  assert.ok(dsp.tempoPrior(120) > dsp.tempoPrior(240));
  assert.ok(Math.abs(dsp.tempoPrior(120) - 1) < 1e-9);
});
