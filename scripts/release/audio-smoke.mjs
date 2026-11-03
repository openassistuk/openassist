import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Synthetic mono PCM: alternate quiet/loud blocks to expose channel/API mistakes.
export function waveformFixture() {
  const wav = Buffer.alloc(44 + 8000 * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  for (let i = 0; i < 8000; i++) {
    const amplitude = Math.floor(i / 125) % 2 ? 24576 : 8192;
    wav.writeInt16LE(i % 2 ? amplitude : -amplitude, 44 + i * 2);
  }
  return wav;
}

export async function verifyAudioDecoder(baileysEntry) {
  const require = createRequire(baileysEntry);
  const metadata = require('audio-decode/package.json');
  assert.equal(metadata.name, '@audio/decode');
  assert.equal(metadata.version, '4.2.0');
  const { getAudioWaveform } = await import(pathToFileURL(path.join(path.dirname(baileysEntry), 'Utils/messages-media.js')).href);
  const expected = Uint8Array.from({ length: 64 }, (_, i) => i % 2 ? 100 : 33);
  assert.deepEqual(await getAudioWaveform(waveformFixture()), expected);
  // Lazy codec/WASM assets must survive production deployment and relocation.
  const { default: decode } = await import(pathToFileURL(require.resolve('audio-decode')).href);
  for (const format of ['mp3', 'flac', 'opus', 'oga']) {
    const decoder = await decode[format]();
    decoder.free();
  }
}
