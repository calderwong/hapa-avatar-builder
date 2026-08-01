#!/usr/bin/env node
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VARIANTS_ROOT = path.resolve(
  process.env.HAPA_ECHO_DIRECTION_VARIANTS_DIR
    || path.join(ROOT, "data", "music-video-project-variants"),
);
const INDEX_PATH = path.join(VARIANTS_ROOT, "index.json");
const CONCURRENCY = 16;

function withinRoot(candidate) {
  const relative = path.relative(VARIANTS_ROOT, candidate);
  return relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function previewFromVariant(variant = {}) {
  const timeline = Array.isArray(variant.timeline) ? variant.timeline : [];
  const shot = timeline.find((candidate) => {
    const contract = candidate?.media_contract || candidate?.mediaContract || {};
    return Boolean(
      contract.runtimeUri
      || contract.runtime_uri
      || candidate?.runtime_media_uri
      || candidate?.runtimeMediaUri
      || candidate?.media_uri
      || candidate?.mediaUri,
    );
  });
  if (!shot) return null;
  const contract = shot.media_contract || shot.mediaContract || {};
  const videoUri = contract.runtimeUri
    || contract.runtime_uri
    || shot.runtime_media_uri
    || shot.runtimeMediaUri
    || shot.media_uri
    || shot.mediaUri
    || null;
  const posterUri = contract.posterUri
    || contract.poster_uri
    || shot.media_thumbnail
    || shot.mediaThumbnail
    || shot.poster_uri
    || shot.posterUri
    || null;
  const sourceStartSeconds = Math.max(0, Number(
    contract.sourceInSeconds
    ?? contract.source_in_seconds
    ?? shot.source_in_seconds
    ?? shot.sourceInSeconds
    ?? 0,
  ) || 0);
  const declaredEnd = Number(
    contract.sourceOutSeconds
    ?? contract.source_out_seconds
    ?? shot.source_out_seconds
    ?? shot.sourceOutSeconds,
  );
  const durationSeconds = Math.max(0.25, Number(
    contract.actualDurationSeconds
    ?? contract.actual_duration_seconds
    ?? (Number(shot.end_sec ?? shot.endSeconds ?? shot.end) - Number(shot.start_sec ?? shot.startSeconds ?? shot.start))
    ?? 8,
  ) || 8);
  return {
    schemaVersion: "hapa.echo-record-garden.catalog-preview.v1",
    mediaId: shot.media_id || shot.mediaId || null,
    videoUri,
    posterUri,
    sourceStartSeconds,
    sourceEndSeconds: Number.isFinite(declaredEnd) && declaredEnd > sourceStartSeconds
      ? declaredEnd
      : sourceStartSeconds + durationSeconds,
    durationSeconds,
    playbackMode: "loop",
    mediaContentHash: contract.contentHash || contract.content_hash || null,
  };
}

async function enrichRow(row = {}) {
  const relativePath = String(row.relativePath || row.relative_path || "").trim();
  const candidate = path.resolve(VARIANTS_ROOT, relativePath);
  if (!relativePath || !withinRoot(candidate)) return row;
  try {
    const payload = JSON.parse(await readFile(candidate, "utf8"));
    const variant = payload.direction_script_variant
      || payload.music_video_project_variant
      || payload.variant
      || payload;
    const recordPreview = previewFromVariant(variant);
    if (!recordPreview) return row;
    return { ...row, recordPreview };
  } catch {
    return row;
  }
}

async function mapBounded(rows = [], mapper) {
  const output = new Array(rows.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(rows[index], index);
    }
  }));
  return output;
}

const payload = JSON.parse(await readFile(INDEX_PATH, "utf8"));
if (!Array.isArray(payload.variants)) throw new Error("Echo direction variant index has no variants array.");
const variants = await mapBounded(payload.variants, enrichRow);
const enriched = variants.filter((row) => row.recordPreview?.videoUri || row.recordPreview?.posterUri).length;
const next = {
  ...payload,
  recordPreviewSchemaVersion: "hapa.echo-record-garden.catalog-preview.v1",
  recordPreviewCount: enriched,
  recordPreviewBuiltAt: new Date().toISOString(),
  variants,
};
const temporaryPath = `${INDEX_PATH}.record-preview-${process.pid}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`);
await rename(temporaryPath, INDEX_PATH);
console.log(JSON.stringify({ indexPath: INDEX_PATH, variants: variants.length, enriched }, null, 2));
