import assert from "node:assert/strict";
import test from "node:test";

import {
  HUMAN_VIDEO_PALETTE_METHOD,
  HUMAN_VIDEO_VISUAL_ENRICHMENT_EVENT_SCHEMA,
  HUMAN_VIDEO_VISUAL_ENRICHMENT_RECORD_SCHEMA,
  HUMAN_VIDEO_VISUAL_ENRICHMENT_STORE_SCHEMA,
  agentReviewDescription,
  createHumanVideoVisualEnrichmentStore,
  descriptionForVideo,
  echoCatalogDescription,
  findHumanVideoVisualEnrichmentRecord,
  humanVideoVisualEnrichmentEvent,
  medianCut,
  normalizeHumanVideoVisualEnrichmentStore,
  paletteFromRawFrames,
  rgbPixelsFromRawFrame,
  sha256Hex,
  sourceIdentityMatches,
  upsertHumanVideoVisualEnrichment,
  visualSourceIdentity,
} from "../src/domain/human-video-visual-enrichment.js";

const SIZE = 32;

function rawFrame(paint) {
  const data = new Uint8Array(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const [r, g, b] = paint(x, y);
      const at = (y * SIZE + x) * 3;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
    }
  }
  return { data, width: SIZE, height: SIZE };
}

// Deterministic pseudo-random pixels (LCG) so the suite never depends on Math.random.
function lcgFrame(seed) {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  return rawFrame(() => [Math.floor(next() * 256), Math.floor(next() * 256), Math.floor(next() * 256)]);
}

test("schema constants are stable", () => {
  assert.equal(HUMAN_VIDEO_VISUAL_ENRICHMENT_STORE_SCHEMA, "hapa.human-video-visual-enrichment-store.v1");
  assert.equal(HUMAN_VIDEO_VISUAL_ENRICHMENT_RECORD_SCHEMA, "hapa.human-video-visual-enrichment.v1");
  assert.equal(HUMAN_VIDEO_VISUAL_ENRICHMENT_EVENT_SCHEMA, "hapa.human-video-visual-enrichment-event.v1");
  assert.equal(HUMAN_VIDEO_PALETTE_METHOD, "local-median-cut-v1");
});

test("rgbPixelsFromRawFrame reads scanline rgb24 pixels", () => {
  const data = new Uint8Array([10, 20, 30, 40, 50, 60]);
  const pixels = rgbPixelsFromRawFrame(data, 2, 1);
  assert.deepEqual(pixels, [[10, 20, 30], [40, 50, 60]]);
  assert.deepEqual(rgbPixelsFromRawFrame(null), []);
});

test("paletteFromRawFrames is deterministic for identical inputs", () => {
  const frames = [lcgFrame(1), lcgFrame(2), lcgFrame(3)];
  const first = paletteFromRawFrames(frames);
  const second = paletteFromRawFrames(frames.map((frame) => ({ ...frame, data: new Uint8Array(frame.data) })));
  assert.deepEqual(first, second);
});

test("paletteFromRawFrames on a flat frame yields one neutral swatch", () => {
  const frame = rawFrame(() => [128, 128, 128]);
  const palette = paletteFromRawFrames([frame]);
  assert.equal(palette.methodVersion, HUMAN_VIDEO_PALETTE_METHOD);
  assert.deepEqual(palette.swatches, [{ hex: "#808080", share: 1 }]);
  assert.ok(Math.abs(palette.luminance - 128 / 255) < 0.001);
  assert.equal(palette.saturation, 0);
  assert.equal(palette.warmth, 0);
  assert.equal(palette.chromaShare, 0);
  assert.deepEqual(palette.hueHistogram, new Array(12).fill(0));
  assert.equal(palette.pixelCount, 1024);
  assert.equal(palette.frameCount, 1);
});

test("paletteFromRawFrames separates red and blue halves with balanced warmth", () => {
  const frame = rawFrame((x) => (x < SIZE / 2 ? [255, 0, 0] : [0, 0, 255]));
  const palette = paletteFromRawFrames([frame]);
  assert.equal(palette.swatches.length, 2);
  assert.deepEqual(palette.swatches.map((swatch) => swatch.share).sort((a, b) => b - a), [0.5, 0.5]);
  assert.ok(palette.swatches.some((swatch) => swatch.hex === "#ff0000"));
  assert.ok(palette.swatches.some((swatch) => swatch.hex === "#0000ff"));
  assert.equal(palette.warmth, 0);
  // Red sits in hue bin 0, blue in hue bin 8 (240/30).
  assert.equal(palette.hueHistogram[0], 0.5);
  assert.equal(palette.hueHistogram[8], 0.5);
  assert.equal(palette.hueHistogram.reduce((sum, bin) => sum + bin, 0), 1);
});

test("paletteFromRawFrames reports warm and cool frames by warmth", () => {
  const warm = paletteFromRawFrames([rawFrame(() => [255, 128, 0])]); // orange, hue 30
  const cool = paletteFromRawFrames([rawFrame(() => [0, 128, 255])]); // azure, hue 210
  assert.equal(warm.warmth, 1);
  assert.equal(cool.warmth, -1);
  assert.equal(warm.swatches[0].hex, "#ff8000");
  assert.equal(cool.swatches[0].hex, "#0080ff");
});

test("medianCut stops early when fewer distinct colors remain and respects determinism", () => {
  const pixels = [
    [10, 20, 30], [10, 20, 31], [200, 100, 50], [201, 100, 51], [255, 255, 255],
  ];
  const boxes = medianCut(pixels, 8);
  assert.ok(boxes.length < 8);
  assert.equal(boxes.reduce((sum, box) => sum + box.pixels.length, 0), pixels.length);
  assert.deepEqual(medianCut(pixels, 8), medianCut([...pixels].reverse(), 8));
});

test("sha256Hex accepts prefixed and bare digests only", () => {
  const digest = "a".repeat(64);
  assert.equal(sha256Hex(digest), digest);
  assert.equal(sha256Hex(`sha256:${digest}`), digest);
  assert.equal(sha256Hex(`SHA256:${digest.toUpperCase()}`), digest);
  assert.equal(sha256Hex("nope"), "");
  assert.equal(sha256Hex("a".repeat(63)), "");
});

test("agentReviewDescription reads provenance from the review record", () => {
  const description = agentReviewDescription({
    id: "review-1",
    status: "accepted",
    reviewer: { model: "gpt-5.6-terra", parameters: { promptVersion: "human-enricher-optical-minimal-v3" } },
    proposal: { description: "A runner crossing a neon bridge." },
  });
  assert.equal(description.sourceClass, "agent-optical");
  assert.equal(description.text, "A runner crossing a neon bridge.");
  assert.equal(description.provenance.model, "gpt-5.6-terra");
  assert.equal(description.provenance.promptVersion, "human-enricher-optical-minimal-v3");
  assert.equal(agentReviewDescription(null), null);
  assert.equal(agentReviewDescription({ proposal: { description: "  " } }), null);
});

test("echoCatalogDescription records catalog provenance", () => {
  const description = echoCatalogDescription("A lighthouse at dawn.", { catalogSha256: "b".repeat(64) });
  assert.equal(description.sourceClass, "echo-enrichment");
  assert.equal(description.provenance.catalogSha256, "b".repeat(64));
  assert.equal(echoCatalogDescription("   "), null);
});

test("descriptionForVideo prefers agent reviews over echo catalog synopses", () => {
  const digest = "c".repeat(64);
  const video = {
    contentFingerprint: digest,
    agentReview: { proposal: { description: "Agent text." }, reviewer: { model: "m", parameters: { promptVersion: "v" } }, status: "accepted" },
  };
  assert.equal(descriptionForVideo(video, { echoSynopses: new Map([[digest, "Echo text."]]) }).sourceClass, "agent-optical");
  assert.equal(descriptionForVideo({ ...video, agentReview: null }, { echoSynopses: new Map([[digest, "Echo text."]]) }).sourceClass, "echo-enrichment");
  assert.equal(descriptionForVideo({ ...video, agentReview: null }, { echoSynopses: new Map() }), null);
});

test("visualSourceIdentity prefers fingerprints, then file identity, then none", () => {
  const fingerprint = visualSourceIdentity({ contentFingerprint: `sha256:${"d".repeat(64)}`, sourcePath: "/a/b.mp4" }, { size: 10, mtimeMs: 5 });
  assert.equal(fingerprint.basis, "content-fingerprint");
  assert.equal(fingerprint.fingerprint, "d".repeat(64));
  const file = visualSourceIdentity({ sourcePath: "/a/b.mp4" }, { size: 10, mtimeMs: 5 });
  assert.equal(file.basis, "file");
  assert.equal(visualSourceIdentity({ sourcePath: "/a/b.mp4" }, null).basis, "none");
  assert.equal(sourceIdentityMatches(fingerprint, visualSourceIdentity({ contentFingerprint: `sha256:${"e".repeat(64)}` }, null)), false);
  assert.equal(sourceIdentityMatches(file, visualSourceIdentity({ sourcePath: "/a/b.mp4" }, { size: 10, mtimeMs: 5 })), true);
  assert.equal(sourceIdentityMatches(file, visualSourceIdentity({ sourcePath: "/a/b.mp4" }, { size: 11, mtimeMs: 5 })), false);
  assert.equal(sourceIdentityMatches(file, visualSourceIdentity({ sourcePath: "/a/b.mp4" }, { size: 10, mtimeMs: 6 })), false);
});

function paletteFixture() {
  return paletteFromRawFrames([rawFrame((x) => (x < 16 ? [255, 128, 0] : [64, 64, 200]))]);
}

function upsertInputs(key) {
  return {
    key,
    aliases: [key, `uri:/media/${key}.mp4`],
    videoId: "video-1",
    videoName: "sample.mp4",
    mediaType: "video",
    videoIdentity: { recordId: "video-1", uri: "/media/sample.mp4", sourcePath: "/media/sample.mp4" },
    palette: paletteFixture(),
    description: {
      text: "Runner on a bridge.",
      sourceClass: "agent-optical",
      provenance: { model: "gpt-5.6-terra", promptVersion: "human-enricher-optical-minimal-v3", reviewStatus: "accepted" },
    },
  };
}

test("store upsert is idempotent for unchanged content", () => {
  const now = "2026-08-21T12:00:00.000Z";
  const first = upsertHumanVideoVisualEnrichment({}, upsertInputs(`fingerprint:${"a".repeat(64)}`), { now });
  assert.equal(first.changed, true);
  const second = upsertHumanVideoVisualEnrichment(first.store, upsertInputs(first.record.key), { now });
  assert.equal(second.changed, false);
  assert.equal(second.record.updatedAt, now);
  assert.equal(JSON.stringify(first.store), JSON.stringify(second.store));
  assert.equal(second.store.records.length, 1);
});

test("store upsert matches an existing record through a different alias", () => {
  const now = "2026-08-21T12:00:00.000Z";
  const key = `fingerprint:${"e".repeat(64)}`;
  const uriAlias = `uri:/media/${key}.mp4`;
  const first = upsertHumanVideoVisualEnrichment({}, upsertInputs(key), { now });
  const next = upsertHumanVideoVisualEnrichment(first.store, {
    key: uriAlias,
    aliases: [uriAlias],
    description: { text: "Revised text.", sourceClass: "agent-optical", provenance: {} },
  }, { now: "2026-08-21T13:00:00.000Z" });
  assert.equal(next.changed, true);
  assert.equal(next.store.records.length, 1);
  assert.equal(next.record.key, key);
  assert.ok(next.record.aliases.includes(uriAlias));
  assert.equal(next.record.description.text, "Revised text.");
  assert.deepEqual(next.record.palette, first.record.palette);
  assert.equal(findHumanVideoVisualEnrichmentRecord(next.store, { key: uriAlias }).key, key);
});

test("store normalize dedupes by key keeping the newest and sorts records", () => {
  const key = `fingerprint:${"f".repeat(64)}`;
  const store = normalizeHumanVideoVisualEnrichmentStore({
    records: [
      { schemaVersion: HUMAN_VIDEO_VISUAL_ENRICHMENT_RECORD_SCHEMA, key, aliases: [key], palette: null, description: { text: "old", sourceClass: "agent-optical", provenance: {} }, updatedAt: "2026-08-01T00:00:00.000Z" },
      { schemaVersion: HUMAN_VIDEO_VISUAL_ENRICHMENT_RECORD_SCHEMA, key, aliases: [key], palette: null, description: { text: "new", sourceClass: "agent-optical", provenance: {} }, updatedAt: "2026-08-02T00:00:00.000Z" },
    ],
  });
  assert.equal(store.records.length, 1);
  assert.equal(store.records[0].description.text, "new");
  assert.equal(store.updatedAt, "2026-08-02T00:00:00.000Z");
  assert.equal(store.truthBoundary, createHumanVideoVisualEnrichmentStore({}).truthBoundary);
});

test("event rows carry the record identity, stage, and source class", () => {
  const record = upsertHumanVideoVisualEnrichment({}, upsertInputs(`fingerprint:${"9".repeat(64)}`), { now: "2026-08-21T12:00:00.000Z" }).record;
  const event = humanVideoVisualEnrichmentEvent({ record, stage: "palette", actorId: "scripts/enrich-human-accepted-visuals", now: "2026-08-21T12:00:00.000Z" });
  assert.equal(event.schemaVersion, HUMAN_VIDEO_VISUAL_ENRICHMENT_EVENT_SCHEMA);
  assert.equal(event.action, "human-video-visual-enrichment.updated");
  assert.ok(event.eventId.startsWith(`fingerprint:${"9".repeat(64)}:palette:`));
  assert.equal(event.videoKey, record.key);
  assert.equal(event.descriptionSourceClass, "agent-optical");
  const failure = humanVideoVisualEnrichmentEvent({ record, stage: "palette", error: "boom", now: "2026-08-21T12:00:00.000Z" });
  assert.equal(failure.action, "human-video-visual-enrichment.failed");
  assert.equal(failure.error, "boom");
});
