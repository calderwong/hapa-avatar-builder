import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  auditRefCardsCertifiedDirectorFamily,
  REF_CARDS_PHYSICAL_SAMPLE_CONTRACT,
  REF_CARDS_TRANSITION_TIME_MAP_SCHEMA,
} from "../scripts/audit-ref-cards-certified-director-family.mjs";
import { stableEchoEnrichmentStringify } from "../src/domain/echo-enrichment-director-variant.js";

const BATCH = "sha256:ref-cards-certified-test-batch";
const JOB_A = "ref-cards-transition:job-a";
const JOB_B = "ref-cards-transition:job-b";
const JOB_Q = "ref-cards-transition:job-quarantined";

function clone(value) {
  return structuredClone(value);
}

function digestPhysical(report) {
  const core = clone(report);
  delete core.resultDigestSha256;
  return createHash("sha256").update(stableEchoEnrichmentStringify(core)).digest("hex");
}

function jobFixture(jobId, index, decision = "certified") {
  const firstSha = String(index + 1).repeat(64).slice(0, 64);
  const lastSha = String(index + 4).repeat(64).slice(0, 64);
  const mediaSha = String(index + 7).repeat(64).slice(0, 64);
  return {
    jobId,
    mediaId: `hapa-media:sha256:${mediaSha}`,
    runtimeUri: `/media/ref-cards/${jobId.split(":").at(-1)}.mp4`,
    video: { frameCount: 72, durationSeconds: 3, fps: 24 },
    endpoints: {
      first: {
        decision: decision === "certified" ? "certified" : "quarantined",
        decodedFrame: { frameIndex: 0, nominalAtSeconds: 0 },
        sourceTiming: {
          contractId: REF_CARDS_PHYSICAL_SAMPLE_CONTRACT,
          authoredSourceSeconds: 0,
        },
        declaredReference: {
          cardId: `reference:${jobId}:first`,
          uri: `/media/references/${jobId.split(":").at(-1)}-first.png`,
          declaredSha256: firstSha,
        },
      },
      last: {
        decision,
        decodedFrame: { frameIndex: 71, nominalAtSeconds: 71 / 24 },
        sourceTiming: {
          contractId: REF_CARDS_PHYSICAL_SAMPLE_CONTRACT,
          authoredSourceSeconds: 71 / 24,
        },
        declaredReference: {
          cardId: `reference:${jobId}:last`,
          uri: `/media/references/${jobId.split(":").at(-1)}-last.png`,
          declaredSha256: lastSha,
        },
      },
    },
    decision,
  };
}

function timeMap(job) {
  return {
    schemaVersion: REF_CARDS_TRANSITION_TIME_MAP_SCHEMA,
    valid: true,
    mode: "fit-source-once-to-cue",
    playbackMode: "once",
    reachesDeclaredLastFrame: true,
    sourceInSeconds: 0,
    sourceOutSeconds: 71 / 24,
    endpointFrameSampling: {
      policy: REF_CARDS_PHYSICAL_SAMPLE_CONTRACT,
      firstSeconds: 0,
      lastSeconds: 71 / 24,
    },
    preRoll: "hold-first-frame",
    postRoll: "hold-last-frame",
    playbackRate: 1,
    maximumPlaybackRate: 5,
  };
}

function holdShot(job, role) {
  const endpoint = role === "entry-reference-still" ? job.endpoints.first : job.endpoints.last;
  return {
    media_id: `hapa-media:sha256:${endpoint.declaredReference.declaredSha256}`,
    media_uri: endpoint.declaredReference.uri,
    media_contract: {
      playbackMode: "hold",
      provenance: "certified-transition-reference-still",
    },
    decision_evidence: {
      atomicTransition: {
        role,
        transitionJobId: job.jobId,
      },
    },
  };
}

function transitionShot(job) {
  const mapping = timeMap(job);
  return {
    media_id: job.mediaId,
    media_uri: job.runtimeUri,
    media_contract: {
      playbackMode: "once",
      sourceInSeconds: 0,
      sourceOutSeconds: 71 / 24,
      timeMapping: clone(mapping),
    },
    decision_evidence: {
      atomicTransition: {
        role: "authored-transition",
        transitionJobId: job.jobId,
        timeMapping: clone(mapping),
        visualValidation: {
          decision: "certified",
          jobId: job.jobId,
          mediaId: job.mediaId,
          endpoints: {
            first: { frameIndex: 0, sourceTimeSeconds: 0 },
            last: { frameIndex: 71, sourceTimeSeconds: 71 / 24 },
          },
        },
      },
    },
  };
}

function placement(job) {
  return {
    jobId: job.jobId,
    mediaId: job.mediaId,
    firstReferenceId: job.endpoints.first.declaredReference.cardId,
    lastReferenceId: job.endpoints.last.declaredReference.cardId,
    selection: { kind: "explicit-assignment" },
    transitionTimeMap: timeMap(job),
  };
}

function finalVariant(songId, jobA, jobB) {
  const id = `ref-cards-certified-${songId}`;
  return {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id,
    status: "ready",
    createdAt: "2026-08-03T12:00:00.000Z",
    updatedAt: "2026-08-03T12:00:00.000Z",
    parent: { songId },
    variationSet: { batchFingerprint: BATCH },
    validation: { ok: true },
    telemetry: {
      placedTransitions: 2,
      selectedTransitionShots: 2,
      referenceStillHoldShots: 4,
      selectedUniqueTransitionJobs: [jobA.jobId, jobB.jobId],
      transitionPlan: [placement(jobA), placement(jobB)],
    },
    timeline: [
      holdShot(jobA, "entry-reference-still"),
      transitionShot(jobA),
      holdShot(jobA, "exit-reference-still"),
      holdShot(jobB, "entry-reference-still"),
      transitionShot(jobB),
      holdShot(jobB, "exit-reference-still"),
    ],
  };
}

function fixture() {
  const songs = ["song-one", "song-two"];
  const jobA = jobFixture(JOB_A, 0);
  const jobB = jobFixture(JOB_B, 1);
  const jobQ = jobFixture(JOB_Q, 2, "quarantined");
  const physicalValidation = {
    schemaVersion: "hapa.echo.transition-endpoint-visual-validation.v1",
    algorithm: { sourceSampleContract: { id: REF_CARDS_PHYSICAL_SAMPLE_CONTRACT } },
    aggregate: {
      declaredTransitionCount: 3,
      certifiedJobs: 2,
      quarantinedJobs: 1,
      wrongReferenceControls: { fullCertificationRulePass: 0 },
    },
    jobs: [jobA, jobB, jobQ],
  };
  physicalValidation.resultDigestSha256 = digestPhysical(physicalValidation);

  const chainGraph = {
    declaredTransitions: [
      {
        transitionMediaId: jobA.mediaId,
        transitionLink: { id: JOB_A, sourceRelativePath: "run2/run3/job-a.mp4" },
      },
      {
        transitionMediaId: jobB.mediaId,
        transitionLink: { id: JOB_B, sourceRelativePath: "run2/job-b.mp4" },
      },
      {
        transitionMediaId: jobQ.mediaId,
        transitionLink: { id: JOB_Q, sourceRelativePath: "run2/job-q.mp4" },
      },
    ],
  };

  const finalVariants = songs.map((songId) => finalVariant(songId, jobA, jobB));
  const variants = songs.flatMap((songId, index) => [
    {
      songId,
      relativePath: `${songId}/older-${songId}.json`,
      variant: {
        schemaVersion: "hapa.echo.direction-script-variant.v1",
        id: `older-${songId}`,
        status: "ready",
        createdAt: "2026-08-02T12:00:00.000Z",
        updatedAt: "2026-08-02T12:00:00.000Z",
        parent: { songId },
        timeline: [{ id: `old-${index}` }],
      },
    },
    {
      songId,
      relativePath: `${songId}/${finalVariants[index].id}.json`,
      variant: finalVariants[index],
    },
  ]);
  const cuts = finalVariants.map((variant) => ({
    songId: variant.parent.songId,
    variantId: variant.id,
  }));
  const reuse = { [JOB_A]: 2, [JOB_B]: 2 };
  const appendReport = {
    schemaVersion: "hapa.echo.enrichment-director-variant-report.v1",
    mode: "apply",
    dryRun: false,
    batch: { batchFingerprint: BATCH },
    enrichment: {
      transitionAssignments: {
        declaredJobs: 3,
        certifiedJobs: 2,
        songs: 2,
        enrichmentRows: 2,
        quarantinedRows: 1,
        songsWithoutCertifiedTransitions: [],
      },
      transitionEndpoints: {
        visualValidation: {
          verified: true,
          resultDigestSha256: physicalValidation.resultDigestSha256,
          certifiedJobs: 2,
          quarantinedJobs: 1,
          certifiedJobIds: [JOB_A, JOB_B],
          quarantinedJobIds: [JOB_Q],
        },
      },
    },
    variants: {
      songs: 2,
      cuts,
      motion: {
        placedTransitions: 4,
        authoredTransitionShots: 4,
        referenceStillHoldShots: 8,
        explicitTransitionPlacements: 4,
        inferredTransitionPlacements: 0,
        maximumTransitionJobReuse: 2,
        uniqueAuthoredTransitionJobs: [JOB_A, JOB_B],
        transitionJobReuse: reuse,
        songsByTransitionCount: { "2": 2 },
        songsWithoutTransitions: [],
      },
    },
    validation: {
      exactSongCoverage: true,
      oneCutPerSong: true,
      allCutsReady: true,
      baseProjectsMutated: 0,
      existingVariantsMutated: 0,
      indexMatchesDiskAfterApply: true,
    },
  };
  const variantIndex = {
    enrichmentDirectorBatch: {
      batchFingerprint: BATCH,
      songCount: 2,
      cutCount: 2,
      appendOnly: true,
    },
    variants: cuts.map((cut) => ({
      songId: cut.songId,
      variantId: cut.variantId,
      relativePath: `${cut.songId}/${cut.variantId}.json`,
    })),
  };
  return {
    appendReport,
    variantIndex,
    variants,
    physicalValidation,
    chainGraph,
    expectations: {
      songs: 2,
      transitionsPerSong: 2,
      certifiedJobs: 2,
      quarantinedJobs: 1,
      run3CertifiedJobs: null,
      minimumJobReuse: 2,
      maximumJobReuse: 2,
    },
  };
}

test("accepts a complete newest Ref Cards family with atomic holds and physical once-through maps", () => {
  const result = auditRefCardsCertifiedDirectorFamily(fixture());
  assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
  assert.deepEqual(result.totals, {
    songs: 2,
    newestSelectorCoverage: 2,
    placedTransitions: 4,
    authoredTransitionShots: 4,
    referenceHolds: 8,
    certifiedJobs: 2,
    quarantinedJobs: 1,
    selectedCertifiedJobs: 2,
    selectedQuarantinedJobs: 0,
    run3CertifiedJobs: 1,
    run3CertifiedJobsSelected: 1,
    minimumJobReuse: 2,
    maximumJobReuse: 2,
    reuseDistribution: { "2": 2 },
    unresolvedMedia: 0,
    priorVibesJobIds: 0,
  });
  assert.deepEqual(result.run3CertifiedJobIds, [JOB_A]);
});

test("rejects a transition shot whose render contract loops or misses the terminal frame", () => {
  const input = fixture();
  const current = input.variants.find((row) => row.variant.id === "ref-cards-certified-song-one").variant;
  current.timeline[1].media_contract.playbackMode = "loop";
  current.timeline[1].media_contract.timeMapping.sourceOutSeconds = 1;
  const result = auditRefCardsCertifiedDirectorFamily(input);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((entry) => entry.code === "transition-playback-contract"));
  assert.ok(result.failures.some((entry) => entry.code === "invalid-physical-time-map"));
});

test("rejects a reported cut that the production newest selector would not choose", () => {
  const input = fixture();
  input.variants.push({
    songId: "song-one",
    relativePath: "song-one/newer-unreported.json",
    variant: {
      schemaVersion: "hapa.echo.direction-script-variant.v1",
      id: "newer-unreported",
      status: "ready",
      createdAt: "2026-08-04T12:00:00.000Z",
      updatedAt: "2026-08-04T12:00:00.000Z",
      parent: { songId: "song-one" },
      timeline: [{ id: "newest" }],
    },
  });
  const result = auditRefCardsCertifiedDirectorFamily(input);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((entry) => entry.code === "newest-selector"));
});

test("derives run3 certification from declaration sourceRelativePath and rejects a pinned mismatch", () => {
  const input = fixture();
  input.expectations.run3CertifiedJobs = 2;
  const result = auditRefCardsCertifiedDirectorFamily(input);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((entry) => entry.code === "run3-certified-coverage"));
  assert.deepEqual(result.run3CertifiedJobIds, [JOB_A]);
});

test("rejects quarantined playback even when a cut authors a complete-looking triplet", () => {
  const input = fixture();
  const quarantined = input.physicalValidation.jobs.find((job) => job.jobId === JOB_Q);
  const current = input.variants.find((row) => row.variant.id === "ref-cards-certified-song-one").variant;
  current.telemetry.transitionPlan[1] = placement(quarantined);
  current.telemetry.selectedUniqueTransitionJobs = [JOB_A, JOB_Q];
  current.timeline.splice(
    3,
    3,
    holdShot(quarantined, "entry-reference-still"),
    transitionShot(quarantined),
    holdShot(quarantined, "exit-reference-still"),
  );
  const result = auditRefCardsCertifiedDirectorFamily(input);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((entry) => entry.code === "quarantined-transition-selected"));
  assert.equal(result.totals.selectedQuarantinedJobs, 1);
});

test("rejects stale Vibes lineage and any wrong-reference certification control pass", () => {
  const input = fixture();
  const legacyId = "vibes-transition:legacy-q";
  input.physicalValidation.jobs[2].jobId = legacyId;
  input.chainGraph.declaredTransitions[2].transitionLink.id = legacyId;
  input.appendReport.enrichment.transitionEndpoints.visualValidation.quarantinedJobIds = [legacyId];
  input.physicalValidation.aggregate.wrongReferenceControls.fullCertificationRulePass = 1;
  input.physicalValidation.resultDigestSha256 = digestPhysical(input.physicalValidation);
  input.appendReport.enrichment.transitionEndpoints.visualValidation.resultDigestSha256 = input.physicalValidation.resultDigestSha256;
  const result = auditRefCardsCertifiedDirectorFamily(input);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((entry) => entry.code === "legacy-vibes-declaration"));
  assert.ok(result.failures.some((entry) => entry.code === "legacy-vibes-physical-job"));
  assert.ok(result.failures.some((entry) => entry.code === "wrong-reference-control-pass"));
});
