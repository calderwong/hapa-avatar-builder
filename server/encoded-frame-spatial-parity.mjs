import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

export const ENCODED_FRAME_SPATIAL_PARITY_SCHEMA = "hapa.echo.encoded-frame-spatial-parity.v1";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sha256File = (filePath) => `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;

function decodePng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function tileEvidence(image, columns = 8, rows = 8) {
  const tiles = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = Math.floor(column * image.width / columns);
      const right = Math.max(left + 1, Math.floor((column + 1) * image.width / columns));
      const top = Math.floor(row * image.height / rows);
      const bottom = Math.max(top + 1, Math.floor((row + 1) * image.height / rows));
      const stride = Math.max(1, Math.floor(Math.sqrt(((right - left) * (bottom - top)) / 1600)));
      let minimum = 255;
      let maximum = 0;
      let visible = 0;
      let samples = 0;
      for (let y = top; y < bottom; y += stride) {
        for (let x = left; x < right; x += stride) {
          const offset = (y * image.width + x) * 4;
          const luma = image.data[offset] * .2126 + image.data[offset + 1] * .7152 + image.data[offset + 2] * .0722;
          minimum = Math.min(minimum, luma);
          maximum = Math.max(maximum, luma);
          if (luma >= 12 && image.data[offset + 3] >= 16) visible += 1;
          samples += 1;
        }
      }
      const visibleRatio = samples ? visible / samples : 0;
      tiles.push({
        column,
        row,
        active: maximum - minimum >= 6 || visibleRatio >= .015,
        visibleRatio: Number(visibleRatio.toFixed(5)),
        lumaRange: Number((maximum - minimum).toFixed(3)),
      });
    }
  }
  return tiles;
}

export function compareEncodedFrameSpatialParity(previewPath, encodedPath) {
  const preview = decodePng(previewPath);
  const encoded = decodePng(encodedPath);
  if (preview.width !== encoded.width || preview.height !== encoded.height) {
    return {
      ok: false,
      reason: "frame-dimensions-mismatch",
      preview: { width: preview.width, height: preview.height },
      encoded: { width: encoded.width, height: encoded.height },
    };
  }
  const previewTiles = tileEvidence(preview);
  const encodedTiles = tileEvidence(encoded);
  const previewActive = previewTiles.filter((tile) => tile.active);
  const encodedActive = encodedTiles.filter((tile) => tile.active);
  const lost = previewActive.filter((tile) => !encodedTiles[tile.row * 8 + tile.column]?.active);
  const previewRight = previewActive.filter((tile) => tile.column >= 4);
  const previewBottom = previewActive.filter((tile) => tile.row >= 4);
  const lostRight = previewRight.filter((tile) => !encodedTiles[tile.row * 8 + tile.column]?.active);
  const lostBottom = previewBottom.filter((tile) => !encodedTiles[tile.row * 8 + tile.column]?.active);
  const lostActiveTileRatio = previewActive.length ? lost.length / previewActive.length : 1;
  const activeTileRetention = previewActive.length ? encodedActive.length / previewActive.length : 0;
  const rightRetention = previewRight.length ? 1 - lostRight.length / previewRight.length : 1;
  const bottomRetention = previewBottom.length ? 1 - lostBottom.length / previewBottom.length : 1;
  const ok = previewActive.length >= 8
    && lostActiveTileRatio <= .22
    && activeTileRetention >= .72
    && rightRetention >= .6
    && bottomRetention >= .6;
  return {
    ok,
    reason: ok ? "verified-full-frame-occupancy" : "encoded-frame-lost-preview-regions",
    dimensions: { width: preview.width, height: preview.height },
    tileGrid: { columns: 8, rows: 8 },
    previewActiveTileCount: previewActive.length,
    encodedActiveTileCount: encodedActive.length,
    lostActiveTileCount: lost.length,
    lostActiveTileRatio: Number(lostActiveTileRatio.toFixed(5)),
    activeTileRetention: Number(activeTileRetention.toFixed(5)),
    rightHalfRetention: Number(rightRetention.toFixed(5)),
    bottomHalfRetention: Number(bottomRetention.toFixed(5)),
    thresholds: {
      maximumLostActiveTileRatio: .22,
      minimumActiveTileRetention: .72,
      minimumRightHalfRetention: .6,
      minimumBottomHalfRetention: .6,
    },
  };
}

function distributedPreviewFrames(pixelReport, maximumSamples = 8) {
  const frames = (pixelReport?.frames || [])
    .filter((frame) => Number.isFinite(Number(frame.timestamp)) && frame.pngPath && fs.existsSync(frame.pngPath))
    .sort((left, right) => Number(left.timestamp) - Number(right.timestamp));
  if (frames.length <= maximumSamples) return frames;
  const selected = [];
  for (let index = 0; index < maximumSamples; index += 1) {
    const position = Math.round(index * (frames.length - 1) / (maximumSamples - 1));
    selected.push(frames[position]);
  }
  return [...new Map(selected.map((frame) => [Number(frame.timestamp).toFixed(6), frame])).values()];
}

export async function verifyEncodedFrameSpatialParity({
  masterPath,
  pixelReport,
  outputDirectory,
  execFile,
  maximumSamples = 8,
} = {}) {
  const selected = distributedPreviewFrames(pixelReport, maximumSamples);
  if (!selected.length) {
    return {
      schemaVersion: ENCODED_FRAME_SPATIAL_PARITY_SCHEMA,
      ok: false,
      status: "preview-frame-samples-missing",
      masterPath,
      samples: [],
    };
  }
  await fsp.mkdir(outputDirectory, { recursive: true });
  const samples = [];
  for (let index = 0; index < selected.length; index += 1) {
    const frame = selected[index];
    const timestamp = finite(frame.timestamp);
    const encodedPath = path.join(outputDirectory, `encoded-frame-${String(index).padStart(2, "0")}-${timestamp.toFixed(3).replace(".", "_")}s.png`);
    await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(timestamp),
      "-i", masterPath,
      "-frames:v", "1",
      encodedPath,
    ], { maxBuffer: 8 * 1024 * 1024 });
    samples.push({
      timestamp,
      previewPath: frame.pngPath,
      previewSha256: frame.pngSha256 || sha256File(frame.pngPath),
      encodedPath,
      encodedSha256: sha256File(encodedPath),
      ...compareEncodedFrameSpatialParity(frame.pngPath, encodedPath),
    });
  }
  const report = {
    schemaVersion: ENCODED_FRAME_SPATIAL_PARITY_SCHEMA,
    ok: samples.length > 0 && samples.every((sample) => sample.ok),
    status: samples.every((sample) => sample.ok)
      ? "verified-preview-to-encoded-full-frame"
      : "encoded-master-spatial-collapse",
    masterPath,
    masterSha256: sha256File(masterPath),
    sampleCount: samples.length,
    samples,
  };
  await fsp.writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
