import test from "node:test";
import assert from "node:assert/strict";

import {
  ECHO_ENRICHMENT_SUPPORTED_SHOT_EVIDENCE_SCHEMAS,
  auditEchoVideoEnrichments,
  auditIntentionalDirectorVariants,
  buildSourceBiasFeedback,
} from "../src/domain/echo-enrichment-audit.js";
import {
  ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
  echoEnrichmentSha256,
} from "../src/domain/echo-enrichment-director-variant.js";

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

function currentAtomicTransitionAuditFixture(variantId = "intentional-valid-atomic-transition") {
  const entryImageSha256 = "1".repeat(64);
  const exitImageSha256 = "2".repeat(64);
  const entryId = `hapa-media:sha256:${entryImageSha256}`;
  const transitionId = `hapa-media:sha256:${"c".repeat(64)}`;
  const exitId = `hapa-media:sha256:${exitImageSha256}`;
  const transitionJobId = "vibes-transition:atomic-a-to-b";
  const endpointIdentityEvidence = "declared-card-lineage+reference-image-sha256+poster-uri";
  const visualResultDigestSha256 = "e".repeat(64);
  const visualValidation = {
    schemaVersion: "hapa.echo.transition-shot-visual-certification.v1",
    decision: "certified",
    jobId: transitionJobId,
    mediaId: transitionId,
    videoSha256: "c".repeat(64),
    endpoints: {
      first: { frameIndex: 0, sourceTimeSeconds: 0 },
      last: { frameIndex: 121, sourceTimeSeconds: 5.041667 },
    },
    resultDigestSha256: visualResultDigestSha256,
  };
  const certifiedJobs = [{
    jobId: transitionJobId,
    mediaId: transitionId,
    videoSha256: "c".repeat(64),
    endpoints: structuredClone(visualValidation.endpoints),
  }];
  const timeMapping = {
    schemaVersion: "hapa.echo.transition-time-map.v1",
    mode: "fit-source-once-to-cue",
    valid: true,
    sourceInSeconds: 0,
    sourceOutSeconds: 5.041667,
    sourceDurationSeconds: 5.041667,
    cueDurationSeconds: 2,
    cueSampleSpanSeconds: 1.966667,
    outputFps: 30,
    playbackRate: 2.563559,
    reachesDeclaredLastFrame: true,
  };
  const firstReference = {
    role: "first",
    cardId: "reference:atomic-entry",
    cardRevisionId: "reference:atomic-entry:revision-1",
    cardTitle: "Atomic Entry",
    assetId: "reference:atomic-entry:image",
    frameId: "transition-frame:atomic-entry",
    sha256: entryImageSha256,
    uri: "/media/reference-atomic-entry.png",
    reviewStatus: "approved",
    sourceCardUnchanged: true,
  };
  const lastReference = {
    role: "last",
    cardId: "reference:atomic-exit",
    cardRevisionId: "reference:atomic-exit:revision-1",
    cardTitle: "Atomic Exit",
    assetId: "reference:atomic-exit:image",
    frameId: "transition-frame:atomic-exit",
    sha256: exitImageSha256,
    uri: "/media/reference-atomic-exit.png",
    reviewStatus: "approved",
    sourceCardUnchanged: true,
  };
  const atomic = (role) => ({
    role,
    centerShotIndex: 1,
    transitionMediaId: transitionId,
    transitionJobId,
    firstReference: structuredClone(firstReference),
    lastReference: structuredClone(lastReference),
    endpointIdentityEvidence,
    visualValidation: structuredClone(visualValidation),
    timeMapping: structuredClone(timeMapping),
  });
  const referenceStillCertification = (role) => {
    const endpoint = role === "entry-reference-still" ? firstReference : lastReference;
    return {
      schemaVersion: "hapa.echo.transition-reference-still-hold.v1",
      role: role === "entry-reference-still" ? "first" : "last",
      cardId: endpoint.cardId,
      imageSha256: endpoint.sha256,
      imageUri: endpoint.uri,
      sourceCardUnchanged: true,
    };
  };
  const evidence = (selectedMediaId, role, neighborContinuity) => ({
    schemaVersion: ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
    selectedMediaId,
    enrichmentId: role === "entry-reference-still"
      ? `certified-reference-still:${entryImageSha256}`
      : role === "exit-reference-still"
        ? `certified-reference-still:${exitImageSha256}`
        : selectedMediaId,
    selectedCandidate: {
      motionRole: { kind: role === "authored-transition" ? "transition" : "reference-still-hold" },
      referenceAnchorIds: role === "entry-reference-still"
        ? [firstReference.cardId]
        : role === "exit-reference-still" ? [lastReference.cardId] : [],
      ...(role === "authored-transition" ? {} : {
        referenceStillCertification: referenceStillCertification(role),
      }),
    },
    lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true },
    rationale: `The ${role} cue is backed by the current compiler evidence.`,
    atomicTransition: atomic(role),
    neighborContinuity,
  });
  const framingContract = (mediaId, dimensions) => {
    const sourceAspect = dimensions.width / dimensions.height;
    const targetAspect = 16 / 9;
    const crop = sourceAspect >= targetAspect
      ? { x: (1 - (targetAspect / sourceAspect)) / 2, y: 0, width: targetAspect / sourceAspect, height: 1 }
      : { x: 0, y: (1 - (sourceAspect / targetAspect)) / 2, width: 1, height: sourceAspect / targetAspect };
    return {
      schemaVersion: "hapa.echo.asset-camera-framing.v2",
      mediaId,
      reason: "certified-atomic-transition-centered-framing",
      derived: true,
      sourceDimensions: { ...dimensions, measured: true },
      sourceAspect,
      sourceOrientation: dimensions.height > dimensions.width ? "portrait" : dimensions.width > dimensions.height ? "landscape" : "square",
      outputProfile: { id: "landscape-16x9-1920x1080", width: 1920, height: 1080, aspect: targetAspect, orientation: "landscape" },
      cropPolicy: "certified-centered-cover-no-motion",
      motion: "static",
      intensity: 0,
      speed: 1,
      focus: "center",
      shotRole: "certified-atomic-transition",
      path: {
        mediaId,
        corridors: [{ targetAspect, startCrop: structuredClone(crop), endCrop: structuredClone(crop) }],
        keyframes: [
          { offset: 0, crop: structuredClone(crop), zoom: 1 },
          { offset: 1, crop: structuredClone(crop), zoom: 1 },
        ],
      },
    };
  };
  const portraitDimensions = { width: 720, height: 1280 };
  const squareDimensions = { width: 1080, height: 1080 };
  return {
    entryId,
    transitionId,
    exitId,
    transitionJobId,
    firstReference,
    lastReference,
    endpointIdentityEvidence,
    variant: {
      schemaVersion: "hapa.echo.direction-script-variant.v1",
      id: variantId,
      parent: { songId: "song-a" },
      enrichmentLineage: { runId: `run-${variantId}` },
      lineage: {
        transitionEndpointCertification: {
          schemaVersion: "hapa.echo.transition-endpoint-certification-lineage.v1",
          verified: true,
          resultDigestSha256: visualResultDigestSha256,
          certifiedJobIds: [transitionJobId],
          quarantinedJobIds: [],
          certifiedJobs,
          certifiedJobLedgerDigestSha256: echoEnrichmentSha256(certifiedJobs),
        },
      },
      timeline: [
        {
          start_sec: 0,
          end_sec: 2,
          media_id: entryId,
          media_uri: firstReference.uri,
          runtime_media_uri: firstReference.uri,
          media_technical_identity: `sha256:${entryImageSha256}`,
          media_orientation: "portrait",
          camera_motion: "static",
          camera_intensity: 0,
          camera_speed: 1,
          camera_focus: "center",
          camera_framing_contract: framingContract(entryId, portraitDimensions),
          media_contract: {
            type: "image",
            originalUri: firstReference.uri,
            runtimeUri: firstReference.uri,
            playbackMode: "hold",
            contentHash: entryImageSha256,
            dimensions: portraitDimensions,
          },
          decision_evidence: evidence(entryId, "entry-reference-still", {
            previous: null,
            next: { kind: "declared-transition-entry-anchor" },
          }),
        },
        {
          start_sec: 2,
          end_sec: 4,
          media_id: transitionId,
          media_uri: "/media/certified-transition.mp4",
          runtime_media_uri: "/media/certified-transition.mp4",
          media_orientation: "square",
          camera_motion: "static",
          camera_intensity: 0,
          camera_speed: 1,
          camera_focus: "center",
          camera_framing_contract: framingContract(transitionId, squareDimensions),
          media_contract: {
            type: "video",
            originalUri: "/media/certified-transition.mp4",
            runtimeUri: "/media/certified-transition.mp4",
            playbackMode: "once",
            sourceInSeconds: timeMapping.sourceInSeconds,
            sourceOutSeconds: timeMapping.sourceOutSeconds,
            timeMapping: structuredClone(timeMapping),
          },
          transition_link: {
            id: transitionJobId,
            mediaId: transitionId,
            playbackMode: "once",
            visualValidation: structuredClone(visualValidation),
            timeMapping: structuredClone(timeMapping),
          },
          decision_evidence: evidence(transitionId, "authored-transition", {
            previous: { kind: "declared-transition-entry-anchor" },
            next: { kind: "declared-transition-exit-anchor" },
          }),
        },
        {
          start_sec: 4,
          end_sec: 6,
          media_id: exitId,
          media_uri: lastReference.uri,
          runtime_media_uri: lastReference.uri,
          media_technical_identity: `sha256:${exitImageSha256}`,
          media_orientation: "portrait",
          camera_motion: "static",
          camera_intensity: 0,
          camera_speed: 1,
          camera_focus: "center",
          camera_framing_contract: framingContract(exitId, portraitDimensions),
          media_contract: {
            type: "image",
            originalUri: lastReference.uri,
            runtimeUri: lastReference.uri,
            playbackMode: "hold",
            contentHash: exitImageSha256,
            dimensions: portraitDimensions,
          },
          decision_evidence: evidence(exitId, "exit-reference-still", {
            previous: { kind: "declared-transition-exit-anchor" },
            next: null,
          }),
        },
      ],
    },
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

test("intentional cut audit preserves historical v4 evidence compatibility", () => {
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

test("intentional cut audit accepts the compiler's current evidence schema and preserves v5 compatibility", () => {
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-current-evidence",
    parent: { songId: "song-a" },
    enrichmentLineage: { runId: "run-current" },
    timeline: [{
      decision_evidence: {
        schemaVersion: ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
        selectedMediaId: id,
        enrichmentId: id,
        lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true },
        rationale: "The current compiler evidence documents the selected garden visual.",
      },
    }],
  };

  assert.deepEqual(ECHO_ENRICHMENT_SUPPORTED_SHOT_EVIDENCE_SCHEMAS, [
    "hapa.echo.shot-decision-evidence.v4",
    "hapa.echo.shot-decision-evidence.v5",
    ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
  ]);
  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [variant],
    enrichmentIds: [id],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.blockers, []);
});

test("intentional cut audit accepts exact certified still holds outside the ordinary enrichment/playability universe", () => {
  const fixture = currentAtomicTransitionAuditFixture();

  assert.deepEqual(fixture.variant.timeline.map((shot) => ({
    role: shot.decision_evidence.atomicTransition.role,
    mediaId: shot.media_id,
    type: shot.media_contract.type,
    playbackMode: shot.media_contract.playbackMode,
    orientation: shot.media_orientation,
    cameraMotion: shot.camera_motion,
    cropPolicy: shot.camera_framing_contract.cropPolicy,
  })), [
    {
      role: "entry-reference-still",
      mediaId: fixture.entryId,
      type: "image",
      playbackMode: "hold",
      orientation: "portrait",
      cameraMotion: "static",
      cropPolicy: "certified-centered-cover-no-motion",
    },
    {
      role: "authored-transition",
      mediaId: fixture.transitionId,
      type: "video",
      playbackMode: "once",
      orientation: "square",
      cameraMotion: "static",
      cropPolicy: "certified-centered-cover-no-motion",
    },
    {
      role: "exit-reference-still",
      mediaId: fixture.exitId,
      type: "image",
      playbackMode: "hold",
      orientation: "portrait",
      cameraMotion: "static",
      cropPolicy: "certified-centered-cover-no-motion",
    },
  ]);

  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [fixture.variant],
    enrichmentIds: [fixture.transitionId],
    playableEnrichmentIds: [fixture.transitionId],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.blockers, []);
});

test("intentional cut audit rejects any tampered certified Reference still SHA, URI, type, hold, or certification", () => {
  const cases = [
    {
      label: "entry URI",
      shotIndex: 0,
      blocker: "atomic-transition-entry-reference-still-binding-invalid",
      mutate: (shot) => { shot.media_uri = "/media/not-the-certified-entry.png"; },
    },
    {
      label: "entry content SHA",
      shotIndex: 0,
      blocker: "atomic-transition-entry-reference-still-binding-invalid",
      mutate: (shot) => { shot.media_contract.contentHash = "9".repeat(64); },
    },
    {
      label: "entry media type",
      shotIndex: 0,
      blocker: "atomic-transition-entry-reference-still-binding-invalid",
      mutate: (shot) => { shot.media_contract.type = "video"; },
    },
    {
      label: "exit playback",
      shotIndex: 2,
      blocker: "atomic-transition-exit-reference-still-binding-invalid",
      mutate: (shot) => { shot.media_contract.playbackMode = "loop"; },
    },
    {
      label: "exit certification",
      shotIndex: 2,
      blocker: "atomic-transition-exit-reference-still-binding-invalid",
      mutate: (shot) => { shot.decision_evidence.selectedCandidate.referenceStillCertification.imageSha256 = "8".repeat(64); },
    },
    {
      label: "entry camera motion",
      shotIndex: 0,
      blocker: "atomic-transition-framing-drift",
      mutate: (shot) => { shot.camera_motion = "pan-up"; },
    },
    {
      label: "transition camera intensity",
      shotIndex: 1,
      blocker: "atomic-transition-framing-drift",
      mutate: (shot) => { shot.camera_intensity = 0.2; },
    },
    {
      label: "exit crop drift",
      shotIndex: 2,
      blocker: "atomic-transition-framing-drift",
      mutate: (shot) => { shot.camera_framing_contract.path.corridors[0].endCrop.y += 0.01; },
    },
    {
      label: "entry static off-center crop",
      shotIndex: 0,
      blocker: "atomic-transition-framing-drift",
      mutate: (shot) => {
        shot.camera_framing_contract.path.corridors[0].startCrop.y += 0.01;
        shot.camera_framing_contract.path.corridors[0].endCrop.y += 0.01;
      },
    },
    {
      label: "transition framing schema",
      shotIndex: 1,
      blocker: "atomic-transition-framing-drift",
      mutate: (shot) => { shot.camera_framing_contract.schemaVersion = "hapa.echo.asset-camera-framing.v1"; },
    },
    {
      label: "exit framing media identity",
      shotIndex: 2,
      blocker: "atomic-transition-framing-drift",
      mutate: (shot) => { shot.camera_framing_contract.mediaId = `hapa-media:sha256:${"9".repeat(64)}`; },
    },
    {
      label: "entry framing path identity",
      shotIndex: 0,
      blocker: "atomic-transition-framing-drift",
      mutate: (shot) => { shot.camera_framing_contract.path.mediaId = `hapa-media:sha256:${"9".repeat(64)}`; },
    },
  ];
  const acceptedTamperLabels = [];
  const missingBlockerLabels = [];
  for (const row of cases) {
    const fixture = currentAtomicTransitionAuditFixture(`intentional-tampered-${row.label.replaceAll(" ", "-")}`);
    row.mutate(fixture.variant.timeline[row.shotIndex]);
    const result = auditIntentionalDirectorVariants({
      songs: [{ id: "song-a" }],
      variants: [fixture.variant],
      enrichmentIds: [fixture.transitionId],
      playableEnrichmentIds: [fixture.transitionId],
    });
    if (result.ok) acceptedTamperLabels.push(row.label);
    if (!result.blockers.some((blocker) => (
      blocker.code === row.blocker && blocker.shotIndex === row.shotIndex
    ))) missingBlockerLabels.push(`${row.label}:${row.blocker}`);
  }
  assert.deepEqual(acceptedTamperLabels, [], "certified atomic tampering was accepted");
  assert.deepEqual(missingBlockerLabels, [], "certified atomic tampering lacked its focused blocker");
});

test("intentional cut audit binds the rendered source window to certified physical endpoint times", () => {
  const fixture = currentAtomicTransitionAuditFixture("intentional-source-window-drift");
  const driftedMapping = {
    ...structuredClone(fixture.variant.timeline[1].media_contract.timeMapping),
    sourceOutSeconds: 5,
    sourceDurationSeconds: 5,
    playbackRate: 2.542372,
  };
  fixture.variant.timeline[1].media_contract.sourceOutSeconds = 5;
  fixture.variant.timeline[1].media_contract.timeMapping = structuredClone(driftedMapping);
  fixture.variant.timeline[1].transition_link.timeMapping = structuredClone(driftedMapping);
  fixture.variant.timeline[1].decision_evidence.atomicTransition.timeMapping = structuredClone(driftedMapping);

  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [fixture.variant],
    enrichmentIds: [fixture.entryId, fixture.transitionId, fixture.exitId],
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => (
    blocker.code === "atomic-transition-time-mapping-visual-endpoint-mismatch"
      && blocker.shotIndex === 1
  )));
});

test("intentional cut audit rejects a current-schema transition candidate without authored atomic evidence", () => {
  const transitionId = `hapa-media:sha256:${"c".repeat(64)}`;
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-transition-without-atomic-role",
    parent: { songId: "song-a" },
    enrichmentLineage: { runId: "run-transition-without-atomic-role" },
    timeline: [{
      media_id: transitionId,
      media_contract: { playbackMode: "once" },
      decision_evidence: {
        schemaVersion: ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
        selectedMediaId: transitionId,
        enrichmentId: transitionId,
        selectedCandidate: { motionRole: { kind: "transition" } },
        lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true },
        rationale: "A transition candidate cannot bypass atomic bridge evidence.",
        atomicTransition: null,
      },
    }],
  };

  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [variant],
    enrichmentIds: [transitionId],
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => (
    blocker.code === "transition-candidate-missing-authored-atomic-role"
      && blocker.shotIndex === 0
      && blocker.atomicRole === null
  )));
});

test("intentional cut audit binds authored atomic and selected IDs to the shot's actual media ID", () => {
  const spoofedShotMediaId = `hapa-media:sha256:${"e".repeat(64)}`;
  const fixture = currentAtomicTransitionAuditFixture("intentional-spoofed-shot-media");
  fixture.variant.timeline[1].media_id = spoofedShotMediaId;

  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [fixture.variant],
    enrichmentIds: [fixture.entryId, fixture.transitionId, fixture.exitId],
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => (
    blocker.code === "atomic-transition-shot-media-mismatch"
      && blocker.shotIndex === 1
      && blocker.shotMediaId === spoofedShotMediaId
      && blocker.selectedMediaId === fixture.transitionId
      && blocker.transitionMediaId === fixture.transitionId
  )));
});

test("intentional cut audit rejects missing, corrupt, or divergent atomic endpoint identity", () => {
  const fixture = currentAtomicTransitionAuditFixture("intentional-corrupt-atomic-endpoints");
  fixture.variant.timeline[0].decision_evidence.atomicTransition.firstReference = null;
  fixture.variant.timeline[1].decision_evidence.atomicTransition.endpointIdentityEvidence = "unverified-card-label";
  fixture.variant.timeline[2].decision_evidence.atomicTransition.lastReference.sha256 = "not-a-sha256";

  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [fixture.variant],
    enrichmentIds: [fixture.entryId, fixture.transitionId, fixture.exitId],
  });
  assert.equal(result.ok, false);
  const codes = new Set(result.blockers.map((blocker) => blocker.code));
  for (const code of [
    "atomic-transition-first-reference-incomplete",
    "atomic-transition-last-reference-incomplete",
    "atomic-transition-endpoint-identity-evidence-invalid",
    "atomic-transition-first-reference-mismatch",
    "atomic-transition-last-reference-mismatch",
    "atomic-transition-endpoint-identity-evidence-mismatch",
  ]) assert.equal(codes.has(code), true, code);
});

test("intentional cut audit binds entry and exit stills to the declared Reference Card anchors", () => {
  const fixture = currentAtomicTransitionAuditFixture("intentional-wrong-reference-anchors");
  fixture.variant.timeline[0].decision_evidence.selectedCandidate.referenceAnchorIds = ["reference:wrong-entry"];
  fixture.variant.timeline[2].decision_evidence.selectedCandidate.referenceAnchorIds = ["reference:wrong-exit"];

  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [fixture.variant],
    enrichmentIds: [fixture.entryId, fixture.transitionId, fixture.exitId],
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => (
    blocker.code === "atomic-transition-entry-reference-anchor-mismatch"
      && blocker.shotIndex === 0
      && blocker.expectedReferenceCardId === fixture.firstReference.cardId
  )));
  assert.ok(result.blockers.some((blocker) => (
    blocker.code === "atomic-transition-exit-reference-anchor-mismatch"
      && blocker.shotIndex === 2
      && blocker.expectedReferenceCardId === fixture.lastReference.cardId
  )));
});

test("intentional cut audit rejects malformed current-schema atomic transition structure and identity", () => {
  const entryId = `hapa-media:sha256:${"b".repeat(64)}`;
  const transitionId = `hapa-media:sha256:${"c".repeat(64)}`;
  const exitId = `hapa-media:sha256:${"d".repeat(64)}`;
  const evidence = (selectedMediaId, atomicTransition, neighborContinuity = {}) => ({
    schemaVersion: ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
    selectedMediaId,
    enrichmentId: selectedMediaId,
    lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true },
    rationale: "Malformed atomic transition evidence must fail closed.",
    atomicTransition,
    neighborContinuity,
  });
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-invalid-atomic-transition",
    parent: { songId: "song-a" },
    enrichmentLineage: { runId: "run-invalid-atomic" },
    timeline: [
      {
        decision_evidence: evidence(entryId, {
          role: "entry-reference-loop",
          transitionMediaId: transitionId,
          transitionJobId: "job-entry",
        }, { next: { kind: "measured-last-to-first-chain" } }),
      },
      {
        media_contract: { playbackMode: "loop" },
        transition_link: { id: "wrong-job", mediaId: exitId, playbackMode: "loop" },
        decision_evidence: evidence(transitionId, {
          role: "authored-transition",
          transitionMediaId: transitionId,
          transitionJobId: "job-transition",
        }, {
          previous: { kind: "none" },
          next: { kind: "none" },
        }),
      },
      {
        decision_evidence: evidence(exitId, {
          role: "exit-reference-loop",
          transitionMediaId: exitId,
          transitionJobId: "job-exit",
        }, { previous: { kind: "measured-last-to-first-chain" } }),
      },
    ],
  };

  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [variant],
    enrichmentIds: [entryId, transitionId, exitId],
  });
  assert.equal(result.ok, false);
  const codes = new Set(result.blockers.map((blocker) => blocker.code));
  for (const code of [
    "atomic-transition-job-id-mismatch",
    "atomic-transition-media-id-mismatch",
    "atomic-transition-playback-not-once",
    "atomic-transition-link-identity-mismatch",
    "atomic-transition-link-playback-not-once",
    "atomic-transition-entry-continuity-missing",
    "atomic-transition-exit-continuity-missing",
  ]) assert.equal(codes.has(code), true, code);
});

test("intentional cut audit rejects boundary, orphan, and adjacent current-schema transitions", () => {
  const transitionId = `hapa-media:sha256:${"c".repeat(64)}`;
  const evidence = (role) => ({
    schemaVersion: ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
    selectedMediaId: transitionId,
    enrichmentId: transitionId,
    lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true },
    rationale: "Invalid adjacent transition evidence must fail closed.",
    atomicTransition: {
      role,
      transitionMediaId: transitionId,
      transitionJobId: "job-adjacent",
    },
    neighborContinuity: {},
  });
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-boundary-adjacent-transition",
    parent: { songId: "song-a" },
    enrichmentLineage: { runId: "run-boundary-adjacent" },
    timeline: [
      {
        media_contract: { playbackMode: "once" },
        transition_link: { id: "job-adjacent", mediaId: transitionId, playbackMode: "once" },
        decision_evidence: evidence("authored-transition"),
      },
      {
        media_contract: { playbackMode: "once" },
        transition_link: { id: "job-adjacent", mediaId: transitionId, playbackMode: "once" },
        decision_evidence: evidence("authored-transition"),
      },
      { decision_evidence: evidence("entry-reference-loop") },
      { decision_evidence: evidence("exit-reference-loop") },
    ],
  };

  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [variant],
    enrichmentIds: [transitionId],
  });
  assert.equal(result.ok, false);
  const codes = new Set(result.blockers.map((blocker) => blocker.code));
  assert.equal(codes.has("atomic-transition-boundary"), true);
  assert.equal(codes.has("adjacent-atomic-transitions"), true);
  assert.equal(codes.has("orphan-atomic-transition-entry"), true);
  assert.equal(codes.has("orphan-atomic-transition-exit"), true);
});

test("intentional cut audit rejects unknown evidence schemas with a version-neutral blocker", () => {
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-unknown-evidence",
    parent: { songId: "song-a" },
    enrichmentLineage: { runId: "run-unknown" },
    timeline: [{
      decision_evidence: {
        schemaVersion: "hapa.echo.shot-decision-evidence.v999",
        selectedMediaId: id,
        enrichmentId: id,
        lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true },
        rationale: "Unknown evidence must fail closed.",
      },
    }],
  };

  const result = auditIntentionalDirectorVariants({
    songs: [{ id: "song-a" }],
    variants: [variant],
    enrichmentIds: [id],
  });
  assert.equal(result.ok, false);
  const blocker = result.blockers.find((item) => item.code === "unsupported-shot-evidence-schema");
  assert.deepEqual(blocker, {
    code: "unsupported-shot-evidence-schema",
    songId: "song-a",
    variantId: "intentional-unknown-evidence",
    shotIndex: 0,
    schemaVersion: "hapa.echo.shot-decision-evidence.v999",
    supportedSchemaVersions: ECHO_ENRICHMENT_SUPPORTED_SHOT_EVIDENCE_SCHEMAS,
  });
  assert.equal(result.blockers.some((item) => item.code.includes("v4")), false);
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
