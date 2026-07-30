import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

export const ENCODED_LYRIC_PARITY_SCHEMA = "hapa.echo.encoded-lyric-parity.v1";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sha256File = (filePath) => `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;

function decodePng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

export function compareLyricParityPngs(previewPath, encodedPath, rect = null) {
  const preview = decodePng(previewPath);
  const encoded = decodePng(encodedPath);
  if (preview.width !== encoded.width || preview.height !== encoded.height) {
    return { ok: false, reason: "frame-dimensions-mismatch", preview: { width: preview.width, height: preview.height }, encoded: { width: encoded.width, height: encoded.height } };
  }
  const bounds = {
    left: Math.max(0, Math.floor(finite(rect?.left, 0))),
    top: Math.max(0, Math.floor(finite(rect?.top, 0))),
    right: Math.min(preview.width, Math.ceil(finite(rect?.right, preview.width))),
    bottom: Math.min(preview.height, Math.ceil(finite(rect?.bottom, preview.height))),
  };
  if (!(bounds.right > bounds.left && bounds.bottom > bounds.top)) return { ok: false, reason: "lyric-region-empty", bounds };
  const stride = Math.max(1, Math.floor(Math.sqrt(((bounds.right - bounds.left) * (bounds.bottom - bounds.top)) / 80_000)));
  let absoluteDelta = 0;
  let sampleCount = 0;
  let encodedMin = 255;
  let encodedMax = 0;
  for (let y = bounds.top; y < bounds.bottom; y += stride) {
    for (let x = bounds.left; x < bounds.right; x += stride) {
      const offset = (y * preview.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) absoluteDelta += Math.abs(preview.data[offset + channel] - encoded.data[offset + channel]);
      const luma = encoded.data[offset] * .2126 + encoded.data[offset + 1] * .7152 + encoded.data[offset + 2] * .0722;
      encodedMin = Math.min(encodedMin, luma);
      encodedMax = Math.max(encodedMax, luma);
      sampleCount += 1;
    }
  }
  const meanAbsoluteDelta = sampleCount ? absoluteDelta / (sampleCount * 3) : Infinity;
  const encodedLumaRange = encodedMax - encodedMin;
  return {
    ok: meanAbsoluteDelta <= 42 && encodedLumaRange >= 8,
    reason: meanAbsoluteDelta > 42 ? "encoded-frame-diverged-from-preview" : encodedLumaRange < 8 ? "encoded-lyric-region-flat" : "verified",
    bounds,
    sampleCount,
    meanAbsoluteDelta: Number(meanAbsoluteDelta.toFixed(4)),
    maximumMeanAbsoluteDelta: 42,
    encodedLumaRange: Number(encodedLumaRange.toFixed(3)),
  };
}

export async function verifyEncodedLyricMaster({
  masterPath,
  pixelReport,
  outputDirectory,
  execFile,
} = {}) {
  const proof = pixelReport?.lyrics || {};
  if (proof.enabled !== true) {
    return {
      schemaVersion: ENCODED_LYRIC_PARITY_SCHEMA,
      ok: proof.ok === true,
      status: proof.ok === true ? "disabled-no-unexpected-overlay" : "disabled-proof-missing",
      enabled: false,
      masterPath,
      masterSha256: fs.existsSync(masterPath) ? sha256File(masterPath) : null,
      samples: [],
    };
  }
  const activeSamples = (proof.samples || []).filter((sample) => sample.active && sample.ok);
  if (!activeSamples.length) {
    return { schemaVersion: ENCODED_LYRIC_PARITY_SCHEMA, ok: false, status: "active-preview-sample-missing", enabled: true, masterPath, samples: [] };
  }
  await fsp.mkdir(outputDirectory, { recursive: true });
  const ordered = [...activeSamples].sort((left, right) => finite(left.timestamp) - finite(right.timestamp));
  const selected = ordered.length <= 5
    ? ordered
    : [0, .25, .5, .75, 1].map((fraction) => ordered[Math.round(fraction * (ordered.length - 1))]);
  const samples = [];
  for (let index = 0; index < selected.length; index += 1) {
    const sample = selected[index];
    const encodedPath = path.join(outputDirectory, `encoded-lyric-${String(index).padStart(2, "0")}-${Number(sample.timestamp).toFixed(3).replace(".", "_")}s.png`);
    await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(sample.timestamp),
      "-i", masterPath,
      "-frames:v", "1",
      encodedPath,
    ], { maxBuffer: 8 * 1024 * 1024 });
    const comparison = compareLyricParityPngs(sample.pngPath, encodedPath, sample.observed?.rect);
    samples.push({
      timestamp: sample.timestamp,
      previewPath: sample.pngPath,
      previewSha256: sample.pngSha256 || sha256File(sample.pngPath),
      encodedPath,
      encodedSha256: sha256File(encodedPath),
      expectedText: sample.expected?.lineText || null,
      observedPreviewText: sample.observed?.text || null,
      templateId: sample.expected?.templateId || null,
      ...comparison,
    });
  }
  return {
    schemaVersion: ENCODED_LYRIC_PARITY_SCHEMA,
    ok: samples.length > 0 && samples.every((sample) => sample.ok),
    status: samples.every((sample) => sample.ok) ? "verified-preview-to-encoded-master" : "encoded-master-mismatch",
    enabled: true,
    contractHash: proof.contractHash || null,
    templateId: proof.templateId || null,
    masterPath,
    masterSha256: sha256File(masterPath),
    sampleCount: samples.length,
    samples,
  };
}
