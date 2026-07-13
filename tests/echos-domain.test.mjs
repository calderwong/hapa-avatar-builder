import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEchoGapsReport,
  detectEchoPlaceholderMetadata,
  ECHO_TRUTH_STATUS,
  scoreEchoVideoReadiness,
} from "../src/domain/echos.js";

function placeholderVideoAsset() {
  return {
    id: "asset-1",
    type: "video",
    title: "Generated cyber loop",
    uri: "/media/generated.mp4",
    tags: [
      "digital-isolation",
      "cyber-operator",
      "simulation-framework",
      "camera-push-in",
      "glitch-lines",
      "browser-playback",
      "era-post-black-horizon",
    ],
    metadata: {
      shotGrammar: "hero_shot",
      motion: "slow_push_in",
      emotion: "reflective",
      rhythm: "stillness",
      colorPalette: ["#0f172a", "#38bdf8", "#f43f5e"],
      objects: ["neon sign", "field coat", "avatar frame"],
      actions: ["glitching", "standing", "shimmering"],
      duration: 4,
      characterCount: 1,
      narrativeSummary: "A classic cyber-operator look inside a never-ending simulation loop.",
      objectiveSummary: "The file is 768 pixels in width and 1168 pixels in height.",
      flowType: "loop",
    },
  };
}

test("detectEchoPlaceholderMetadata catches generated Echo signatures", () => {
  const result = detectEchoPlaceholderMetadata(placeholderVideoAsset());
  assert.equal(result.isPlaceholder, true);
  assert.ok(result.signals.includes("placeholder-tag-set"));
  assert.ok(result.signals.includes("generated-object-set"));
});

test("Echo gaps report separates raw field presence from source-truth score", () => {
  const songbook = {
    songCards: [
      {
        id: "song-1",
        title: "Synthetic Map",
        sections: [
          { section_id: "intro", start_sec: 0, end_sec: 12 },
          { section_id: "verse_1", start_sec: 12, end_sec: 45 },
          { section_id: "chorus_1", start_sec: 45, end_sec: 75 },
          { section_id: "verse_2", start_sec: 75, end_sec: 108 },
          { section_id: "chorus_2", start_sec: 108, end_sec: 138 },
          { section_id: "bridge", start_sec: 138, end_sec: 168 },
          { section_id: "chorus_3", start_sec: 168, end_sec: 198 },
          { section_id: "outro", start_sec: 198, end_sec: 218 },
          { section_id: "ringout", start_sec: 218, end_sec: 230 },
        ],
        beats: Array.from({ length: 48 }, (_, index) => ({
          t: index * 2.5,
          bar: Math.floor(index / 4) + 1,
          beat: (index % 4) + 1,
        })),
        vocalDensity: [
          { start_sec: 0, end_sec: 12, vocal_density: "none" },
          { start_sec: 12, end_sec: 138, vocal_density: "high" },
          { start_sec: 138, end_sec: 168, vocal_density: "low" },
          { start_sec: 168, end_sec: 198, vocal_density: "high" },
          { start_sec: 198, end_sec: 230, vocal_density: "none" },
        ],
        energyCurves: {
          loudness: [0.1, 0.4, 0.8, 0.45, 0.85, 0.5, 0.9, 0.3, 0.05],
          tension: [0.2, 0.3, 0.7, 0.5, 0.8, 0.9, 0.95, 0.4, 0.1],
          release: [0.1, 0.1, 0.8, 0.2, 0.8, 0.1, 0.9, 0.8, 0.9],
          brightness: [0.3, 0.4, 0.6, 0.4, 0.7, 0.3, 0.8, 0.2, 0.1],
        },
        sync: { stemCount: 12 },
        sourceAnchors: [{ kind: "suno-playlist-track", confidence: "hard" }],
        narrativeSpine: "Local spine for \"Synthetic Map\": Narrative journey tracing motifs from the singer perspective.",
      },
    ],
  };
  const itemStore = { cards: [{ id: "avatar-1", mediaAssets: [placeholderVideoAsset()] }] };
  const sceneStore = { scenes: [] };

  const report = buildEchoGapsReport({ songbook, itemStore, sceneStore, generatedAt: "2026-06-27T00:00:00.000Z" });
  assert.equal(report.schemaVersion, "hapa.echos-gaps-report.v4");
  assert.equal(report.scoring.contract, "hapa.echo.source-truth.v1");
  assert.equal(report.summary.placeholderSongs, 1);
  assert.equal(report.summary.placeholderVideos, 1);
  assert.equal(report.videos[0].rawPresenceScore, 100);
  assert.ok(report.videos[0].score < report.videos[0].rawPresenceScore);
  assert.equal(report.videos[0].truthStatus, ECHO_TRUTH_STATUS.GENERATED_PLACEHOLDER);
});

test("Echo gaps report builder does not mutate source stores", () => {
  const fixture = {
    songbook: { songCards: [{ id: "song-1", title: "Untouched" }] },
    itemStore: { cards: [{ id: "avatar-1", mediaAssets: [placeholderVideoAsset()] }] },
    sceneStore: { scenes: [{ id: "scene-1", assets: [] }] },
    mediaLibrary: { records: [{ id: "system-1", mediaType: "video", tags: ["scroll-site"] }] },
  };
  const before = JSON.parse(JSON.stringify(fixture));
  buildEchoGapsReport(fixture);
  assert.deepEqual(fixture, before);
});

test("Echo gaps report discovers eligible Scroll Site and FAL system media", () => {
  const mediaLibrary = {
    records: [
      {
        id: "scroll-main",
        name: "Scroll main.mp4",
        mediaType: "video",
        uri: "/media/scroll-main.mp4",
        thumbnailUri: "/media/scroll-main.jpg",
        contentFingerprint: "a".repeat(64),
        duration: 8.5,
        tags: ["scroll-site", "progression"],
      },
      {
        id: "scroll-fal",
        name: "FAL cinematic.mp4",
        mediaType: "video",
        uri: "/media/scroll-fal.mp4",
        contentHash: { algorithm: "sha256", value: "b".repeat(64) },
        tags: ["scroll-fal", "loop"],
        asset: { metadata: { flowType: "loop" } },
      },
      { id: "other-video", mediaType: "video", tags: ["folder-ingest"] },
      { id: "scroll-image", mediaType: "image", tags: ["scroll-site"] },
    ],
  };

  const report = buildEchoGapsReport({ mediaLibrary });

  assert.equal(report.summary.systemMediaVideos, 2);
  assert.deepEqual(report.videos.map((video) => video.id), ["scroll-main", "scroll-fal"]);
  assert.ok(report.videos.every((video) => video.source === "system_media"));
  assert.equal(report.videos[0].duration, 8.5);
  assert.equal(report.videos[1].flowType, "loop");
});

test("Echo gaps report deduplicates system media against Cards, Scenes, and prior system hashes", () => {
  const duplicateHash = "c".repeat(64);
  const systemOnlyHash = "d".repeat(64);
  const report = buildEchoGapsReport({
    itemStore: {
      cards: [{
        id: "avatar-1",
        mediaAssets: [{ id: "attached", type: "video", contentHash: `sha256:${duplicateHash}`, uri: "/media/attached.mp4" }],
      }],
    },
    sceneStore: { scenes: [] },
    mediaLibrary: {
      records: [
        { id: "duplicate-attached", mediaType: "video", contentFingerprint: duplicateHash, tags: ["scroll-site"] },
        { id: "system-first", mediaType: "video", contentFingerprint: systemOnlyHash, tags: ["scroll-fal"] },
        { id: "system-second", mediaType: "video", sha256: systemOnlyHash, tags: ["scroll-site"] },
      ],
    },
  });

  assert.equal(report.summary.avatarCardVideos, 1);
  assert.equal(report.summary.systemMediaVideos, 1);
  assert.deepEqual(report.videos.map((video) => video.id), ["attached", "system-first"]);
});

test("Echo truth gate quarantines the newer unproven 120 BPM half-second grid", () => {
  const songbook = {
    songCards: [{
      id: "song-half-second-grid",
      title: "Generated 120 BPM",
      sections: [{ section_id: "intro", start_sec: 0, end_sec: 12 }],
      beats: Array.from({ length: 240 }, (_, index) => ({
        t: index * 0.5,
        bar: Math.floor(index / 4) + 1,
        beat: (index % 4) + 1,
      })),
      sync: { stemCount: 12 },
      sourceAnchors: [{ kind: "suno-playlist-track", confidence: "hard" }],
    }],
  };
  const report = buildEchoGapsReport({ songbook, itemStore: { cards: [] }, sceneStore: { scenes: [] } });
  assert.equal(report.songs[0].truth.beats, ECHO_TRUTH_STATUS.GENERATED_PLACEHOLDER);
  assert.ok(report.songs[0].placeholderSignals.includes("unproven-uniform-0.5s-beat-grid"));
});

test("Echo truth gate accepts a uniform beat grid when measured telemetry provenance exists", () => {
  const songbook = {
    songCards: [{
      id: "song-measured-grid",
      title: "Measured 120 BPM",
      sections: [{ section_id: "intro", start_sec: 0, end_sec: 12 }],
      beats: Array.from({ length: 32 }, (_, index) => ({
        t: index * 0.5,
        bar: Math.floor(index / 4) + 1,
        beat: (index % 4) + 1,
      })),
      sync: { stemCount: 12, audioTelemetryPath: "/verified/telemetry.json" },
    }],
  };
  const report = buildEchoGapsReport({ songbook, itemStore: { cards: [] }, sceneStore: { scenes: [] } });
  assert.equal(report.songs[0].truth.beats, ECHO_TRUTH_STATUS.VERIFIED);
  assert.ok(!report.songs[0].placeholderSignals.includes("unproven-uniform-0.5s-beat-grid"));
});

test("technical media affordance truth overrides placeholder field scoring", () => {
  const asset = placeholderVideoAsset();
  asset.metadata.echosTechnicalAffordance = {
    status: "verified",
    durationSec: 4.2,
    width: 768,
    height: 1168,
  };
  asset.metadata.echosTruth = {
    status: "technical_verified_source_inferred",
    fields: {
      duration: "verified",
      shotGrammar: "inferred",
      motionAffordances: "inferred",
      objects: "source_inferred",
      actions: "source_inferred",
      flowType: "inferred",
    },
  };

  const readiness = scoreEchoVideoReadiness(asset, {});
  assert.equal(readiness.truthStatus, ECHO_TRUTH_STATUS.GENERATED_PLACEHOLDER);
  assert.equal(readiness.truth.hasDuration, ECHO_TRUTH_STATUS.VERIFIED);
  assert.equal(readiness.truth.hasShotGrammar, ECHO_TRUTH_STATUS.INFERRED);
  assert.equal(readiness.truth.hasObjects, ECHO_TRUTH_STATUS.INFERRED);
  assert.ok(readiness.score > 26, "technical evidence should improve score without pretending full verification");
});
