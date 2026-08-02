import test from "node:test";
import assert from "node:assert/strict";

import {
  auditEchoVideoEnrichments,
  auditIntentionalDirectorVariants,
  buildSourceBiasFeedback,
} from "../src/domain/echo-enrichment-audit.js";

const hash = "a".repeat(64);
const id = `hapa-media:sha256:${hash}`;

function enrichment(overrides = {}) {
  return {
    schemaVersion: "hapa.echo.video-enrichment.v1",
    id,
    contentHash: { algorithm: "sha256", value: hash },
    runtimeUri: "/media/a.mp4",
    recognition: {
      frames: ["first", "mid", "last"].map((marker) => ({ marker, evaluationStatus: "ready", available: true })),
      synopsis: "A figure crosses a luminous garden.",
      arcSynopsis: "Stillness becomes motion and resolves at a gate.",
      tags: [{ tag: "place:garden" }],
    },
    quality: { score: 87, percentile: 94 },
    sourcePrior: { sourceClass: "verified-ordinary", prior: 1 },
    flow: {
      loop: { classification: "loop-candidate" },
      transition: { classification: "transition" },
    },
    ...overrides,
  };
}

test("video audit proves three-frame, synopsis, score, flow, and chain completeness", () => {
  const row = enrichment();
  const result = auditEchoVideoEnrichments({
    manifest: [{ id }],
    enrichments: [row],
    chainEdges: [{ id: "edge:a:a", sourceVideoId: id, targetVideoId: id, score: 0.8 }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.totals.enrichmentRows, 1);
  assert.equal(result.totals.classifiedLoops, 1);
  assert.equal(result.totals.classifiedTransitions, 1);
});

test("video audit fails closed on a missing middle evaluation and quality score", () => {
  const row = enrichment({
    recognition: { synopsis: "Start.", arcSynopsis: "End.", tags: ["place:garden"], frames: [{ marker: "first" }, { marker: "last" }] },
    quality: {},
  });
  const result = auditEchoVideoEnrichments({ manifest: [{ id }], enrichments: [row] });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.code === "missing-mid-frame-evaluation"));
  assert.ok(result.blockers.some((item) => item.code === "invalid-quality-score"));
});

test("video audit blocks unavailable decoded frames but accepts explicit source-corrupt quarantine evidence", () => {
  const decodedGap = enrichment({
    decodeStatus: "decoded",
    recognition: {
      synopsis: "Start.",
      arcSynopsis: "End.",
      tags: ["place:garden"],
      frames: ["first", "mid", "last"].map((marker) => ({
        marker,
        evaluationStatus: marker === "mid" ? "unavailable" : "ready",
        available: marker !== "mid",
        unavailableReason: marker === "mid" ? "frame-extraction-failed" : null,
      })),
    },
  });
  const failed = auditEchoVideoEnrichments({ manifest: [{ id }], enrichments: [decodedGap] });
  assert.equal(failed.ok, false);
  assert.ok(failed.blockers.some((item) => item.code === "decoded-video-frame-evaluation-unavailable"));

  const corrupt = enrichment({
    decodeStatus: "decode-failed",
    playable: false,
    recognition: {
      synopsis: "Source bytes cannot be decoded.",
      arcSynopsis: "No visual arc can be claimed from malformed source bytes.",
      tags: ["status:source-corrupt"],
      frames: ["first", "mid", "last"].map((marker) => ({
        marker,
        evaluationStatus: "unavailable",
        available: false,
        unavailableReason: "video-decode-failed",
      })),
    },
  });
  const quarantined = auditEchoVideoEnrichments({ manifest: [{ id }], enrichments: [corrupt] });
  assert.equal(quarantined.ok, true);
  assert.equal(quarantined.totals.sourceCorruptVideos, 1);
  assert.ok(quarantined.warnings.some((item) => item.code === "source-corrupt-video-quarantined"));
});

test("video audit requires a frame citation for every visual Reference affinity claim", () => {
  const row = enrichment({
    semantic: {
      references: [{
        cardId: "reference:uncited",
        truthStatus: "textual-visual-affinity-pending-review",
        supportingFrameIds: [],
      }],
    },
  });
  const result = auditEchoVideoEnrichments({ manifest: [{ id }], enrichments: [row] });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.code === "visual-reference-affinity-missing-frame-citation"));
  const downgraded = auditEchoVideoEnrichments({
    manifest: [{ id }],
    enrichments: [{
      ...row,
      semantic: {
        references: [{
          cardId: "reference:uncited",
          truthStatus: "textual-affinity-without-frame-citation-pending-review",
          supportingFrameIds: [],
        }],
      },
    }],
  });
  assert.equal(downgraded.ok, true);
});

test("source feedback keeps intrinsic score independent and reports low-prior rescues", () => {
  const low = enrichment({ sourcePrior: { sourceClass: "hapa-dev-proto", prior: 0.1 }, quality: { score: 91, percentile: 96 } });
  const ordinaryId = `hapa-media:sha256:${"b".repeat(64)}`;
  const ordinary = enrichment({ id: ordinaryId, contentHash: { algorithm: "sha256", value: "b".repeat(64) }, quality: { score: 70, percentile: 55 } });
  const result = buildSourceBiasFeedback({ enrichments: [low, ordinary], selections: [
    { mediaId: id, selectionKind: "post-prior" },
    { mediaId: ordinaryId, selectionKind: "intrinsic-counterfactual" },
  ] });
  assert.equal(result.intrinsicQualityIndependentOfSourcePrior, true);
  assert.equal(result.totals.rescueCases, 1);
  assert.equal(result.groups.find((group) => group.sourceClass === "hapa-dev-proto").postPriorDirectorSelections, 1);
  assert.equal(result.groups.find((group) => group.sourceClass === "verified-ordinary").intrinsicCounterfactualSelections, 1);
});

test("intentional cut audit requires exactly one fully explained enrichment-backed cut per song", () => {
  const song = { id: "song-a" };
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-a",
    parent: { songId: "song-a" },
    enrichmentLineage: { runId: "run-a" },
    timeline: [{
      decision_evidence: {
        schemaVersion: "hapa.echo.shot-decision-evidence.v4",
        selectedMediaId: id,
        lyricCitation: { status: "timed-lyric", text: "Dear Papa" },
        rationale: "The garden image answers the lyric's return-home motif.",
      },
    }],
  };
  const result = auditIntentionalDirectorVariants({ songs: [song], variants: [variant], enrichmentIds: [id] });
  assert.equal(result.ok, true);

  const duplicate = auditIntentionalDirectorVariants({ songs: [song], variants: [variant, { ...variant, id: "intentional-b" }], enrichmentIds: [id] });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.blockers.some((item) => item.code === "intentional-cut-count-not-one"));
});

test("intentional cut audit accepts the compiler's canonical lineage, enrichment identity, and explicit lyrics-unavailable evidence", () => {
  const legacyMediaId = "legacy-media-card-a";
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-current-shape",
    parent: { songId: "song-a" },
    lineage: { kind: "append-only-intentional-enrichment" },
    timeline: [{
      decision_evidence: {
        schemaVersion: "hapa.echo.shot-decision-evidence.v4",
        selectedMediaId: legacyMediaId,
        enrichmentId: id,
        lyrics: { status: "unavailable", explicitLyricsUnavailable: true, citation: null },
        rationale: "The selected visual supplies the section's documented atmospheric beat.",
      },
    }],
  };
  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [variant],
    enrichmentIds: [id],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.blockers, []);
});

test("intentional cut audit rejects overstated zero-affinity canonical story evidence", () => {
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-overstated-story",
    parent: { songId: "song-a" },
    lineage: { kind: "append-only-intentional-enrichment" },
    timeline: [{
      decision_evidence: {
        schemaVersion: "hapa.echo.shot-decision-evidence.v4",
        selectedMediaId: id,
        enrichmentId: id,
        lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true, citation: null },
        story: { status: "canonical-story-beat", ids: ["unrelated"], summary: "Unrelated protocol.", affinity: 0 },
        rationale: "Mechanical claim.",
      },
    }],
  };
  const result = auditIntentionalDirectorVariants({ songs: [{ id: "song-a" }], variants: [variant], enrichmentIds: [id] });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.code === "shot-evidence-overstated-story-affinity"));
});

test("intentional cut audit never accepts soft-canon authority as a canonical story match", () => {
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-soft-as-canonical",
    parent: { songId: "song-a" },
    lineage: { kind: "append-only-intentional-enrichment" },
    timeline: [{
      decision_evidence: {
        schemaVersion: "hapa.echo.shot-decision-evidence.v4",
        selectedMediaId: id,
        enrichmentId: id,
        lyrics: { status: "time-overlap", citation: { text: "Moon door" } },
        story: {
          status: "canonical-story-beat-match",
          ids: ["soft-beat"],
          summary: "Moon door carries the letter.",
          affinity: 0.8,
          authority: "soft-canon-association",
          softCanon: true,
          overlapTokens: ["moon", "door"],
        },
        rationale: "False authority claim.",
      },
    }],
  };
  const result = auditIntentionalDirectorVariants({ songs: [{ id: "song-a" }], variants: [variant], enrichmentIds: [id] });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.code === "shot-evidence-overstated-story-affinity"));
});

test("intentional cut audit rejects an enriched identity that is quarantined from playback", () => {
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-unplayable",
    parent: { songId: "song-a" },
    lineage: { kind: "append-only-intentional-enrichment" },
    timeline: [{
      decision_evidence: {
        schemaVersion: "hapa.echo.shot-decision-evidence.v4",
        selectedMediaId: id,
        enrichmentId: id,
        lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true },
        rationale: "A quarantined source must fail closed.",
      },
    }],
  };
  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [variant],
    enrichmentIds: [id],
    playableEnrichmentIds: [`hapa-media:sha256:${"b".repeat(64)}`],
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.code === "shot-media-not-playable"));
});

test("intentional cut audit fails closed when the supplied playability universe is empty", () => {
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-zero-playable",
    parent: { songId: "song-a" },
    lineage: { kind: "append-only-intentional-enrichment" },
    timeline: [{
      decision_evidence: {
        schemaVersion: "hapa.echo.shot-decision-evidence.v4",
        selectedMediaId: id,
        enrichmentId: id,
        lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true },
        rationale: "A catalog with no playable videos must quarantine every selected cut.",
      },
    }],
  };
  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [variant],
    enrichmentIds: [id],
    playableEnrichmentIds: [],
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.code === "shot-media-not-playable"));
});

test("intentional cut audit preserves legacy behavior only when playability was truly omitted", () => {
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-playability-unspecified",
    parent: { songId: "song-a" },
    lineage: { kind: "append-only-intentional-enrichment" },
    timeline: [{
      decision_evidence: {
        schemaVersion: "hapa.echo.shot-decision-evidence.v4",
        selectedMediaId: id,
        enrichmentId: id,
        lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true },
        rationale: "Compatibility callers may omit a playability universe they cannot project.",
      },
    }],
  };
  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [variant],
    enrichmentIds: [id],
  });

  assert.equal(result.ok, true);
  assert.equal(result.blockers.some((item) => item.code === "shot-media-not-playable"), false);
});

test("intentional cut audit requires a directly persisted source-neutral counterfactual", () => {
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-counterfactual-missing",
    parent: { songId: "song-a" },
    lineage: { kind: "append-only-intentional-enrichment" },
    timeline: [{
      decision_evidence: {
        schemaVersion: "hapa.echo.shot-decision-evidence.v4",
        truthStatus: "intentional-enrichment-backed",
        selectedMediaId: id,
        enrichmentId: id,
        lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true },
        selectedCandidate: {
          mediaId: id,
          title: "Garden",
          observedSynopsis: "A luminous garden opens.",
          score: { lyricAffinity: 0, canonAffinity: 0, objectActionAffinity: 0, emotionAffinity: 0 },
        },
        rationale: "Garden supplies observed luminous imagery.",
      },
    }],
  };
  const result = auditIntentionalDirectorVariants({ songs: [{ id: "song-a" }], variants: [variant], enrichmentIds: [id] });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((item) => item.code === "source-bias-counterfactual-missing-direct-evidence"));
});
