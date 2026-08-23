// Avatar Likeness Profile — Node-side builder.
//
// Avatar Likeness Assignment plan, layer L2. Turns an Avatar Card object
// (from data/avatar-store.json) into a likeness profile document:
//   1. resolve each attached pixel asset to a file on disk,
//   2. fingerprint the file (sha256) for content-hash keying,
//   3. sign it with the L1 media visual signature (ffmpeg),
//   4. assemble the weighted profile + text channel (pure domain math).
//
// The builder never mutates the Avatar store; profiles are sidecar data.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import {
  assetLikenessWeight,
  buildAvatarLikenessProfile,
  classifyAssetWeightClass,
  profileIsFresh,
  selectLikenessAssets,
  textChannelFromAvatar,
} from "../src/domain/avatar-likeness-profile.js";
import { mergeFrameSignatures } from "../src/domain/media-visual-signature.js";
import { MediaVisualSignatureError, createMediaVisualSignature } from "./media-visual-signature-extract.mjs";

/**
 * Resolve an Avatar asset to an on-disk path.
 *
 * @param {object} asset
 * @param {string} mediaDir
 * @returns {string|null}
 */
export function mediaPathForAsset(asset, mediaDir) {
  const uri = String(asset?.uri || "");
  if (uri.startsWith("/media/")) return path.join(mediaDir, uri.slice("/media/".length));
  if (uri.startsWith("file://")) {
    try {
      return new URL(uri).pathname;
    } catch {
      return null;
    }
  }
  if (path.isAbsolute(uri)) return uri;
  const storage = asset?.metadata?.storage;
  if (storage?.kind === "local-file" && storage.path && path.isAbsolute(storage.path)) return storage.path;
  if (storage?.fileName) return path.join(mediaDir, storage.fileName);
  return null;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} filePath
 * @returns {Promise<string>} hex sha256 of the file bytes
 */
export async function fingerprintFile(filePath) {
  const hash = createHash("sha256");
  const stream = await createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

/**
 * Current file fingerprints for every usable pixel asset of an Avatar.
 * Assets whose files are missing are omitted (they are reported as missing
 * by the builder, not as "changed").
 *
 * @param {{ assets?: object[] }} avatar
 * @param {string} mediaDir
 * @returns {Promise<Map<string, string>>} assetId → sha256 hex
 */
export async function computeAssetFingerprints(avatar = {}, mediaDir) {
  const fingerprints = new Map();
  for (const asset of Array.isArray(avatar.assets) ? avatar.assets : []) {
    if (classifyAssetWeightClass(asset) === "unusable") continue;
    const filePath = mediaPathForAsset(asset, mediaDir);
    if (!filePath || !(await fileExists(filePath))) continue;
    const id = String(asset.id || "");
    if (!id) continue;
    fingerprints.set(id, await fingerprintFile(filePath));
  }
  return fingerprints;
}

/**
 * Sign one media file into a single media signature document shape
 * ({ palette, dHashes, tone }). Images come back as a single-frame
 * signature; videos as the merged First/Mid/Last signature.
 *
 * @param {string} filePath
 * @param {object} [options] forwarded to createMediaVisualSignature
 * @returns {Promise<{ signature: object, kind: "image"|"video", degraded: boolean }>}
 * @throws {MediaVisualSignatureError}
 */
export async function signMediaFile(filePath, options = {}) {
  const result = await createMediaVisualSignature({ ...options, path: filePath });
  const degraded = result.frames.some((frame) => frame.signature?.degraded);
  const merged = result.merged;
  return {
    kind: result.type,
    signature: { palette: merged.palette, dHashes: merged.dHashes, tone: merged.tone },
    degraded,
  };
}

/**
 * Build the likeness profile for one Avatar Card.
 *
 * Phase 1 classifies + resolves every attached asset (cheap: no decode);
 * only the assets inside the per-class sample cap (see
 * AVATAR_LIKENESS_SAMPLE_CAPS) are queued for ffmpeg signing. Phase 2 runs
 * the queued signs through a bounded concurrency pool — the merge math
 * saturates long before an Avatar's full clip count, so the sample keeps
 * full-store rebuilds in the minutes instead of the hour range.
 *
 * @param {{ id: string, primaryName?: string, assets?: object[] }} avatar
 * @param {{
 *   mediaDir: string, profiledAt?: string, registry?: object[],
 *   ffmpegPath?: string, ffprobePath?: string,
 *   caps?: object, concurrency?: number,
 * }} options
 * @returns {Promise<{ profile: object, assets: Array<object> }>} the profile
 *   plus the per-asset work report (signed / missing / failed / skipped /
 *   sampled-out).
 */
export async function buildAvatarLikenessProfileForAvatar(avatar, options = {}) {
  const { mediaDir } = options;
  if (!mediaDir) throw new Error("buildAvatarLikenessProfileForAvatar requires options.mediaDir");
  const assets = Array.isArray(avatar.assets) ? avatar.assets : [];
  const selection = selectLikenessAssets(assets, { caps: options.caps });
  const usable = selection.filter((entry) => entry.cls !== "unusable").length;
  // Freshness is keyed on the FULL usable-on-disk set (the sample cap only
  // bounds the sign work, never the invalidation contract): any added,
  // removed, or changed pixel file re-profiles the Avatar, so new media
  // competes for the sample and the profile tracks a growing store. When no
  // precomputed map is handed in, the builder hashes the full set itself.
  const fingerprints = options.precomputedFingerprints instanceof Map
    ? options.precomputedFingerprints
    : await computeAssetFingerprints(avatar, mediaDir);
  const missingEntries = [];
  const assetReport = [];
  const signTasks = [];
  const sampledOut = { identity: 0, default: 0, context: 0 };
  // Phase 1 — classify + resolve.
  for (const { asset, cls, selected } of selection) {
    const weight = assetLikenessWeight(asset);
    const base = {
      assetId: String(asset.id || ""),
      kind: asset.type === "video" ? "video" : "image",
      fileName: path.basename(String(asset.metadata?.storage?.fileName || asset.uri || asset.name || "")),
      weight,
      weightClass: cls,
    };
    if (cls === "unusable") {
      assetReport.push({ ...base, status: "skipped", note: "non-pixel asset" });
      continue;
    }
    if (!selected) {
      sampledOut[cls] += 1;
      assetReport.push({ ...base, status: "sampled-out", note: "outside the per-class sample cap" });
      continue;
    }
    const filePath = mediaPathForAsset(asset, mediaDir);
    if (!filePath || !(await fileExists(filePath))) {
      assetReport.push({ ...base, status: "missing", note: "referenced media file is not on disk" });
      missingEntries.push({ ...base, status: "missing", signature: null });
      continue;
    }
    signTasks.push({ base, filePath });
  }
  // Phase 2 — sign the selected sample through a bounded pool.
  const concurrency = Math.max(1, Math.trunc(Number(options.concurrency) || 8));
  const results = new Array(signTasks.length);
  if (signTasks.length) {
    let next = 0;
    const runners = Array.from({ length: Math.min(concurrency, signTasks.length) }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= signTasks.length) return;
        const { base, filePath } = signTasks[index];
        try {
          const signed = await signMediaFile(filePath, options);
          results[index] = { ...base, status: "signed", signature: signed.signature, ...(signed.degraded ? { note: "degraded frame seek" } : {}) };
          assetReport.push({ ...base, status: "signed", note: signed.degraded ? "degraded frame seek" : undefined });
        } catch (error) {
          const code = error instanceof MediaVisualSignatureError ? error.code : "decode_failed";
          results[index] = { ...base, status: "failed", note: `decode failed (${code})`, signature: null };
          assetReport.push({ ...base, status: "failed", note: `decode failed (${code})` });
        }
      }
    });
    await Promise.all(runners);
  }
  const signedCount = results.reduce((count, entry) => count + (entry?.status === "signed" ? 1 : 0), 0);
  const profile = buildAvatarLikenessProfile({
    avatarId: String(avatar.id || ""),
    name: avatar.primaryName || avatar.name,
    entries: [...missingEntries, ...results],
    text: textChannelFromAvatar(avatar, options),
    assetFingerprints: Object.fromEntries(fingerprints),
    sampling: {
      usable,
      attempted: signTasks.length,
      signed: signedCount,
      sampledOut: sampledOut.identity + sampledOut.default + sampledOut.context,
    },
    profiledAt: options.profiledAt || new Date().toISOString(),
  });
  return { profile, assets: assetReport };
}

/**
 * Whether an existing profile still matches the Avatar's current asset
 * fingerprints (i.e. it can be skipped on a re-run).
 *
 * @param {object} existingProfile
 * @param {{ id: string, assets?: object[] }} avatar
 * @param {Map<string, string>} fingerprints assetId → current file hash
 * @returns {boolean}
 */
export function existingProfileIsFresh(existingProfile, avatar, fingerprints) {
  if (!existingProfile) return false;
  const current = (Array.isArray(avatar.assets) ? avatar.assets : [])
    .map((asset) => {
      const classKind = classifyAssetWeightClass(asset);
      if (classKind === "unusable") return null;
      const id = String(asset.id || "");
      const fingerprint = fingerprints.get(id);
      return fingerprint ? { assetId: id, fingerprint } : null;
    })
    .filter(Boolean);
  return profileIsFresh(existingProfile, current);
}
