// Avatar Likeness Media Signature — Node-side construction (L3).
//
// Turns one Human Enricher dashboard video (durable accepted set) into a
// media likeness signature document: the L1 visual signature over the
// resolved source file plus the enrichment text channels and the
// deterministic palette color words. Documents are content-hash keyed
// (file sha256) and stamped with the signer version, so a re-run signs
// only what changed — same invalidation discipline as the layer-L2 Avatar
// profiles.
//
// This module never mutates the enricher ledger; it only reads dashboard
// videos and the Avatar-side documents are produced by the stores.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { tokenizeLikenessText, AVATAR_LIKENESS_SIGNER_VERSION } from "../src/domain/avatar-likeness-profile.js";
import { AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA, colorWordsFromPalette } from "../src/domain/avatar-likeness-match.js";
import { createMediaVisualSignature, MediaVisualSignatureError } from "./media-visual-signature-extract.mjs";

/**
 * Resolve a dashboard video to an on-disk file, following the
 * human-accepted-visuals convention: sourcePath, then /media/ uri under
 * the data root.
 *
 * @param {{ sourcePath?: string, uri?: string }} video
 * @param {{ dataRoot: string }} options
 * @returns {string|null}
 */
export function mediaFileForVideo(video = {}, { dataRoot }) {
  const sourcePath = String(video.sourcePath || "").replace(/^file:\/\//, "");
  if (sourcePath && path.isAbsolute(sourcePath)) return sourcePath;
  const uri = String(video.uri || "");
  if (uri.startsWith("/media/")) {
    const relative = uri.replace(/^\/media\//, "").split(/[?#]/)[0];
    try {
      return path.join(dataRoot, "media", decodeURIComponent(relative));
    } catch {
      return path.join(dataRoot, "media", relative);
    }
  }
  if (path.isAbsolute(uri)) return uri;
  return null;
}

async function readableFile(filePath) {
  try {
    const info = await stat(filePath);
    return info?.isFile() && info.size > 0 ? filePath : null;
  } catch {
    return null;
  }
}

/** sha256 of a file, streamed. */
export async function mediaFingerprint(filePath) {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  const stream = await createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

function listify(value) {
  if (Array.isArray(value)) return value.map((entry) => (typeof entry === "string" ? entry : entry?.text || entry?.label || entry?.term || "")).filter(Boolean);
  if (typeof value === "string") return [value];
  return [];
}

/**
 * Assemble the text channels from a dashboard video + its enrichment.
 * Most accepted media carry no description (the live ledger measured
 * 0/3,267); tags, the filename, and classification words are the usual
 * content. All terms go through the likeness tokenizer (pure-numeric
 * tokens excluded).
 *
 * @param {{ name?: string, tags?: string[], enrichmentSummary?: object, humanEnrichment?: object }} video
 * @returns {{ description: string, categories: string[], tags: string[], mentions: string[], terms: string[] }}
 */
export function mediaTextFromVideo(video = {}) {
  const enrichment = video.humanEnrichment || {};
  const classification = video.enrichmentSummary?.classifications || {};
  const description = String(enrichment.description || "").slice(0, 2000);
  const categories = listify(enrichment.categories).map((value) => String(value).slice(0, 120)).slice(0, 16);
  const tags = listify(video.tags).map((value) => String(value).slice(0, 120)).slice(0, 24);
  // avatarMentions entries are objects ({ avatarId, avatarName, mention })
  // or plain strings — listify would flatten the objects away, so handle
  // the raw list here.
  const mentionList = Array.isArray(enrichment.avatarMentions)
    ? enrichment.avatarMentions
    : [enrichment.avatarMentions].filter(Boolean);
  const mentions = mentionList.map((entry) =>
    String(typeof entry === "string" ? entry : entry?.avatarName || entry?.mention || entry?.text || "").slice(0, 120),
  ).filter(Boolean).slice(0, 8);
  const directorNotes = String(enrichment.directorNotes || "").slice(0, 1000);
  const classificationWords = [
    classification.documentKind,
    classification.medium,
    classification.characterRead?.gender,
    classification.characterRead?.framing,
    ...listify(classification.activity),
  ]
    .map((value) => String(value || "").slice(0, 60))
    .filter(Boolean)
    .slice(0, 12);
  const terms = new Set(
    [String(video.name || ""), description, directorNotes, ...categories, ...tags, ...mentions, ...classificationWords]
      .flatMap(tokenizeLikenessText),
  );
  return {
    description,
    categories,
    tags,
    mentions,
    ...(directorNotes ? { directorNotes } : {}),
    ...(classificationWords.length ? { classificationWords } : {}),
    terms: [...terms].sort().slice(0, 128),
  };
}

/**
 * Build one media likeness signature document.
 *
 * @param {{ humanVideoKey: string, humanVideoAliases: string[], id: string, name: string, mediaType: string }} video
 *   a human-video-enrichment dashboard video
 * @param {{
 *   dataRoot: string,
 *   filePath?: string,            pre-resolved file (skips resolution)
 *   precomputedFingerprint?: string,
 *   ffmpegPath?: string, ffprobePath?: string, concurrency?: number,
 *   colorWordMax?: number,
 * }} options
 * @returns {Promise<{ signature: object, file: string, source: "source-file"|"thumbnail" } | { error: string, file: string|null }>}
 *   the document plus provenance, or an honest error when nothing readable
 *   could be signed.
 */
export async function buildMediaLikenessSignature(video, options = {}) {
  const { dataRoot } = options;
  if (!dataRoot) throw new Error("buildMediaLikenessSignature requires options.dataRoot");
  const key = String(video.humanVideoKey || video.id || "");
  if (!key) throw new Error("a dashboard video needs a humanVideoKey (or id) to key the signature");

  let file = options.filePath || null;
  let source = "source-file";
  if (!file) {
    file = await readableFile(mediaFileForVideo(video, { dataRoot }) || "");
    if (!file && video.thumbnailUri) {
      // The source file is gone but the extracted first frame still is —
      // sign the thumbnail rather than dropping the media.
      const uri = String(video.thumbnailUri);
      const thumbnail = uri.startsWith("/media/")
        ? path.join(dataRoot, "media", uri.replace(/^\/media\//, "").split(/[?#]/)[0])
        : path.isAbsolute(uri) ? uri : null;
      if (thumbnail) {
        const found = await readableFile(thumbnail);
        if (found) {
          file = found;
          source = "thumbnail";
        }
      }
    }
  }
  if (!file) {
    return { error: "no_readable_file", file: null };
  }

  const fingerprint = options.precomputedFingerprint || (await mediaFingerprint(file));
  const result = await createMediaVisualSignature({ ...options, path: file });
  const degraded = result.frames.some((frame) => frame.signature?.degraded);
  const text = mediaTextFromVideo(video);
  const colorWords = colorWordsFromPalette(result.merged.palette, { maxWords: options.colorWordMax || 12 });
  const signature = {
    schemaVersion: AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA,
    key,
    aliases: (Array.isArray(video.humanVideoAliases) ? video.humanVideoAliases : [key]).slice(0, 8),
    videoId: String(video.id || key),
    videoName: String(video.name || "").slice(0, 240),
    mediaType: result.type,
    source,
    contentFingerprint: fingerprint,
    signerVersion: AVATAR_LIKENESS_SIGNER_VERSION,
    signature: {
      palette: result.merged.palette,
      dHashes: result.merged.dHashes,
      tone: result.merged.tone,
      ...(degraded ? { degraded: true } : {}),
    },
    text: { ...text, colorWords },
    signedAt: new Date().toISOString(),
  };
  return { signature, file, source };
}

/**
 * Whether a stored signature still matches the video's current file.
 * Content-hash keyed + signer-versioned, exactly like the L2 profiles.
 *
 * @param {object|null} existing a stored signature document
 * @param {object} video a dashboard video
 * @param {string|null} fingerprint current file sha256 (or null when unreadable)
 * @returns {boolean}
 */
export function mediaSignatureIsFresh(existing, video = {}, fingerprint) {
  if (!existing || existing.schemaVersion !== AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA) return false;
  if (existing.signerVersion !== AVATAR_LIKENESS_SIGNER_VERSION) return false;
  const key = String(video.humanVideoKey || video.id || "");
  if (!key || existing.key !== key) return false;
  if (!fingerprint) return false;
  return existing.contentFingerprint === fingerprint;
}

export { MediaVisualSignatureError };
