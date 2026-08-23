import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import {
  MEDIA_VISUAL_SIGNATURE_SCHEMA,
  PALETTE_CUBE_BINS,
  PALETTE_CUBE_LEVELS,
  DHASH_BITS,
  paletteBinIndex,
  paletteHistogramFromPixels,
  paletteHistogramToVector,
  paletteHistogramSimilarity,
  dHashFromGrayscale,
  dHashHamming,
  dHashSimilarity,
  dHashListSimilarity,
  toneFromPixels,
  toneSimilarity,
  signatureFromFrame,
  mergeFrameSignatures,
} from "../src/domain/media-visual-signature.js";
import {
  MediaVisualSignatureError,
  extractFramePixels,
  probeMediaFormat,
  createMediaVisualSignature,
} from "../server/media-visual-signature-extract.mjs";

const HAS_FFMPEG =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0 &&
  spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

// ---------------------------------------------------------------------------
// Pure feature math (no ffmpeg needed)
// ---------------------------------------------------------------------------

function solidRgb(color, width = 8, height = 8) {
  const buffer = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) buffer.set(color, i * 3);
  return buffer;
}

function solidGray(value, width = 9, height = 8) {
  const buffer = new Uint8Array(width * height);
  buffer.fill(value);
  return buffer;
}

test("paletteBinIndex quantizes into the 6x6x6 cube deterministically", () => {
  assert.equal(paletteBinIndex(255, 0, 0), 5 * PALETTE_CUBE_LEVELS * PALETTE_CUBE_LEVELS);
  assert.equal(paletteBinIndex(0, 255, 0), 5 * PALETTE_CUBE_LEVELS);
  assert.equal(paletteBinIndex(0, 0, 255), 5);
  // Edge values clamp inside the cube.
  assert.ok(paletteBinIndex(300, -5, 999) >= 0);
  assert.ok(paletteBinIndex(300, -5, 999) < PALETTE_CUBE_BINS);
});

test("palette histogram of a solid frame is a single full-weight bin", () => {
  const histogram = paletteHistogramFromPixels(solidRgb([255, 0, 0]), 8, 8);
  assert.equal(histogram.bins.length, 1);
  assert.equal(histogram.bins[0].bin, paletteBinIndex(255, 0, 0));
  assert.equal(histogram.bins[0].weight, 1);
  assert.equal(histogram.totalWeight, 1);
});

test("palette histogram keeps the weighted top-K of a two-color frame in stable order", () => {
  const width = 8;
  const height = 8;
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels.set((x + y) % 2 === 0 ? [255, 0, 0] : [0, 255, 0], (y * width + x) * 3);
    }
  }
  const histogram = paletteHistogramFromPixels(pixels, width, height);
  assert.equal(histogram.bins.length, 2);
  // Equal weights sort by ascending bin index.
  const greenBin = paletteBinIndex(0, 255, 0);
  const redBin = paletteBinIndex(255, 0, 0);
  const order = greenBin < redBin ? [greenBin, redBin] : [redBin, greenBin];
  assert.deepEqual(histogram.bins.map((entry) => entry.bin), order);
  assert.ok(Math.abs(histogram.bins[0].weight - 0.5) < 0.001);
  assert.ok(Math.abs(histogram.bins[1].weight - 0.5) < 0.001);
});

test("palette histogram throws on undersized pixel buffers", () => {
  assert.throws(() => paletteHistogramFromPixels(new Uint8Array(3), 8, 8), /expected 192 bytes/);
});

test("palette similarity is 1 for identical palettes, 0 for disjoint, tolerant for adjacent bins", () => {
  const red = { bins: [{ bin: paletteBinIndex(255, 0, 0), weight: 1 }] };
  const blue = { bins: [{ bin: paletteBinIndex(0, 0, 255), weight: 1 }] };
  // Same hue, one quantization step darker: inside the tolerance neighborhood.
  const darkRed = { bins: [{ bin: paletteBinIndex(190, 0, 0), weight: 1 }] };
  assert.equal(paletteHistogramSimilarity(red, red), 1);
  assert.equal(paletteHistogramSimilarity(red, blue), 0);
  assert.equal(paletteHistogramSimilarity(red, darkRed), 1);
  assert.equal(paletteHistogramSimilarity(blue, red), 0, "symmetric");
  assert.equal(paletteHistogramSimilarity({}, red), 0, "empty side scores 0");
});

test("palette histogram vectors round-trip through the dense representation", () => {
  const histogram = paletteHistogramFromPixels(solidRgb([10, 200, 30]), 8, 8);
  const vector = paletteHistogramToVector(histogram);
  assert.equal(vector.length, PALETTE_CUBE_BINS);
  assert.equal(vector[paletteBinIndex(10, 200, 30)], 1);
  assert.equal(vector.reduce((sum, value) => sum + value, 0), 1);
});

test("dHash of a uniform frame is all zeros; a gradient is all ones", () => {
  assert.equal(dHashFromGrayscale(solidGray(128)), "0".repeat(16));
  const horizontal = new Uint8Array(9 * 8);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 9; col += 1) horizontal[row * 9 + col] = col * 28;
  }
  assert.equal(dHashFromGrayscale(horizontal), "f".repeat(16));
});

test("dHash separates a horizontal gradient from a vertical one", () => {
  const horizontal = new Uint8Array(9 * 8);
  const vertical = new Uint8Array(9 * 8);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      horizontal[row * 9 + col] = col * 28;
      vertical[row * 9 + col] = row * 28;
    }
  }
  const hashH = dHashFromGrayscale(horizontal);
  const hashV = dHashFromGrayscale(vertical);
  assert.equal(hashH, "f".repeat(16));
  assert.equal(hashV, "0".repeat(16));
  assert.equal(dHashHamming(hashH, hashV), DHASH_BITS);
  assert.equal(dHashSimilarity(hashH, hashV), 0);
  assert.equal(dHashSimilarity(hashH, hashH), 1);
});

test("dHashHamming handles short/odd hex gracefully", () => {
  assert.equal(dHashHamming("", ""), 0);
  assert.equal(dHashHamming("f".repeat(16), "0".repeat(16)), DHASH_BITS);
  // 0x88 ^ 0xff = 0x77 = 1110111 (six set bits) for four bytes = 24.
  assert.equal(dHashHamming("8".repeat(8) + "0".repeat(8), "f".repeat(8) + "0".repeat(8)), 24);
});

test("dHashListSimilarity picks the best representative hash", () => {
  assert.equal(dHashListSimilarity("f".repeat(16), ["0".repeat(16), "f".repeat(16)]), 1);
  assert.equal(dHashListSimilarity("f".repeat(16), []), 0);
  // 24 differing bits over 4 payload bytes: 1 - 24/64.
  assert.equal(dHashSimilarity("8".repeat(8), "f".repeat(8)), 1 - 24 / DHASH_BITS);
});

test("tone of a solid color", () => {
  const red = toneFromPixels(solidRgb([255, 0, 0], 4, 4), 4, 4);
  assert.deepEqual(red, { r: 255, g: 0, b: 0, saturation: 1 });
});

test("tone vector of gray is neutral", () => {
  const gray = new Uint8Array(4 * 4 * 3);
  gray.fill(128);
  const tone = toneFromPixels(gray, 4, 4);
  assert.deepEqual(tone, { r: 128, g: 128, b: 128, saturation: 0 });
});

test("tone similarity: identical is 1, red vs blue is well below 1", () => {
  const red = { r: 255, g: 0, b: 0, saturation: 1 };
  const blue = { r: 0, g: 0, b: 255, saturation: 1 };
  assert.equal(toneSimilarity(red, red), 1);
  assert.ok(toneSimilarity(red, blue) < 0.5);
});

test("signatureFromFrame assembles palette + dHash + tone from pixel samples", () => {
  const gradient = new Uint8Array(9 * 8);
  for (let row = 0; row < 8; row += 1) for (let col = 0; col < 9; col += 1) gradient[row * 9 + col] = col * 28;
  const signature = signatureFromFrame({ rgb: solidRgb([255, 0, 0], 8, 8), width: 8, height: 8, gray: gradient });
  assert.equal(signature.palette.bins[0].bin, paletteBinIndex(255, 0, 0));
  assert.equal(signature.dHash, "f".repeat(16));
  assert.equal(signature.tone.r, 255);
  // A missing gray sample degrades to an all-zero hash, not a failure.
  const noGray = signatureFromFrame({ rgb: solidRgb([0, 255, 0], 8, 8), width: 8, height: 8 });
  assert.equal(noGray.dHash, "0".repeat(16));
});

test("mergeFrameSignatures averages tone, renormalizes palette mass, dedupes hashes", () => {
  const redFrame = signatureFromFrame({ rgb: solidRgb([255, 0, 0], 8, 8), width: 8, height: 8 });
  const blueFrame = signatureFromFrame({ rgb: solidRgb([0, 0, 255], 8, 8), width: 8, height: 8 });
  const gradientFrame = signatureFromFrame({
    rgb: solidRgb([255, 0, 0], 8, 8), width: 8, height: 8,
    gray: (() => { const buffer = new Uint8Array(9 * 8); for (let row = 0; row < 8; row += 1) for (let col = 0; col < 9; col += 1) buffer[row * 9 + col] = col * 28; return buffer; })(),
  });
  const merged = mergeFrameSignatures([redFrame, blueFrame, gradientFrame]);
  assert.equal(merged.tone.r, 170); // two red frames + one blue, averaged
  assert.equal(merged.tone.g, 0);
  assert.equal(merged.tone.b, 85); // blue is 1 of 3 frames
  // Two distinct hashes survive dedupe (red/blue frames hash identically at zero).
  assert.equal(merged.dHashes.length, 2);
  const redBin = paletteBinIndex(255, 0, 0);
  const blueBin = paletteBinIndex(0, 0, 255);
  const weights = new Map(merged.palette.bins.map((entry) => [entry.bin, entry.weight]));
  assert.ok(weights.has(redBin) && weights.has(blueBin));
  assert.ok(Math.abs(weights.get(redBin) - 2 / 3) < 0.01);
  assert.ok(Math.abs(weights.get(blueBin) - 1 / 3) < 0.01);
  assert.throws(() => mergeFrameSignatures([]), /no frame signatures/);
});

// ---------------------------------------------------------------------------
// Extraction layer with injected fakes (no ffmpeg needed)
// ---------------------------------------------------------------------------

function fakeChild({ bytes, code = 0, error }) {
  const child = new EventEmitter();
  child.stdout = new Readable({ read() {} });
  child.stderr = new Readable({ read() {} });
  child.kill = () => {};
  setImmediate(() => {
    if (error) child.emit("error", error);
    else {
      if (bytes) child.stdout.push(bytes);
      child.stdout.push(null);
      child.stderr.push(null);
      child.emit("close", code);
    }
  });
  return child;
}

test("extractFramePixels assembles the expected raw buffer from the ffmpeg stream", async () => {
  const width = 64;
  const height = 64;
  const bytes = Buffer.alloc(width * height * 3, 255); // all red
  const calls = [];
  const spawnFn = (command, args) => {
    calls.push({ command, args });
    return fakeChild({ bytes });
  };
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "mvs-asm-"));
  const file = path.join(fixture, "input.png");
  await fs.writeFile(file, "");
  try {
    const result = await extractFramePixels({ path: file, width, height, pixelFormat: "rgb24", spawnFn });
  assert.equal(result.pixels.length, width * height * 3);
  assert.equal(result.pixels[0], 255);
  assert.equal(result.width, width);
    const scaleIndex = calls[0].args.indexOf("scale=64:64:flags=bilinear");
    assert.ok(scaleIndex > 0, "bilinear scale filter requested");
    assert.ok(calls[0].args.includes("pipe:1"));
    assert.equal(calls[0].args[calls[0].args.indexOf("-pix_fmt") + 1], "rgb24");
  } finally {
    await fs.rm(fixture, { recursive: true, force: true });
  }
});

test("extractFramePixels throws decode_failed when the stream size is wrong", async () => {
  const spawnFn = () => fakeChild({ bytes: Buffer.alloc(100, 0) });
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "mvs-size-"));
  const file = path.join(fixture, "input.png");
  await fs.writeFile(file, "");
  try {
    await assert.rejects(
      extractFramePixels({ path: file, width: 64, height: 64, pixelFormat: "rgb24", spawnFn }),
      (error) => error instanceof MediaVisualSignatureError && error.code === "decode_failed",
    );
  } finally {
    await fs.rm(fixture, { recursive: true, force: true });
  }
});

test("extractFramePixels throws tool_not_found when ffmpeg cannot start", async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "mvs-tool-"));
  const file = path.join(fixture, "input.png");
  await fs.writeFile(file, "");
  const spawnFn = () => fakeChild({ error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }) });
  try {
    await assert.rejects(
      extractFramePixels({ path: file, width: 4, height: 4, pixelFormat: "gray", spawnFn }),
      (error) => error instanceof MediaVisualSignatureError && error.code === "tool_not_found",
    );
  } finally {
    await fs.rm(fixture, { recursive: true, force: true });
  }
});

test("extractFramePixels throws file_not_found for missing media", async () => {
  await assert.rejects(
    extractFramePixels({ path: "/tmp/definitely-missing-1789798999.png", width: 4, height: 4 }),
    (error) => error instanceof MediaVisualSignatureError && error.code === "file_not_found",
  );
});

test("probeMediaFormat parses duration and fps, and nulls on failure", async () => {
  const goodPath = path.join(os.tmpdir(), `duration-works-${process.pid}.txt`);
  await fs.writeFile(goodPath, "");
  const ok = (command, args, options, callback) => callback(null, JSON.stringify({ format: { duration: "3.024" }, streams: [{ avg_frame_rate: "24/1" }] }));
  const probe = await probeMediaFormat({ path: goodPath, execFileFn: ok });
  assert.equal(probe.durationSeconds, 3.024);
  assert.equal(probe.fps, 24);
  const broken = (command, args, options, cb) => cb(new Error("ffprobe exploded"), "");
  assert.deepEqual(await probeMediaFormat({ path: goodPath, execFileFn: broken }), { durationSeconds: null, fps: null });
  await assert.rejects(
    probeMediaFormat({ path: "/tmp/definitely-missing-1789798999.txt", execFileFn: ok }),
    (error) => error instanceof MediaVisualSignatureError && error.code === "file_not_found",
  );
  await fs.unlink(goodPath).catch(() => {});
});

test("createMediaVisualSignature assembles a 3-frame video signature from injected decoders", async () => {
  const goodPath = path.join(os.tmpdir(), `fake-video-${process.pid}.txt`);
  await fs.writeFile(goodPath, "");
  // Answer each request with correctly-sized raw pixels: red 64×64 RGB24,
  // uniform 9×8 gray.
  const spawnFn = (command, args) => {
    const grayRequest = args[args.indexOf("-pix_fmt") + 1] === "gray";
    const bytes = grayRequest ? Buffer.alloc(9 * 8, 128) : Buffer.alloc(64 * 64 * 3, 255);
    return fakeChild({ bytes });
  };
  const execFileFn = (command, args, options, callback) => {
    if (String(args.join(" ")).includes("format=duration")) callback(null, JSON.stringify({ format: { duration: "3.0" }, streams: [{ avg_frame_rate: "24/1" }] }));
    else callback(null, "");
  };
  const signature = await createMediaVisualSignature({ path: goodPath, type: "auto", spawnFn, execFileFn });
  assert.equal(signature.schemaVersion, MEDIA_VISUAL_SIGNATURE_SCHEMA);
  assert.equal(signature.type, "video");
  assert.equal(signature.durationSeconds, 3);
  assert.deepEqual(signature.frames.map((frame) => frame.role), ["first", "mid", "last"]);
  // Last = duration − offset, offset = 2 frame periods at the faked 24fps.
  assert.deepEqual(signature.frames.map((frame) => frame.timeSeconds), [0, 1.5, Number((3 - 2 / 24).toFixed(3))]);
  assert.equal(signature.frames.every((frame) => frame.signature.tone.r === 255), true);
  // A uniform frame hashes to all zeros; dedupe keeps a single hash.
  assert.deepEqual(signature.merged.dHashes, ["0".repeat(16)]);
  await fs.unlink(goodPath).catch(() => {});
});

// ---------------------------------------------------------------------------
// Real ffmpeg/ffprobe round-trips (skipped when the tools are absent)
// ---------------------------------------------------------------------------

let fixtureDir = null;

test("real ffmpeg: red png signs as an image with a single-bin red palette", { skip: !HAS_FFMPEG, timeout: 60_000 }, async () => {
  fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "mvs-"));
  const redPath = path.join(fixtureDir, "red.png");
  const made = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x240", "-frames:v", "1", redPath], { stdio: "pipe" });
  assert.equal(made.status, 0, made.stderr.toString());
  const signature = await createMediaVisualSignature({ path: redPath });
  assert.equal(signature.type, "image");
  assert.equal(signature.durationSeconds, null);
  assert.deepEqual(signature.frames.map((frame) => frame.role), ["single"]);
  const tone = signature.merged.tone;
  assert.ok(tone.r > 200 && tone.g < 80 && tone.b < 80, `expected red tone, got ${JSON.stringify(tone)}`);
  assert.equal(signature.merged.palette.bins.length, 1);
  assert.equal(signature.merged.palette.bins[0].weight, 1);
  assert.equal(signature.merged.palette.bins[0].bin, paletteBinIndex(255, 0, 0));
});

test("real ffmpeg: red vs blue palettes are near-disjoint", { skip: !HAS_FFMPEG, timeout: 60_000 }, async () => {
  if (!fixtureDir) fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "mvs-"));
  const bluePath = path.join(fixtureDir, "blue.png");
  const made = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x240", "-frames:v", "1", bluePath], { stdio: "pipe" });
  assert.equal(made.status, 0, made.stderr.toString());
  const redPath = path.join(fixtureDir, "red.png");
  const [red, blue] = await Promise.all([
    createMediaVisualSignature({ path: redPath }),
    createMediaVisualSignature({ path: bluePath }),
  ]);
  const similarity = paletteHistogramSimilarity(red.merged.palette, blue.merged.palette);
  assert.ok(similarity < 0.2, `red/blue palette similarity should be near 0, got ${similarity}`);
});

test("real ffmpeg: 3s video signs with first/mid/last frames and a stable duration", { skip: !HAS_FFMPEG, timeout: 120_000 }, async () => {
  if (!fixtureDir) fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "mvs-"));
  const videoPath = path.join(fixtureDir, "red3.mp4");
  const made = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x240:r=24", "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", videoPath], { stdio: "pipe" });
  assert.equal(made.status, 0, made.stderr.toString());
  const signature = await createMediaVisualSignature({ path: videoPath });
  assert.equal(signature.type, "video");
  assert.ok(Math.abs(signature.durationSeconds - 3) < 0.5, `duration ${signature.durationSeconds}`);
  assert.deepEqual(signature.frames.map((frame) => frame.role), ["first", "mid", "last"]);
  assert.equal(signature.frames[1].timeSeconds, 1.5);
  assert.ok(Math.abs(signature.frames[2].timeSeconds - 2.96) < 0.1);
  for (const frame of signature.frames) {
    assert.ok(frame.signature.tone.r > 200 && frame.signature.tone.g < 90 && frame.signature.tone.b < 90, `frame ${frame.role} tone ${JSON.stringify(frame.signature.tone)}`);
    assert.equal(frame.signature.degraded, undefined, `${frame.role} frame must decode fully, not degrade`);
  }
  // Uniform source: all three frames hash identically and dedupe to one.
  assert.equal(signature.merged.dHashes.length, 1);
});

test("real ffmpeg: identical source files produce identical dHashes (determinism)", { skip: !HAS_FFMPEG, timeout: 60_000 }, async () => {
  if (!fixtureDir) fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "mvs-"));
  const srcPath = path.join(fixtureDir, "testsrc.png");
  const made = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x240", "-frames:v", "1", srcPath], { stdio: "pipe" });
  assert.equal(made.status, 0, made.stderr.toString());
  const [first, second] = await Promise.all([
    createMediaVisualSignature({ path: srcPath }),
    createMediaVisualSignature({ path: srcPath }),
  ]);
  assert.equal(first.frames[0].signature.dHash, second.frames[0].signature.dHash);
  assert.notEqual(first.frames[0].signature.dHash, "0".repeat(16), "structured content must not hash to uniform-zero");
});

test("cleanup fixture directory", async () => {
  if (fixtureDir) await fs.rm(fixtureDir, { recursive: true, force: true });
});
