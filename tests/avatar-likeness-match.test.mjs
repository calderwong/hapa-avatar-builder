import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  AVATAR_LIKENESS_MATCH_SCHEMA,
  AVATAR_LIKENESS_MATCH_GATE,
  AVATAR_LIKENESS_MATCH_WEIGHTS,
  AVATAR_LIKENESS_COLOR_WORDS,
  AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA,
  paletteBinCenterRgb,
  colorWordsFromPalette,
  colorWordVector,
  colorWordOverlap,
  textOverlap,
  bestDHashSimilarity,
  prepareLikenessState,
  scoreMediaAgainstAvatar,
  matchMediaToAvatars,
} from "../src/domain/avatar-likeness-match.js";
import {
  mediaFileForVideo,
  mediaTextFromVideo,
  mediaSignatureIsFresh,
  buildMediaLikenessSignature,
} from "../server/avatar-likeness-media-signature.mjs";
import {
  createMediaLikenessSignatureStore,
  createAvatarLikenessVerdictStore,
  AvatarLikenessMediaStoreError,
} from "../src/../server/avatar-likeness-media-stores.mjs";
import { buildAvatarLikenessProfile, AVATAR_LIKENESS_PROFILE_SCHEMA } from "../src/domain/avatar-likeness-profile.js";

// ---------------------------------------------------------------------------
// Deterministic color words
// ---------------------------------------------------------------------------

test("colorWordsFromPalette maps bin mass to a normalized weighted vocabulary", () => {
  const red = colorWordsFromPalette({ bins: [{ bin: 0, weight: 0 }, { bin: 41, weight: 1 }] });
  // bin 41 = (r=1, g=0, b=5) in the 6×6×6 cube → one derived word.
  assert.ok(red.length > 0);
  const total = red.reduce((sum, entry) => sum + entry.weight, 0);
  assert.ok(Math.abs(total - 1) < 0.01, "weights renormalize to 1");
  // Pure black / pure white resolve to their obvious words.
  assert.equal(colorWordsFromPalette({ bins: [{ bin: 0, weight: 1 }] })[0].word, "black");
  assert.equal(colorWordsFromPalette({ bins: [{ bin: 215, weight: 1 }] })[0].word, "white");
  // An empty palette has no words.
  assert.deepEqual(colorWordsFromPalette({ bins: [] }), []);
  assert.deepEqual(colorWordsFromPalette(null), []);
  // maxWords bounds the result.
  const many = colorWordsFromPalette({ bins: [{ bin: 1, weight: 1 }, { bin: 10, weight: 1 }, { bin: 20, weight: 1 }, { bin: 41, weight: 1 }] }, { maxWords: 2 });
  assert.ok(many.length <= 2);
});

test("paletteBinCenterRgb decodes the 6×6×6 cube", () => {
  assert.deepEqual(paletteBinCenterRgb(0), { r: 21, g: 21, b: 21 });
  assert.deepEqual(paletteBinCenterRgb(215), { r: 234, g: 234, b: 234 });
});

test("colorWordOverlap is weighted Jaccard: 1 identical, 0 disjoint or empty", () => {
  const a = [{ word: "red", weight: 0.7 }, { word: "blue", weight: 0.3 }];
  assert.equal(colorWordOverlap(a, a.map((entry) => ({ ...entry }))), 1);
  assert.equal(colorWordOverlap(a, [{ word: "green", weight: 1 }]), 0);
  assert.equal(colorWordOverlap(a, []), 0);
  assert.equal(colorWordOverlap([], a), 0);
  // Half-overlap: intersection 0.3 (blue), union 0.7 + 1.0 → 0.3/1.7.
  const value = colorWordOverlap(a, [{ word: "blue", weight: 1 }]);
  assert.ok(Math.abs(value - 0.3 / 1.7) < 1e-9);
  // String arrays are accepted.
  assert.equal(colorWordOverlap(["red"], ["red"]), 1);
  // The vocabulary is bounded and non-empty.
  assert.ok(AVATAR_LIKENESS_COLOR_WORDS.length >= 20);
});

// ---------------------------------------------------------------------------
// Channel math
// ---------------------------------------------------------------------------

test("textOverlap is cosine over binary term sets", () => {
  assert.equal(textOverlap(["red", "blade"], ["red", "blade"]), 1);
  assert.equal(textOverlap(["red"], ["blade"]), 0);
  assert.equal(textOverlap([], ["red"]), 0);
  assert.equal(textOverlap(["red"], []), 0);
  // 1 shared of (2 × 4) → 1/√8.
  assert.ok(Math.abs(textOverlap(["red", "blade"], ["red", "ocean", "city", "oath"]) - 1 / Math.sqrt(8)) < 1e-12);
});

test("bestDHashSimilarity takes the best pair over bounded hash sets", () => {
  const allDark = "0".repeat(16);
  const allLight = "f".repeat(16);
  const half = "f".repeat(8) + "0".repeat(8);
  assert.equal(bestDHashSimilarity([allDark], [allDark]), 1);
  assert.equal(bestDHashSimilarity([allDark], [allLight]), 0);
  // The shared hash wins: best pair is identical → 1, even though the
  // other pair is only 0.5 and one side is fully disjoint.
  assert.equal(bestDHashSimilarity([allDark, half], [half, allLight]), 1);
  assert.equal(bestDHashSimilarity([allDark], [half, allLight]), 0.5);
  assert.equal(bestDHashSimilarity([], [allDark]), 0);
  assert.equal(bestDHashSimilarity(allDark, allLight), 0, "single hashes work too");
});

// ---------------------------------------------------------------------------
// Scoring + verdict gate
// ---------------------------------------------------------------------------

function redMedia(text = {}) {
  return {
    schemaVersion: AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA,
    key: "media-red",
    signature: {
      palette: { bins: [{ bin: 41, weight: 1 }] },
      dHashes: ["f".repeat(16)],
      tone: { r: 220, g: 45, b: 45, saturation: 0.8 },
    },
    text,
  };
}

function redAvatar() {
  return buildAvatarLikenessProfile({
    avatarId: "avatar-red",
    name: "Red",
    entries: [
      {
        assetId: "a1",
        kind: "image",
        weight: 1,
        status: "signed",
        signature: {
          palette: { bins: [{ bin: 41, weight: 1 }] },
          dHashes: ["f".repeat(16)],
          tone: { r: 220, g: 45, b: 45, saturation: 0.8 },
        },
      },
    ],
    text: { terms: ["red", "blade"] },
  });
}

function blueAvatar() {
  return buildAvatarLikenessProfile({
    avatarId: "avatar-blue",
    name: "Blue",
    entries: [
      {
        assetId: "b1",
        kind: "image",
        weight: 1,
        status: "signed",
        signature: {
          palette: { bins: [{ bin: 36, weight: 1 }] },
          dHashes: ["0".repeat(16)],
          tone: { r: 55, g: 95, b: 200, saturation: 0.7 },
        },
      },
    ],
    text: { terms: ["blue", "ocean"] },
  });
}

test("scoreMediaAgainstAvatar is 1 for identical sides and renormalizes missing text", () => {
  // No explicit color words: both sides derive them from the (identical)
  // palettes, so the fourth channel is live and the score is exactly 1.
  const media = redMedia({ terms: ["red", "blade"] });
  const score = scoreMediaAgainstAvatar(media, redAvatar());
  assert.equal(score.score, 1);
  assert.equal(score.avatarId, "avatar-red");
  assert.deepEqual(score.active, ["palette", "dHash", "text", "colorWords"]);

  // Same pixels, but the media carries no text or color words: the text
  // channel drops out and its weight redistributes — identical pixels must
  // still score 1, not a compressed 0.8.
  const textless = scoreMediaAgainstAvatar(redMedia(), redAvatar());
  assert.deepEqual(textless.active, ["palette", "dHash", "colorWords"]);
  assert.equal(textless.score, 1);
  assert.equal(textless.channels.text, null);

  // Disjoint pixels: score drops but stays bounded 0..1.
  const disjoint = scoreMediaAgainstAvatar(redMedia({ terms: ["red", "blade"] }), blueAvatar());
  assert.ok(disjoint.score >= 0 && disjoint.score <= 1);
  assert.ok(disjoint.score < 1);
});

test("prepareLikenessState pre-parses both sides for fast repeated scoring", () => {
  const media = redMedia({ terms: ["red"] });
  const avatar = redAvatar();
  const withState = { ...media, __state: prepareLikenessState(media) };
  avatar.__state = prepareLikenessState({ signature: avatar.media, text: avatar.text });
  const a = scoreMediaAgainstAvatar(media, avatar);
  const b = scoreMediaAgainstAvatar(withState, avatar);
  assert.deepEqual(a, b);
});

test("matchMediaToAvatars assigns only above the calibrated score+margin gate", () => {
  const media = redMedia({ terms: ["red", "blade"] });
  const profiles = [redAvatar(), blueAvatar()];

  const result = matchMediaToAvatars(media, profiles, { gate: AVATAR_LIKENESS_MATCH_GATE });
  assert.equal(result.verdict, "assigned");
  assert.equal(result.primary.avatarId, "avatar-red");
  assert.equal(result.primary.score, 1);
  assert.equal(result.candidates[0].avatarId, "avatar-red");
  assert.equal(result.candidates[1].avatarId, "avatar-blue");
  // The runner-up scores on its own channels, not the floor — a clearly
  // different Avatar stays below the secondary threshold.
  assert.ok(result.secondary === null || result.secondary.avatarId !== "avatar-red");

  // No candidates at all → honest unresolved with a reason.
  const profileless = buildAvatarLikenessProfile({ avatarId: "avatar-empty", entries: [] });
  const none = matchMediaToAvatars(media, [profileless]);
  assert.equal(none.verdict, "unresolved");
  assert.deepEqual(none.reasons, ["no_profiled_avatars"]);
  assert.equal(none.excludedProfileless, 1);
  assert.deepEqual(none.candidates, []);
});

test("matchMediaToAvatars reports too_close and below_floor distinctly", () => {
  // Two near-identical Avatars (same palette + text, dHash 1 bit off →
  // ~0.996 vs 1.0): the margin gate keeps the verdict unresolved.
  const near = redAvatar();
  near.media = { ...near.media, dHashes: ["f".repeat(15) + "e"] };
  const media = redMedia({ terms: ["red", "blade"] });
  const result = matchMediaToAvatars(media, [redAvatar(), near], { gate: { assignedScore: 0.55, assignedMargin: 0.5, secondaryScore: 0.55 } });
  assert.equal(result.verdict, "unresolved");
  assert.deepEqual(result.reasons, ["too_close"]);
  assert.ok(result.primary, "the best candidate is still surfaced as evidence");

  // Everything below the floor.
  const far = matchMediaToAvatars(redMedia({ terms: [] }), [blueAvatar()], { gate: { assignedScore: 0.9, assignedMargin: 0.1, secondaryScore: 0.9 } });
  assert.equal(far.verdict, "unresolved");
  assert.deepEqual(far.reasons, ["below_floor"]);
  assert.equal(far.primary.avatarId, "avatar-blue");
});

// ---------------------------------------------------------------------------
// Media signature (server side)
// ---------------------------------------------------------------------------

test("mediaFileForVideo resolves sourcePath, /media/ uris, and returns null when neither exists", () => {
  const { dataRoot } = { dataRoot: "/data" };
  assert.equal(mediaFileForVideo({ sourcePath: "/opt/a.mp4" }, { dataRoot }), "/opt/a.mp4");
  assert.equal(mediaFileForVideo({ sourcePath: "file:///opt/a.mp4" }, { dataRoot }), "/opt/a.mp4");
  assert.equal(mediaFileForVideo({ uri: "/media/a%20b/c.mp4" }, { dataRoot }), path.join("/data", "media", "a b/c.mp4"));
  assert.equal(mediaFileForVideo({ uri: "/media/c.mp4" }, { dataRoot }), "/data/media/c.mp4");
  assert.equal(mediaFileForVideo({}, { dataRoot }), null);
});

test("mediaTextFromVideo assembles bounded text channels with numeric tokens dropped", () => {
  const text = mediaTextFromVideo({
    name: "20251105_video_139217__39307884.mp4",
    tags: ["comic", "video-loop"],
    enrichmentSummary: { classifications: { documentKind: "comic", medium: "video-loop", activity: ["movement"] } },
    humanEnrichment: {
      description: "A samurai in red armor wields a blade",
      categories: ["fantasy"],
      avatarMentions: [{ avatarName: "Thor" }],
      directorNotes: "strong opening beat",
    },
  });
  assert.equal(text.description, "A samurai in red armor wields a blade");
  assert.deepEqual(text.categories, ["fantasy"]);
  assert.deepEqual(text.mentions, ["Thor"]);
  assert.ok(text.terms.includes("samurai"));
  assert.ok(text.terms.includes("red"));
  assert.ok(!text.terms.includes("20251105"), "all-digit filename tokens are noise");
  assert.ok(text.terms.every((term) => !/^[0-9]+$/.test(term)));
});

test("mediaSignatureIsFresh compares key, content hash, and signer version", () => {
  const video = { humanVideoKey: "fingerprint:abc", id: "v1" };
  const signature = { schemaVersion: AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA, key: "fingerprint:abc", contentFingerprint: "h1", signerVersion: "hapa.media-visual-signature.v1" };
  assert.equal(mediaSignatureIsFresh(signature, video, "h1"), true);
  assert.equal(mediaSignatureIsFresh(signature, video, "h2"), false, "changed bytes are stale");
  assert.equal(mediaSignatureIsFresh(signature, video, null), false, "unreadable files cannot be fresh");
  assert.equal(mediaSignatureIsFresh({ ...signature, signerVersion: "old" }, video, "h1"), false, "old signer is stale");
  assert.equal(mediaSignatureIsFresh({ ...signature, key: "fingerprint:other" }, video, "h1"), false, "wrong key is stale");
  assert.equal(mediaSignatureIsFresh(null, video, "h1"), false);
});

test("buildMediaLikenessSignature reports no_readable_file honestly when nothing is on disk", async () => {
  const result = await buildMediaLikenessSignature(
    { humanVideoKey: "fingerprint:xyz", id: "v", uri: "/media/does-not-exist.mp4" },
    { dataRoot: os.tmpdir() },
  );
  assert.equal(result.error, "no_readable_file");
});

// ---------------------------------------------------------------------------
// Stores (real tmp dirs)
// ---------------------------------------------------------------------------

test("media-side stores round-trip, reject invalid entries, and own their directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-likeness-l3-"));
  try {
    const nested = path.join(root, "does", "not", "exist");
    const signatures = createMediaLikenessSignatureStore({ dir: nested });
    const verdicts = createAvatarLikenessVerdictStore({ dir: nested });
    assert.equal(await signatures.size(), 0);
    const mediaDoc = {
      schemaVersion: AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA,
      key: "fingerprint:a",
      contentFingerprint: "h",
      signerVersion: "v1",
      signature: { palette: { bins: [{ bin: 1, weight: 1 }] } },
      text: { terms: ["red"] },
    };
    await signatures.upsert("fingerprint:a", mediaDoc);
    assert.equal((await signatures.get("fingerprint:a")).contentFingerprint, "h");
    await assert.rejects(
      signatures.upsert("fingerprint:b", { schemaVersion: "wrong", key: "fingerprint:b" }),
      (error) => error instanceof AvatarLikenessMediaStoreError,
    );
    await verdicts.upsert("fingerprint:a", { schemaVersion: AVATAR_LIKENESS_MATCH_SCHEMA, key: "fingerprint:a", verdict: "unresolved", reasons: ["below_floor"] });
    assert.equal((await verdicts.get("fingerprint:a")).verdict, "unresolved");
    await assert.rejects(
      verdicts.upsert("fingerprint:b", { schemaVersion: AVATAR_LIKENESS_MATCH_SCHEMA, key: "fingerprint:b", verdict: "maybe" }),
      (error) => error instanceof AvatarLikenessMediaStoreError && error.code === "invalid_entry",
    );
    // Concurrent upserts must not lose writes.
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        signatures.upsert(`fingerprint:c${index}`, { ...mediaDoc, key: `fingerprint:c${index}`, contentFingerprint: String(index) }),
      ),
    );
    assert.equal(await signatures.size(), 9);
    const raw = await fs.readFile(path.join(nested, "verdicts.json"), "utf8");
    assert.ok(raw.includes('"unresolved"'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Source contracts
// ---------------------------------------------------------------------------

const repoRoot = new URL("..", import.meta.url);
const scriptSource = readFileSync(new URL("scripts/avatar-likeness-match.mjs", repoRoot), "utf8");
const dataReadme = readFileSync(new URL("data/README.md", repoRoot), "utf8");

test("the batch script exposes match + calibrate with apply/limit/backup semantics", () => {
  assert.match(scriptSource, /calibrate/);
  assert.match(scriptSource, /--apply/);
  assert.match(scriptSource, /--limit/);
  assert.match(scriptSource, /backupStoreFiles/);
  assert.match(scriptSource, /quickSortDecision\?\.state === "accepted"/, "the candidate pool is exactly the durable accepted set");
  assert.doesNotMatch(scriptSource, /human-video-quick-sort-decisions\.json", "w"/, "the batch never writes the enricher ledger");
});

test("runtime data docs cover the media-side stores", () => {
  assert.match(dataReadme, /avatar-likeness\/media-signatures\.json/);
  assert.match(dataReadme, /avatar-likeness\/verdicts\.json/);
});
