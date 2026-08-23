import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  AVATAR_LIKENESS_PROFILE_SCHEMA,
  AVATAR_LIKENESS_PROFILE_STORE_SCHEMA,
  AVATAR_LIKENESS_SAMPLE_CAPS,
  AVATAR_LIKENESS_SIGNER_VERSION,
  AVATAR_LIKENESS_WEIGHTS,
  classifyAssetWeightClass,
  assetLikenessWeight,
  selectLikenessAssets,
  tokenizeLikenessText,
  textChannelFromAvatar,
  buildAvatarLikenessProfile,
  profileIsFresh,
  profileSummary,
} from "../src/domain/avatar-likeness-profile.js";
import { paletteBinIndex } from "../src/domain/media-visual-signature.js";
import {
  createAvatarLikenessStore,
  AvatarLikenessStoreError,
} from "../server/avatar-likeness-store.mjs";
import {
  mediaPathForAsset,
  computeAssetFingerprints,
  buildAvatarLikenessProfileForAvatar,
  existingProfileIsFresh,
} from "../server/avatar-likeness-build.mjs";

// ---------------------------------------------------------------------------
// Domain: weight classes + text channel
// ---------------------------------------------------------------------------

test("asset weight classes rank identity media above context media", () => {
  assert.equal(classifyAssetWeightClass({ type: "image", requirementId: "backgroundless_two_thirds" }), "identity");
  assert.equal(classifyAssetWeightClass({ type: "image", requirementId: "closeup_emotions" }), "identity");
  assert.equal(classifyAssetWeightClass({ type: "image", requirementId: "fullbody_concept_art" }), "identity");
  assert.equal(classifyAssetWeightClass({ type: "image", requirementId: "kit_sheet", name: "kit-poses-image-2" }), "context");
  assert.equal(classifyAssetWeightClass({ type: "image", requirementId: "character_dossier" }), "context");
  assert.equal(classifyAssetWeightClass({ type: "video", requirementId: "folder_video" }), "default");
  assert.equal(classifyAssetWeightClass({ type: "model", requirementId: "avatar_3d_model" }), "unusable");
  // The classifier also honors the intelligence document kind.
  assert.equal(
    classifyAssetWeightClass({ type: "image", requirementId: "media_asset", metadata: { intelligence: { classifications: { documentKind: "avatar_reference" } } } }),
    "identity",
  );
  assert.equal(assetLikenessWeight({ type: "image", requirementId: "fullbody_backgroundless" }), AVATAR_LIKENESS_WEIGHTS.identity);
  assert.equal(assetLikenessWeight({ type: "model" }), 0);
});

test("tokenizeLikenessText lowercases, splits, and drops short tokens", () => {
  assert.deepEqual(tokenizeLikenessText("Neon Blade, SWORD-7!!"), ["neon", "blade", "sword"]);
  assert.deepEqual(tokenizeLikenessText("a b ci sword"), ["sword"]);
  assert.deepEqual(tokenizeLikenessText(""), []);
});

test("selectLikenessAssets caps per class, identity-first, and is input-order stable", () => {
  const caps = { identity: 2, default: 1, context: 1, unusable: 0 };
  const assets = [
    { id: "c2", type: "image", name: "kit_sheet", requirementId: "media_asset" },
    { id: "m1", type: "model", requirementId: "avatar_3d_model" },
    { id: "e3", type: "image", requirementId: "backgroundless_two_thirds" },
    { id: "d1", type: "video", requirementId: "folder_video" },
    { id: "e1", type: "image", requirementId: "fullbody_concept_art" },
    { id: "c1", type: "image", requirementId: "character_dossier" },
    { id: "d2", type: "video", requirementId: "folder_video" },
    { id: "e2", type: "image", requirementId: "closeup_emotions" },
  ];
  const forward = selectLikenessAssets(assets, { caps });
  const reversed = selectLikenessAssets([...assets].reverse(), { caps });
  assert.deepEqual(
    forward.map((entry) => [entry.asset.id, entry.cls, entry.selected]),
    reversed.map((entry) => [entry.asset.id, entry.cls, entry.selected]),
    "selection must not depend on input order",
  );
  assert.deepEqual(forward.map((entry) => entry.asset.id), ["e1", "e2", "e3", "d1", "d2", "c1", "c2", "m1"]);
  assert.deepEqual(forward.filter((entry) => entry.selected).map((entry) => entry.asset.id), ["e1", "e2", "d1", "c1"]);
  const model = forward.find((entry) => entry.asset.id === "m1");
  assert.equal(model.cls, "unusable");
  assert.equal(model.selected, false);
  assert.deepEqual(AVATAR_LIKENESS_SAMPLE_CAPS, { identity: 40, default: 40, context: 12, unusable: 0 });
});

test("textChannelFromAvatar assembles bounded channels and registry invariants", () => {
  const avatar = {
    id: "avatar-5",
    primaryName: "Thorsun",
    assets: [
      {
        id: "a1",
        type: "image",
        tags: ["pink", "tactical"],
        metadata: {
          intelligence: {
            ocr: { lines: ["pink cat-ear comms", "HUD readout"] },
            vision: { labels: [{ identifier: "person" }, "headset"] },
          },
        },
      },
    ],
  };
  const channel = textChannelFromAvatar(avatar, {
    registry: [{ avatarId: "avatar-5", identityInvariants: ["Thorsun outfit and styling", "recognizable face and silhouette"] }],
  });
  assert.deepEqual(channel.ocrLines, ["pink cat-ear comms", "HUD readout"]);
  assert.ok(channel.labels.includes("person"));
  assert.ok(channel.tags.includes("pink"));
  assert.deepEqual(channel.invariants, ["Thorsun outfit and styling", "recognizable face and silhouette"]);
  assert.ok(channel.terms.includes("thorsun"), "primary name feeds the term set");
  assert.ok(channel.terms.includes("pink"));
});

// ---------------------------------------------------------------------------
// Domain: profile assembly
// ---------------------------------------------------------------------------

function solidSignature(rgb) {
  return {
    palette: { bins: [{ bin: paletteBinIndex(rgb[0], rgb[1], rgb[2]), weight: 1 }], totalWeight: 1 },
    dHashes: [rgb[0] > 128 ? "f".repeat(16) : "0".repeat(16)],
    tone: { r: rgb[0], g: rgb[1], b: rgb[2], saturation: rgb[0] > 128 ? 1 : 0 },
  };
}

test("buildAvatarLikenessProfile merges weighted media and bounds the text channel", () => {
  const profile = buildAvatarLikenessProfile({
    avatarId: "red-reaper",
    name: "Red Reaper",
    entries: [
      { assetId: "a1", kind: "image", weight: 1.0, status: "signed", signature: solidSignature([255, 0, 0]) },
      { assetId: "a2", kind: "video", weight: 0.5, status: "signed", signature: solidSignature([0, 0, 255]) },
    ],
    text: { ocrLines: ["x".repeat(500)], terms: ["alpha", "beta"] },
    assetFingerprints: { a1: "1111", a2: "2222" },
    profiledAt: "2026-08-23T00:00:00.000Z",
  });
  assert.equal(profile.schemaVersion, AVATAR_LIKENESS_PROFILE_SCHEMA);
  assert.equal(profile.status, "profiled");
  // Weighted tone: (255*1 + 0*0.5) / 1.5 = 170 red.
  assert.equal(profile.media.tone.r, 170);
  assert.equal(profile.media.tone.b, 85);
  const redBin = paletteBinIndex(255, 0, 0);
  const blueBin = paletteBinIndex(0, 0, 255);
  const weights = new Map(profile.media.palette.bins.map((entry) => [entry.bin, entry.weight]));
  assert.ok(Math.abs(weights.get(redBin) - 2 / 3) < 0.01);
  assert.ok(Math.abs(weights.get(blueBin) - 1 / 3) < 0.01);
  assert.equal(profile.media.dHashes.length, 2);
  assert.equal(profile.text.ocrLines[0].length, 240, "long OCR lines are truncated");
  assert.deepEqual(profile.assetFingerprints, { a1: "1111", a2: "2222" });
  assert.equal(profile.sourceAssets.length, 2);
  assert.throws(() => buildAvatarLikenessProfile({ avatarId: " " }), /requires an avatarId/);
});

test("profiles record sampling metadata and summaries expose signed/usable counts", () => {
  const profile = buildAvatarLikenessProfile({
    avatarId: "big-avatar",
    entries: [
      { assetId: "a1", kind: "image", weight: 1, status: "signed", signature: solidSignature([255, 0, 0]) },
      { assetId: "a2", kind: "image", weight: 1, status: "failed", note: "decode failed (spawn_failed)", signature: null },
    ],
    sampling: { usable: 120, attempted: 2, signed: 1, sampledOut: 118 },
  });
  assert.deepEqual(profile.sampling, { usable: 120, attempted: 2, signed: 1, sampledOut: 118 });
  const summary = profileSummary(profile);
  assert.equal(summary.signedCount, 1);
  assert.equal(summary.usableCount, 120);
  // Without sampling metadata the summary falls back to the recorded entries.
  const legacy = buildAvatarLikenessProfile({
    avatarId: "legacy-avatar",
    entries: [{ assetId: "a1", kind: "image", weight: 1, status: "signed", signature: solidSignature([255, 0, 0]) }],
  });
  assert.equal(legacy.sampling, undefined);
  const legacySummary = profileSummary(legacy);
  assert.equal(legacySummary.signedCount, 1);
  assert.equal(legacySummary.usableCount, 1);
});

test("profiles with no signed media are honestly profileless", () => {
  const none = buildAvatarLikenessProfile({ avatarId: "empty-avatar", entries: [] });
  assert.equal(none.status, "profileless");
  assert.equal(none.reason, "no usable visual assets attached");
  assert.equal(none.media, undefined);
  const missing = buildAvatarLikenessProfile({
    avatarId: "ghost-avatar",
    entries: [{ assetId: "a1", kind: "image", weight: 1, status: "missing", signature: null, note: "referenced media file is not on disk" }],
  });
  assert.equal(missing.status, "profileless");
  assert.match(missing.reason, /missing or failed/);
  // Text still ships: it is independent of the pixel channel.
  assert.ok(Array.isArray(missing.text.terms));
});

test("profileIsFresh demands the exact asset/fingerprint set", () => {
  const profile = buildAvatarLikenessProfile({
    avatarId: "red-reaper",
    entries: [
      { assetId: "a1", kind: "image", weight: 1, status: "signed", signature: solidSignature([255, 0, 0]) },
      { assetId: "a2", kind: "image", weight: 0.5, status: "missing", signature: null },
    ],
    assetFingerprints: { a1: "hash-1", a2: "hash-2" },
  });
  assert.equal(profileIsFresh(profile, [{ assetId: "a1", fingerprint: "hash-1" }, { assetId: "a2", fingerprint: "hash-2" }]), true);
  assert.equal(profileIsFresh(profile, [{ assetId: "a1", fingerprint: "changed" }, { assetId: "a2", fingerprint: "hash-2" }]), false);
  assert.equal(profileIsFresh(profile, [{ assetId: "a1", fingerprint: "hash-1" }]), false, "adding an asset is not fresh");
  assert.equal(profileIsFresh(null, []), false);
  // A profile signed by an older signer is stale even when every file
  // is byte-identical: signer fixes must force a re-sign.
  const oldSigner = { ...profile, signerVersion: "hapa.media-visual-signature.v0" };
  assert.equal(profileIsFresh(oldSigner, [{ assetId: "a1", fingerprint: "hash-1" }, { assetId: "a2", fingerprint: "hash-2" }]), false);
  assert.equal(profileIsFresh({ ...profile, signerVersion: undefined }, [{ assetId: "a1", fingerprint: "hash-1" }, { assetId: "a2", fingerprint: "hash-2" }]), false, "pre-versioning profiles are stale");
});

test("buildAvatarLikenessProfile stamps the current signer version", () => {
  const profile = buildAvatarLikenessProfile({ avatarId: "x", entries: [] });
  assert.equal(profile.signerVersion, AVATAR_LIKENESS_SIGNER_VERSION);
  const custom = buildAvatarLikenessProfile({ avatarId: "x", entries: [], signerVersion: "custom.v9" });
  assert.equal(custom.signerVersion, "custom.v9");
});

test("profileSummary projects a compact read-only shape", () => {
  const profile = buildAvatarLikenessProfile({
    avatarId: "red-reaper",
    name: "Red Reaper",
    entries: [{ assetId: "a1", kind: "image", weight: 1, status: "signed", signature: solidSignature([255, 0, 0]) }],
    text: { terms: ["alpha"] },
    assetFingerprints: { a1: "h" },
  });
  const summary = profileSummary(profile);
  assert.equal(summary.avatarId, "red-reaper");
  assert.equal(summary.status, "profiled");
  assert.equal(summary.tone.r, 255);
  assert.equal(summary.sourceAssetCount, 1);
  assert.equal(summary.dHashCount, 1);
  assert.equal(summary.termCount, 1);
  assert.equal(summary.assetFingerprints, undefined, "fingerprints never leak into summaries");
});

// ---------------------------------------------------------------------------
// Store: real filesystem in a tmpdir
// ---------------------------------------------------------------------------

test("avatar likeness store round-trips profiles through an atomic JSON file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-likeness-"));
  try {
    const store = createAvatarLikenessStore({ dir });
    assert.equal(await store.size(), 0);
    const profile = buildAvatarLikenessProfile({
      avatarId: "red-reaper",
      entries: [{ assetId: "a1", kind: "image", weight: 1, status: "signed", signature: solidSignature([255, 0, 0]) }],
      assetFingerprints: { a1: "h1" },
    });
    await store.upsert(profile);
    assert.equal(await store.size(), 1);
    const read = await store.get("red-reaper");
    assert.equal(read.schemaVersion, AVATAR_LIKENESS_PROFILE_SCHEMA);
    assert.equal(read.media.tone.r, 255);
    const listed = await store.list();
    assert.equal(listed.length, 1);
    // The file on disk is valid JSON with the store schema.
    const raw = JSON.parse(await fs.readFile(store.filePath, "utf8"));
    assert.equal(raw.schemaVersion, AVATAR_LIKENESS_PROFILE_STORE_SCHEMA);
    assert.ok(raw.profiles["red-reaper"]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("avatar likeness store creates its own directory on first write", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-likeness-dir-"));
  try {
    const nested = path.join(root, "does", "not", "exist", "yet");
    const store = createAvatarLikenessStore({ dir: nested });
    const profile = buildAvatarLikenessProfile({ avatarId: "x", entries: [] });
    await store.upsert(profile);
    assert.equal(await store.size(), 1);
    const raw = await fs.readFile(path.join(nested, "profiles.json"), "utf8");
    assert.ok(raw.includes('"x"'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("avatar likeness store rejects invalid profiles and serializes concurrent upserts", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-likeness-"));
  try {
    const store = createAvatarLikenessStore({ dir });
    await assert.rejects(
      store.upsert({ schemaVersion: "wrong" }),
      (error) => error instanceof AvatarLikenessStoreError && error.code === "invalid_profile",
    );
    await assert.rejects(
      store.upsert({ schemaVersion: AVATAR_LIKENESS_PROFILE_SCHEMA }),
      (error) => error instanceof AvatarLikenessStoreError && error.code === "invalid_profile",
    );
    const mk = (id, hash) => buildAvatarLikenessProfile({ avatarId: id, entries: [], assetFingerprints: { a: hash } });
    await Promise.all([store.upsert(mk("a1", "1")), store.upsert(mk("a2", "2")), store.upsert(mk("a3", "3"))]);
    assert.equal(await store.size(), 3, "concurrent upserts must not lose writes");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Builder: resolution + freshness (no ffmpeg needed for these paths)
// ---------------------------------------------------------------------------

test("mediaPathForAsset resolves /media/ uris, file:// uris, and storage paths", () => {
  assert.equal(mediaPathForAsset({ uri: "/media/a/b.png" }, "/data/media"), path.join("/data/media", "a/b.png"));
  assert.equal(mediaPathForAsset({ uri: "file:///opt/x.png" }, "/data/media"), "/opt/x.png");
  assert.equal(mediaPathForAsset({ uri: "/opt/abs.png" }, "/data/media"), "/opt/abs.png");
  assert.equal(mediaPathForAsset({ uri: "", metadata: { storage: { kind: "local-file", path: "/opt/y.png" } } }, "/data/media"), "/opt/y.png");
  assert.equal(mediaPathForAsset({ uri: "", metadata: { storage: { kind: "local-file", fileName: "z.png" } } }, "/data/media"), path.join("/data/media", "z.png"));
  assert.equal(mediaPathForAsset({}, "/data/media"), null);
});

test("builder caps the sign sample, pools signs, and keeps entry order intact", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-likeness-pool-"));
  try {
    for (let i = 0; i < 5; i += 1) {
      await fs.writeFile(path.join(dir, `asset-${i}.png`), "not-really-a-png");
    }
    const avatar = {
      id: "pool-avatar",
      primaryName: "Pool Test",
      assets: Array.from({ length: 5 }, (_, index) => ({
        id: `asset-${index}`,
        type: "image",
        name: `concept-${index}`,
        uri: `file://${path.join(dir, `asset-${index}.png`)}`,
      })),
    };
    const { profile, assets: report } = await buildAvatarLikenessProfileForAvatar(avatar, {
      mediaDir: dir,
      caps: { identity: 4, default: 4, context: 4, unusable: 0 },
      concurrency: 2,
      ffmpegPath: "definitely-not-a-real-ffmpeg",
    });
    // Five identity assets against a cap of four: one is sampled out.
    assert.deepEqual(profile.sampling, { usable: 5, attempted: 4, signed: 0, sampledOut: 1 });
    // The unsampled asset is still fingerprinted: freshness keys on the FULL
    // usable set, so a changed/added file anywhere re-profiles the Avatar.
    assert.equal(Object.keys(profile.assetFingerprints).length, 5);
    assert.equal(existingProfileIsFresh(profile, avatar, await computeAssetFingerprints(avatar, dir)), true);
    // Every attempted asset lands exactly once in the profile, no holes.
    assert.equal(profile.sourceAssets.length, 4);
    for (const entry of profile.sourceAssets) {
      assert.ok(entry && typeof entry === "object");
      assert.equal(entry.status, "failed");
    }
    assert.deepEqual(new Set(report.map((entry) => entry.status)), new Set(["failed", "sampled-out"]));
    assert.equal(report.length, 5);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("computeAssetFingerprints skips unusable and missing assets", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-likeness-fp-"));
  const realFile = path.join(dir, "real.png");
  await fs.writeFile(realFile, "pixel");
  const avatar = {
    assets: [
      { id: "image-1", type: "image", uri: `file://${realFile}` },
      { id: "missing-1", type: "image", uri: `file://${path.join(dir, "nope.png")}` },
      { id: "model-1", type: "model", uri: `file://${realFile}` },
    ],
  };
  const fingerprints = await computeAssetFingerprints(avatar, dir);
  assert.deepEqual([...fingerprints.keys()], ["image-1"]);
  // The existing-profile freshness gate agrees with the builder.
  const profile = buildAvatarLikenessProfile({ avatarId: "x", entries: [{ assetId: "image-1", kind: "image", weight: 1, status: "signed", signature: solidSignature([255, 0, 0]) }, { assetId: "missing-1", kind: "image", weight: 1, status: "missing", signature: null }], assetFingerprints: Object.fromEntries(fingerprints) });
  assert.equal(existingProfileIsFresh(profile, avatar, fingerprints), true);
  const changed = new Map(fingerprints);
  changed.set("image-1", "different-hash");
  assert.equal(existingProfileIsFresh(profile, avatar, changed), false);
  await fs.rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Source contracts: API route, CLI command, runtime data docs
// ---------------------------------------------------------------------------

const repoRoot = new URL("..", import.meta.url);
const apiSource = readFileSync(new URL("server/api.mjs", repoRoot), "utf8");
const cliSource = readFileSync(new URL("cli/avatar-builder.mjs", repoRoot), "utf8");
const dataReadme = readFileSync(new URL("data/README.md", repoRoot), "utf8");
const buildSource = readFileSync(new URL("server/avatar-likeness-build.mjs", repoRoot), "utf8");

test("api exposes an admin-gated /api/avatars/likeness read route", () => {
  assert.match(apiSource, /import \{ createAvatarLikenessStore, AvatarLikenessStoreError \} from "\.\/avatar-likeness-store\.mjs";/);
  assert.match(apiSource, /const AVATAR_LIKENESS_DIR = process\.env\.HAPA_AVATAR_LIKENESS_DIR \|\| path\.join\(ROOT, "data\/avatar-likeness"\);/);
  const route = apiSource.slice(apiSource.indexOf('"/api/avatars/likeness"'), apiSource.indexOf('"/api/avatars" && req.method === "GET"'));
  assert.ok(route.length > 0, "route block must exist before the generic avatars route");
  assert.match(route, /requireAdmin\(req, res\)/, "route must be admin-gated");
  assert.match(route, /avatarLikenessStore\.list\(\)/);
  assert.match(route, /profileSummary/);
});

test("cli exposes avatar-likeness-profile with dry-run default and help", () => {
  assert.match(cliSource, /import \{ computeAssetFingerprints, existingProfileIsFresh, buildAvatarLikenessProfileForAvatar \} from "\.\.\/server\/avatar-likeness-build\.mjs";/);
  assert.match(cliSource, /if \(cmd === "avatar-likeness-profile"\)/);
  assert.match(cliSource, /const apply = Boolean\(opts\.apply\);/);
  assert.match(cliSource, /const concurrency = Math\.max\(1, Math\.trunc\(Number\(opts\.concurrency\) \|\| 8\)\);/);
  assert.match(cliSource, /avatar-likeness-profile \[\--avatar <id>\|\--all\] \[\--apply\] \[\--concurrency <n>\] \[\--media-dir <dir>\] \[\--profile-dir <dir>\] \[\--json\]/);
});

test("server builder resolves, fingerprints, and signs assets without touching the Avatar store", () => {
  assert.match(buildSource, /export async function computeAssetFingerprints/);
  assert.match(buildSource, /export async function buildAvatarLikenessProfileForAvatar/);
  assert.match(buildSource, /createMediaVisualSignature\(\{ \.\.\.options, path: filePath \}\)/);
  assert.doesNotMatch(buildSource, /writeFile\(.*avatar-store/i, "the builder must never write the Avatar Card store");
});

test("runtime data docs cover the avatar-likeness directory", () => {
  assert.match(dataReadme, /avatar-likeness\/profiles\.json/);
  assert.match(dataReadme, /avatar-likeness-profile --apply/);
});
