// Echo Album Director Preview recordings — local persistence store.
//
// Stores quick-capture preview recordings (MediaRecorder output uploaded from
// the Director Workbench) under the Builder's media directory:
//
//   data/media/echo-preview-recordings/index.json      durable index
//   data/media/echo-preview-recordings/<id>.<mp4|webm> capture files
//
// This is deliberately NOT part of the Song Card mint pipeline: recordings
// are operator scratch material with no ledger, edition, or release
// semantics. They can be played back, downloaded, and deleted at any time.

import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

import {
  ECHO_PREVIEW_RECORDING_SCHEMA,
  echoPreviewRecordingContentType,
  echoPreviewRecordingFileExtension,
} from "../src/domain/echo-preview-recording.js";

const SAFE_RECORDING_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,63}$/u;

export class PreviewRecordingStoreError extends Error {
  constructor(code, message, statusCode = 400, details = {}) {
    super(message);
    this.name = "PreviewRecordingStoreError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function storeError(code, message, statusCode, details = {}) {
  return new PreviewRecordingStoreError(code, message, statusCode, details);
}

function normalizeId(value) {
  return String(value || "").trim();
}

function safeText(value, maxLength) {
  return String(value || "").trim().slice(0, Math.max(1, Number(maxLength) || 120));
}

function safeNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false, fallback = null } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = integer ? Math.trunc(parsed) : parsed;
  if (normalized < min || normalized > max) return fallback;
  return normalized;
}

function assertSafeId(id) {
  const value = normalizeId(id);
  if (!SAFE_RECORDING_ID.test(value)) {
    throw storeError(
      "preview_recording_id_unsafe",
      "A safe preview recording id is required (8-64 letters, digits, dashes, or underscores).",
      400,
      { id: value || null },
    );
  }
  return value;
}

/**
 * Create the preview recording store.
 *
 * @param {object} options
 * @param {string} options.mediaRoot Directory for the capture files + index
 *   (the caller owns the data/media/ convention; this store appends nothing).
 * @param {string} [options.indexFileName] Index file name inside mediaRoot.
 * @param {() => Date} [options.now]
 * @param {() => string} [options.randomId]
 * @param {number} [options.maxRecordings] Retention ceiling (oldest evicted).
 * @param {number} [options.maxFileBytes] Upload size ceiling (bytes).
 */
export function createPreviewRecordingStore({
  mediaRoot,
  indexFileName = "index.json",
  now = () => new Date(),
  randomId = () => crypto.randomUUID(),
  maxRecordings = 500,
  maxFileBytes = 128 * 1024 * 1024,
} = {}) {
  const root = path.resolve(String(mediaRoot || ""));
  const indexPath = path.join(root, String(indexFileName || "index.json"));
  let writeChain = Promise.resolve();

  async function readIndex() {
    try {
      const parsed = JSON.parse(await fsp.readFile(indexPath, "utf8"));
      const recordings = Array.isArray(parsed?.recordings) ? parsed.recordings : [];
      return {
        schemaVersion: parsed?.schemaVersion || ECHO_PREVIEW_RECORDING_SCHEMA,
        updatedAt: String(parsed?.updatedAt || ""),
        recordings,
      };
    } catch (error) {
      if (error?.code === "ENOENT") return { schemaVersion: ECHO_PREVIEW_RECORDING_SCHEMA, updatedAt: "", recordings: [] };
      throw error;
    }
  }

  async function writeIndex(index) {
    await fsp.mkdir(root, { recursive: true });
    const next = {
      schemaVersion: ECHO_PREVIEW_RECORDING_SCHEMA,
      updatedAt: now().toISOString(),
      recordings: index.recordings,
    };
    const tmpPath = path.join(root, `.${path.basename(indexPath)}.${process.pid}.${Date.now()}.tmp`);
    await fsp.writeFile(tmpPath, `${JSON.stringify(next, null, 2)}\n`);
    await fsp.rename(tmpPath, indexPath);
    return next;
  }

  function serialize(mutate) {
    const run = writeChain.then(async () => mutate(await readIndex()));
    writeChain = run.catch(() => {});
    return run;
  }

  async function publicRecord(record) {
    if (!record) return null;
    return {
      id: String(record.id || ""),
      schemaVersion: record.schemaVersion || ECHO_PREVIEW_RECORDING_SCHEMA,
      songId: String(record.songId || ""),
      songTitle: String(record.songTitle || ""),
      projectTitle: String(record.projectTitle || ""),
      orientation: String(record.orientation || ""),
      width: Number(record.width || 0),
      height: Number(record.height || 0),
      fps: Number(record.fps || 0),
      durationMs: Number(record.durationMs || 0),
      sizeBytes: Number(record.sizeBytes || 0),
      mimeType: String(record.mimeType || ""),
      contentType: String(record.contentType || ""),
      extension: String(record.extension || ""),
      fileName: String(record.fileName || ""),
      sha256: String(record.sha256 || ""),
      createdAt: String(record.createdAt || ""),
    };
  }

  return {
    mediaRoot: root,
    indexPath,

    /**
     * List recordings, newest first.
     * @param {{ songId?: string }} [filter]
     */
    async list({ songId } = {}) {
      const index = await readIndex();
      let rows = index.recordings;
      const wanted = normalizeId(songId);
      if (wanted) rows = rows.filter((row) => String(row.songId || "") === wanted);
      return [...(await Promise.all(rows.map((row) => publicRecord(row))))].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    },

    /**
     * Fetch one recording's metadata.
     * @param {string} id
     */
    async get(id) {
      const safeId = assertSafeId(id);
      const index = await readIndex();
      const row = index.recordings.find((entry) => entry.id === safeId) || null;
      if (!row) {
        throw storeError("preview_recording_not_found", `No preview recording named "${safeId}".`, 404, { id: safeId });
      }
      return publicRecord(row);
    },

    /**
     * Persist one uploaded capture.
     *
     * @param {object} input
     * @param {Buffer|Uint8Array} input.buffer Raw MediaRecorder blob bytes.
     * @param {string} [input.mimeType] Container mime (mp4/webm variants).
     * @param {object} [input.metadata] songId, songTitle, projectTitle,
     *   orientation, width, height, fps, durationMs, id (optional).
     * @returns {Promise<object>} The stored record (public shape).
     */
    async add({ buffer, mimeType, metadata = {} }) {
      const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
      if (!bytes.length) {
        throw storeError("preview_recording_empty", "A preview recording upload must not be empty.", 400);
      }
      if (bytes.byteLength > Number(maxFileBytes) || bytes.byteLength > 512 * 1024 * 1024) {
        throw storeError("preview_recording_too_large", "The preview recording exceeds the storage budget.", 413, {
          sizeBytes: bytes.byteLength,
          maxFileBytes: Number(maxFileBytes),
        });
      }
      const normalizedMime = String(mimeType || "").trim() || "video/webm";
      const extension = echoPreviewRecordingFileExtension(normalizedMime);
      const id = normalizeId(metadata.id) || randomId();
      const safeId = assertSafeId(id);
      const fileName = `${safeId}.${extension}`;
      const record = {
        id: safeId,
        schemaVersion: ECHO_PREVIEW_RECORDING_SCHEMA,
        songId: safeText(metadata.songId, 120),
        songTitle: safeText(metadata.songTitle, 240),
        projectTitle: safeText(metadata.projectTitle, 240),
        orientation: safeText(metadata.orientation, 60),
        width: safeNumber(metadata.width, { min: 16, max: 16384, integer: true, fallback: 0 }) || 0,
        height: safeNumber(metadata.height, { min: 16, max: 16384, integer: true, fallback: 0 }) || 0,
        fps: safeNumber(metadata.fps, { min: 1, max: 120, fallback: 0 }) || 0,
        durationMs: safeNumber(metadata.durationMs, { min: 0, max: 12 * 60 * 60 * 1000, integer: true, fallback: 0 }) || 0,
        sizeBytes: bytes.byteLength,
        mimeType: normalizedMime,
        contentType: echoPreviewRecordingContentType(normalizedMime),
        extension,
        fileName,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        createdAt: now().toISOString(),
      };

      const stored = await serialize(async (index) => {
        const existing = index.recordings.some((row) => row.id === safeId);
        const filePath = path.join(root, fileName);
        const tmpPath = path.join(root, `.${fileName}.${process.pid}.${Date.now()}.tmp`);
        await fsp.mkdir(root, { recursive: true });
        await fsp.writeFile(tmpPath, bytes);
        await fsp.rename(tmpPath, filePath);
        if (existing) {
          index.recordings = index.recordings.filter((row) => row.id !== safeId);
        }
        index.recordings.push(record);
        // Retention ceiling: drop the oldest beyond the cap (file + entry).
        while (index.recordings.length > Number(maxRecordings)) {
          const oldest = [...index.recordings].sort((a, b) =>
            String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
          )[0];
          index.recordings = index.recordings.filter((row) => row !== oldest);
          await fsp.unlink(path.join(root, oldest.fileName)).catch(() => {});
        }
        await writeIndex(index);
        return record;
      });
      return publicRecord(stored);
    },

    /**
     * Resolve a stored file for the range-serving route.
     * @param {string} id
     * @returns {Promise<{ filePath: string, fileName: string, sizeBytes: number, contentType: string, sha256: string }>}
     */
    async openFile(id) {
      const safeId = assertSafeId(id);
      const index = await readIndex();
      const row = index.recordings.find((entry) => entry.id === safeId) || null;
      if (!row) {
        throw storeError("preview_recording_not_found", `No preview recording named "${safeId}".`, 404, { id: safeId });
      }
      const filePath = path.join(root, row.fileName);
      // Defense in depth: the resolved path must stay inside the store root.
      if (path.resolve(filePath) !== path.join(root, path.basename(filePath))) {
        throw storeError("preview_recording_path_unsafe", "The preview recording path is not inside the media root.", 400, { id: safeId });
      }
      const stat = await fsp.stat(filePath).catch((error) => {
        if (error?.code === "ENOENT") {
          throw storeError("preview_recording_file_missing", `The stored file for "${safeId}" is missing.`, 410, { id: safeId, fileName: row.fileName });
        }
        throw error;
      });
      return {
        filePath,
        fileName: row.fileName,
        sizeBytes: stat.size,
        contentType: String(row.contentType || "video/webm"),
        sha256: String(row.sha256 || ""),
      };
    },

    /**
     * Delete a recording (file + index entry).
     * @param {string} id
     */
    async remove(id) {
      const safeId = assertSafeId(id);
      await serialize(async (index) => {
        const row = index.recordings.find((entry) => entry.id === safeId) || null;
        if (!row) {
          throw storeError("preview_recording_not_found", `No preview recording named "${safeId}".`, 404, { id: safeId });
        }
        index.recordings = index.recordings.filter((entry) => entry.id !== safeId);
        await fsp.unlink(path.join(root, row.fileName)).catch(() => {});
        await writeIndex(index);
        return row;
      });
      return { id: safeId, removed: true };
    },
  };
}
