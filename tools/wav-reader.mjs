/**
 * MASH-Mix-Audio-and-Text, a tiny WAV reader for the checks.
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 MASH (Khaled Bhuiyan)
 *
 * It reads the uncompressed PCM WAV files the check scripts use. It is not
 * part of the extension, the browser decodes the audio itself.
 */
import { readFileSync } from 'node:fs';

/**
 * Read a PCM WAV file into channels of Float32Array.
 *
 * @param {string} path The file to read.
 * @returns {{channels: Float32Array[], sampleRate: number}} The audio.
 */
export function readWav(path) {
  const buffer = readFileSync(path);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a RIFF file');
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAVE file');

  let offset = 12;
  let format = null;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = {
        code: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bits: buffer.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = size;
    }
    offset = body + size + (size % 2);
  }
  if (!format) throw new Error('no fmt chunk');
  if (dataOffset < 0) throw new Error('no data chunk');
  if (format.code !== 1) throw new Error(`only PCM is supported, got ${format.code}`);
  if (format.bits !== 16 && format.bits !== 32) throw new Error(`unsupported depth ${format.bits}`);

  const count = Math.floor(dataLength / (format.channels * (format.bits / 8)));
  const channels = [];
  for (let c = 0; c < format.channels; c++) channels.push(new Float32Array(count));

  const stride = format.channels * (format.bits / 8);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < format.channels; c++) {
      const at = dataOffset + i * stride + c * (format.bits / 8);
      let value;
      if (format.bits === 16) {
        value = buffer.readInt16LE(at) / 32768;
      } else {
        value = buffer.readFloatLE(at);
      }
      channels[c][i] = value;
    }
  }
  return { channels, sampleRate: format.sampleRate };
}
