import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stableEchoEnrichmentStringify } from "../src/domain/echo-enrichment-director-variant.js";
import {
  ECHO_CHAIN_GRAPH_SCHEMA,
  ECHO_ENRICHMENT_REPORT_SCHEMA,
  REF_CARDS_TRANSITION_COMPILER,
  REF_CARDS_TRANSITION_RECEIPT_SCHEMA,
} from "../scripts/build-ref-cards-transition-contracts.mjs";
import {
  finalizeRefCardsTransitionContracts,
  REF_CARDS_TRANSITION_FINALIZER,
} from "../scripts/finalize-ref-cards-transition-contracts.mjs";

const FIXED_TIME = "2026-08-03T00:00:00.000Z";

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Contract(value) {
  return sha256Bytes(stableEchoEnrichmentStringify(value));
}

function jobFixture(index) {
  const hash = String(index + 1).repeat(64);
  const mediaId = `hapa-media:sha256:${hash}`;
  const jobId = `ref-cards-transition:job-${index + 1}`;
  const first = {
    role: "first",
    cardId: `reference:first-${index + 1}`,
    cardRevisionId: `reference:first-${index + 1}:r1`,
    cardTitle: `First ${index + 1}`,
    assetId: `reference:first-${index + 1}:image`,
    frameId: `reference-frame:first-${index + 1}`,
    sha256: "a".repeat(64),
    uri: `/media/reference-first-${index + 1}.png`,
    sourceCardUnchanged: true,
  };
  const last = {
    role: "last",
    cardId: `reference:last-${index + 1}`,
    cardRevisionId: `reference:last-${index + 1}:r1`,
    cardTitle: `Last ${index + 1}`,
    assetId: `reference:last-${index + 1}:image`,
    frameId: `reference-frame:last-${index + 1}`,
    sha256: "b".repeat(64),
    uri: `/media/reference-last-${index + 1}.png`,
    sourceCardUnchanged: true,
  };
  const link = { id: jobId, mediaId, provider: "provider-neutral-ref-cards" };
  return {
    hash,
    mediaId,
    jobId,
    declaration: {
      classification: "declared-transition",
      transitionMediaId: mediaId,
      transitionLink: link,
      sourceFrame: first,
      targetFrame: last,
      visuallyValidated: false,
    },
    enrichment: {
      schemaVersion: "hapa.echo.video-enrichment.v1",
      id: mediaId,
      mediaId,
      sha256: hash,
      contentHash: { algorithm: "sha256", value: hash },
      runtimeUri: `/media/job-${index + 1}.mp4`,
      playable: true,
      decodeStatus: "decoded",
      status: "ready",
      flow: {
        transition: {
          eligible: true,
          declaredTransition: true,
          classification: "declared-transition",
          visuallyValidated: false,
          declaredEndpoints: { first, last, link },
        },
      },
      continuity: {
        transition: {
          eligible: true,
          declaredTransition: true,
          classification: "declared-transition",
          visuallyValidated: false,
          declaredEndpoints: { first, last, link },
        },
      },
      recognition: {
        frames: [
          { marker: "first", atSeconds: 0.02 },
          { marker: "last", atSeconds: 1.92 },
        ],
      },
    },
  };
}

function physicalJob(job, decision) {
  const certified = decision === "certified";
  return {
    jobId: job.jobId,
    mediaId: job.mediaId,
    video: {
      actualSha256: job.hash,
      frameCount: 2,
      durationSeconds: 2,
      fps: 1,
    },
    sourceSamples: {
      contractId: "physical-terminal-frame-presentation-pts-v1",
      first: { frameIndex: 0, authoredSourceSeconds: 0 },
      last: { frameIndex: 1, authoredSourceSeconds: 1 },
    },
    endpoints: {
      first: {
        decodedFrame: { frameIndex: 0 },
        sourceTiming: { authoredSourceSeconds: 0 },
        decision: certified ? "certified" : "quarantine",
      },
      last: {
        decodedFrame: { frameIndex: 1 },
        sourceTiming: { authoredSourceSeconds: 1 },
        decision: certified ? "certified" : "quarantine",
      },
    },
    decision,
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ref-transition-finalize-"));
  const candidateDirectory = path.join(root, "candidate");
  const projectsDirectory = path.join(root, "projects");
  await Promise.all([mkdir(candidateDirectory), mkdir(projectsDirectory)]);
  const jobs = [jobFixture(0), jobFixture(1), jobFixture(2)];
  const preservedLegacyRow = {
    schemaVersion: "hapa.echo.video-enrichment.v1",
    id: "hapa-media:legacy-provider-transition",
    mediaId: "hapa-media:legacy-provider-transition",
    sha256: "f".repeat(64),
    contentHash: { algorithm: "sha256", value: "f".repeat(64) },
    runtimeUri: "/media/legacy-provider-transition.mp4",
    playable: true,
    decodeStatus: "decoded",
    status: "ready",
    quality: { score: 0.91, label: "preserve-me" },
    flow: {
      transition: {
        eligible: true,
        declaredTransition: true,
        classification: "declared-transition",
        declaredEndpoints: { link: { id: "vibes-transition:preserved-legacy" } },
      },
    },
  };
  const graph = {
    schemaVersion: ECHO_CHAIN_GRAPH_SCHEMA,
    generatedAt: FIXED_TIME,
    method: "fixture-candidate-graph",
    nodes: jobs.map((job) => ({ id: job.mediaId, mediaId: job.mediaId })),
    edges: [],
    alternatesBySource: {},
    declaredTransitions: jobs.map((job) => job.declaration),
    totals: { declaredTransitions: jobs.length },
  };
  const enrichments = [...jobs.map((job) => job.enrichment), preservedLegacyRow];
  const candidateReport = {
    schemaVersion: ECHO_ENRICHMENT_REPORT_SCHEMA,
    complete: true,
    generatedAt: FIXED_TIME,
    batchFingerprint: "c".repeat(64),
    counts: {
      manifestVideos: enrichments.length,
      enrichmentRows: enrichments.length,
      chainEdges: 0,
      declaredTransitions: jobs.length,
      declaredTransitionsAwaitingVisualValidation: jobs.length,
    },
  };
  const graphBytes = Buffer.from(`${JSON.stringify(graph, null, 2)}\n`);
  const enrichmentsBytes = Buffer.from(`${enrichments.map((row) => JSON.stringify(row)).join("\n")}\n`);
  const reportBytes = Buffer.from(`${JSON.stringify(candidateReport, null, 2)}\n`);
  await Promise.all([
    writeFile(path.join(candidateDirectory, "chain-graph.json"), graphBytes),
    writeFile(path.join(candidateDirectory, "enrichments.ndjson"), enrichmentsBytes),
    writeFile(path.join(candidateDirectory, "report.json"), reportBytes),
  ]);
  const receiptCore = {
    schemaVersion: REF_CARDS_TRANSITION_RECEIPT_SCHEMA,
    generatedAt: FIXED_TIME,
    compiler: REF_CARDS_TRANSITION_COMPILER,
    inputBinding: { inputManifestDigest: `sha256:${"d".repeat(64)}` },
    outputs: {
      "chain-graph.json": { sha256: sha256Bytes(graphBytes), bytes: graphBytes.length },
      "enrichments.ndjson": { sha256: sha256Bytes(enrichmentsBytes), bytes: enrichmentsBytes.length },
      "report.json": { sha256: sha256Bytes(reportBytes), bytes: reportBytes.length },
    },
    totals: {},
    validation: {},
  };
  await writeFile(path.join(candidateDirectory, "build-receipt.json"), `${JSON.stringify({
    ...receiptCore,
    resultDigestSha256: sha256Contract(receiptCore),
  }, null, 2)}\n`);

  const referenceCatalogPath = path.join(root, "reference-catalog.json");
  const referenceCatalogBytes = Buffer.from(`${JSON.stringify({
    schemaVersion: "hapa.echo-reference-animated-media-catalog.v1",
    records: [],
  }, null, 2)}\n`);
  await writeFile(referenceCatalogPath, referenceCatalogBytes);
  const physicalCore = {
    schemaVersion: "hapa.echo.transition-endpoint-visual-validation.v1",
    generatedAt: FIXED_TIME,
    algorithm: {
      id: "center-crop-luma-ssim-phash-edge-v3-physical-terminal-pts",
      sourceSampleContract: { id: "physical-terminal-frame-presentation-pts-v1" },
      thresholds: { ssimMin: 0.9, pHashDistanceMax: 10, edgeCorrelationMin: 0.75 },
    },
    inputs: {
      chainGraph: { sha256: sha256Bytes(graphBytes) },
      enrichments: { sha256: sha256Bytes(enrichmentsBytes) },
      referenceCatalog: { sha256: sha256Bytes(referenceCatalogBytes) },
      declaredTransitionCount: jobs.length,
    },
    aggregate: { certifiedJobs: 2, quarantinedJobs: 1 },
    jobs: [physicalJob(jobs[0], "certified"), physicalJob(jobs[1], "certified"), physicalJob(jobs[2], "quarantine")],
  };
  const physicalValidationPath = path.join(root, "physical-validation.json");
  await writeFile(physicalValidationPath, `${JSON.stringify({
    ...physicalCore,
    resultDigestSha256: sha256Contract(physicalCore),
  }, null, 2)}\n`);
  for (const song of [
    { id: "dear-papa-song-alpha", title: "Alpha" },
    { id: "dear-papa-song-beta", title: "Beta" },
  ]) {
    await writeFile(path.join(projectsDirectory, `${song.id}.json`), `${JSON.stringify({
      music_video_project: { song_id: song.id, song_title: song.title },
    })}\n`);
  }
  return { root, candidateDirectory, projectsDirectory, referenceCatalogPath, physicalValidationPath, jobs };
}

function options(value, outputDirectory) {
  return {
    candidateDirectory: value.candidateDirectory,
    physicalValidationPath: value.physicalValidationPath,
    referenceCatalogPath: value.referenceCatalogPath,
    projectsDirectory: value.projectsDirectory,
    outputDirectory,
    expectedSongCount: 2,
  };
}

test("finalizer keeps only certified declarations, demotes quarantines, and assigns two distinct jobs per song", async () => {
  const value = await fixture();
  const outputA = path.join(value.root, "final-a");
  const outputB = path.join(value.root, "final-b");
  const first = await finalizeRefCardsTransitionContracts(options(value, outputA));
  const second = await finalizeRefCardsTransitionContracts(options(value, outputB));
  assert.equal(first.certifiedJobs, 2);
  assert.equal(first.quarantinedJobs, 1);
  assert.equal(first.assignmentPairs, 4);
  assert.equal(first.assignmentJobReuseMaximum, 2);
  assert.equal(first.finalGraphPhysicalRevalidationRequired, true);

  const graph = JSON.parse(await readFile(path.join(outputA, "chain-graph.json")));
  assert.equal(graph.declaredTransitions.length, 2);
  assert.deepEqual(graph.declaredTransitions.map((row) => row.transitionLink.id).sort(), value.jobs.slice(0, 2).map((job) => job.jobId).sort());
  assert.equal(graph.declaredTransitions.some((row) => row.transitionLink.id === value.jobs[2].jobId), false);
  assert.equal(graph.truthBoundary.finalGraphRevalidationRequired, true);
  assert.equal(graph.declaredTransitions.every((row) => row.visuallyValidated === false), true);

  const enrichments = (await readFile(path.join(outputA, "enrichments.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
  const quarantined = enrichments.find((row) => row.mediaId === value.jobs[2].mediaId);
  assert.equal(quarantined.flow.transition.eligible, false);
  assert.equal(quarantined.flow.transition.declaredTransition, false);
  assert.equal(quarantined.flow.transition.visualValidationDecision, "quarantine");
  const preservedLegacy = enrichments.find((row) => row.mediaId === "hapa-media:legacy-provider-transition");
  assert.equal(preservedLegacy.flow.transition.declaredEndpoints.link.id, "vibes-transition:preserved-legacy");
  assert.deepEqual(preservedLegacy.quality, { score: 0.91, label: "preserve-me" });
  for (const job of value.jobs.slice(0, 2)) {
    const certified = enrichments.find((row) => row.mediaId === job.mediaId);
    assert.equal(certified.flow.transition.declaredTransition, true);
    assert.equal(certified.flow.transition.visuallyValidated, false);
    assert.equal(certified.flow.transition.visualValidationDecision, "awaiting-final-graph-physical-revalidation");
  }

  const assignments = JSON.parse(await readFile(path.join(outputA, "transition-assignment-report.json")));
  assert.equal(assignments.schemaVersion, "hapa.echo.transition-director-script-report.v1");
  assert.equal(assignments.assignment.source, "ref-cards-certified-transition-family");
  assert.equal(assignments.assignment.songs.length, 2);
  assert.equal(assignments.assignment.songs.every((row) => row.jobIds.length === 2), true);
  assert.equal(assignments.assignment.songs.every((row) => new Set(row.jobIds).size === 2), true);
  assert.equal(assignments.balance.jobUsageMinimum, 2);
  assert.equal(assignments.balance.jobUsageMaximum, 2);
  assert.equal(assignments.balance.jobUsageMaximumPolicy, 3);

  const finalReport = JSON.parse(await readFile(path.join(outputA, "finalization-report.json")));
  assert.equal(finalReport.compiler, REF_CARDS_TRANSITION_FINALIZER);
  assert.equal(finalReport.validation.onlyCertifiedJobsDeclared, true);
  assert.equal(finalReport.validation.assignmentMaximumReuseWithinPolicy, true);
  assert.equal(finalReport.validation.finalGraphPhysicalRevalidationRequired, true);

  const names = (await readdir(outputA)).sort();
  assert.deepEqual(names, (await readdir(outputB)).sort());
  for (const name of names) assert.deepEqual(await readFile(path.join(outputA, name)), await readFile(path.join(outputB, name)), `${name} must replay deterministically`);
  assert.equal(second.assignmentPairs, first.assignmentPairs);
});

test("finalizer rejects a physical report not bound to the exact candidate graph", async () => {
  const value = await fixture();
  const physical = JSON.parse(await readFile(value.physicalValidationPath));
  physical.inputs.chainGraph.sha256 = "f".repeat(64);
  const core = structuredClone(physical);
  delete core.resultDigestSha256;
  physical.resultDigestSha256 = sha256Contract(core);
  await writeFile(value.physicalValidationPath, `${JSON.stringify(physical, null, 2)}\n`);
  await assert.rejects(
    finalizeRefCardsTransitionContracts(options(value, path.join(value.root, "rejected"))),
    /not bound to the candidate chain graph/u,
  );
});
