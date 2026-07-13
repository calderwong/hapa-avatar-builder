import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildDirectorV2Artifacts,
  DEFAULT_VARIANT_RECIPES,
} from "../src/domain/echo-director-v2.js";

const MUSIC_VIZ_MANIFEST = "/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json";
const PROJECTS_DIR = new URL("../data/music-video-projects/", import.meta.url);

function shader(id, title = id, overrides = {}) {
  return {
    id: `isf:${id}`,
    title,
    source: `/static/isf/shaders/${id}.fs`,
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.25 }],
    audioMap: { gain: { signal: "rms", depth: 0.4 } },
    enabled: true,
    directorEligible: true,
    ...overrides,
  };
}

function projectFor(visualizerTimeline, duration = 12) {
  return {
    music_video_project: {
      song_id: "visualizer-fidelity-fixture",
      song_title: "Visualizer Fidelity Fixture",
      duration,
      stems_available: [],
      timed_lyrics: [],
      song_edit_map: {
        sections: [{ id: "section", type: "verse", label: "Section", start: 0, end: duration }],
      },
      timeline: [{
        section_id: "section",
        section_type: "verse",
        start_sec: 0,
        end_sec: duration,
        media_id: "fixture-media",
        media_title: "Fixture media",
        media_uri: "/media/fixture.mp4",
        transition: "cut",
      }],
      visualizer_timeline: visualizerTimeline,
    },
  };
}

function compile({ visualizers, manifest, duration = 12, recipe = "visualizer-forward" }) {
  return buildDirectorV2Artifacts({
    project: projectFor(visualizers, duration),
    manifest: { shaders: manifest },
    duration,
    recipe,
    seed: "visualizer-cue-fidelity",
  });
}

function trackB(result) {
  return result.showGraph.tracks.find((track) => track.id === "track-b").cards;
}

function clippedWindow(segment, duration) {
  const start = Math.max(0, Math.min(duration, Number(segment.start_sec) || 0));
  const end = Math.max(0, Math.min(duration, Number(segment.end_sec) || 0));
  if (end <= start) return null;
  return [Math.round(start * 1_000) / 1_000, Math.round(end * 1_000) / 1_000];
}

function maxExecutableConcurrency(cards) {
  const events = cards
    .filter((card) => card.executionStatus.startsWith("executable"))
    .flatMap((card) => [
      { at: card.startSeconds, delta: 1 },
      { at: card.endSeconds, delta: -1 },
    ])
    // End events win ties so adjacent half-open [start,end) cues do not overlap.
    .sort((left, right) => left.at - right.at || left.delta - right.delta);
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event.delta;
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

test("exact visualizer ID wins before an earlier duplicate-title sibling", () => {
  const duplicateTitle = "Duplicate title";
  const manifest = [shader("wrong-sibling", duplicateTitle), shader("requested", duplicateTitle)];
  const visualizers = [{
    start_sec: 0,
    end_sec: 12,
    visualizer_id: "isf:requested",
    visualizer_title: duplicateTitle,
  }];
  const result = compile({ visualizers, manifest });
  const treatment = result.treatment.visualizers[0];
  const card = trackB(result)[0];

  assert.equal(treatment.requestedSourceId, "isf:requested");
  assert.equal(treatment.sourceId, "isf:requested");
  assert.equal(treatment.manifestResolution.status, "exact-id");
  assert.equal(treatment.manifestResolution.fallbackUsed, false);
  assert.equal(card.visualization.sourceId, "isf:requested");
  assert.equal(card.visualization.resolutionStatus, "exact-id");
  assert.equal(card.visualization.fallbackReceipt, null);
});

test("layer cap limits only simultaneous overlap and never truncates later sequential cues", () => {
  const manifest = Array.from({ length: 10 }, (_, index) => shader(`cue-${index}`));
  const sevenWayOverlap = Array.from({ length: 7 }, (_, index) => ({
    start_sec: 0,
    end_sec: 5,
    visualizer_id: `isf:cue-${index}`,
    visualizer_title: `cue-${index}`,
  }));
  const laterAdjacentCues = [
    { start_sec: 5, end_sec: 7, visualizer_id: "isf:cue-7", visualizer_title: "cue-7" },
    { start_sec: 7, end_sec: 9, visualizer_id: "isf:cue-8", visualizer_title: "cue-8" },
    { start_sec: 9, end_sec: 12, visualizer_id: "isf:cue-9", visualizer_title: "cue-9" },
  ];
  const result = compile({ visualizers: [...sevenWayOverlap, ...laterAdjacentCues], manifest });
  const cards = trackB(result);
  const rejected = cards.filter((card) => card.executionStatus === "rejected-concurrency-limit");

  assert.equal(cards.length, 10, "every valid source cue remains represented on track B");
  assert.equal(rejected.length, 1, "only the seventh simultaneous layer is rejected");
  assert.equal(rejected[0].knockedOut, true);
  assert.equal(rejected[0].executionReceipt.reason, "all-simultaneous-visualizer-layers-occupied");
  assert.equal(maxExecutableConcurrency(cards), DEFAULT_VARIANT_RECIPES["visualizer-forward"].maxVisualizerLayers);
  assert.deepEqual(
    cards.slice(7).map((card) => [card.sourceCueIndex, card.executionStatus]),
    [[7, "executable"], [8, "executable"], [9, "executable"]],
    "later sequential cues survive after the overlap spike",
  );
});

test("adjacent half-open cues reuse a constrained layer without false overlap", () => {
  const manifest = [shader("a"), shader("b"), shader("c")];
  const result = compile({
    manifest,
    recipe: { ...DEFAULT_VARIANT_RECIPES.conservative, maxVisualizerLayers: 1 },
    visualizers: [
      { start_sec: 0, end_sec: 4, visualizer_id: "isf:a", visualizer_title: "a" },
      { start_sec: 4, end_sec: 8, visualizer_id: "isf:b", visualizer_title: "b" },
      { start_sec: 8, end_sec: 12, visualizer_id: "isf:c", visualizer_title: "c" },
    ],
  });
  const cards = trackB(result);
  assert.equal(cards.length, 3);
  assert.ok(cards.every((card) => card.executionStatus === "executable"));
  assert.ok(cards.every((card) => card.visualization.layerIndex === 0));
  assert.equal(maxExecutableConcurrency(cards), 1);
});

test("director-ineligible exact requests and invalid windows have explicit receipts", () => {
  const title = "Same title must not substitute";
  const manifest = [
    shader("eligible-sibling", title),
    shader("requested-ineligible", title, { directorEligible: false }),
  ];
  const result = compile({
    manifest,
    visualizers: [
      { start_sec: 0, end_sec: 6, visualizer_id: "isf:requested-ineligible", visualizer_title: title },
      { start_sec: 8, end_sec: 7, visualizer_id: "isf:eligible-sibling", visualizer_title: title },
    ],
  });
  const [overrideCard] = trackB(result);
  const [overrideReceipt, invalidReceipt] = result.treatment.visualizerReceipts;

  assert.equal(overrideCard.visualization.sourceId, "isf:requested-ineligible");
  assert.equal(overrideCard.resolutionStatus, "exact-id");
  assert.equal(overrideCard.eligibilityStatus, "source-cue-override");
  assert.equal(overrideCard.executionStatus, "executable-source-cue-override");
  assert.equal(overrideReceipt.resolvedSourceId, "isf:requested-ineligible");
  assert.equal(overrideReceipt.eligibilityStatus, "source-cue-override");
  assert.equal(invalidReceipt.sourceCueIndex, 1);
  assert.equal(invalidReceipt.resolutionStatus, "not-resolved-invalid-window");
  assert.equal(invalidReceipt.eligibilityStatus, "rejected-invalid-window");
  assert.equal(invalidReceipt.reason, "cue-window-empty-after-duration-clipping");
});

test("plan generation filters disabled, director-ineligible, ID-less, and source-less manifest rows", () => {
  const generatorSource = fs.readFileSync(new URL("../scripts/generate-music-video-plans.mjs", import.meta.url), "utf8");
  for (const requiredPredicate of [
    "shader?.enabled !== false",
    "shader?.directorEligible !== false",
    "shader?.id",
    "shader?.source",
  ]) {
    assert.ok(generatorSource.includes(requiredPredicate), `generator shader pool is missing: ${requiredPredicate}`);
  }

  const manifest = JSON.parse(fs.readFileSync(MUSIC_VIZ_MANIFEST, "utf8"));
  const selected = manifest.shaders.filter((entry) => (
    entry?.enabled !== false && entry?.directorEligible !== false && entry?.id && entry?.source
  ));
  assert.equal(manifest.shaders.length, 182);
  assert.equal(selected.length, 180);
  assert.equal(selected.some((entry) => entry.directorEligible === false), false);
});

test("all 79 album projects preserve 791 exact-ID cues and 17,035.08 clipped seconds", { timeout: 120_000 }, () => {
  assert.ok(fs.existsSync(MUSIC_VIZ_MANIFEST), "Music Viz ISF manifest is required for the album fidelity gate");
  const manifest = JSON.parse(fs.readFileSync(MUSIC_VIZ_MANIFEST, "utf8"));
  const manifestById = new Map(manifest.shaders.map((entry) => [entry.id, entry]));
  const files = fs.readdirSync(PROJECTS_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();
  assert.equal(files.length, 79);

  const totals = {
    sourceCues: 0,
    treatmentCues: 0,
    receipts: 0,
    cards: 0,
    sourceDuration: 0,
    cardDuration: 0,
    exactIds: 0,
    silentFallbacks: 0,
    sourceCueOverrides: 0,
    rejectedCards: 0,
    endClips: 0,
  };

  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR.pathname, file), "utf8"));
    const project = payload.music_video_project || payload.project || payload;
    const duration = Number(project.duration || 0);
    const sourceCues = (project.visualizer_timeline || [])
      .map((segment, sourceCueIndex) => ({ segment, sourceCueIndex, window: clippedWindow(segment, duration) }))
      .filter((entry) => entry.window);
    const result = buildDirectorV2Artifacts({
      project: payload,
      manifest,
      duration,
      recipe: "visualizer-forward",
      seed: "album-visualizer-cue-fidelity",
    });
    const visualizersByCue = new Map(result.treatment.visualizers.map((entry) => [entry.sourceCueIndex, entry]));
    const receiptsByCue = new Map(result.treatment.visualizerReceipts.map((entry) => [entry.sourceCueIndex, entry]));
    const cards = trackB(result);
    const cardsByCue = new Map(cards.map((entry) => [entry.sourceCueIndex, entry]));

    assert.equal(result.treatment.visualizerReceipts.length, (project.visualizer_timeline || []).length, `${file}: every source cue has a receipt`);
    assert.equal(result.treatment.visualizers.length, sourceCues.length, `${file}: every clipped cue has a treatment row`);
    assert.equal(cards.length, sourceCues.length, `${file}: every clipped cue has a track-B card`);

    for (const { segment, sourceCueIndex, window } of sourceCues) {
      const visualizer = visualizersByCue.get(sourceCueIndex);
      const receipt = receiptsByCue.get(sourceCueIndex);
      const card = cardsByCue.get(sourceCueIndex);
      const expectedManifest = manifestById.get(segment.visualizer_id);
      assert.ok(expectedManifest, `${file} cue ${sourceCueIndex}: requested manifest ID exists`);
      assert.ok(visualizer && receipt && card, `${file} cue ${sourceCueIndex}: cue is represented end-to-end`);
      assert.equal(visualizer.requestedSourceId, segment.visualizer_id, `${file} cue ${sourceCueIndex}: requested ID retained`);
      assert.equal(visualizer.sourceId, segment.visualizer_id, `${file} cue ${sourceCueIndex}: no duplicate-title substitution`);
      assert.equal(visualizer.manifestResolution.status, "exact-id", `${file} cue ${sourceCueIndex}: exact ID resolution`);
      assert.equal(visualizer.manifestResolution.fallbackUsed, false, `${file} cue ${sourceCueIndex}: no fallback`);
      assert.equal(receipt.resolvedSourceId, segment.visualizer_id, `${file} cue ${sourceCueIndex}: receipt records exact resolved ID`);
      assert.equal(card.visualization.sourceId, segment.visualizer_id, `${file} cue ${sourceCueIndex}: compiled ID retained`);
      assert.equal(card.visualization.fallbackReceipt, null, `${file} cue ${sourceCueIndex}: no silent fallback receipt`);
      assert.deepEqual([card.startSeconds, card.endSeconds], window, `${file} cue ${sourceCueIndex}: clipped timing retained`);
      if (expectedManifest.directorEligible === false) {
        assert.equal(card.eligibilityStatus, "source-cue-override", `${file} cue ${sourceCueIndex}: ineligible request is explicit`);
        assert.equal(card.executionStatus, "executable-source-cue-override", `${file} cue ${sourceCueIndex}: override execution is explicit`);
        totals.sourceCueOverrides += 1;
      } else {
        assert.equal(card.eligibilityStatus, "eligible", `${file} cue ${sourceCueIndex}: eligible request remains eligible`);
        assert.equal(card.executionStatus, "executable", `${file} cue ${sourceCueIndex}: eligible request executes`);
      }

      totals.sourceDuration += window[1] - window[0];
      totals.cardDuration += card.endSeconds - card.startSeconds;
      totals.exactIds += 1;
      totals.silentFallbacks += Number(visualizer.manifestResolution.fallbackUsed);
      totals.endClips += Number(Number(segment.end_sec) > duration && window[1] === duration);
    }

    assert.ok(maxExecutableConcurrency(cards) <= DEFAULT_VARIANT_RECIPES["visualizer-forward"].maxVisualizerLayers, `${file}: simultaneous layer cap is respected`);
    totals.sourceCues += sourceCues.length;
    totals.treatmentCues += result.treatment.visualizers.length;
    totals.receipts += result.treatment.visualizerReceipts.length;
    totals.cards += cards.length;
    totals.rejectedCards += cards.filter((card) => !card.executionStatus.startsWith("executable")).length;
  }

  assert.deepEqual({
    projects: files.length,
    sourceCues: totals.sourceCues,
    treatmentCues: totals.treatmentCues,
    receipts: totals.receipts,
    cards: totals.cards,
    exactIds: totals.exactIds,
    silentFallbacks: totals.silentFallbacks,
    sourceCueOverrides: totals.sourceCueOverrides,
    rejectedCards: totals.rejectedCards,
    endClips: totals.endClips,
    sourceDuration: round2(totals.sourceDuration),
    cardDuration: round2(totals.cardDuration),
  }, {
    projects: 79,
    sourceCues: 791,
    treatmentCues: 791,
    receipts: 791,
    cards: 791,
    exactIds: 791,
    silentFallbacks: 0,
    sourceCueOverrides: 12,
    rejectedCards: 0,
    endClips: 27,
    sourceDuration: 17_035.08,
    cardDuration: 17_035.08,
  });
});
