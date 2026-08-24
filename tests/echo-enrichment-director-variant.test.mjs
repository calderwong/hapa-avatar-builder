import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ECHO_ASSET_CAMERA_FRAMING_SCHEMA,
  ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
  ECHO_INFERRED_TRANSITION_MIN_CONTEXT_AFFINITY,
  buildEchoAuthoredTransitionTimeMap,
  buildEchoVideoEnrichmentCatalog,
  compileEchoEnrichmentDirectorVariant,
  deriveEchoEnrichmentParentProject,
  echoDeclaredTransitionEndpointContractDigest,
  echoReferenceAnimationCatalogContractDigest,
  echoShotDirectionContractSnapshot,
  echoTransitionSelectionBalanceDigest,
  normalizeEchoVideoEnrichmentRow,
  selectLatestEnrichmentParentVariant,
  stableEchoEnrichmentStringify,
} from "../src/domain/echo-enrichment-director-variant.js";
import {
  applyExplicitTransitionSongAssignments,
  applyTransitionEndpointVisualValidation,
  runEnrichmentDirectorVariantPass,
  validateTransitionEndpointVisualValidation,
  validateExplicitTransitionSongAssignments,
} from "../scripts/append-enrichment-director-variants.mjs";
import { applyMultitrackOperation, projectToEditorGraph } from "../src/domain/multitrack-editor.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseProject(songId = "song-fixture") {
  return {
    song_id: songId,
    song_title: "Fixture Song",
    duration: 8,
    audio_uri: "/media/audio.mp3",
    stems_available: ["Vocals", "Drums"],
    lyrics_enabled: true,
    timed_lyrics: [
      { id: "lyric-1", start: 0, end: 4, text: "Moon door carries the letter" },
      { id: "lyric-2", start: 4, end: 8, text: "River sail returns us home" },
    ],
    persistent_shader_slots: [{ id: "always-1", enabled: true, shader_id: "UltimateFlame", track_id: "main" }],
    visualizer_timeline: [{ start_sec: 0, end_sec: 8, visualizer_id: "simple-wave", transition: "cut" }],
    timeline: [
      {
        section_id: "verse-1",
        section_label: "Verse 1",
        section_type: "verse",
        shot_index: 0,
        start_sec: 0,
        end_sec: 4,
        transition: "fade-in",
        camera_motion: "pan-down",
        camera_intensity: 1.2,
        camera_speed: 1.4,
        camera_focus: "center",
        active_stems: ["Vocals"],
        audio_bindings: [{ source: "vocals_stem_energy", target: "vibe_intensity", curve: "linear" }],
        shader_cue: { id: "flame-a", mix: 0.8 },
        media_id: "parent-a",
        media_title: "Parent A",
        media_uri: "/media/parent-a.mp4",
        runtime_media_uri: "/media/parent-a.mp4",
        media_source_group: "unknown",
        media_technical_identity: "sha256:a".padEnd(71, "a"),
        media_contract: {
          schemaVersion: "hapa.echo.playback-media.v2",
          type: "video",
          originalUri: "/media/parent-a.mp4",
          runtimeUri: "/media/parent-a.mp4",
          playbackMode: "loop",
        },
      },
      {
        section_id: "verse-2",
        section_label: "Verse 2",
        section_type: "verse",
        shot_index: 1,
        start_sec: 4,
        end_sec: 8,
        transition: "crossfade",
        camera_motion: "pan-up",
        camera_intensity: 1.5,
        camera_speed: 1.8,
        camera_focus: "top-center",
        active_stems: ["Vocals", "Drums"],
        audio_bindings: [{ source: "drums_stem_energy", target: "cut_density", curve: "ease-out" }],
        shader_cue: { id: "flame-b", mix: 0.9 },
        media_id: "parent-b",
        media_title: "Parent B",
        media_uri: "/media/parent-b.mp4",
        runtime_media_uri: "/media/parent-b.mp4",
        media_source_group: "unknown",
        media_technical_identity: "sha256:b".padEnd(71, "b"),
        media_contract: {
          schemaVersion: "hapa.echo.playback-media.v2",
          type: "video",
          originalUri: "/media/parent-b.mp4",
          runtimeUri: "/media/parent-b.mp4",
          playbackMode: "loop",
        },
      },
    ],
  };
}

function parentVariant(project = baseProject()) {
  return {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "newest-modern-cut",
    title: "Newest Modern Cut",
    status: "ready",
    createdAt: "2026-07-31T12:00:00.000Z",
    updatedAt: "2026-07-31T12:00:00.000Z",
    parent: { songId: project.song_id, projectSha256: "f".repeat(64), immutableLegacyProject: true },
    timeline: clone(project.timeline),
    visualizer_timeline: clone(project.visualizer_timeline),
    persistent_shader_slots: clone(project.persistent_shader_slots),
    project_patch: {
      persistent_shader_slots: clone(project.persistent_shader_slots),
      lyrics_enabled: true,
    },
  };
}

function songCard(songId = "song-fixture") {
  return {
    id: songId,
    cardId: songId,
    title: "Fixture Song",
    lyricTimings: [
      { id: "lyric-1", start: 0, end: 4, text: "Moon door carries the letter" },
      { id: "lyric-2", start: 4, end: 8, text: "River sail returns us home" },
    ],
    storyBeats: [
      { id: "beat-door", summary: "Carry the family letter through the moon door." },
      { id: "beat-river", summary: "Sail the memory river toward home." },
    ],
    lore: { summary: "A family letter crosses a moonlit river.", mood: "luminous, protective, returning" },
    tags: ["moon", "letter", "river", "home"],
  };
}

function enrichmentRows() {
  return [
    {
      schemaVersion: "hapa.echo.video-enrichment.v1",
      mediaId: `hapa-media:sha256:${"1".repeat(64)}`,
      contentHash: { algorithm: "sha256", value: "1".repeat(64) },
      title: "Moon Door Letter",
      runtimeUri: "/media/moon-door.mp4",
      mediaContract: {
        schemaVersion: "hapa.echo.playback-media.v2",
        type: "video",
        originalUri: "/media/moon-door.mp4",
        runtimeUri: "/media/moon-door.mp4",
        sourceInSeconds: 0.25,
        sourceOutSeconds: 5.75,
        playbackMode: "loop",
      },
      recognition: {
        synopsis: "A luminous moon door opens while a hand carries a family letter.",
        tags: [{ tag: "motif:moon" }, { tag: "object:letter" }],
      },
      quality: { score: 91 },
      provenance: [{ source: "operator-attachment", verifiedAttachment: true }],
    },
    {
      schemaVersion: "hapa.echo.video-enrichment.v1",
      mediaId: `hapa-media:sha256:${"2".repeat(64)}`,
      contentHash: { algorithm: "sha256", value: "2".repeat(64) },
      title: "River Sail Home",
      runtimeUri: "/media/river-sail.mp4",
      recognition: { synopsis: "A vessel sails a memory river and returns home." },
      quality: { score: 88 },
      provenance: [{ source: "verified-source-file", verifiedSource: true }],
    },
    {
      schemaVersion: "hapa.echo.video-enrichment.v1",
      mediaId: `hapa-media:sha256:${"3".repeat(64)}`,
      contentHash: { algorithm: "sha256", value: "3".repeat(64) },
      title: "LTX Moon Door",
      runtimeUri: "/media/ltx-moon-door.mp4",
      recognition: { synopsis: "A perfect moon door carries the letter toward home." },
      quality: { score: 100 },
      provenance: [{ source: "LTX v2.3" }],
    },
  ];
}

function ordinaryMotionRow(hex = "4") {
  const row = clone(enrichmentRows()[0]);
  row.mediaId = bridgeMediaId(hex);
  row.contentHash = { algorithm: "sha256", value: hex.repeat(64) };
  row.runtimeUri = `/media/${hex}-ordinary-motion.mp4`;
  row.mediaContract = {
    ...row.mediaContract,
    originalUri: row.runtimeUri,
    runtimeUri: row.runtimeUri,
  };
  return row;
}

function chainGraph() {
  return {
    schemaVersion: "hapa.echo.video-chain-graph.v1",
    candidates: [{
      sourceVideoId: `hapa-media:sha256:${"1".repeat(64)}`,
      targetVideoId: `hapa-media:sha256:${"2".repeat(64)}`,
      score: 0.93,
    }],
  };
}

function bridgeMediaId(hex) {
  return `hapa-media:sha256:${hex.repeat(64)}`;
}

function mediaIdShaForTest(mediaId) {
  return String(mediaId).split(":").at(-1);
}

function bridgeEndpoint({ cardId, cardTitle, uri, hex, dimensions = { width: 720, height: 1280 } }) {
  return {
    cardId,
    cardRevisionId: `${cardId}:revision-1`,
    cardTitle,
    assetId: `${cardId}:asset-1`,
    frameId: `${cardId}:frame-1`,
    sha256: `sha256:${hex.repeat(64)}`,
    uri,
    imageDimensions: dimensions,
    reviewStatus: "approved",
    sourceCardUnchanged: true,
  };
}

function referenceLoopRow({ hex, cardId, title, posterUri, quality = 96 }) {
  const mediaId = bridgeMediaId(hex);
  return {
    schemaVersion: "hapa.echo.video-enrichment.v1",
    mediaId,
    contentHash: { algorithm: "sha256", value: hex.repeat(64) },
    title,
    runtimeUri: `/media/${hex}-reference-loop.mp4`,
    thumbnailUri: posterUri,
    mediaContract: {
      schemaVersion: "hapa.echo.playback-media.v2",
      type: "video",
      originalUri: `/media/${hex}-reference-loop.mp4`,
      runtimeUri: `/media/${hex}-reference-loop.mp4`,
      playbackMode: "loop",
      dimensions: { width: 720, height: 1280 },
    },
    recognition: { synopsis: `${title} holds the exact Reference composition with subtle ambient motion.` },
    semantic: { references: [{ cardId, cardTitle: title }] },
    flow: {
      loop: { eligible: true, classification: "loop", score: 0.97 },
      transition: {
        eligible: false,
        classification: "not-transition",
        components: {
          directedStateChange: { score: 0.04 },
          endpointDistinctness: { score: 0.03 },
        },
      },
    },
    quality: { score: quality },
    provenance: [{ source: "approved-reference", approvedReference: true }],
  };
}

function authoredTransitionRow({
  hex,
  jobId,
  first,
  last,
  quality = 35,
  songIds = [],
}) {
  const mediaId = bridgeMediaId(hex);
  return {
    schemaVersion: "hapa.echo.video-enrichment.v1",
    mediaId,
    contentHash: { algorithm: "sha256", value: hex.repeat(64) },
    title: `${first.cardTitle} to ${last.cardTitle} authored transition`,
    runtimeUri: `/media/${hex}-authored-transition.mp4`,
    mediaContract: {
      schemaVersion: "hapa.echo.playback-media.v2",
      type: "video",
      originalUri: `/media/${hex}-authored-transition.mp4`,
      runtimeUri: `/media/${hex}-authored-transition.mp4`,
      playbackMode: "loop",
      actualDurationSeconds: 5.083333,
      frameCount: 122,
      fps: 24,
      sourceInSeconds: 0,
      sourceOutSeconds: 5.041667,
      dimensions: { width: 1080, height: 1080 },
    },
    technical: { width: 1080, height: 1080 },
    recognition: { synopsis: `${first.cardTitle} transforms with decisive motion into ${last.cardTitle}.` },
    flow: {
      loop: { eligible: false, classification: "not-loop", score: 0.08 },
      transition: {
        eligible: true,
        classification: "declared-transition",
        declaredTransition: true,
        visuallyValidated: true,
        visualValidationDecision: "certified",
        score: 0.94,
        components: {
          directedStateChange: { score: 0.96 },
          endpointDistinctness: { score: 0.91 },
        },
        declaredEndpoints: {
          first,
          last,
          link: { id: jobId, mediaId },
        },
        truthBoundary: "Authored endpoint lineage is declared; frame similarity remains measured evidence.",
      },
    },
    songIds,
    quality: { score: quality },
    provenance: [{ source: "vibes-transition", verifiedSource: true }],
  };
}

function declaredTransitionGraph(transitions) {
  return {
    schemaVersion: "hapa.echo.video-chain-graph.v1",
    edges: [],
    declaredTransitions: transitions.map(({ row, first, last, jobId }) => ({
      transitionMediaId: row.mediaId,
      classification: "declared-transition",
      visuallyValidated: true,
      truthBoundary: "Declared Reference endpoints with locally verified playback media.",
      sourceFrame: first,
      targetFrame: last,
      transitionLink: { id: jobId, mediaId: row.mediaId },
    })),
  };
}

function bridgeFixture(songId = "song-motion-bridge") {
  const first = bridgeEndpoint({
    cardId: "reference-card:a",
    cardTitle: "Moon Door A",
    uri: "/reference-frames/moon-door-a.png",
    hex: "1",
  });
  const last = bridgeEndpoint({
    cardId: "reference-card:b",
    cardTitle: "River Home B",
    uri: "/reference-frames/river-home-b.png",
    hex: "2",
  });
  const entry = referenceLoopRow({
    hex: "a",
    cardId: first.cardId,
    title: first.cardTitle,
    posterUri: first.uri,
    quality: 98,
  });
  const exit = referenceLoopRow({
    hex: "b",
    cardId: last.cardId,
    title: last.cardTitle,
    posterUri: last.uri,
    quality: 96,
  });
  const transition = authoredTransitionRow({
    hex: "c",
    jobId: "vibes-job-a-to-b",
    first,
    last,
    quality: 35,
    songIds: [songId],
  });
  return {
    first,
    last,
    entry,
    transition,
    exit,
    rows: [entry, transition, exit],
    graph: declaredTransitionGraph([{
      row: transition,
      first,
      last,
      jobId: "vibes-job-a-to-b",
    }]),
  };
}

function referenceAnimationCatalogForGraph(graph) {
  const recordsByCard = new Map();
  for (const declaration of graph.declaredTransitions || []) {
    for (const endpoint of [declaration.sourceFrame, declaration.targetFrame]) {
      recordsByCard.set(endpoint.cardId, {
        card: { id: endpoint.cardId, revisionId: endpoint.cardRevisionId },
        artifacts: {
          image: {
            uri: endpoint.uri,
            sha256: String(endpoint.sha256).replace(/^sha256:/u, ""),
            dimensions: clone(endpoint.imageDimensions),
          },
        },
      });
    }
  }
  return {
    schemaVersion: "hapa.echo-reference-animated-media-catalog.v1",
    sourceManifestHash: `sha256:${"f".repeat(64)}`,
    records: [...recordsByCard.values()],
  };
}

function verifiedBridgeCatalog({ rows, graph, report = {} }) {
  const referenceAnimationCatalog = referenceAnimationCatalogForGraph(graph);
  const certifiedJobIds = graph.declaredTransitions.map((entry) => entry.transitionLink.id).sort();
  const rowByJobId = new Map(rows.map((row) => [transitionJobIdForTest(row), row]));
  const transitionEndpointValidation = {
    schemaVersion: "hapa.echo.transition-endpoint-file-validation.v1",
    verified: true,
    endpointRecords: graph.declaredTransitions.length * 2,
    declaredEndpointContractDigest: echoDeclaredTransitionEndpointContractDigest(graph),
    referenceCatalogContractDigest: echoReferenceAnimationCatalogContractDigest(referenceAnimationCatalog),
    visualValidation: {
      schemaVersion: "hapa.echo.transition-endpoint-visual-validation-receipt.v1",
      verified: true,
      totalJobs: certifiedJobIds.length,
      certifiedJobs: certifiedJobIds.length,
      quarantinedJobs: 0,
      sourceSchemaVersion: "hapa.echo.transition-endpoint-visual-validation.v1",
      resultDigestSha256: "e".repeat(64),
      certifiedJobIds,
      jobs: certifiedJobIds.map((jobId) => {
        const row = rowByJobId.get(jobId);
        return {
          jobId,
          mediaId: row.mediaId,
          decision: "certified",
          video: { actualSha256: mediaIdShaForTest(row.mediaId) },
          endpoints: {
            first: { frameIndex: 0, sourceTimeSeconds: 0 },
            last: { frameIndex: 121, sourceTimeSeconds: 5.041667 },
          },
        };
      }),
    },
    visualMediaFiles: {
      schemaVersion: "hapa.echo.transition-visual-media-file-validation.v1",
      verified: true,
      files: certifiedJobIds.length,
      ledgerDigestSha256: "f".repeat(64),
    },
  };
  return buildEchoVideoEnrichmentCatalog({
    enrichments: rows,
    chainGraph: graph,
    report,
    transitionEndpointValidation,
    referenceAnimationCatalog,
  });
}

function sha256Stable(value) {
  return createHash("sha256").update(stableEchoEnrichmentStringify(value)).digest("hex");
}

function visualValidationFixture() {
  const first = bridgeFixture("song-visual-validation");
  const quarantinedTransition = authoredTransitionRow({
    hex: "d",
    jobId: "vibes-job-quarantined",
    first: first.first,
    last: first.last,
    songIds: ["stale-song-hint"],
  });
  quarantinedTransition.transitionAssignment = {
    schemaVersion: "hapa.echo.transition-song-assignment.v1",
    jobId: "vibes-job-quarantined",
    songIds: ["stale-song-hint"],
    source: "stale-fixture",
  };
  const graph = declaredTransitionGraph([
    {
      row: first.transition,
      first: first.first,
      last: first.last,
      jobId: "vibes-job-a-to-b",
    },
    {
      row: quarantinedTransition,
      first: first.first,
      last: first.last,
      jobId: "vibes-job-quarantined",
    },
  ]);
  const rawEnrichments = [first.entry, first.transition, quarantinedTransition, first.exit];
  const digests = {
    chainGraphSha256: "1".repeat(64),
    enrichmentsSha256: "2".repeat(64),
    referenceAnimationCatalogSha256: "3".repeat(64),
  };
  const certifiedMetrics = {
    ssim: 0.978321,
    pHashDistance: 2,
    edgeCorrelation: 0.951234,
  };
  const divergentMetrics = {
    ssim: 0.187514,
    pHashDistance: 20,
    edgeCorrelation: 0.146596,
  };
  const jobs = [
    {
      jobId: "vibes-job-a-to-b",
      mediaId: first.transition.mediaId,
      decision: "certified",
      video: {
        actualSha256: mediaIdShaForTest(first.transition.mediaId),
        frameCount: 122,
        durationSeconds: 5.083333,
        fps: 24,
      },
      endpoints: {
        first: {
          decodedFrame: { frameIndex: 0, nominalAtSeconds: 0 },
          sourceTiming: {
            contractId: "physical-terminal-frame-presentation-pts-v1",
            presentationPtsSeconds: 0,
            authoredSourceSeconds: 0,
          },
          decision: "certified",
          metrics: certifiedMetrics,
          declaredReferenceCardId: first.first.cardId,
          declaredReferenceSha256: first.first.sha256,
        },
        last: {
          decodedFrame: { frameIndex: 121, nominalAtSeconds: 5.041667 },
          sourceTiming: {
            contractId: "physical-terminal-frame-presentation-pts-v1",
            presentationPtsSeconds: 5.041667,
            authoredSourceSeconds: 5.041667,
          },
          decision: "certified",
          metrics: { ...certifiedMetrics, ssim: 0.969123 },
          declaredReferenceCardId: first.last.cardId,
          declaredReferenceSha256: first.last.sha256,
        },
      },
      runtimeUri: first.transition.runtimeUri,
    },
    {
      jobId: "vibes-job-quarantined",
      mediaId: quarantinedTransition.mediaId,
      decision: "quarantined",
      video: {
        actualSha256: mediaIdShaForTest(quarantinedTransition.mediaId),
        frameCount: 122,
        durationSeconds: 5.083333,
        fps: 24,
      },
      endpoints: {
        first: {
          decodedFrame: { frameIndex: 0, nominalAtSeconds: 0 },
          sourceTiming: {
            contractId: "physical-terminal-frame-presentation-pts-v1",
            presentationPtsSeconds: 0,
            authoredSourceSeconds: 0,
          },
          decision: "certified",
          metrics: certifiedMetrics,
          declaredReferenceCardId: first.first.cardId,
          declaredReferenceSha256: first.first.sha256,
        },
        last: {
          decodedFrame: { frameIndex: 121, nominalAtSeconds: 5.041667 },
          sourceTiming: {
            contractId: "physical-terminal-frame-presentation-pts-v1",
            presentationPtsSeconds: 5.041667,
            authoredSourceSeconds: 5.041667,
          },
          decision: "quarantined",
          metrics: divergentMetrics,
          declaredReferenceCardId: first.last.cardId,
          declaredReferenceSha256: first.last.sha256,
        },
      },
      runtimeUri: quarantinedTransition.runtimeUri,
    },
  ];
  const validationReport = {
    schemaVersion: "hapa.echo.transition-endpoint-visual-validation.v1",
    algorithm: {
      id: "center-crop-luma-ssim-phash-edge-v3-physical-terminal-pts",
      sourceSampleContract: {
        id: "physical-terminal-frame-presentation-pts-v1",
      },
      thresholds: {
        ssimMin: 0.9,
        pHashDistanceMax: 10,
        edgeCorrelationMin: 0.75,
      },
      canonicalization: "recursive-lexicographic-json-keys-v1",
    },
    inputs: {
      chainGraph: { sha256: digests.chainGraphSha256 },
      enrichments: { sha256: digests.enrichmentsSha256 },
      referenceCatalog: { sha256: digests.referenceAnimationCatalogSha256 },
      declaredTransitionCount: 2,
      endpointCount: 4,
    },
    aggregate: {
      declaredTransitionCount: 2,
      endpointCount: 4,
      certifiedJobs: 1,
      quarantinedJobs: 1,
      certifiedEndpoints: 3,
      quarantinedEndpoints: 1,
      quarantinedJobIds: ["vibes-job-quarantined"],
    },
    jobs,
  };
  validationReport.resultDigestSha256 = sha256Stable(validationReport);
  return {
    ...first,
    quarantinedTransition,
    rawEnrichments,
    graph,
    digests,
    validationReport,
  };
}

function resignVisualValidationReport(report) {
  const next = clone(report);
  delete next.resultDigestSha256;
  next.resultDigestSha256 = sha256Stable(next);
  return next;
}

function transitionJobIdForTest(row = {}) {
  return row.flow?.transition?.declaredEndpoints?.link?.id
    || row.continuity?.transition?.declaredEndpoints?.link?.id
    || row.transition?.declaredEndpoints?.link?.id
    || "";
}

function projectWithShotCount(songId, shotCount) {
  const project = baseProject(songId);
  project.duration = shotCount * 2;
  project.timeline = Array.from({ length: shotCount }, (_, index) => ({
    ...clone(project.timeline[index % project.timeline.length]),
    section_id: `bridge-section-${index + 1}`,
    section_label: index === 0 ? "Moon door" : index === shotCount - 1 ? "River home" : "Crossing",
    shot_index: index,
    start_sec: index * 2,
    end_sec: (index + 1) * 2,
  }));
  project.timed_lyrics = project.timeline.map((shot, index) => ({
    id: `bridge-lyric-${index + 1}`,
    start: shot.start_sec,
    end: shot.end_sec,
    text: index === 0 ? "Moon door carries the letter" : index === shotCount - 1 ? "River sail returns us home" : "The crossing becomes motion",
  }));
  project.visualizer_timeline = [{ start_sec: 0, end_sec: project.duration, visualizer_id: "simple-wave", transition: "cut" }];
  return project;
}

test("normalizes the pipeline schema and applies the exact shared source-prior policy", () => {
  const [attachment, , ltx] = enrichmentRows().map(normalizeEchoVideoEnrichmentRow);
  assert.equal(attachment.uri, "/media/moon-door.mp4");
  assert.equal(attachment.technicalIdentity, `sha256:${"1".repeat(64)}`);
  assert.equal(attachment.qualityScore, 0.91);
  assert.equal(attachment.sourcePrior, 1.1);
  assert.equal(ltx.sourcePrior, 0.15);
  assert.equal(ltx.lowPrior, true);
  assert.ok(attachment.semanticText.some((entry) => /moon door/i.test(entry)));
});

test("normalizes authored motion endpoints and forces transition playback to once", () => {
  const fixture = bridgeFixture();
  const rawBefore = clone(fixture.transition);
  const normalized = normalizeEchoVideoEnrichmentRow(fixture.transition);

  assert.equal(normalized.motionRole.kind, "transition");
  assert.equal(normalized.motionRole.transition.eligible, true);
  assert.equal(normalized.motionRole.transition.declaredTransition, true);
  assert.equal(normalized.motionRole.transition.visuallyValidated, true);
  assert.equal(normalized.motionRole.transition.jobId, "vibes-job-a-to-b");
  assert.deepEqual(normalized.motionRole.transition.endpoints.first, {
    role: "first",
    cardId: fixture.first.cardId,
    cardRevisionId: fixture.first.cardRevisionId,
    cardTitle: fixture.first.cardTitle,
    assetId: fixture.first.assetId,
    frameId: fixture.first.frameId,
    sha256: "1".repeat(64),
    uri: fixture.first.uri,
    reviewStatus: "approved",
    sourceCardUnchanged: true,
  });
  assert.deepEqual(normalized.motionRole.transition.endpoints.last, {
    role: "last",
    cardId: fixture.last.cardId,
    cardRevisionId: fixture.last.cardRevisionId,
    cardTitle: fixture.last.cardTitle,
    assetId: fixture.last.assetId,
    frameId: fixture.last.frameId,
    sha256: "2".repeat(64),
    uri: fixture.last.uri,
    reviewStatus: "approved",
    sourceCardUnchanged: true,
  });
  assert.equal(normalized.mediaContract.playbackMode, "once");
  assert.equal(fixture.transition.mediaContract.playbackMode, "loop", "normalization mutated the source row");
  assert.deepEqual(fixture.transition, rawBefore);
});

test("catalog continuity resolves only the exact declared Reference entry and exit", () => {
  const fixture = bridgeFixture();
  const transitionWithoutInlineEndpoints = clone(fixture.transition);
  delete transitionWithoutInlineEndpoints.flow.transition.declaredEndpoints;
  const catalog = buildEchoVideoEnrichmentCatalog({
    enrichments: [fixture.entry, transitionWithoutInlineEndpoints, fixture.exit],
    chainGraph: fixture.graph,
    report: {},
  });
  const entry = catalog.find({ mediaId: fixture.entry.mediaId });
  const transition = catalog.find({ mediaId: fixture.transition.mediaId });
  const exit = catalog.find({ mediaId: fixture.exit.mediaId });
  const resolution = catalog.transitionResolution(transition);

  assert.equal(transition.motionRole.kind, "transition");
  assert.equal(transition.motionRole.transition.jobId, "vibes-job-a-to-b");
  assert.equal(transition.mediaContract.playbackMode, "once");
  assert.deepEqual(resolution.entryMediaIds, [fixture.entry.mediaId]);
  assert.deepEqual(resolution.exitMediaIds, [fixture.exit.mediaId]);
  assert.deepEqual(resolution.entryTechnicalIdentities, [`sha256:${"a".repeat(64)}`]);
  assert.deepEqual(resolution.exitTechnicalIdentities, [`sha256:${"b".repeat(64)}`]);
  assert.deepEqual(
    {
      mediaId: resolution.entryReferenceStill.mediaId,
      enrichmentId: resolution.entryReferenceStill.enrichmentId,
      uri: resolution.entryReferenceStill.uri,
      technicalIdentity: resolution.entryReferenceStill.technicalIdentity,
      contentHash: resolution.entryReferenceStill.mediaContract.contentHash,
      playbackMode: resolution.entryReferenceStill.mediaContract.playbackMode,
    },
    {
      mediaId: bridgeMediaId("1"),
      enrichmentId: `certified-reference-still:${"1".repeat(64)}`,
      uri: fixture.first.uri,
      technicalIdentity: `sha256:${"1".repeat(64)}`,
      contentHash: "1".repeat(64),
      playbackMode: "hold",
    },
  );
  assert.notEqual(
    resolution.entryReferenceStill.mediaId,
    fixture.entry.mediaId,
    "catalog incorrectly substituted adaptive-loop video bytes for the source Reference still",
  );
  assert.equal(resolution.endpointIdentityEvidence, "declared-card-lineage+poster-uri-match");
  assert.equal(resolution.first.sha256, "1".repeat(64), "the declared endpoint digest remains traceable evidence");
  assert.equal(resolution.last.sha256, "2".repeat(64), "the declared endpoint digest remains traceable evidence");
  assert.doesNotMatch(
    resolution.endpointIdentityEvidence,
    /sha256/iu,
    "the resolution label must not claim a digest comparison that the resolver does not perform",
  );
  assert.equal(resolution.eligible, false);
  assert.equal(resolution.reason, "decoded-transition-endpoints-not-certified");
  assert.equal(
    catalog.continuityEvidence(entry, transition).kind,
    "none",
    "declared endpoints leaked into continuity without decoded visual certification",
  );
  assert.equal(
    catalog.continuityEvidence(transition, exit).kind,
    "none",
    "declared endpoints leaked into continuity without decoded visual certification",
  );
  assert.equal(catalog.continuityEvidence(exit, transition).kind, "none", "the exit was incorrectly accepted as the entry");
  assert.equal(catalog.continuityEvidence(transition, entry).kind, "none", "the entry was incorrectly accepted as the exit");
});

test("atomically places exact certified Reference still A, authored transition, and exact still B", () => {
  const songId = "song-motion-bridge";
  const fixture = bridgeFixture(songId);
  const project = projectWithShotCount(songId, 3);
  const catalog = verifiedBridgeCatalog({
    rows: fixture.rows,
    graph: fixture.graph,
    report: { generatedAt: "2026-08-03T00:00:00.000Z" },
  });
  const variant = compileEchoEnrichmentDirectorVariant({
    song: songCard(songId),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "c".repeat(64),
    catalog,
    enrichments: fixture.rows,
    chainGraph: fixture.graph,
    report: { generatedAt: "2026-08-03T00:00:00.000Z" },
  });

  assert.deepEqual(
    variant.timeline.map((shot) => shot.media_id),
    [bridgeMediaId("1"), fixture.transition.mediaId, bridgeMediaId("2")],
  );
  assert.deepEqual(
    variant.timeline.map((shot) => shot.decision_evidence.atomicTransition?.role),
    ["entry-reference-still", "authored-transition", "exit-reference-still"],
  );
  const [entry, transition, exit] = variant.timeline;
  assert.notEqual(entry.media_id, fixture.entry.mediaId, "the adaptive entry loop video replaced the certified source still");
  assert.notEqual(exit.media_id, fixture.exit.mediaId, "the adaptive exit loop video replaced the certified source still");
  assert.notEqual(entry.media_technical_identity, fixture.entry.contentHash.value, "the still and loop byte identities were conflated");
  assert.notEqual(exit.media_technical_identity, fixture.exit.contentHash.value, "the still and loop byte identities were conflated");
  assert.deepEqual(
    [entry, exit].map((shot) => ({
      type: shot.media_contract.type,
      playbackMode: shot.media_contract.playbackMode,
      uri: shot.media_uri,
      runtimeUri: shot.runtime_media_uri,
      contentHash: shot.media_contract.contentHash,
      enrichmentId: shot.decision_evidence.enrichmentId,
      motionKind: shot.decision_evidence.selectedCandidate.motionRole.kind,
    })),
    [
      {
        type: "image",
        playbackMode: "hold",
        uri: fixture.first.uri,
        runtimeUri: fixture.first.uri,
        contentHash: "1".repeat(64),
        enrichmentId: `certified-reference-still:${"1".repeat(64)}`,
        motionKind: "reference-still-hold",
      },
      {
        type: "image",
        playbackMode: "hold",
        uri: fixture.last.uri,
        runtimeUri: fixture.last.uri,
        contentHash: "2".repeat(64),
        enrichmentId: `certified-reference-still:${"2".repeat(64)}`,
        motionKind: "reference-still-hold",
      },
    ],
  );
  assert.deepEqual(entry.decision_evidence.selectedCandidate.referenceStillCertification, {
    schemaVersion: "hapa.echo.transition-reference-still-hold.v1",
    role: "first",
    cardId: fixture.first.cardId,
    imageSha256: "1".repeat(64),
    imageUri: fixture.first.uri,
    sourceCardUnchanged: true,
  });
  assert.deepEqual(exit.decision_evidence.selectedCandidate.referenceStillCertification, {
    schemaVersion: "hapa.echo.transition-reference-still-hold.v1",
    role: "last",
    cardId: fixture.last.cardId,
    imageSha256: "2".repeat(64),
    imageUri: fixture.last.uri,
    sourceCardUnchanged: true,
  });
  assert.deepEqual(
    [entry, transition, exit].map((shot) => shot.media_orientation),
    ["portrait", "square", "portrait"],
    "fixture must prove still dimensions independently of the square transition video",
  );
  for (const shot of [entry, transition, exit]) {
    assert.equal(shot.camera_motion, "static");
    assert.equal(shot.camera_intensity, 0);
    assert.equal(shot.camera_focus, "center");
    assert.equal(shot.camera_framing_contract.cropPolicy, "certified-centered-cover-no-motion");
    assert.equal(shot.camera_framing_contract.motion, "static");
    assert.equal(shot.camera_framing_contract.intensity, 0);
    assert.equal(shot.camera_framing_contract.path.corridors.every((corridor) => (
      stableEchoEnrichmentStringify(corridor.startCrop)
        === stableEchoEnrichmentStringify(corridor.endCrop)
    )), true, `${shot.media_id} drifted inside the atomic triplet`);
  }
  assert.equal(transition.media_contract.playbackMode, "once");
  assert.equal(transition.transition_link.playbackMode, "once");
  assert.equal(transition.media_contract.timeMapping.valid, true);
  assert.equal(transition.media_contract.timeMapping.reachesDeclaredLastFrame, true);
  assert.deepEqual(transition.transition_link.timeMapping, transition.media_contract.timeMapping);
  assert.deepEqual(
    transition.decision_evidence.atomicTransition.timeMapping,
    transition.media_contract.timeMapping,
  );
  assert.deepEqual(
    buildEchoAuthoredTransitionTimeMap({
      mediaContract: fixture.transition.mediaContract,
      cueStartSeconds: transition.start_sec,
      cueEndSeconds: transition.end_sec,
      outputFps: 30,
    }),
    transition.media_contract.timeMapping,
  );
  assert.equal(transition.transition_link.from.cardId, fixture.first.cardId);
  assert.equal(transition.transition_link.to.cardId, fixture.last.cardId);
  assert.equal(entry.decision_evidence.neighborContinuity.next.kind, "declared-transition-entry-anchor");
  assert.equal(transition.decision_evidence.neighborContinuity.previous.kind, "declared-transition-entry-anchor");
  assert.equal(transition.decision_evidence.neighborContinuity.next.kind, "declared-transition-exit-anchor");
  assert.equal(exit.decision_evidence.neighborContinuity.previous.kind, "declared-transition-exit-anchor");
  assert.equal(variant.telemetry.assignedTransitions, 1);
  assert.equal(variant.telemetry.placedTransitions, 1);
  assert.equal(variant.telemetry.rejectedTransitions, 0);
  assert.equal(variant.telemetry.selectedTransitionShots, 1);
  assert.equal(variant.telemetry.referenceStillHoldShots, 2);
  assert.equal(variant.telemetry.selectedSubtleReferenceLoops, 0);
  assert.deepEqual(variant.telemetry.transitionPlan.map((row) => row.center), [1]);
  assert.deepEqual(variant.telemetry.transitionPlan.map((row) => [row.entryMediaId, row.exitMediaId]), [[
    bridgeMediaId("1"),
    bridgeMediaId("2"),
  ]]);
  const graph = projectToEditorGraph({ ...project, timeline: variant.timeline });
  const mediaTrack = graph.tracks.find((track) => ["foundation", "media"].includes(track.role));
  assert.equal(mediaTrack.cards.length, 3);
  for (const [index, card] of mediaTrack.cards.entries()) {
    const declared = variant.timeline[index].camera_framing_contract.path;
    const declaredCorridor = declared.corridors.find((corridor) => (
      Math.abs(corridor.targetAspect - (16 / 9)) <= 0.000001
    ));
    const rebound = graph.directorV2.mediaRoleCamera.find((path) => path.mediaCardId === card.id);
    const frames = graph.directorV2.cameraKeyframes.filter((frame) => frame.cameraPathId === rebound.id);
    assert.equal(card.provenance.cameraBinding, "certified-atomic-contract-preserved");
    assert.deepEqual(rebound.corridors[0].startCrop, declaredCorridor.startCrop);
    assert.deepEqual(rebound.corridors[0].endCrop, declaredCorridor.endCrop);
    assert.deepEqual(frames.map((frame) => frame.crop), [declaredCorridor.startCrop, declaredCorridor.endCrop]);
    assert.ok(frames.every((frame) => frame.motion === "static" && frame.intensity === 0 && frame.speed === 1));
  }
  const expectedCropsByMediaId = new Map(graph.directorV2.mediaRoleCamera.map((path) => [
    path.mediaId,
    structuredClone(path.corridors[0]),
  ]));
  const certifiedMutations = [
    { kind: "replace-card", media: { id: "replacement", uri: "/media/replacement.mp4" } },
    { kind: "knock-card", knockedOut: true },
    { kind: "trim-card", startSeconds: 0, endSeconds: 1.8 },
    { kind: "set-blend", blendMode: "multiply" },
    { kind: "set-opacity", opacity: 0.5 },
    { kind: "set-camera", motion: "pan-left", intensity: 1 },
  ];
  for (const [cardIndex, card] of mediaTrack.cards.entries()) {
    for (const mutation of certifiedMutations) {
      assert.throws(() => applyMultitrackOperation(graph, {
        id: `reject-certified-${cardIndex}-${mutation.kind}`,
        cardId: card.id,
        ...mutation,
      }), /cannot be visually or temporally changed without recompiling the complete atomic bridge/);
    }
    const rebound = graph.directorV2.mediaRoleCamera.find((path) => path.mediaCardId === card.id);
    assert.equal(card.provenance.cameraBinding, "certified-atomic-contract-preserved");
    assert.deepEqual(rebound.corridors[0], expectedCropsByMediaId.get(card.media.id));
  }
  assert.equal(variant.validation.ok, true);
});

test("semantically supplements an unassigned certified transition only above the declared affinity threshold", () => {
  const songId = "song-semantic-transition-supplement";
  const fixture = bridgeFixture(songId);
  fixture.transition.songIds = [];
  const project = projectWithShotCount(songId, 3);
  const ordinary = ordinaryMotionRow();
  const rows = [...fixture.rows, ordinary];
  const catalog = verifiedBridgeCatalog({ rows, graph: fixture.graph });
  const variant = compileEchoEnrichmentDirectorVariant({
    song: songCard(songId),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "6".repeat(64),
    catalog,
    enrichments: rows,
    chainGraph: fixture.graph,
    report: { generatedAt: "2026-08-03T00:00:00.000Z" },
  });

  assert.equal(variant.telemetry.assignedTransitions, 0);
  assert.equal(variant.telemetry.inferredTransitions, 1);
  assert.equal(variant.telemetry.explicitTransitionPlacements, 0);
  assert.equal(variant.telemetry.inferredTransitionPlacements, 1);
  assert.equal(variant.telemetry.selectedTransitionShots, 1);
  assert.equal(variant.telemetry.transitionPlan[0].selection.kind, "semantic-supplement");
  assert.equal(
    variant.telemetry.transitionPlan[0].selection.minimumContextAffinity,
    ECHO_INFERRED_TRANSITION_MIN_CONTEXT_AFFINITY,
  );
  assert.ok(
    variant.telemetry.transitionPlan[0].selection.contextAffinity
      >= ECHO_INFERRED_TRANSITION_MIN_CONTEXT_AFFINITY,
  );
  assert.equal(
    variant.timeline.find((shot) => shot.decision_evidence.atomicTransition?.role === "authored-transition")
      .decision_evidence.selectedCandidate.transitionSelection.kind,
    "semantic-supplement",
  );

  const unrelated = bridgeFixture("song-unrelated-transition-supplement");
  unrelated.transition.songIds = [];
  unrelated.first.cardTitle = "Obsidian taxonomy";
  unrelated.last.cardTitle = "Ceramic registry";
  unrelated.transition.title = "Obsidian taxonomy and ceramic registry";
  unrelated.transition.recognition.synopsis = "Cryptographic taxonomy resolves as ceramic registry.";
  const unrelatedRows = [...unrelated.rows, ordinary];
  const unrelatedCatalog = verifiedBridgeCatalog({ rows: unrelatedRows, graph: unrelated.graph });
  const unrelatedProject = projectWithShotCount("song-unrelated-transition-supplement", 3);
  const belowThreshold = compileEchoEnrichmentDirectorVariant({
    song: songCard("song-unrelated-transition-supplement"),
    baseProject: unrelatedProject,
    parentVariant: parentVariant(unrelatedProject),
    parentProjectSha256: "7".repeat(64),
    catalog: unrelatedCatalog,
    enrichments: unrelatedRows,
    chainGraph: unrelated.graph,
    report: { generatedAt: "2026-08-03T00:00:00.000Z" },
  });
  assert.equal(belowThreshold.telemetry.inferredTransitions, 0);
  assert.equal(belowThreshold.telemetry.inferredTransitionPlacements, 0);
  assert.equal(belowThreshold.telemetry.selectedTransitionShots, 0);
});

test("album balance chooses the least-used certified transition inside the semantic cohort deterministically", () => {
  const songId = "song-balanced-transition-supplement";
  const fixture = bridgeFixture(songId);
  fixture.transition.songIds = [];
  const alternative = authoredTransitionRow({
    hex: "d",
    jobId: "vibes-job-balanced-alternative",
    first: fixture.first,
    last: fixture.last,
    quality: 35,
    songIds: [],
  });
  const rows = [fixture.entry, fixture.transition, alternative, fixture.exit, ordinaryMotionRow()];
  const graph = declaredTransitionGraph([
    { row: fixture.transition, first: fixture.first, last: fixture.last, jobId: "vibes-job-a-to-b" },
    { row: alternative, first: fixture.first, last: fixture.last, jobId: "vibes-job-balanced-alternative" },
  ]);
  const catalog = verifiedBridgeCatalog({ rows, graph });
  const project = projectWithShotCount(songId, 3);
  const compile = (transitionUsageCounts) => compileEchoEnrichmentDirectorVariant({
    song: songCard(songId),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "8".repeat(64),
    catalog,
    enrichments: rows,
    chainGraph: graph,
    report: { generatedAt: "2026-08-03T00:00:00.000Z" },
    transitionUsageCounts,
  });

  const preferAlternativeUsage = new Map([
    ["vibes-job-a-to-b", 5],
    ["vibes-job-balanced-alternative", 0],
  ]);
  const first = compile(preferAlternativeUsage);
  const replay = compile(preferAlternativeUsage);
  assert.equal(first.telemetry.transitionPlan[0].jobId, "vibes-job-balanced-alternative");
  assert.equal(first.telemetry.transitionPlan[0].selection.albumPriorUsageCount, 0);
  assert.equal(first.lineage.transitionSelectionBalanceDigest, echoTransitionSelectionBalanceDigest(preferAlternativeUsage));
  assert.equal(replay.contentSha256, first.contentSha256);
  assert.equal(replay.lineage.compilerInputFingerprint, first.lineage.compilerInputFingerprint);

  const preferPrimaryUsage = new Map([
    ["vibes-job-a-to-b", 0],
    ["vibes-job-balanced-alternative", 5],
  ]);
  const rebalanced = compile(preferPrimaryUsage);
  assert.equal(rebalanced.telemetry.transitionPlan[0].jobId, "vibes-job-a-to-b");
  assert.notEqual(rebalanced.lineage.transitionSelectionBalanceDigest, first.lineage.transitionSelectionBalanceDigest);
  assert.notEqual(rebalanced.lineage.compilerInputFingerprint, first.lineage.compilerInputFingerprint);
  assert.notEqual(rebalanced.contentSha256, first.contentSha256);
});

test("forbids adaptive Reference loops outside reservations and never emits boundary, adjacent, or dropped transitions", () => {
  const songId = "song-transition-constraints";
  const fixture = bridgeFixture(songId);

  const unassigned = clone(fixture.transition);
  unassigned.songIds = [];
  const oneShotProject = projectWithShotCount(songId, 1);
  const oneShotVariant = compileEchoEnrichmentDirectorVariant({
    song: songCard(songId),
    baseProject: oneShotProject,
    parentVariant: parentVariant(oneShotProject),
    parentProjectSha256: "1".repeat(64),
    enrichments: [fixture.entry, unassigned, fixture.exit, ordinaryMotionRow()],
    chainGraph: fixture.graph,
    report: { generatedAt: "2026-08-03T00:00:00.000Z" },
  });
  assert.notEqual(oneShotVariant.timeline[0].media_id, fixture.transition.mediaId);
  assert.notEqual(oneShotVariant.timeline[0].media_id, fixture.entry.mediaId);
  assert.notEqual(oneShotVariant.timeline[0].media_id, fixture.exit.mediaId);
  assert.equal(oneShotVariant.sourcePolicy.transitionPolicy.adaptiveReferenceLoopsReservationOnly, true);
  assert.equal(oneShotVariant.telemetry.selectedTransitionShots, 0);
  assert.equal(oneShotVariant.telemetry.selectedSubtleReferenceLoops, 0);

  const twoShotProject = projectWithShotCount(songId, 2);
  const twoShotCatalog = verifiedBridgeCatalog({ rows: fixture.rows, graph: fixture.graph });
  assert.throws(
    () => compileEchoEnrichmentDirectorVariant({
      song: songCard(songId),
      baseProject: twoShotProject,
      parentVariant: parentVariant(twoShotProject),
      parentProjectSha256: "2".repeat(64),
      enrichments: fixture.rows,
      chainGraph: fixture.graph,
      catalog: twoShotCatalog,
      report: { generatedAt: "2026-08-03T00:00:00.000Z" },
    }),
    /could not place every assigned transition bridge:.*no-non-overlapping-interior-three-shot-window/iu,
    "an assigned transition was allowed at a first/last boundary",
  );

  const secondTransition = authoredTransitionRow({
    hex: "d",
    jobId: "vibes-job-z-second",
    first: fixture.first,
    last: fixture.last,
    quality: 99,
    songIds: [songId],
  });
  const fourShotProject = projectWithShotCount(songId, 4);
  const twoTransitionGraph = declaredTransitionGraph([
    { row: fixture.transition, first: fixture.first, last: fixture.last, jobId: "vibes-job-a-to-b" },
    { row: secondTransition, first: fixture.first, last: fixture.last, jobId: "vibes-job-z-second" },
  ]);
  const twoTransitionCatalog = verifiedBridgeCatalog({
    rows: [fixture.entry, fixture.transition, secondTransition, fixture.exit],
    graph: twoTransitionGraph,
  });
  assert.throws(
    () => compileEchoEnrichmentDirectorVariant({
      song: songCard(songId),
      baseProject: fourShotProject,
      parentVariant: parentVariant(fourShotProject),
      parentProjectSha256: "4".repeat(64),
      enrichments: [fixture.entry, fixture.transition, secondTransition, fixture.exit],
      chainGraph: twoTransitionGraph,
      catalog: twoTransitionCatalog,
      report: { generatedAt: "2026-08-03T00:00:00.000Z" },
    }),
    /no-global-non-overlapping-interior-three-shot-plan/iu,
    "an adjacent or silently dropped assigned transition did not fail closed",
  );
});

test("assignment overlay joins transition jobs to songs without mutating source enrichments", () => {
  const fixture = bridgeFixture("song-existing");
  const secondTransition = authoredTransitionRow({
    hex: "d",
    jobId: "vibes-job-b-to-c",
    first: fixture.first,
    last: fixture.last,
    songIds: [],
  });
  const enrichments = [fixture.transition, secondTransition, fixture.entry];
  const before = clone(enrichments);
  const overlay = applyExplicitTransitionSongAssignments(enrichments, {
    assignment: {
      songs: [
        { songId: "song-z", jobIds: ["vibes-job-a-to-b"] },
        { songId: "song-a", jobIds: ["vibes-job-a-to-b", "vibes-job-b-to-c"] },
        { songId: "song-a", jobIds: ["vibes-job-a-to-b"] },
      ],
    },
  });

  assert.deepEqual(enrichments, before);
  assert.equal(overlay.assignmentJobs, 2);
  assert.equal(overlay.assignedSongs, 2);
  assert.equal(overlay.assignedRows, 2);
  assert.deepEqual(overlay.rows[0].songIds, ["song-a", "song-z"]);
  assert.deepEqual(overlay.rows[1].songIds, ["song-a"]);
  assert.deepEqual(overlay.rows[0].transitionAssignment, {
    schemaVersion: "hapa.echo.transition-song-assignment.v1",
    jobId: "vibes-job-a-to-b",
    songIds: ["song-a", "song-z"],
    source: "vibes-transition-director-script-report",
  });
  assert.equal(overlay.rows[2], enrichments[2], "an unrelated row was unnecessarily replaced");
});

test("provider-neutral assignment reports derive or preserve neutral provenance", () => {
  const songId = "song-provider-neutral-assignment";
  const fixture = bridgeFixture(songId);
  const baseReport = {
    schemaVersion: "hapa.echo.transition-director-script-report.v1",
    assignment: {
      songs: [{ songId, jobIds: ["vibes-job-a-to-b"] }],
      unassignedJobIds: [],
    },
  };

  assert.equal(validateExplicitTransitionSongAssignments({
    enrichments: fixture.rows,
    chainGraph: fixture.graph,
    assignmentReport: baseReport,
    projectSongIds: [songId],
  }).verified, true);
  assert.equal(
    applyExplicitTransitionSongAssignments(fixture.rows, baseReport).rows[1]
      .transitionAssignment.source,
    "echo-transition-director-script-report",
  );

  const declaredSourceReport = clone(baseReport);
  declaredSourceReport.assignment.source = "ref-cards-certified-transition-family";
  assert.equal(
    applyExplicitTransitionSongAssignments(fixture.rows, declaredSourceReport).rows[1]
      .transitionAssignment.source,
    "ref-cards-certified-transition-family",
  );
  assert.throws(
    () => validateExplicitTransitionSongAssignments({
      enrichments: fixture.rows,
      chainGraph: fixture.graph,
      assignmentReport: {
        ...baseReport,
        assignment: { ...baseReport.assignment, source: "Ref Cards (unsafe)" },
      },
      projectSongIds: [songId],
    }),
    /lowercase provider-neutral provenance identifier/iu,
  );
});

test("visual endpoint validation binds its exact schema, thresholds, inputs, job/media set, counts, and stable result digest", () => {
  const fixture = visualValidationFixture();
  const unrelatedLegacy = authoredTransitionRow({
    hex: "e",
    jobId: "legacy-provider-job-outside-current-graph",
    first: fixture.first,
    last: fixture.last,
    songIds: ["legacy-song"],
  });
  unrelatedLegacy.quality = { score: 0.91, label: "preserve-provider-semantics" };
  const rawEnrichments = [...fixture.rawEnrichments, unrelatedLegacy];
  const receipt = validateTransitionEndpointVisualValidation({
    validationReport: fixture.validationReport,
    chainGraph: fixture.graph,
    rawEnrichments,
    ...fixture.digests,
  });

  assert.equal(receipt.verified, true);
  assert.equal(receipt.reportSchemaVersion, "hapa.echo.transition-endpoint-visual-validation.v1");
  assert.deepEqual(receipt.thresholds, {
    ssimMin: 0.9,
    pHashDistanceMax: 10,
    edgeCorrelationMin: 0.75,
  });
  assert.equal(receipt.declaredJobs, 2);
  assert.equal(receipt.certifiedJobs, 1);
  assert.equal(receipt.quarantinedJobs, 1);
  assert.deepEqual(receipt.certifiedJobIds, ["vibes-job-a-to-b"]);
  assert.deepEqual(receipt.quarantinedJobIds, ["vibes-job-quarantined"]);
  assert.equal(receipt.chainGraphSha256, fixture.digests.chainGraphSha256);
  assert.equal(receipt.enrichmentsSha256, fixture.digests.enrichmentsSha256);
  assert.equal(
    receipt.referenceAnimationCatalogSha256,
    fixture.digests.referenceAnimationCatalogSha256,
  );
  assert.equal(receipt.resultDigestSha256, fixture.validationReport.resultDigestSha256);
  assert.deepEqual(
    receipt.jobs.map(({ jobId, mediaId, decision }) => ({ jobId, mediaId, decision })),
    [
      {
        jobId: "vibes-job-a-to-b",
        mediaId: fixture.transition.mediaId,
        decision: "certified",
      },
      {
        jobId: "vibes-job-quarantined",
        mediaId: fixture.quarantinedTransition.mediaId,
        decision: "quarantined",
      },
    ],
  );
  assert.equal(receipt.jobs[0].endpoints.first.frameIndex, 0);
  assert.equal(receipt.jobs[0].endpoints.first.sourceTimeSeconds, 0);
  assert.equal(receipt.jobs[0].endpoints.first.decision, "certified");
  assert.deepEqual(receipt.jobs[0].endpoints.first.metrics, {
    ssim: 0.978321,
    pHashDistance: 2,
    edgeCorrelation: 0.951234,
  });
  assert.equal(receipt.jobs[0].endpoints.last.sourceTimeSeconds, 5.041667);

  const reverseTopLevelKeys = Object.fromEntries(Object.entries(fixture.validationReport).reverse());
  assert.equal(
    validateTransitionEndpointVisualValidation({
      validationReport: reverseTopLevelKeys,
      chainGraph: fixture.graph,
      rawEnrichments: fixture.rawEnrichments,
      ...fixture.digests,
    }).resultDigestSha256,
    receipt.resultDigestSha256,
    "validation depended on JSON object insertion order instead of the declared stable canonicalization",
  );
  const applied = applyTransitionEndpointVisualValidation(rawEnrichments, receipt);
  assert.deepEqual(
    applied.rows.find((row) => transitionJobIdForTest(row) === "legacy-provider-job-outside-current-graph"),
    unrelatedLegacy,
    "an unrelated provider's preserved transition row was mutated or rejected",
  );
});

test("visual endpoint validation fails closed for stale identity, altered policy, set drift, contradictory decisions, or a forged result digest", () => {
  const fixture = visualValidationFixture();
  const input = {
    chainGraph: fixture.graph,
    rawEnrichments: fixture.rawEnrichments,
    ...fixture.digests,
  };
  const rejects = [
    {
      label: "schema",
      report: resignVisualValidationReport({
        ...fixture.validationReport,
        schemaVersion: "hapa.echo.transition-endpoint-visual-validation.v0",
      }),
      pattern: /schema|hapa\.echo\.transition-endpoint-visual-validation\.v1/iu,
    },
    {
      label: "threshold policy",
      report: resignVisualValidationReport({
        ...fixture.validationReport,
        algorithm: {
          ...fixture.validationReport.algorithm,
          thresholds: {
            ...fixture.validationReport.algorithm.thresholds,
            ssimMin: 0.5,
          },
        },
      }),
      pattern: /threshold|ssim/iu,
    },
    {
      label: "algorithm contract",
      report: resignVisualValidationReport({
        ...fixture.validationReport,
        algorithm: {
          ...fixture.validationReport.algorithm,
          id: "center-crop-luma-ssim-phash-edge-v2-source-contract",
        },
      }),
      pattern: /algorithm|sample contract|supported/iu,
    },
    {
      label: "missing job",
      report: resignVisualValidationReport({
        ...fixture.validationReport,
        jobs: fixture.validationReport.jobs.slice(0, 1),
      }),
      pattern: /job|declared|set|count/iu,
    },
    {
      label: "wrong media",
      report: resignVisualValidationReport({
        ...fixture.validationReport,
        jobs: fixture.validationReport.jobs.map((job, index) => index === 0
          ? { ...job, mediaId: bridgeMediaId("e") }
          : job),
      }),
      pattern: /media|job|set/iu,
    },
    {
      label: "contradictory certified decision",
      report: resignVisualValidationReport({
        ...fixture.validationReport,
        jobs: fixture.validationReport.jobs.map((job, index) => index === 1
          ? { ...job, decision: "certified" }
          : job),
      }),
      pattern: /decision|certif|threshold|count/iu,
    },
    {
      label: "aggregate counts",
      report: resignVisualValidationReport({
        ...fixture.validationReport,
        aggregate: {
          ...fixture.validationReport.aggregate,
          certifiedJobs: 2,
          quarantinedJobs: 0,
        },
      }),
      pattern: /aggregate|count|certif|quarantin/iu,
    },
    {
      label: "non-terminal endpoint sample",
      report: resignVisualValidationReport({
        ...fixture.validationReport,
        jobs: fixture.validationReport.jobs.map((job, index) => index === 0
          ? {
            ...job,
            endpoints: {
              ...job.endpoints,
              last: {
                ...job.endpoints.last,
                decodedFrame: {
                  ...job.endpoints.last.decodedFrame,
                  frameIndex: 120,
                  nominalAtSeconds: 5,
                },
                sourceTiming: {
                  ...job.endpoints.last.sourceTiming,
                  presentationPtsSeconds: 5,
                  authoredSourceSeconds: 5,
                },
              },
            },
          }
          : job),
      }),
      pattern: /endpoint|sample|frame|terminal|source/iu,
    },
    {
      label: "result digest",
      report: {
        ...fixture.validationReport,
        resultDigestSha256: "f".repeat(64),
      },
      pattern: /digest|sha-?256/iu,
    },
  ];
  for (const rejection of rejects) {
    assert.throws(
      () => validateTransitionEndpointVisualValidation({
        validationReport: rejection.report,
        ...input,
      }),
      rejection.pattern,
      `${rejection.label} drift did not fail closed`,
    );
  }
  for (const name of Object.keys(fixture.digests)) {
    assert.throws(
      () => validateTransitionEndpointVisualValidation({
        validationReport: fixture.validationReport,
        ...input,
        [name]: "9".repeat(64),
      }),
      /digest|sha-?256|input/iu,
      `${name} drift did not fail closed`,
    );
  }
  assert.throws(
    () => validateTransitionEndpointVisualValidation({
      validationReport: fixture.validationReport,
      ...input,
      rawEnrichments: fixture.rawEnrichments.filter((row) => transitionJobIdForTest(row) !== "vibes-job-a-to-b"),
    }),
    /covers|expected|job/iu,
    "a missing enrichment for a current graph declaration did not fail closed",
  );
  assert.throws(
    () => validateTransitionEndpointVisualValidation({
      validationReport: fixture.validationReport,
      ...input,
      rawEnrichments: [...fixture.rawEnrichments, clone(fixture.transition)],
    }),
    /multiple enrichment rows|duplicate|job/iu,
    "duplicate enrichment rows for a current graph declaration did not fail closed",
  );
  const wrongJobBinding = clone(fixture.rawEnrichments);
  const declaredRow = wrongJobBinding.find((row) => transitionJobIdForTest(row) === "vibes-job-a-to-b");
  declaredRow.flow.transition.declaredEndpoints.link.id = "legacy-provider-wrong-job";
  assert.throws(
    () => validateTransitionEndpointVisualValidation({
      validationReport: fixture.validationReport,
      ...input,
      rawEnrichments: wrongJobBinding,
    }),
    /binds job|expected graph job|identity/iu,
    "a graph-declared media row with the wrong embedded job ID did not fail closed",
  );
});

test("shipped transition visual-validation artifact satisfies the compiler's exact physical-endpoint contract", async () => {
  const root = process.cwd();
  const paths = {
    validation: path.join(root, "artifacts/echo-video-enrichment-v1/transition-endpoint-visual-validation.json"),
    graph: path.join(root, "artifacts/echo-video-enrichment-v1/chain-graph.json"),
    enrichments: path.join(root, "artifacts/echo-video-enrichment-v1/enrichments.ndjson"),
    references: path.join(root, "data/echo-reference-animated-media.json"),
  };
  const [validationBytes, graphBytes, enrichmentBytes, referenceBytes] = await Promise.all([
    readFile(paths.validation),
    readFile(paths.graph),
    readFile(paths.enrichments),
    readFile(paths.references),
  ]);
  const rawEnrichments = enrichmentBytes.toString("utf8").trim().split(/\r?\n/u).map(JSON.parse);
  const receipt = validateTransitionEndpointVisualValidation({
    validationReport: JSON.parse(validationBytes),
    chainGraph: JSON.parse(graphBytes),
    rawEnrichments,
    chainGraphSha256: createHash("sha256").update(graphBytes).digest("hex"),
    enrichmentsSha256: createHash("sha256").update(enrichmentBytes).digest("hex"),
    referenceAnimationCatalogSha256: createHash("sha256").update(referenceBytes).digest("hex"),
  });
  assert.equal(receipt.totalJobs, 41);
  assert.equal(receipt.certifiedJobs, 30);
  assert.equal(receipt.quarantinedJobs, 11);
  assert.equal(receipt.jobs.every((job) => (
    job.endpoints.first.frameIndex === 0
      && job.endpoints.last.frameIndex === job.video.frameCount - 1
  )), true);
});

test("visual validation certifies exact endpoint samples and quarantines divergent transition media without mutating enrichment sources", () => {
  const fixture = visualValidationFixture();
  const rawBefore = clone(fixture.rawEnrichments);
  const validationReceipt = validateTransitionEndpointVisualValidation({
    validationReport: fixture.validationReport,
    chainGraph: fixture.graph,
    rawEnrichments: fixture.rawEnrichments,
    ...fixture.digests,
  });
  const applied = applyTransitionEndpointVisualValidation(
    fixture.rawEnrichments,
    validationReceipt,
  );

  assert.deepEqual(fixture.rawEnrichments, rawBefore, "visual validation mutated the source enrichment corpus");
  assert.deepEqual(applied.eligibleJobIds, ["vibes-job-a-to-b"]);
  assert.deepEqual(applied.quarantinedJobIds, ["vibes-job-quarantined"]);
  const certified = applied.rows.find((row) => transitionJobIdForTest(row) === "vibes-job-a-to-b");
  const quarantined = applied.rows.find((row) => transitionJobIdForTest(row) === "vibes-job-quarantined");
  assert.ok(certified);
  assert.ok(quarantined);
  assert.equal(certified.flow.transition.eligible, true);
  assert.equal(certified.flow.transition.visuallyValidated, true);
  assert.equal(certified.flow.transition.visualValidationDecision, "certified");
  assert.equal(certified.mediaContract.sourceInSeconds, 0);
  assert.equal(certified.mediaContract.sourceOutSeconds, 5.041667);
  assert.equal(certified.flow.transition.visualValidation.resultDigestSha256, validationReceipt.resultDigestSha256);
  assert.deepEqual(certified.flow.transition.visualValidation.endpoints, validationReceipt.jobs[0].endpoints);
  assert.equal(quarantined.flow.transition.eligible, false);
  assert.equal(quarantined.flow.transition.visuallyValidated, false);
  assert.equal(quarantined.flow.transition.visualValidationDecision, "quarantined");
  assert.equal(quarantined.flow.transition.classification, "endpoint-mismatch-quarantined");
});

test("assignment overlay preserves certified jobs and cannot restore a visually quarantined assignment", () => {
  const songId = "song-visual-validation";
  const fixture = visualValidationFixture();
  const validationReceipt = validateTransitionEndpointVisualValidation({
    validationReport: fixture.validationReport,
    chainGraph: fixture.graph,
    rawEnrichments: fixture.rawEnrichments,
    ...fixture.digests,
  });
  const applied = applyTransitionEndpointVisualValidation(
    fixture.rawEnrichments,
    validationReceipt,
  );
  const overlay = applyExplicitTransitionSongAssignments(applied.rows, {
    schemaVersion: "hapa.echo.transition-director-script-report.v1",
    assignment: {
      source: "ref-cards-certified-transition-family",
      songs: [{
        songId,
        jobIds: ["vibes-job-a-to-b", "vibes-job-quarantined"],
      }],
    },
  }, {
    eligibleJobIds: applied.eligibleJobIds,
  });

  assert.equal(overlay.assignmentJobs, 1);
  assert.equal(overlay.assignedRows, 1);
  assert.deepEqual([...overlay.jobsBySongId.get(songId)], ["vibes-job-a-to-b"]);
  const certified = overlay.rows.find((row) => transitionJobIdForTest(row) === "vibes-job-a-to-b");
  const quarantined = overlay.rows.find((row) => transitionJobIdForTest(row) === "vibes-job-quarantined");
  assert.deepEqual(certified.songIds, [songId]);
  assert.deepEqual(certified.transitionAssignment.songIds, [songId]);
  assert.deepEqual(quarantined.songIds, [songId]);
  assert.deepEqual(quarantined.transitionAssignment, {
    schemaVersion: "hapa.echo.transition-song-assignment.v1",
    jobId: "vibes-job-quarantined",
    songIds: [songId],
    status: "visual-endpoint-quarantined",
    source: "ref-cards-certified-transition-family+endpoint-visual-validation",
  });
  assert.equal(quarantined.flow.transition.visualValidationDecision, "quarantined");
  assert.equal(quarantined.flow.transition.eligible, false);
});

test("production transition assignments fail closed when missing, stale, ambiguous, or non-canonical", () => {
  const songId = "song-assignment-validation";
  const fixture = bridgeFixture(songId);
  const assignmentReport = {
    schemaVersion: "hapa.vibes-transition-director-script-report.v1",
    assignment: {
      songs: [{ songId, jobIds: ["vibes-job-a-to-b"] }],
      unassignedJobIds: [],
    },
  };
  const input = {
    enrichments: fixture.rows,
    chainGraph: fixture.graph,
    assignmentReport,
    projectSongIds: [songId],
  };
  assert.deepEqual(validateExplicitTransitionSongAssignments(input), {
    schemaVersion: "hapa.echo.transition-assignment-validation.v1",
    verified: true,
    declaredJobs: 1,
    assignedJobs: 1,
    assignedSongs: 1,
    assignmentPairs: 1,
    matchedEnrichmentRows: 1,
  });
  assert.throws(
    () => validateExplicitTransitionSongAssignments({ ...input, assignmentReport: {} }),
    /must use hapa\.echo\.transition-director-script-report\.v1 or hapa\.vibes-transition-director-script-report\.v1/iu,
  );
  assert.throws(
    () => validateExplicitTransitionSongAssignments({
      ...input,
      assignmentReport: { ...assignmentReport, assignment: { songs: [], unassignedJobIds: ["vibes-job-a-to-b"] } },
    }),
    /has no canonical song assignment/iu,
  );
  assert.throws(
    () => validateExplicitTransitionSongAssignments({
      ...input,
      assignmentReport: {
        ...assignmentReport,
        assignment: { songs: [{ songId: "song-unknown", jobIds: ["vibes-job-a-to-b"] }], unassignedJobIds: [] },
      },
    }),
    /unknown canonical song song-unknown/iu,
  );
  assert.throws(
    () => validateExplicitTransitionSongAssignments({
      ...input,
      enrichments: [...fixture.rows, clone(fixture.transition)],
    }),
    /resolves to 2 enrichment rows/iu,
  );
  const wrongMediaRows = clone(fixture.rows);
  wrongMediaRows[1].mediaId = bridgeMediaId("d");
  assert.throws(
    () => validateExplicitTransitionSongAssignments({ ...input, enrichments: wrongMediaRows }),
    /resolves to media .*; expected/iu,
  );
  const unplayableRows = clone(fixture.rows);
  unplayableRows[1].playable = false;
  assert.throws(
    () => validateExplicitTransitionSongAssignments({ ...input, enrichments: unplayableRows }),
    /resolves to unplayable media/iu,
  );
  const unresolvedAnchorRows = clone(fixture.rows);
  unresolvedAnchorRows[0].thumbnailUri = "/reference-frames/not-the-declared-entry.png";
  assert.throws(
    () => validateExplicitTransitionSongAssignments({ ...input, enrichments: unresolvedAnchorRows }),
    /does not resolve to playable entry and exit anchors/iu,
  );
});

test("Director semantics use confidence-gated labels and retain raw recognition labels as evidence only", () => {
  const row = {
    ...enrichmentRows()[0],
    recognition: {
      synopsis: "A luminous moon door opens.",
      frames: [{
        marker: "first",
        labels: [{ identifier: "raw-noise-never-score", confidence: 0.001 }],
      }],
      tags: ["vision:moon-door"],
    },
    semantic: {
      labels: [{ identifier: "raw-noise-never-score", confidence: 0.001 }],
      confidentLabels: [{ identifier: "moon_door", confidence: 0.8 }],
      provisionalLabels: [{ identifier: "provisional-noise-never-score", confidence: 0.01 }],
    },
  };
  const normalized = normalizeEchoVideoEnrichmentRow(row);
  assert.match(normalized.observedVisualText.join(" "), /moon door/iu);
  assert.doesNotMatch(normalized.observedVisualText.join(" "), /raw-noise|provisional-noise/iu);
  assert.doesNotMatch(normalized.semanticText.join(" "), /raw-noise|provisional-noise/iu);
});

test("selects the latest ready non-legacy parent but excludes this compiler's own replay output", () => {
  const project = baseProject();
  const selected = selectLatestEnrichmentParentVariant([
    { ...parentVariant(project), id: "Legacy Baseline", updatedAt: "2027-01-01T00:00:00.000Z" },
    { ...parentVariant(project), id: "older-modern", updatedAt: "2026-07-30T00:00:00.000Z" },
    parentVariant(project),
    {
      ...parentVariant(project),
      id: "intentional-enrichment-already-generated",
      updatedAt: "2026-08-01T00:00:00.000Z",
      lineage: { kind: "append-only-intentional-enrichment" },
    },
  ]);
  assert.equal(selected.id, "newest-modern-cut");
});

test("builds one deterministic intentional cut and preserves every inherited direction/runtime contract", () => {
  const project = baseProject();
  const parent = parentVariant(project);
  const parentBefore = clone(parent);
  const projectBefore = clone(project);
  const catalog = buildEchoVideoEnrichmentCatalog({
    enrichments: enrichmentRows(),
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  const moonId = enrichmentRows()[0].mediaId;
  const riverId = enrichmentRows()[1].mediaId;
  assert.equal(catalog.affinity([moonId], [riverId]), 0.93);
  assert.equal(catalog.affinity([riverId], [moonId]), 0, "directed last-to-first evidence was incorrectly reversed");
  assert.ok(catalog.neighborKeys([moonId]).includes(riverId));
  const input = {
    song: songCard(),
    baseProject: project,
    parentVariant: parent,
    parentProjectSha256: "f".repeat(64),
    catalog,
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  };
  const first = compileEchoEnrichmentDirectorVariant(input);
  const second = compileEchoEnrichmentDirectorVariant(input);
  assert.deepEqual(first, second);
  assert.deepEqual(project, projectBefore);
  assert.deepEqual(parent, parentBefore);
  assert.match(first.id, /^intentional-enrichment-[a-f0-9]{12}-[a-f0-9]{16}$/u);
  assert.equal(first.status, "ready");
  assert.equal(first.parent.variantId, parent.id);
  assert.equal(first.validation.ok, true);
  assert.ok(first.hyperframe_script.includes("/media/moon-door.mp4"));
  assert.deepEqual(first.visualizer_timeline, project.visualizer_timeline);
  assert.deepEqual(first.persistent_shader_slots, project.persistent_shader_slots);

  const inherited = deriveEchoEnrichmentParentProject(project, parent);
  for (const [index, shot] of first.timeline.entries()) {
    assert.equal(
      stableEchoEnrichmentStringify(echoShotDirectionContractSnapshot(shot)),
      stableEchoEnrichmentStringify(echoShotDirectionContractSnapshot(inherited.timeline[index])),
    );
    assert.equal(shot.decision_evidence.schemaVersion, ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA);
    assert.ok(shot.decision_evidence.selectedMediaId);
    assert.ok(shot.decision_evidence.enrichmentId);
    assert.ok(shot.decision_evidence.lyricCitation);
    assert.equal(shot.decision_evidence.explicitLyricsUnavailable, false);
    assert.ok(shot.decision_evidence.story.ids.length);
    assert.equal(shot.decision_evidence.story.status, "canonical-story-beat-match");
    assert.equal(shot.decision_evidence.story.authority, "human-canonical");
    assert.ok(shot.decision_evidence.story.overlapTokens.length >= 2);
    assert.equal(shot.decision_evidence.lore.status, "canonical-song-lore");
    assert.ok(Array.isArray(shot.decision_evidence.candidateAlternatives));
    assert.match(shot.decision_evidence.rationale, new RegExp(shot.decision_evidence.selectedCandidate.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
    assert.doesNotMatch(shot.decision_evidence.rationale, /stable visual continuity/iu);
    for (const field of ["lyricAffinity", "canonAffinity", "objectActionAffinity", "emotionAffinity"]) {
      assert.equal(typeof shot.decision_evidence.selectedCandidate.score[field], "number");
    }
    assert.ok(shot.decision_evidence.candidateAlternatives.every((candidate) => /score .*delta/iu.test(candidate.rejectionReason)));
    assert.equal(shot.decision_evidence.preservedDirection.runtimeMediaContract, true);
    assert.equal(shot.media_contract.playbackMode, "once");
    assert.notEqual(shot.media_uri, "/media/ltx-moon-door.mp4", "low-prior LTX unexpectedly outranked verified media");
  }
  assert.deepEqual(first.timeline[0].media_contract, { ...enrichmentRows()[0].mediaContract, playbackMode: "once" });
  assert.equal(first.timeline[0].decision_evidence.neighborContinuity.previous, null);
  assert.equal(first.timeline[0].decision_evidence.sourceBiasCounterfactual.schemaVersion, "hapa.echo.source-bias-counterfactual.v1");
  assert.equal(first.timeline[0].decision_evidence.sourceBiasCounterfactual.evaluatedCandidateCount, enrichmentRows().length);
  assert.ok(first.timeline[0].decision_evidence.sourceBiasCounterfactual.selectedCandidate.mediaId);
  assert.ok(first.timeline[0].decision_evidence.neighborContinuity.next);
  assert.ok(first.timeline[1].decision_evidence.neighborContinuity.previous);
});

test("final selection rewards lyric, canon, object-action, and emotion evidence instead of quality alone", () => {
  const project = baseProject("song-semantic-selection");
  project.duration = 4;
  project.timeline = project.timeline.slice(0, 1);
  project.timed_lyrics = project.timed_lyrics.slice(0, 1);
  const semanticId = `hapa-media:sha256:${"5".repeat(64)}`;
  const genericId = `hapa-media:sha256:${"6".repeat(64)}`;
  const variant = compileEchoEnrichmentDirectorVariant({
    song: songCard("song-semantic-selection"),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "5".repeat(64),
    enrichments: [
      {
        schemaVersion: "hapa.echo.video-enrichment.v1",
        mediaId: semanticId,
        contentHash: { algorithm: "sha256", value: "5".repeat(64) },
        title: "Luminous Letter at the Moon Door",
        runtimeUri: "/media/semantic-moon-letter.mp4",
        recognition: {
          synopsis: "A luminous hand carries a family letter through a moon door in a protective homecoming ritual.",
        },
        quality: { score: 72 },
        provenance: [{ source: "verified-source-file", verifiedSource: true }],
      },
      {
        schemaVersion: "hapa.echo.video-enrichment.v1",
        mediaId: genericId,
        contentHash: { algorithm: "sha256", value: "6".repeat(64) },
        title: "Pristine Abstract Geometry",
        runtimeUri: "/media/pristine-generic.mp4",
        recognition: { synopsis: "Immaculate abstract chrome geometry rotates against a neutral studio background." },
        quality: { score: 100 },
        provenance: [{ source: "verified-source-file", verifiedSource: true }],
      },
    ],
    chainGraph: { schemaVersion: "hapa.echo.video-chain-graph.v1", candidates: [] },
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  const selected = variant.timeline[0].decision_evidence.selectedCandidate;
  assert.equal(selected.mediaId, semanticId);
  assert.ok(selected.score.lyricAffinity > 0);
  assert.ok(selected.score.canonAffinity > 0);
  assert.ok(selected.score.objectActionAffinity > 0);
  assert.ok(selected.score.emotionAffinity > 0);
});

test("rejects a known-short video cue instead of selecting it and repeating the clip", () => {
  const project = baseProject("song-no-repeat");
  project.duration = 4;
  project.timeline = project.timeline.slice(0, 1);
  project.timed_lyrics = project.timed_lyrics.slice(0, 1);
  const [shortRow, longRow] = enrichmentRows().slice(0, 2).map(clone);
  shortRow.quality = { score: 100 };
  shortRow.mediaContract = {
    ...shortRow.mediaContract,
    sourceInSeconds: 0,
    sourceOutSeconds: 2,
    actualDurationSeconds: 2,
  };
  longRow.quality = { score: 80 };
  longRow.recognition = clone(shortRow.recognition);
  longRow.mediaContract = {
    schemaVersion: "hapa.echo.playback-media.v2",
    type: "video",
    originalUri: longRow.runtimeUri,
    runtimeUri: longRow.runtimeUri,
    sourceInSeconds: 0,
    sourceOutSeconds: 6,
    actualDurationSeconds: 6,
    playbackMode: "loop",
  };
  const catalog = buildEchoVideoEnrichmentCatalog({
    enrichments: [shortRow, longRow],
    chainGraph: { schemaVersion: "hapa.echo.video-chain-graph.v1", candidates: [] },
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  const variant = compileEchoEnrichmentDirectorVariant({
    song: songCard("song-no-repeat"),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "7".repeat(64),
    catalog,
    enrichments: [shortRow, longRow],
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  assert.equal(variant.timeline[0].media_id, longRow.mediaId);
  assert.equal(variant.timeline[0].media_contract.playbackMode, "once");
});

test("records explicit lyrics-unavailable evidence instead of inventing an instrumental claim", () => {
  const project = baseProject("song-no-lyrics");
  delete project.timed_lyrics;
  const parent = parentVariant(project);
  const variant = compileEchoEnrichmentDirectorVariant({
    song: { ...songCard("song-no-lyrics"), lyricTimings: [], lyrics: null },
    baseProject: project,
    parentVariant: parent,
    parentProjectSha256: "e".repeat(64),
    enrichments: enrichmentRows(),
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  for (const shot of variant.timeline) {
    assert.equal(shot.decision_evidence.lyricCitation, null);
    assert.equal(shot.decision_evidence.explicitLyricsUnavailable, true);
    assert.equal(shot.decision_evidence.lyrics.status, "lyrics-unavailable");
    assert.doesNotMatch(JSON.stringify(shot.decision_evidence), /instrumental/iu);
  }
});

test("does not claim a canonical story beat when measured contextual affinity is below threshold", () => {
  const project = baseProject("song-unmatched-story");
  const variant = compileEchoEnrichmentDirectorVariant({
    song: {
      ...songCard("song-unmatched-story"),
      storyBeats: [{ id: "unrelated-protocol", summary: "Taxonomy governance synchronizes cryptographic registry schemas." }],
    },
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "c".repeat(64),
    enrichments: enrichmentRows(),
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  for (const shot of variant.timeline) {
    assert.equal(shot.decision_evidence.story.status, "canonical-story-beats-context-unmatched");
    assert.deepEqual(shot.decision_evidence.story.ids, []);
    assert.equal(shot.decision_evidence.story.summary, "");
    assert.doesNotMatch(shot.edit_reason, /supports story beat/iu);
    assert.doesNotMatch(JSON.stringify(shot.decision_evidence.selectedCandidate), /cryptographic registry/iu);
  }
});

test("keeps a high-overlap Lorekeeper association explicitly soft-canon and body-only", () => {
  const project = baseProject("song-soft-story");
  const body = "Moon door carries the family letter toward home.";
  const variant = compileEchoEnrichmentDirectorVariant({
    song: {
      ...songCard("song-soft-story"),
      storyBeats: [{
        id: "node-card-protocol-secret-id",
        authorType: "lorekeeper-agent",
        authorName: "Hapa Lorekeeper",
        beatType: "kit-combination",
        body,
        tags: ["soft-canon", "kit-combination"],
        createdAt: "2026-01-01T00:00:00.000Z",
      }],
    },
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "a".repeat(64),
    enrichments: enrichmentRows(),
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  const evidence = variant.timeline[0].decision_evidence.story;
  assert.equal(evidence.status, "soft-canon-association-match");
  assert.equal(evidence.softCanon, true);
  assert.equal(evidence.summary, body);
  assert.doesNotMatch(evidence.summary, /protocol-secret-id|Hapa Lorekeeper|2026-/iu);
  assert.match(variant.timeline[0].decision_evidence.rationale, /without treating it as canonical/iu);
});

test("does not describe a nearest lyric line as temporally aligned", () => {
  const project = baseProject("song-distant-lyrics");
  project.timed_lyrics = [{ id: "future-line", start: 100, end: 104, text: "Future river returns home" }];
  const variant = compileEchoEnrichmentDirectorVariant({
    song: { ...songCard("song-distant-lyrics"), lyricTimings: [] },
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "9".repeat(64),
    enrichments: enrichmentRows(),
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  for (const shot of variant.timeline) {
    assert.equal(shot.decision_evidence.lyrics.status, "distant-line-context");
    assert.ok(shot.decision_evidence.lyrics.distanceSeconds > 2);
    assert.match(shot.decision_evidence.rationale, /without claiming overlap/iu);
    assert.doesNotMatch(shot.decision_evidence.rationale, /aligns with (?:timed )?lyric/iu);
  }
});

test("excludes enrichment rows whose source video failed decoding from the candidate pool", () => {
  const project = baseProject("song-corrupt-source");
  const corrupt = {
    ...enrichmentRows()[0],
    mediaId: `hapa-media:sha256:${"9".repeat(64)}`,
    id: `hapa-media:sha256:${"9".repeat(64)}`,
    contentHash: { algorithm: "sha256", value: "9".repeat(64) },
    runtimeUri: "/media/corrupt.mp4",
    playable: false,
    decodeStatus: "decode-failed",
    recognition: { synopsis: "Moon door carries the letter with perfect semantic affinity." },
    quality: { score: 100 },
  };
  const variant = compileEchoEnrichmentDirectorVariant({
    song: songCard("song-corrupt-source"),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "b".repeat(64),
    enrichments: [corrupt, ...enrichmentRows()],
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  assert.ok(variant.timeline.every((shot) => shot.media_uri !== "/media/corrupt.mp4"));
  assert.equal(variant.telemetry.enrichmentRowsWithPlayableUri, enrichmentRows().length);
});

test("fails before returning a variant when parent media has no playable catalog enrichment", () => {
  const project = baseProject("song-parent-media-unenriched");
  const quarantinedParent = {
    ...enrichmentRows()[0],
    id: `hapa-media:sha256:${"9".repeat(64)}`,
    mediaId: `hapa-media:sha256:${"9".repeat(64)}`,
    contentHash: { algorithm: "sha256", value: "9".repeat(64) },
    runtimeUri: project.timeline[0].media_uri,
    playable: false,
    decodeStatus: "decode-failed",
  };

  assert.throws(
    () => compileEchoEnrichmentDirectorVariant({
      song: songCard("song-parent-media-unenriched"),
      baseProject: project,
      parentVariant: parentVariant(project),
      parentProjectSha256: "d".repeat(64),
      enrichments: [quarantinedParent],
      chainGraph: { edges: [] },
      report: { generatedAt: "2026-08-01T00:00:00.000Z" },
    }),
    /no playable parent or enrichment media candidates/iu,
  );
});

test("canonicalizes legacy aliases that point at the same runtime video", () => {
  const project = baseProject("song-aliases");
  for (const [index, shot] of project.timeline.entries()) {
    shot.media_id = `legacy-card-${index}`;
    shot.media_uri = "/media/shared-runtime.mp4";
    shot.runtime_media_uri = "/media/shared-runtime.mp4";
    shot.media_technical_identity = `uri:/legacy/source-${index}.mp4`;
    shot.media_contract = {
      schemaVersion: "hapa.echo.playback-media.v2",
      type: "video",
      originalUri: "/media/shared-runtime.mp4",
      runtimeUri: "/media/shared-runtime.mp4",
      playbackMode: "loop",
    };
  }
  const canonicalId = `hapa-media:sha256:${"4".repeat(64)}`;
  const rows = [{
    schemaVersion: "hapa.echo.video-enrichment.v1",
    id: canonicalId,
    mediaId: canonicalId,
    contentHash: { algorithm: "sha256", value: "4".repeat(64) },
    title: "Canonical Shared Runtime",
    runtimeUri: "/media/shared-runtime.mp4",
    recognition: { synopsis: "A moonlit river carries a letter home." },
    quality: { score: 90 },
    provenance: [{ source: "verified-source-file", verifiedSource: true }],
  }];
  const variant = compileEchoEnrichmentDirectorVariant({
    song: songCard("song-aliases"),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "d".repeat(64),
    enrichments: rows,
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  assert.deepEqual(new Set(variant.timeline.map((shot) => shot.media_id)), new Set([canonicalId]));
  assert.deepEqual(new Set(variant.timeline.map((shot) => shot.media_technical_identity)), new Set([`sha256:${"4".repeat(64)}`]));
  assert.deepEqual(new Set(variant.timeline.map((shot) => shot.decision_evidence.enrichmentId)), new Set([canonicalId]));
});

test("replacements that change source orientation receive a selected-media camera contract", () => {
  const project = baseProject("song-camera-reframe");
  project.duration = 4;
  project.timeline = project.timeline.slice(0, 1);
  project.timed_lyrics = project.timed_lyrics.slice(0, 1);
  project.timeline[0].media_contract.dimensions = { width: 1920, height: 1080 };
  project.timeline[0].camera_motion = "static";
  const mediaId = `hapa-media:sha256:${"7".repeat(64)}`;
  const variant = compileEchoEnrichmentDirectorVariant({
    song: songCard("song-camera-reframe"),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "7".repeat(64),
    enrichments: [{
      schemaVersion: "hapa.echo.video-enrichment.v1",
      mediaId,
      contentHash: { algorithm: "sha256", value: "7".repeat(64) },
      title: "Portrait Moon Door",
      runtimeUri: "/media/portrait-moon-door.mp4",
      technical: { width: 720, height: 1280 },
      recognition: { synopsis: "A hand carries a family letter through a luminous moon door." },
      quality: { score: 95 },
      provenance: [{ source: "verified-source-file", verifiedSource: true }],
    }],
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  const shot = variant.timeline[0];
  const framing = shot.camera_framing_contract;
  assert.equal(shot.media_orientation, "portrait");
  assert.deepEqual(shot.media_dimensions, { width: 720, height: 1280, maxDimension: 1280 });
  assert.equal(framing.schemaVersion, ECHO_ASSET_CAMERA_FRAMING_SCHEMA);
  assert.equal(framing.reason, "selected-media-orientation-changed");
  assert.equal(framing.mediaId, mediaId);
  assert.equal(framing.path.mediaId, mediaId);
  assert.equal(shot.decision_evidence.preservedDirection.camera, false);
  assert.equal(shot.decision_evidence.cameraFraming.status, "rederived-for-selected-media");
  assert.notEqual(shot.camera_motion, "static");
  assert.equal(variant.validation.ok, true);
  for (const corridor of framing.path.corridors) {
    for (const crop of [corridor.startCrop, corridor.endCrop]) {
      assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 1.000001 && crop.y + crop.height <= 1.000001);
      assert.ok(Math.abs((framing.sourceAspect * crop.width / crop.height) - corridor.targetAspect) <= 0.00001);
    }
  }
});

test("real media replacing a generated-visualizer cue cannot claim the parent camera was preserved", () => {
  const project = baseProject("song-generated-gap");
  project.duration = 4;
  project.timeline = project.timeline.slice(0, 1);
  project.timed_lyrics = project.timed_lyrics.slice(0, 1);
  Object.assign(project.timeline[0], {
    media_id: "none",
    media_uri: "",
    runtime_media_uri: "",
    media_technical_identity: "",
    camera_motion: "static",
    media_contract: { type: "generated-visualizer", runtimeUri: "", originalUri: "" },
  });
  const mediaId = `hapa-media:sha256:${"8".repeat(64)}`;
  const variant = compileEchoEnrichmentDirectorVariant({
    song: songCard("song-generated-gap"),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "8".repeat(64),
    enrichments: [{
      schemaVersion: "hapa.echo.video-enrichment.v1",
      mediaId,
      contentHash: { algorithm: "sha256", value: "8".repeat(64) },
      title: "Restored Foundation",
      runtimeUri: "/media/restored-foundation.mp4",
      technical: { width: 1920, height: 1080 },
      recognition: { synopsis: "A moonlit family letter crosses the river toward home." },
      quality: { score: 90 },
      provenance: [{ source: "verified-source-file", verifiedSource: true }],
    }],
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  const shot = variant.timeline[0];
  assert.equal(shot.camera_framing_contract.reason, "replaces-generated-visualizer-or-no-media");
  assert.equal(shot.camera_framing_contract.path.mediaId, mediaId);
  assert.equal(shot.decision_evidence.preservedDirection.camera, false);
  assert.equal(variant.telemetry.assetReframedShots, 1);
  assert.equal(variant.validation.ok, true);
});

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileHash(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

test("CLI dry-run is write-free; apply is exclusive, replay-safe, immutable, and rebuilds exact index parity", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "echo-enrichment-director-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifacts = path.join(root, "artifacts");
  const projectsDirectory = path.join(root, "projects");
  const variantsDirectory = path.join(root, "variants");
  const project = baseProject();
  const parent = parentVariant(project);
  const projectPath = path.join(projectsDirectory, "song-fixture-video-project.json");
  const parentPath = path.join(variantsDirectory, project.song_id, `${parent.id}.json`);
  const indexPath = path.join(variantsDirectory, "index.json");
  const reportPath = path.join(root, "output", "report.json");
  const backupsDirectory = path.join(root, "backups");
  const enrichmentsPath = path.join(artifacts, "enrichments.ndjson");
  const chainGraphPath = path.join(artifacts, "chain-graph.json");
  const enrichmentReportPath = path.join(artifacts, "report.json");
  const songsPath = path.join(root, "songs.json");
  await writeJson(projectPath, { music_video_project: project });
  await writeJson(parentPath, parent);
  await writeJson(indexPath, {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: [{
      id: `${project.song_id}:${parent.id}`,
      songId: project.song_id,
      variantId: parent.id,
      title: parent.title,
      relativePath: `${project.song_id}/${parent.id}.json`,
      status: "ready",
      timelineCount: parent.timeline.length,
      updatedAt: parent.updatedAt,
    }],
  });
  await writeJson(songsPath, { songs: [songCard()] });
  await mkdir(artifacts, { recursive: true });
  await writeFile(enrichmentsPath, `${enrichmentRows().map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  await writeJson(chainGraphPath, chainGraph());
  const fixtureCatalog = buildEchoVideoEnrichmentCatalog({ enrichments: enrichmentRows(), chainGraph: chainGraph(), report: {} });
  await writeJson(enrichmentReportPath, {
    schemaVersion: "hapa.echo.video-enrichment-report.v1",
    generatedAt: "2026-08-01T00:00:00.000Z",
    complete: true,
    batchFingerprint: `sha256:${fixtureCatalog.computedFingerprint}`,
    counts: {
      manifestVideos: enrichmentRows().length,
      enrichmentRows: enrichmentRows().length,
      chainEdges: fixtureCatalog.edges.length,
    },
  });
  const options = {
    apply: false,
    songId: "",
    expectedSongCount: 1,
    enrichmentsPath,
    chainGraphPath,
    enrichmentReportPath,
    songsPath,
    projectsDirectory,
    variantsDirectory,
    indexPath,
    reportPath,
    backupsDirectory,
  };
  const projectHashBefore = await fileHash(projectPath);
  const parentHashBefore = await fileHash(parentPath);
  const indexHashBefore = await fileHash(indexPath);
  const dryRun = await runEnrichmentDirectorVariantPass(options);
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.variants.generated, 1);
  assert.equal(dryRun.variants.newFiles, 1);
  assert.equal(await fileHash(indexPath), indexHashBefore);
  await assert.rejects(stat(reportPath), { code: "ENOENT" });
  const generatedId = dryRun.variants.cuts[0].variantId;
  const generatedPath = path.join(variantsDirectory, project.song_id, `${generatedId}.json`);
  await assert.rejects(stat(generatedPath), { code: "ENOENT" });

  const applied = await runEnrichmentDirectorVariantPass({ ...options, apply: true });
  assert.equal(applied.mode, "apply");
  assert.equal(applied.variants.newFiles, 1);
  assert.equal(applied.validation.indexMatchesDiskAfterApply, true);
  assert.equal(await fileHash(projectPath), projectHashBefore);
  assert.equal(await fileHash(parentPath), parentHashBefore);
  const generatedHash = await fileHash(generatedPath);
  const persistedIndex = JSON.parse(await readFile(indexPath, "utf8"));
  assert.deepEqual(
    persistedIndex.variants.map((row) => row.id).sort(),
    [`${project.song_id}:${parent.id}`, `${project.song_id}:${generatedId}`].sort(),
  );

  const replay = await runEnrichmentDirectorVariantPass({ ...options, apply: true });
  assert.equal(replay.variants.newFiles, 0);
  assert.equal(replay.variants.existingIdentical, 1);
  assert.equal(await fileHash(generatedPath), generatedHash);
  assert.equal(await fileHash(projectPath), projectHashBefore);
  assert.equal(await fileHash(parentPath), parentHashBefore);

  const conflicted = JSON.parse(await readFile(generatedPath, "utf8"));
  conflicted.contentSha256 = "0".repeat(64);
  await writeJson(generatedPath, conflicted);
  await assert.rejects(
    runEnrichmentDirectorVariantPass({ ...options, apply: true }),
    /append-only conflict/iu,
  );
});
