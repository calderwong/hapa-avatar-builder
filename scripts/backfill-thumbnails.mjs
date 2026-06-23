#!/usr/bin/env node
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE_PATH = process.env.HAPA_AVATAR_STORE || path.join(ROOT, "data/avatar-store.json");
const MEDIA_DIR = process.env.HAPA_MEDIA_DIR || path.join(ROOT, "data/media");
const IMAGE_THUMB_WIDTH = Number(process.env.HAPA_IMAGE_THUMB_WIDTH || 360);
const FRAME_THUMB_WIDTH = Number(process.env.HAPA_FRAME_THUMB_WIDTH || 240);
const BACKUP_DIR = path.join(ROOT, "data/backups");
const SIPS_BIN = process.env.SIPS_BIN || "sips";

const counters = {
  assetsVisited: 0,
  imageAssets: 0,
  videoAssets: 0,
  imageSourcesCreated: 0,
  imageSourcesReused: 0,
  assetThumbnailsCreated: 0,
  assetThumbnailsReused: 0,
  frameThumbnailsCreated: 0,
  frameThumbnailsReused: 0,
  skipped: 0,
  errors: []
};

await main();

async function main() {
  await mkdir(MEDIA_DIR, { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });

  const rawStore = await readFile(STORE_PATH, "utf8");
  const store = JSON.parse(rawStore);
  const avatars = Array.isArray(store.avatars) ? store.avatars : [];
  let changed = false;

  for (const avatar of avatars) {
    const assets = Array.isArray(avatar.assets) ? avatar.assets : [];
    for (const asset of assets) {
      counters.assetsVisited += 1;
      const assetChanged = await healAsset(asset);
      changed = assetChanged || changed;
    }

    if (changed) {
      avatar.updatedAt = new Date().toISOString();
    }
  }

  if (!changed) {
    report({ changed: false, backupPath: null });
    return;
  }

  const backupPath = path.join(BACKUP_DIR, `avatar-store.thumbnail-backup-${timestampForFile()}.json`);
  await copyFile(STORE_PATH, backupPath);
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  report({ changed: true, backupPath });
}

async function healAsset(asset) {
  if (!asset || typeof asset !== "object") return false;

  let changed = false;
  asset.metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};

  if (asset.type === "image") {
    counters.imageAssets += 1;
    changed = (await externalizeImageAsset(asset)) || changed;
    changed = (await ensureAssetThumbnail(asset, asset.uri, IMAGE_THUMB_WIDTH)) || changed;
  }

  if (asset.type === "video") {
    counters.videoAssets += 1;
    changed = (await healVideoAsset(asset)) || changed;
  }

  return changed;
}

async function healVideoAsset(asset) {
  let changed = false;
  const metadataFrames = normalizeFrames(asset.metadata?.frames);
  const stateFrames = normalizeFrames(asset.state?.keyframes);
  const frameGroups = new Map();

  for (const frame of metadataFrames) {
    addFrameToGroup(frameGroups, frame);
  }
  for (const frame of stateFrames) {
    addFrameToGroup(frameGroups, frame);
  }

  for (const group of frameGroups.values()) {
    const sourceFrame = group.find((frame) => frame.thumbnail?.uri || frame.thumbnailUri) || group[0];
    const thumb = sourceFrame?.thumbnail || (sourceFrame?.thumbnailUri ? { uri: sourceFrame.thumbnailUri } : null);

    if (thumb?.uri) {
      for (const frame of group) {
        if (!frame.thumbnail?.uri) {
          frame.thumbnail = thumb;
          changed = true;
        }
        if (!frame.thumbnailUri) {
          frame.thumbnailUri = thumb.uri;
          changed = true;
        }
      }
      continue;
    }

    const generated = await buildThumbnail(sourceFrame?.uri, sourceFrame?.id || asset.id, FRAME_THUMB_WIDTH, "frame");
    if (!generated) {
      counters.skipped += 1;
      continue;
    }

    for (const frame of group) {
      frame.thumbnail = generated.thumbnail;
      frame.thumbnailUri = generated.thumbnail.uri;
      changed = true;
    }

    if (generated.created) {
      counters.frameThumbnailsCreated += 1;
    } else {
      counters.frameThumbnailsReused += 1;
    }
  }

  const firstFrame = metadataFrames.find((frame) => frame.marker === "first") || metadataFrames[0] ||
    stateFrames.find((frame) => frame.marker === "first") || stateFrames[0];
  const firstFrameThumb = firstFrame?.thumbnail?.uri || firstFrame?.thumbnailUri || firstFrame?.uri;
  if (!asset.metadata.thumbnail?.uri && !asset.metadata.thumbnailUri && firstFrameThumb) {
    changed = (await ensureAssetThumbnail(asset, firstFrameThumb, FRAME_THUMB_WIDTH)) || changed;
  }

  return changed;
}

async function externalizeImageAsset(asset) {
  const sourceUri = String(asset.uri || "");
  if (!sourceUri.startsWith("data:image/")) return false;

  const parsed = decodeDataImage(sourceUri);
  if (!parsed) {
    counters.skipped += 1;
    return false;
  }

  const ext = extensionForMime(parsed.mimeType);
  const sourceHash = sha1(sourceUri);
  const originalName = asset.metadata?.originalFileName || asset.metadata?.originalAssetName || `${asset.id || "image"}.${ext}`;
  const base = slugify(path.basename(originalName, path.extname(originalName))) || slugify(asset.id) || "image";
  const fileName = `${base}-source-${sourceHash.slice(0, 16)}.${ext}`;
  const filePath = path.join(MEDIA_DIR, fileName);

  if (existsSync(filePath)) {
    counters.imageSourcesReused += 1;
  } else {
    await writeFile(filePath, parsed.buffer);
    counters.imageSourcesCreated += 1;
  }

  asset.uri = `/media/${fileName}`;
  asset.metadata = {
    ...asset.metadata,
    mimeType: asset.metadata?.mimeType || parsed.mimeType,
    sizeBytes: asset.metadata?.sizeBytes || parsed.buffer.length,
    storage: {
      kind: "local-file",
      fileName,
      path: filePath
    },
    sourceCache: {
      migratedBy: "hapa-thumbnail-healer",
      sourceKind: "data-uri",
      sourceHash,
      migratedAt: new Date().toISOString()
    }
  };

  return true;
}

async function ensureAssetThumbnail(asset, sourceUri, maxWidth) {
  if (asset.metadata?.thumbnail?.uri && asset.metadata?.thumbnailUri) {
    return false;
  }

  const generated = await buildThumbnail(sourceUri, asset.id || asset.name || "asset", maxWidth, "asset");
  if (!generated) {
    counters.skipped += 1;
    return false;
  }

  asset.metadata.thumbnail = generated.thumbnail;
  asset.metadata.thumbnailUri = generated.thumbnail.uri;
  if (generated.created) {
    counters.assetThumbnailsCreated += 1;
  } else {
    counters.assetThumbnailsReused += 1;
  }
  return true;
}

async function buildThumbnail(sourceUri, identity, maxWidth, scope) {
  if (!sourceUri) return null;

  let sourceFile = null;
  let cleanupFile = null;
  let sourceDescriptor = null;

  try {
    if (sourceUri.startsWith("data:image/")) {
      const parsed = decodeDataImage(sourceUri);
      if (!parsed) return null;

      const sourceHash = sha1(sourceUri);
      const ext = extensionForMime(parsed.mimeType);
      sourceFile = path.join(os.tmpdir(), `hapa-thumb-source-${sourceHash}.${ext}`);
      cleanupFile = sourceFile;
      await writeFile(sourceFile, parsed.buffer);
      sourceDescriptor = `data:${parsed.mimeType}:${sourceHash}`;
    } else {
      sourceFile = localMediaPath(sourceUri);
      if (!sourceFile || !existsSync(sourceFile)) return null;

      const sourceStat = await stat(sourceFile);
      sourceDescriptor = `${sourceUri}:${sourceStat.size}:${Math.round(sourceStat.mtimeMs)}`;
    }

    const base = slugify(identity || path.basename(sourceFile, path.extname(sourceFile))) || scope;
    const cacheHash = sha1(`${scope}:${sourceDescriptor}:${maxWidth}`);
    const fileName = `${base.slice(0, 76)}-${scope}-thumb-${cacheHash.slice(0, 16)}.jpg`;
    const outputPath = path.join(MEDIA_DIR, fileName);
    const created = !existsSync(outputPath);

    if (created) {
      await execFileAsync(SIPS_BIN, [
        "-s", "format", "jpeg",
        "-Z", String(maxWidth),
        sourceFile,
        "--out", outputPath
      ], { maxBuffer: 1024 * 1024 * 4 });
    }

    const dimensions = await imageDimensions(outputPath);
    return {
      created,
      thumbnail: {
        id: `thumb-${cacheHash.slice(0, 16)}`,
        uri: `/media/${fileName}`,
        width: dimensions.width,
        height: dimensions.height,
        mimeType: "image/jpeg",
        storage: {
          kind: "local-file",
          fileName,
          path: outputPath
        },
        cache: {
          generatedBy: "hapa-thumbnail-healer",
          sourceKind: sourceUri.startsWith("data:image/") ? "data-uri" : "local-media",
          sourceHash: sha1(sourceDescriptor),
          maxWidth
        },
        createdAt: new Date().toISOString()
      }
    };
  } catch (error) {
    counters.errors.push({
      source: summarizeSource(sourceUri),
      message: error?.message || String(error)
    });
    return null;
  } finally {
    if (cleanupFile) {
      await rm(cleanupFile, { force: true });
    }
  }
}

async function imageDimensions(filePath) {
  const { stdout } = await execFileAsync(SIPS_BIN, [
    "-g", "pixelWidth",
    "-g", "pixelHeight",
    filePath
  ], { maxBuffer: 1024 * 1024 });

  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] || 0);
  return { width, height };
}

function addFrameToGroup(groups, frame) {
  if (!frame || typeof frame !== "object") return;
  const key = frame.id || frame.marker || frame.uri;
  if (!key) return;
  const group = groups.get(key) || [];
  group.push(frame);
  groups.set(key, group);
}

function normalizeFrames(frames) {
  return Array.isArray(frames) ? frames.filter(Boolean) : [];
}

function localMediaPath(uri) {
  if (!uri || typeof uri !== "string") return null;
  if (!uri.startsWith("/media/")) return null;
  return path.join(MEDIA_DIR, path.basename(uri));
}

function decodeDataImage(uri) {
  const match = uri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

function extensionForMime(mimeType) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sha1(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function summarizeSource(sourceUri) {
  if (!sourceUri) return "missing";
  if (sourceUri.startsWith("data:image/")) return `${sourceUri.slice(0, 32)}...`;
  return sourceUri;
}

function report({ changed, backupPath }) {
  console.log(JSON.stringify({
    changed,
    backupPath,
    ...counters
  }, null, 2));
}
