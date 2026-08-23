// Avatar Likeness Profile Store — local runtime data.
//
// Avatar Likeness Assignment plan, layer L2. One JSON document
// (data/avatar-likeness/profiles.json) mapping avatarId to its likeness
// profile. Writes are serialized through a single in-process chain and
// land atomically (tmp file + rename) so a crash never leaves a torn
// store. The directory is gitignored runtime data (see data/README.md);
// the store is rebuilt at any time by re-profiling.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AVATAR_LIKENESS_PROFILE_SCHEMA, AVATAR_LIKENESS_PROFILE_STORE_SCHEMA } from "../src/domain/avatar-likeness-profile.js";

export class AvatarLikenessStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AvatarLikenessStoreError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new AvatarLikenessStoreError(code, message, details);
}

function normalizeProfile(input) {
  if (!input || typeof input !== "object") fail("invalid_profile", "A likeness profile must be an object.");
  const avatarId = String(input.avatarId || "").trim();
  if (!avatarId) fail("invalid_profile", "A likeness profile requires an avatarId.");
  if (input.schemaVersion !== AVATAR_LIKENESS_PROFILE_SCHEMA) {
    fail("invalid_profile", `A likeness profile must use schema ${AVATAR_LIKENESS_PROFILE_SCHEMA}.`, {
      found: input.schemaVersion || null,
    });
  }
  return {
    ...input,
    avatarId,
    profiledAt: String(input.profiledAt || new Date().toISOString()),
  };
}

function emptyDocument() {
  return { schemaVersion: AVATAR_LIKENESS_PROFILE_STORE_SCHEMA, profiles: {}, updatedAt: null };
}

export function createAvatarLikenessStore({ dir, fileName = "profiles.json" } = {}) {
  if (!dir) fail("missing_dir", "createAvatarLikenessStore requires a dir.");
  const filePath = path.join(dir, fileName);
  let writeChain = Promise.resolve();

  async function readDocument() {
    let raw;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return emptyDocument();
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      fail("store_unreadable", `The likeness profile store is not valid JSON: ${filePath}`);
    }
    const profiles = parsed?.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {};
    return {
      schemaVersion: AVATAR_LIKENESS_PROFILE_STORE_SCHEMA,
      profiles: Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, normalizeProfile(profile)])),
      updatedAt: parsed?.updatedAt || null,
    };
  }

  async function mutate(mutator) {
    const document = await readDocument();
    const result = mutator(document);
    document.updatedAt = new Date().toISOString();
    // Own the directory lifecycle; land through tmp + rename so a crash
    // never leaves a torn store file behind.
    await mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    await rename(tmp, filePath);
    return result ?? document;
  }

  return {
    filePath,
    /** All profiles, as an array. */
    async list() {
      const document = await readDocument();
      return Object.values(document.profiles);
    },
    /** One profile by avatarId, or null. */
    async get(avatarId) {
      const document = await readDocument();
      return document.profiles[String(avatarId || "")] || null;
    },
    /** Replace one avatar's profile (id-keyed). Serialized + atomic.
     *  Async so invalid input rejects (never throws synchronously). */
    async upsert(profile) {
      const normalized = normalizeProfile(profile);
      const operation = async () => mutate((document) => {
        document.profiles[normalized.avatarId] = normalized;
        return normalized;
      });
      writeChain = writeChain.then(operation, operation);
      return writeChain;
    },
    async size() {
      const document = await readDocument();
      return Object.keys(document.profiles).length;
    },
  };
}
