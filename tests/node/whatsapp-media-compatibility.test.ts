import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const require = createRequire(path.resolve("packages/channels-whatsapp-md/package.json"));
const baileysEntry = require.resolve("@whiskeysockets/baileys");
const baileysRequire = createRequire(baileysEntry);
const mediaUrl = pathToFileURL(path.join(path.dirname(baileysEntry), "Utils/messages-media.js")).href;

test("Baileys image thumbnails use patched librsvg and preserve normal SVG and PNG dimensions", async () => {
  const sharp = baileysRequire("sharp");
  const version = sharp.versions.rsvg.split(".").map(Number);
  const minimum = [2, 63, 2];
  const different = version.findIndex((value: number, index: number) => value !== minimum[index]);
  assert.ok(different === -1 || version[different] > minimum[different], `Unpatched librsvg ${sharp.versions.rsvg}`);
  const { generateThumbnail } = await import(mediaUrl);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="blue"/></svg>');
  const png = await sharp({ create: { width: 64, height: 32, channels: 3, background: "blue" } }).png().toBuffer();
  for (const input of [svg, png]) {
    const result = await generateThumbnail(input, "image", {});
    assert.deepEqual(result.originalImageDimensions, { width: 64, height: 32 });
    const thumbnail = await sharp(Buffer.from(result.thumbnail, "base64")).metadata();
    assert.equal(thumbnail.format, "jpeg");
    assert.equal(thumbnail.width, 32);
    assert.equal(thumbnail.height, 16);
  }
});

test("Baileys audio duration remains compatible with buffer, file and stream inputs", async () => {
  const { getAudioDuration } = await import(mediaUrl);
  const wav = Buffer.alloc(44 + 8_000, 128);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8_000, 24);
  wav.writeUInt32LE(8_000, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(8_000, 40);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-media-compat-"));
  try {
    const file = path.join(root, "one-second.wav");
    fs.writeFileSync(file, wav);
    for (const input of [wav, file, Readable.from([wav], { objectMode: false })]) {
      assert.equal(await getAudioDuration(input), 1);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("APEv2 rejects oversized cover art before allocation and unterminated keys within a bounded worker", () => {
  // A tiny Monkey's Audio header followed by a deliberately inconsistent APEv2 tag.
  const prefix = Buffer.alloc(76);
  prefix.write("MAC ");
  for (const [offset, value] of [[4, 4_000], [8, 52], [12, 24], [56, 1], [60, 1], [64, 1], [72, 44_100]]) {
    prefix.writeUInt32LE(value, offset);
  }
  prefix.writeUInt16LE(16, 68);
  prefix.writeUInt16LE(1, 70);
  function fixture(size: number, key: Buffer): Buffer {
    const tag = Buffer.alloc(40);
    tag.write("APETAGEX");
    tag.writeUInt32LE(2_000, 8);
    tag.writeUInt32LE(32 + 8 + key.length + size, 12);
    tag.writeUInt32LE(1, 16);
    tag.writeUInt32LE(size, 32);
    tag.writeUInt32LE(2, 36); // Binary tag item.
    return Buffer.concat([prefix, tag, key]);
  }
  const fixtures = [
    { data: fixture(1_048_576, Buffer.from("Cover Art (Front)\0")).toString("base64"), error: "Invalid tag item size" },
    { data: fixture(1, Buffer.from("unterminated")).toString("base64"), error: "Unterminated tag item key" }
  ];
  const parserUrl = pathToFileURL(baileysRequire.resolve("music-metadata")).href;
  const script = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import os from "node:os";
    import path from "node:path";
    import { Readable } from "node:stream";
    import { parseBuffer, parseFile, parseStream } from ${JSON.stringify(parserUrl)};
    const OriginalUint8Array = globalThis.Uint8Array;
    let largeAllocation = false;
    globalThis.Uint8Array = new Proxy(OriginalUint8Array, {
      construct(target, args, newTarget) {
        if (typeof args[0] === "number" && args[0] > 65_536) {
          largeAllocation = true;
          throw new Error("Blocked oversized fixture allocation");
        }
        return Reflect.construct(target, args, newTarget);
      }
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-media-parser-"));
    try {
      for (const fixture of ${JSON.stringify(fixtures)}) {
        const input = Buffer.from(fixture.data, "base64");
        const file = path.join(root, "malformed.ape");
        fs.writeFileSync(file, input);
        const stream = () => Readable.from([input], { objectMode: false });
        for (const [parse, expected] of [
          [() => parseBuffer(input), fixture.error],
          [() => parseFile(file), fixture.error],
          [() => parseStream(stream(), { size: input.length }), fixture.error],
          [() => parseStream(stream()), fixture.error === "Invalid tag item size" ? "End-Of-Stream" : fixture.error]
        ]) {
          await assert.rejects(parse, error => error.message.includes(expected));
          assert.equal(largeAllocation, false, "Parser attempted an untrusted-size allocation");
        }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { timeout: 10_000, shell: false });
});
