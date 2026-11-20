/*!
 * MASH-Mix-Audio-and-Text, the extension core.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * Classic script on purpose: the same file is loaded by the side panel page
 * and imported by the node test suite.
 *
 * No DOM, no network, no analytics. Every number here is measured on the
 * machine that runs it, and nothing leaves it.
 */
(function (global) {
  'use strict';

  var NS = 'MASH_MIX';
  var root = (global[NS] = global[NS] || {});
  if (root.dsp) return; // already loaded in this realm

  var EPS = 1e-12;

  // ---------------------------------------------------------------------------
  // small helpers
  // ---------------------------------------------------------------------------

  function toDb(x) {
    return x <= EPS ? -Infinity : 20 * Math.log10(x);
  }
  function fromDb(db) {
    return Math.pow(10, db / 20);
  }
  function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
  }
  function frameCount(channels) {
    return channels && channels.length ? channels[0].length : 0;
  }
  function mixdown(channels) {
    var n = frameCount(channels);
    var out = new Float32Array(n);
    if (!n) return out;
    for (var c = 0; c < channels.length; c++) {
      var ch = channels[c];
      for (var i = 0; i < n; i++) out[i] += ch[i] / channels.length;
    }
    return out;
  }

  /**
   * Round half to even, the way Python rounds. The difference only shows up
   * on an exact half, but the key of a file must not depend on that.
   */
  function roundHalfEven(x) {
    var floor = Math.floor(x);
    var diff = x - floor;
    if (diff > 0.5) return floor + 1;
    if (diff < 0.5) return floor;
    return floor % 2 === 0 ? floor : floor + 1;
  }

  /** The symmetric Hann window, the same one numpy.hanning builds. */
  function hann(n) {
    var out = new Float64Array(n);
    if (n === 1) {
      out[0] = 1;
      return out;
    }
    for (var i = 0; i < n; i++) out[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    return out;
  }

  // ---------------------------------------------------------------------------
  // fft
  // ---------------------------------------------------------------------------

  /**
   * In place radix 2 FFT. re and im are Float64Array of the same power of two
   * length. The inverse divides by n at the end.
   */
  function fft(re, im, inverse) {
    var n = re.length;
    var j = 0;
    for (var i = 1; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        var ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = (inverse ? 2 : -2) * Math.PI / len;
      var wRe = Math.cos(ang);
      var wIm = Math.sin(ang);
      var half = len >> 1;
      for (var start = 0; start < n; start += len) {
        // the twiddle of the first element of the block is one, the rest
        // follow by one power of w each step
        var curRe = 1;
        var curIm = 0;
        for (var k = 0; k < half; k++) {
          var aRe = re[start + k];
          var aIm = im[start + k];
          var bRe = re[start + k + half];
          var bIm = im[start + k + half];
          var tRe = bRe * curRe - bIm * curIm;
          var tIm = bRe * curIm + bIm * curRe;
          re[start + k] = aRe + tRe;
          im[start + k] = aIm + tIm;
          re[start + k + half] = aRe - tRe;
          im[start + k + half] = aIm - tIm;
          var nextRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = nextRe;
        }
      }
    }
    if (inverse) {
      for (var k2 = 0; k2 < n; k2++) {
        re[k2] /= n;
        im[k2] /= n;
      }
    }
  }

  /**
   * The magnitude spectrum of every frame of a signal.
   *
   * The frames are visited one at a time, so the memory cost is one frame
   * and not the whole spectrogram. A four minute song at 48 kHz would need
   * hundreds of megabytes if the spectrogram were kept.
   */
  function eachMagnitudeFrame(x, nFft, hop, visit) {
    var n = x.length;
    var padded = n;
    if (n < nFft) padded = nFft;
    var count = 1 + Math.floor((padded - nFft) / hop);
    var re = new Float64Array(nFft);
    var im = new Float64Array(nFft);
    var win = hann(nFft);
    var mag = new Float64Array(Math.floor(nFft / 2) + 1);
    for (var f = 0; f < count; f++) {
      var start = f * hop;
      for (var i = 0; i < nFft; i++) {
        var at = start + i;
        re[i] = (at < n ? x[at] : 0) * win[i];
        im[i] = 0;
      }
      fft(re, im, false);
      for (var b = 0; b < mag.length; b++) mag[b] = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      visit(mag, f);
    }
    return count;
  }

  /** The normalised autocorrelation of a signal, computed with the FFT. */
  function autocorrelation(signal) {
    var size = signal.length;
    if (!size) return new Float64Array(0);
    var n = 1;
    while (n < 2 * size - 1) n <<= 1;
    var re = new Float64Array(n);
    var im = new Float64Array(n);
    for (var i = 0; i < size; i++) re[i] = signal[i];
    fft(re, im, false);
    for (var k = 0; k < n; k++) {
      var power = re[k] * re[k] + im[k] * im[k];
      re[k] = power;
      im[k] = 0;
    }
    fft(re, im, true);
    var out = new Float64Array(size);
    for (var j = 0; j < size; j++) out[j] = re[j];
    if (out[0] > 0) {
      for (var m = 0; m < size; m++) out[m] /= out[0];
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // loudness, ITU-R BS.1770
  // ---------------------------------------------------------------------------

  /** The K weighting pre filter, a high shelf at about 1681 Hz. */
  function highShelf(fs) {
    var f0 = 1681.974450955533;
    var gainDb = 3.999843853973347;
    var q = 0.7071752369554196;
    var k = Math.tan((Math.PI * f0) / fs);
    var vh = Math.pow(10, gainDb / 20);
    var vb = Math.pow(vh, 0.4996667741545416);
    var a0 = 1 + k / q + k * k;
    return {
      b: [(vh + (vb * k) / q + k * k) / a0, (2 * (k * k - vh)) / a0, (vh - (vb * k) / q + k * k) / a0],
      a: [1, (2 * (k * k - 1)) / a0, (1 - (k / q) + k * k) / a0]
    };
  }

  /** The K weighting RLB filter, a high pass at about 38 Hz. */
  function highPass(fs) {
    var f0 = 38.13547087602444;
    var q = 0.5003270373238773;
    var k = Math.tan((Math.PI * f0) / fs);
    var a0 = 1 + k / q + k * k;
    return {
      b: [1, -2, 1],
      a: [1, (2 * (k * k - 1)) / a0, (1 - (k / q) + k * k) / a0]
    };
  }

  /**
   * A second order IIR filter in the transposed direct form two, the form
   * scipy.signal.lfilter uses, with zero initial conditions.
   */
  function makeBiquad(b, a) {
    var z1 = 0;
    var z2 = 0;
    return function (x) {
      var y = b[0] * x + z1;
      z1 = b[1] * x - a[1] * y + z2;
      z2 = b[2] * x - a[2] * y;
      return y;
    };
  }

  /**
   * The mean square of every block of a signal, with the given length and
   * hop. The window slides, so the memory cost is one block.
   */
  function blockMeanSquare(x, block, hop) {
    var n = x.length;
    var out = [];
    if (n < block) return new Float64Array(0);
    var sum = 0;
    var i;
    for (i = 0; i < block; i++) sum += x[i] * x[i];
    var pos = 0;
    while (pos + block <= n) {
      out.push(sum / block);
      var next = pos + hop;
      if (next + block > n) break;
      for (i = pos; i < next; i++) sum -= x[i] * x[i];
      for (i = pos + block; i < next + block; i++) sum += x[i] * x[i];
      pos = next;
    }
    return new Float64Array(out);
  }

  /**
   * Gated loudness in LUFS following the ITU-R BS.1770 recipe.
   *
   * Every channel is K weighted on its own and the block mean squares are
   * summed with the standard channel weights, so a stereo file is never
   * downmixed before it is measured.
   */
  function lufs(channels, sampleRate) {
    if (!channels || !channels.length || !sampleRate) return null;
    var fs = sampleRate;
    var shelf = highShelf(fs);
    var rlb = highPass(fs);
    var block = Math.max(1, Math.round(0.4 * fs));
    var hop = Math.max(1, Math.round(0.1 * fs));
    var weights = [];
    for (var c = 0; c < channels.length; c++) weights.push(c < 2 ? 1.0 : 1.41);

    var perChannel = [];
    var shortest = Infinity;
    for (var index = 0; index < channels.length; index++) {
      var channel = channels[index];
      var shelfStep = makeBiquad(shelf.b, shelf.a);
      var rlbStep = makeBiquad(rlb.b, rlb.a);
      var ring = new Float64Array(block);
      var ringPos = 0;
      var sum = 0;
      var powers = [];
      var nextEmit = block - 1;
      var emitted = 0;
      for (var i = 0; i < channel.length; i++) {
        var y = rlbStep(shelfStep(channel[i]));
        var square = y * y;
        sum += square - ring[ringPos];
        ring[ringPos] = square;
        ringPos = ringPos + 1 === block ? 0 : ringPos + 1;
        if (i === nextEmit) {
          powers.push(sum / block);
          emitted++;
          nextEmit += hop;
        }
      }
      if (!powers.length) continue;
      perChannel.push(powers);
      if (powers.length < shortest) shortest = powers.length;
    }
    if (!perChannel.length || !isFinite(shortest) || shortest === 0) return null;

    var meanAbsolute = 0;
    var count = 0;
    var levels = new Float64Array(shortest);
    var powers = new Float64Array(shortest);
    for (var k = 0; k < shortest; k++) {
      var total = 0;
      for (var ch = 0; ch < perChannel.length; ch++) total += weights[ch] * perChannel[ch][k];
      powers[k] = total;
      levels[k] = -0.691 + 10 * Math.log10(Math.max(total, 1e-12));
      if (levels[k] > -70) {
        meanAbsolute += total;
        count++;
      }
    }
    if (!count) return null;
    meanAbsolute /= count;
    var relative = -0.691 + 10 * Math.log10(Math.max(meanAbsolute, 1e-12)) - 10;
    var gated = 0;
    var gatedCount = 0;
    for (var g = 0; g < shortest; g++) {
      if (levels[g] > -70 && levels[g] > relative) {
        gated += powers[g];
        gatedCount++;
      }
    }
    if (!gatedCount) {
      gated = 0;
      gatedCount = 0;
      for (var f = 0; f < shortest; f++) {
        if (levels[f] > -70) {
          gated += powers[f];
          gatedCount++;
        }
      }
    }
    if (!gatedCount) return null;
    var meanGated = gated / gatedCount;
    if (meanGated <= 0) return null;
    return -0.691 + 10 * Math.log10(meanGated);
  }

  // ---------------------------------------------------------------------------
  // levels and the health of a recording
  // ---------------------------------------------------------------------------

  /** A sample at or above this level counts as clipped. */
  var CLIP_LEVEL = 0.999;

  /** The level below which a sample counts as silence, in dBFS. */
  var SILENCE_DBFS = -60.0;

  /**
   * Every level of a recording: the peak, the average, the clipped samples,
   * the dc offset, the silence at the head and the crest factor.
   */
  function measure(channels, sampleRate) {
    var frames = frameCount(channels);
    var channelCount = channels && channels.length ? channels.length : 0;
    var result = {
      duration: sampleRate ? frames / sampleRate : 0,
      sampleRate: sampleRate,
      channels: channelCount,
      peakDbfs: null,
      rmsDbfs: null,
      loudnessLufs: null,
      clippedSamples: 0,
      dcOffsetPercent: null,
      headSilenceSeconds: null,
      crestDb: null
    };
    if (!frames || !sampleRate) return result;

    var peak = 0;
    var squareSum = 0;
    var clipped = 0;
    var dcSum = 0;
    var total = 0;
    for (var c = 0; c < channelCount; c++) {
      var channel = channels[c];
      for (var i = 0; i < frames; i++) {
        var value = channel[i];
        var absolute = value < 0 ? -value : value;
        if (absolute > peak) peak = absolute;
        if (absolute >= CLIP_LEVEL) clipped++;
        squareSum += value * value;
        dcSum += value;
        total++;
      }
    }
    if (!total) return result;
    var rms = Math.sqrt(squareSum / total);
    result.peakDbfs = toDb(peak);
    result.rmsDbfs = toDb(rms);
    result.clippedSamples = clipped;
    result.dcOffsetPercent = Math.abs(dcSum / total) * 100;
    result.crestDb = result.peakDbfs - result.rmsDbfs;

    // the silence at the head, measured on the downmix
    var mix = mixdown(channels);
    var floor = Math.pow(10, SILENCE_DBFS / 20);
    var head = mix.length;
    for (var m = 0; m < mix.length; m++) {
      if (Math.abs(mix[m]) > floor) {
        head = m;
        break;
      }
    }
    result.headSilenceSeconds = head / sampleRate;

    result.loudnessLufs = lufs(channels, sampleRate);
    return result;
  }

  // ---------------------------------------------------------------------------
  // key and mode
  // ---------------------------------------------------------------------------

  var KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  var MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  /** Half width of the triangular window that folds a bin onto a semitone. */
  var CHROMA_WIDTH = 0.5;

  /**
   * The chroma vector of a signal.
   *
   * Only the peaks of the average spectrum are read, and each peak is folded
   * onto the nearest semitone with a triangular window. Reading every bin
   * instead would count the broadband skirt of a loud note as if it belonged
   * to the pitch classes next door, and the key of the song would come out
   * wrong.
   */
  function chroma(x, sampleRate) {
    var nFft = 4096;
    var hop = 2048;
    var bins = Math.floor(nFft / 2) + 1;
    var sum = new Float64Array(bins);
    var frames = 0;
    eachMagnitudeFrame(x, nFft, hop, function (mag) {
      frames++;
      for (var b = 0; b < bins; b++) sum[b] += mag[b];
    });
    if (!frames) return null;
    var spectrum = new Float64Array(bins);
    for (var s = 0; s < bins; s++) spectrum[s] = sum[s] / frames;

    var binHz = sampleRate / nFft;
    var loBin = Math.max(1, Math.round(55 / binHz));
    var hiBin = Math.min(bins - 1, Math.round(2200 / binHz));
    var vector = new Float64Array(12);
    for (var i = 1; i < spectrum.length - 1; i++) {
      var value = spectrum[i];
      if (value <= 0) continue;
      if (value <= spectrum[i - 1] || value < spectrum[i + 1]) continue;
      if (i < loBin || i > hiBin) continue;
      // The peak of a tone is worked out from the three bins around it, so
      // the frequency of the tone does not depend on where it happens to
      // fall between two bins. At the bottom of the range a semitone is
      // narrower than a bin, and the raw bin of a peak can be a quarter of a
      // semitone away from the tone it belongs to.
      var left = Math.log(spectrum[i - 1]);
      var middle = Math.log(value);
      var right = Math.log(spectrum[i + 1]);
      var denominator = left - 2 * middle + right;
      var shift = 0;
      if (Math.abs(denominator) > 1e-18) {
        shift = (0.5 * (left - right)) / denominator;
        if (shift > 1) shift = 1;
        else if (shift < -1) shift = -1;
      }
      var hz = (i + shift) * binHz;
      var peak = Math.exp(middle - 0.25 * (left - right) * shift);
      var midi = 69 + 12 * Math.log2(hz / 440);
      var centre = roundHalfEven(midi);
      var distance = Math.abs(midi - centre);
      if (distance > CHROMA_WIDTH) continue;
      var weight = 1 - distance / CHROMA_WIDTH;
      var pitchClass = ((centre % 12) + 12) % 12;
      vector[pitchClass] += peak * weight;
    }
    var total = 0;
    for (var t = 0; t < 12; t++) total += vector[t];
    if (total <= 0) return null;
    for (var v = 0; v < 12; v++) vector[v] /= total;
    return vector;
  }

  /** Pearson correlation between two short vectors. */
  function correlate(a, b) {
    var n = a.length;
    if (n < 2 || b.length < 2) return 0;
    var meanA = 0;
    var meanB = 0;
    for (var i = 0; i < n; i++) {
      meanA += a[i];
      meanB += b[i];
    }
    meanA /= n;
    meanB /= n;
    var num = 0;
    var da = 0;
    var db = 0;
    for (var j = 0; j < n; j++) {
      var x = a[j] - meanA;
      var y = b[j] - meanB;
      num += x * y;
      da += x * x;
      db += y * y;
    }
    var denominator = Math.sqrt(da * db);
    if (denominator <= 1e-12) return 0;
    return num / denominator;
  }

  function rolledProfile(profile, rotation) {
    var out = new Float64Array(12);
    for (var i = 0; i < 12; i++) out[i] = profile[(i - rotation + 12) % 12];
    return out;
  }

  /**
   * The key and the mode of a signal.
   *
   * The correlation of the chroma with the key profiles is the usual
   * Krumhansl style estimate. The profile of a major key starts on its tonic
   * and the profile of a minor key starts on its tonic too, so the two are
   * tried for every rotation.
   */
  function detectKey(channels, sampleRate) {
    var mix = mixdown(channels);
    var vector = chroma(mix, sampleRate);
    if (!vector) return { key: '', mode: '', tonic: -1, confidence: 0 };
    var bestScore = -1;
    var bestRotation = 0;
    var bestMode = '';
    for (var rotation = 0; rotation < 12; rotation++) {
      var major = correlate(vector, rolledProfile(MAJOR_PROFILE, rotation));
      var minor = correlate(vector, rolledProfile(MINOR_PROFILE, rotation));
      if (major > bestScore) {
        bestScore = major;
        bestRotation = rotation;
        bestMode = 'major';
      }
      if (minor > bestScore) {
        bestScore = minor;
        bestRotation = rotation;
        bestMode = 'minor';
      }
    }
    if (bestScore < 0.3) return { key: '', mode: '', tonic: -1, confidence: bestScore };
    return {
      key: KEY_NAMES[bestRotation],
      mode: bestMode,
      tonic: bestRotation,
      confidence: bestScore
    };
  }

  // ---------------------------------------------------------------------------
  // tempo
  // ---------------------------------------------------------------------------

  /** The tempo a beat tracker expects a track to be at, in beats a minute. */
  var TEMPO_PRIOR_BPM = 120.0;

  /** How many octaves around that expectation the prior reaches. */
  var TEMPO_PRIOR_WIDTH = 1.0;

  /** The step of the beat period search, in frames of the onset envelope. */
  var PERIOD_STEP_FRAMES = 0.05;

  /** The onset strength envelope of a signal, and the hop it was built with. */
  function onsetEnvelope(x, sampleRate) {
    var nFft = 1024;
    var hop = 512;
    var bins = Math.floor(nFft / 2) + 1;
    var previous = null;
    var envelope = [];
    eachMagnitudeFrame(x, nFft, hop, function (mag) {
      if (previous) {
        var sum = 0;
        for (var b = 0; b < bins; b++) {
          var diff = mag[b] - previous[b];
          if (diff > 0) sum += diff;
        }
        envelope.push(sum);
      }
      previous = Float64Array.from(mag);
    });
    var out = new Float64Array(envelope);
    if (out.length) {
      var peak = 0;
      for (var i = 0; i < out.length; i++) if (out[i] > peak) peak = out[i];
      if (peak > 0) for (var j = 0; j < out.length; j++) out[j] /= peak;
    }
    return { envelope: out, hopSeconds: hop / sampleRate };
  }

  /** The autocorrelation read at a lag that falls between two frames. */
  function acAt(ac, lag) {
    if (lag < 0 || lag >= ac.length - 1) return 0;
    var low = Math.floor(lag);
    var fraction = lag - low;
    return ac[low] * (1 - fraction) + ac[low + 1] * fraction;
  }

  /**
   * How tightly the onsets sit on the beat grid of a given period.
   *
   * Every onset is folded onto a circle of circumference `period`. When the
   * period is the real beat the onsets all land on the same point of that
   * circle. When the period is twice the beat every second onset lands on
   * the opposite point and the two halves cancel each other out.
   */
  function phaseConcentration(times, weights, period) {
    if (!times.length || period <= 0) return 0;
    var total = 0;
    var real = 0;
    var imag = 0;
    for (var i = 0; i < times.length; i++) {
      var angle = (2 * Math.PI * times[i]) / period;
      var weight = weights[i];
      total += weight;
      real += weight * Math.cos(angle);
      imag += weight * Math.sin(angle);
    }
    if (total <= 0) return 0;
    return Math.sqrt(real * real + imag * imag) / total;
  }

  /** A log normal prior over the tempo, centred on 120 beats a minute. */
  function tempoPrior(bpm) {
    if (bpm <= 0) return 0;
    var distance = Math.log2(bpm / TEMPO_PRIOR_BPM);
    return Math.exp(-0.5 * Math.pow(distance / TEMPO_PRIOR_WIDTH, 2));
  }

  /**
   * The beat period in frames, or null when nothing stands out.
   *
   * Every candidate period is scored on three things: the autocorrelation at
   * its multiples, so a period whose double also carries support wins over a
   * period that stands alone; how tightly the onsets sit on its grid, which
   * is what tells a beat apart from two beats; and a tempo prior, which pulls
   * the result towards the range a listener expects.
   *
   * The search moves in steps of a fraction of a frame, because the beat of a
   * real track does not land on a whole frame.
   */
  function pickPeriod(ac, minLag, maxLag, frameRate, times, weights, hopSeconds) {
    if (maxLag <= minLag) return null;
    var bestFrame = null;
    var bestScore = -1;
    var frame = minLag;
    while (frame <= maxLag) {
      var period = frame * hopSeconds;
      var score = 0;
      var total = 0;
      var multiples = [
        [1, 1.0],
        [2, 0.5],
        [3, 0.33],
        [4, 0.25]
      ];
      for (var m = 0; m < multiples.length; m++) {
        score += multiples[m][1] * acAt(ac, frame * multiples[m][0]);
        total += multiples[m][1];
      }
      if (total > 0) {
        var bpm = 60 / period;
        var lock = phaseConcentration(times, weights, period);
        var combined = (score / total) * (0.25 + 0.75 * lock) * tempoPrior(bpm);
        if (combined > bestScore) {
          bestScore = combined;
          bestFrame = frame;
        }
      }
      frame += PERIOD_STEP_FRAMES;
    }
    return bestFrame;
  }

  /**
   * The tempo of a signal, in beats a minute.
   *
   * The spectral flux gives the onset envelope, the autocorrelation of that
   * envelope gives the candidates, and the beat grid decides between a beat
   * and two beats.
   */
  function detectTempo(channels, sampleRate) {
    var mix = mixdown(channels);
    var built = onsetEnvelope(mix, sampleRate);
    var envelope = built.envelope;
    var hopSeconds = built.hopSeconds;
    if (envelope.length < 8) return { bpm: 0, confidence: 0 };

    var mean = 0;
    for (var i = 0; i < envelope.length; i++) mean += envelope[i];
    mean /= envelope.length;
    var centred = new Float64Array(envelope.length);
    var spread = 0;
    for (var j = 0; j < envelope.length; j++) centred[j] = envelope[j] - mean;
    for (var k = 0; k < centred.length; k++) spread += centred[k] * centred[k];
    if (Math.sqrt(spread) <= 1e-9) return { bpm: 0, confidence: 0 };

    var ac = autocorrelation(centred);
    var frameRate = 1 / hopSeconds;
    var minLag = Math.max(2, Math.trunc((frameRate * 60) / 200));
    var maxLag = Math.min(ac.length - 1, Math.trunc((frameRate * 60) / 40));
    if (maxLag <= minLag) return { bpm: 0, confidence: 0 };

    var positive = [];
    var sum = 0;
    var squareSum = 0;
    for (var p = 0; p < centred.length; p++) {
      var value = centred[p] > 0 ? centred[p] : 0;
      positive.push(value);
      sum += value;
      squareSum += value * value;
    }
    var count = positive.length;
    var average = sum / count;
    var deviation = Math.sqrt(Math.max(0, squareSum / count - average * average));
    var threshold = average + 0.5 * deviation;

    var times = [];
    var weights = [];
    for (var q = 0; q < count; q++) {
      if (positive[q] > threshold) {
        times.push(q * hopSeconds);
        weights.push(positive[q]);
      }
    }
    if (!times.length) return { bpm: 0, confidence: 0 };

    var best = pickPeriod(ac, minLag, maxLag, frameRate, times, weights, hopSeconds);
    if (best === null) return { bpm: 0, confidence: 0 };

    var lag = best;
    var left = acAt(ac, lag - 1);
    var middle = acAt(ac, lag);
    var right = acAt(ac, lag + 1);
    var denominator = left - 2 * middle + right;
    if (Math.abs(denominator) > 1e-12) {
      var refined = lag + (0.5 * (left - right)) / denominator;
      if (refined >= minLag && refined <= maxLag) lag = refined;
    }
    var confidence = acAt(ac, lag);
    if (confidence < 0.05) return { bpm: 0, confidence: confidence };

    var period = lag / frameRate;
    if (period <= 0) return { bpm: 0, confidence: 0 };
    var bpm = 60 / period;
    if (bpm < 40 || bpm > 200) return { bpm: 0, confidence: confidence };
    return { bpm: bpm, confidence: confidence };
  }

  // ---------------------------------------------------------------------------
  // the whole picture
  // ---------------------------------------------------------------------------

  /**
   * Measure a track: its levels, its health, its key and its tempo.
   *
   * The levels come first because they are cheap, and the key and the tempo
   * come last because they cost the most.
   */
  function analyze(channels, sampleRate) {
    var result = measure(channels, sampleRate);
    result.key = detectKey(channels, sampleRate);
    result.tempo = detectTempo(channels, sampleRate);
    return result;
  }

  root.dsp = {
    toDb: toDb,
    fromDb: fromDb,
    clamp: clamp,
    mixdown: mixdown,
    frameCount: frameCount,
    hann: hann,
    fft: fft,
    autocorrelation: autocorrelation,
    blockMeanSquare: blockMeanSquare,
    lufs: lufs,
    measure: measure,
    chroma: chroma,
    correlate: correlate,
    detectKey: detectKey,
    onsetEnvelope: onsetEnvelope,
    phaseConcentration: phaseConcentration,
    tempoPrior: tempoPrior,
    pickPeriod: pickPeriod,
    detectTempo: detectTempo,
    analyze: analyze,
    KEY_NAMES: KEY_NAMES,
    MAJOR_PROFILE: MAJOR_PROFILE,
    MINOR_PROFILE: MINOR_PROFILE,
    CLIP_LEVEL: CLIP_LEVEL,
    SILENCE_DBFS: SILENCE_DBFS
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
