// Avatar Likeness media-side runtime stores (L3).
//
// Two keyed JSON stores under data/avatar-likeness/ (gitignored runtime
// data, documented in data/README.md):
//
//   media-signatures.json  key → media likeness signature document
//                          (content-hash keyed, signer-versioned)
//   verdicts.json          key → matcher verdict receipt (the human gate's
//                          proposal queue; re-runs replace the receipt and
//                          record the run)
//
// Both follow the layer-L2 store discipline: one in-process serialized
// write chain, tmp-file + rename landing, normalized on read, and they
// create their own directory on first write.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AVATAR_LIKENESS_MATCH_SCHEMA,
  AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA,
} from "../src/domain/avatar-likeness-match.js";

export class AvatarLikenessMediaStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AvatarLikenessMediaStoreError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Factory for one keyed JSON map store with serialized atomic writes.
 *
 * @param {{ dir: string, fileName: string, schemaVersion: string,
 *   normalize: (object) => object }} options `normalize` validates and
 *   returns the canonical shape; it must throw AvatarLikenessMediaStoreError
 *   on invalid input (fail-closed on read and write).
 */
export function createAvatarLikenessMapStore({ dir, fileName, schemaVersion, normalize }) {
  if (!dir) throw new AvatarLikenessMediaStoreError("missing_dir", "store requires a dir");
  if (!schemaVersion || typeof normalize !== "function") {
    throw new AvatarLikenessMediaStoreError("invalid_config", "store requires a schemaVersion and a normalize function");
  }
  const filePath = path.join(dir, fileName);
  let writeChain = Promise.resolve();

  async function readDocument() {
    let raw;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return { schemaVersion, entries: {}, updatedAt: null };
      throw new AvatarLikenessMediaStoreError("store_unreadable", `store file is not readable: ${filePath}`, { cause: error.message });
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new AvatarLikenessMediaStoreError("store_unreadable", `store file is not valid JSON: ${filePath}`, { cause: error.message });
    }
    const entries = {};
    for (const [key, entry] of Object.entries(parsed?.entries && typeof parsed.entries === "object" ? parsed.entries : {})) {
      entries[key] = normalize(entry);
    }
    return { schemaVersion, entries, updatedAt: parsed?.updatedAt || null };
  }

  async function mutate(mutator) {
    const document = await readDocument();
    const result = mutator(document);
    document.updatedAt = new Date().toISOString();
    await mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    await rename(tmp, filePath);
    return result ?? document;
  }

  return {
    filePath,
    /** All entries as [key, entry] pairs. */
    async list() {
      const document = await readDocument();
      return Object.entries(document.entries);
    },
    /** One entry by key, or null. */
    async get(key) {
      const document = await readDocument();
      return document.entries[String(key || "")] || null;
    },
    /** Replace one key's entry. Serialized + atomic; invalid input rejects. */
    async upsert(key, entry) {
      const cleanKey = String(key || "").trim();
      if (!cleanKey) throw new AvatarLikenessMediaStoreError("invalid_entry", "an entry requires a key");
      const normalized = normalize(entry);
      const operation = async () =>
        mutate((document) => {
          document.entries[cleanKey] = normalized;
          return normalized;
        });
      writeChain = writeChain.then(operation, operation);
      return writeChain;
    },
    async size() {
      const document = await readDocument();
      return Object.keys(document.entries).length;
    },
  };
}

function normalizeMediaSignature(entry) {
  if (!entry || typeof entry !== "object") {
    throw new AvatarLikenessMediaStoreError("invalid_entry", "a media signature must be an object");
  }
  if (entry.schemaVersion !== AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA) {
    throw new AvatarLikenessMediaStoreError("invalid_entry", `a media signature must use schema ${AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA}`, { found: entry.schemaVersion || null });
  }
  const key = String(entry.key || "").trim();
  if (!key) throw new AvatarLikenessMediaStoreError("invalid_entry", "a media signature requires a key");
  if (!entry.contentFingerprint) throw new AvatarLikenessMediaStoreError("invalid_entry", "a media signature requires a contentFingerprint");
  return { ...entry, key };
}

function normalizeVerdict(entry) {
  if (!entry || typeof entry !== "object") {
    throw new AvatarLikenessMediaStoreError("invalid_entry", "a verdict must be an object");
  }
  if (entry.schemaVersion !== AVATAR_LIKENESS_MATCH_SCHEMA) {
    throw new AvatarLikenessMediaStoreError("invalid_entry", `a verdict must use schema ${AVATAR_LIKENESS_MATCH_SCHEMA}`, { found: entry.schemaVersion || null });
  }
  const key = String(entry.key || "").trim();
  if (!key) throw new AvatarLikenessMediaStoreError("invalid_entry", "a verdict requires a key");
  if (entry.verdict !== "assigned" && entry.verdict !== "unresolved") {
    throw new AvatarLikenessMediaStoreError("invalid_entry", `a verdict must be assigned or unresolved, found: ${entry.verdict}`);
  }
  return { ...entry, key };
}

/** Media signatures, keyed by the enricher-ledger videoKey. */
export function createMediaLikenessSignatureStore({ dir, fileName = "media-signatures.json" } = {}) {
  return createAvatarLikenessMapStore({
    dir,
    fileName,
    schemaVersion: AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA,
    normalize: normalizeMediaSignature,
  });
}

/** Matcher verdicts (proposals), keyed by the enricher-ledger videoKey. */
export function createAvatarLikenessVerdictStore({ dir, fileName = "verdicts.json" } = {}) {
  return createAvatarLikenessMapStore({
    dir,
    fileName,
    schemaVersion: AVATAR_LIKENESS_MATCH_SCHEMA,
    normalize: normalizeVerdict,
  });
}
