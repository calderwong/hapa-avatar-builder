import assert from "node:assert/strict";
import test from "node:test";

import {
  ECHO_EXTERNAL_REFERENCE_RESEARCH_RESULT_SCHEMA,
  ECHO_EXTERNAL_REFERENCE_RESOLUTION_SCHEMA,
  buildCodexExternalReferenceResearchArgs,
  buildEchoExternalReferenceCycle,
  calibrateEchoExternalReferenceCandidate,
  claimEchoExternalReferenceJobs,
  compactEchoExternalReferenceCycle,
  enrichEchoExternalReferenceResolutionEvidence,
  projectEchoExternalReferenceResults,
  reclassifyIntegratedEchoExternalReferenceJob,
  restrictIntegratedEchoExternalReferenceSignals,
  resolveEchoExternalReferenceJob,
  seedEchoExternalReferenceLoop,
  submitEchoExternalReferenceResult,
  validateEchoExternalReferenceResearchResult,
} from "../src/domain/echo-external-reference-loop.js";

test("places the global web-search flag before the Codex exec subcommand", () => {
  const args = buildCodexExternalReferenceResearchArgs({
    schemaPath: "/tmp/schema.json",
    outputPath: "/tmp/output.json",
    workingDirectory: "/tmp/research",
  });
  assert.deepEqual(args.slice(0, 8), [
    "--search",
    "--sandbox",
    "read-only",
    "--ask-for-approval",
    "never",
    "-C",
    "/tmp/research",
    "exec",
  ]);
  assert.equal(args[8], "--ephemeral");
  assert.equal(args[args.length - 1], "-");
});

test("compacts a cycle into a receipt with externalized heavy artifacts", () => {
  const receipt = compactEchoExternalReferenceCycle({
    cycleId: "cycle-one",
    projectedRun: { runHash: "run-hash", cards: [{ id: "large" }] },
    sharpening: { sharpeningRunId: "sharpen-one", database: { large: true } },
    artManifest: { manifestId: "manifest-one", jobs: [{ id: "art" }] },
  }, {
    projectedRun: "cycles/001-projected-run.json",
    sharpening: "cycles/001-sharpening.json",
    artManifest: "cycles/001-gpt-image-manifest.json",
  });
  assert.equal(receipt.cycleId, "cycle-one");
  assert.equal(receipt.projectedRun, undefined);
  assert.equal(receipt.sharpening, undefined);
  assert.equal(receipt.artManifest, undefined);
  assert.equal(receipt.artifacts.projectedRunHash, "run-hash");
  assert.equal(receipt.artifacts.sharpeningRunId, "sharpen-one");
  assert.equal(receipt.artifacts.artManifestId, "manifest-one");
});

test("demotes low-confidence external canon to evidence-backed ambiguity", () => {
  const candidate = calibrateEchoExternalReferenceCandidate({
    disposition: "external-reference",
    reference: {
      title: "Speculative Canon",
      aliases: [],
      referenceType: "motif",
      publicContext: "A plausible but weakly selected motif.",
    },
    jobAnalyses: [{ confidence: 0.78 }],
    researchNotes: "Sources establish the motif but not the lyric selection.",
  });
  assert.equal(candidate.disposition, "ambiguous");
  assert.equal(candidate.reference.title, "");
  assert.match(candidate.researchNotes, /Automatic confidence hold/);
});

function fixture() {
  const song = {
    id: "song-one",
    title: "Song One",
    trackNumber: 1,
    lyricsStatus: "available",
    lyrics: [
      { lineNumber: 1, text: "I am Carraway beside the light", normalized: "i am carraway beside the light", isSectionHeading: false },
      { lineNumber: 2, text: "Gatsby throws fireworks at night", normalized: "gatsby throws fireworks at night", isSectionHeading: false },
    ],
    detectorSignals: { properNames: ["Carraway", "Gatsby"] },
  };
  const run = {
    runId: "run-one",
    runHash: "hash-one",
    packetHash: "packet-one",
    minerVersion: "test",
    packet: { songs: [song] },
    cards: [],
    graph: { graphHash: "graph-one", edges: [] },
    contributions: [],
    unresolved: [],
  };
  const sharpening = {
    sharpeningRunId: "sharpen-one",
    database: {
      researchQueue: [{
        id: "reference-research:song-one",
        songId: "song-one",
        songTitle: "Song One",
        status: "research-ready",
        priority: 0.9,
        externalReferenceDeficit: 3,
        candidateClues: [
          { key: "carraway", phrase: "Carraway", score: 0.9 },
          { key: "gatsby", phrase: "Gatsby", score: 0.88 },
        ],
        internalContext: [],
        researchQuestions: [
          "Does “Carraway” call a public work?",
          "Does “Gatsby” call a public work?",
        ],
        requiredOutput: { exactLyricSpanRequired: true, automaticCanonPromotionAllowed: false },
      }],
    },
  };
  return { run, sharpening };
}

function result(jobId) {
  return {
    schemaVersion: ECHO_EXTERNAL_REFERENCE_RESEARCH_RESULT_SCHEMA,
    jobId,
    reference: {
      title: "The Great Gatsby",
      aliases: ["Gatsby", "Carraway", "Nick Carraway"],
      referenceType: "external-work",
      publicContext: "Nick Carraway narrates a story centered on his extravagant neighbor Jay Gatsby and Gatsby's pursuit of Daisy.",
    },
    sources: [{
      id: "gatsby-source",
      label: "Project Gutenberg — The Great Gatsby",
      url: "https://www.gutenberg.org/ebooks/64317",
      sourceClass: "primary-source",
      supportsClaim: "The novel is narrated by Nick Carraway and centers on Jay Gatsby.",
      retrievedAt: "2026-07-26",
    }],
    lyricEvidence: [{
      songId: "song-one",
      lineNumber: 1,
      lyricText: "I am Carraway beside the light",
      matchedText: "Carraway",
    }],
    reading: {
      withoutContext: "A quiet witness stays beside someone.",
      withContext: "Carraway contributes the role of observant narrator beside Gatsby's spectacle.",
      narrativeConsequence: "The lyric chooses witness and steadiness over spectacle.",
    },
    themeDelta: { effect: "reframes", takeaway: "Love becomes attentive witness rather than grand performance." },
    alternativeReadings: [{ summary: "Carraway may also be a private name independent of the novel." }],
    sharedLanguage: {
      symbols: ["green light", "fireworks"],
      themes: ["witness", "spectacle"],
      characters: ["Nick Carraway", "Jay Gatsby"],
      narrativeBeats: ["observer enters another person's world"],
      mechanics: ["witness without taking over"],
      emotions: ["restraint"],
      audioMotifs: [],
    },
    signals: { literal: ["Gatsby", "Carraway", "Nick Carraway"] },
    confidence: 0.95,
    caveat: "The source expands a plausible reading but does not prove exclusive authorial intent.",
    authority: { authorialIntentEstablished: false, canonStatus: "non-canon" },
    researcher: { id: "test-researcher", model: "test-model" },
  };
}

test("seeds clue-sized research jobs and claims a bounded batch", () => {
  const { run, sharpening } = fixture();
  const loop = seedEchoExternalReferenceLoop(run, sharpening, () => "2026-07-26T00:00:00.000Z");
  assert.equal(loop.jobs.length, 2);
  const claimed = claimEchoExternalReferenceJobs(loop, { runner: "codex", limit: 1 }, () => "2026-07-26T00:01:00.000Z");
  assert.equal(claimed.claimed.length, 1);
  assert.equal(claimed.claimed[0].status, "claimed");
});

test("rejects loose evidence and validates an exact sourced contribution", () => {
  const { run, sharpening } = fixture();
  const loop = seedEchoExternalReferenceLoop(run, sharpening);
  const job = loop.jobs[0];
  const good = result(job.id);
  assert.equal(validateEchoExternalReferenceResearchResult(good, run, job).valid, true);
  const bad = structuredClone(good);
  bad.lyricEvidence[0].lyricText = "wrong";
  bad.sources[0].url = "file:///secret";
  const validation = validateEchoExternalReferenceResearchResult(bad, run, job);
  assert.equal(validation.valid, false);
  assert(validation.errors.includes("invalid-source-url:gatsby-source"));
  assert(validation.errors.some((error) => error.startsWith("lyric-text-mismatch")));
});

test("integrates validated research, rechecks all lyrics, and plans GPT Image art", () => {
  const { run, sharpening } = fixture();
  let loop = seedEchoExternalReferenceLoop(run, sharpening);
  const claimed = claimEchoExternalReferenceJobs(loop, { runner: "codex", limit: 1 });
  loop = claimed.loop;
  const submitted = submitEchoExternalReferenceResult(loop, run, { result: result(claimed.claimed[0].id) });
  assert.equal(submitted.validation.valid, true);
  const cycle = buildEchoExternalReferenceCycle({
    sourceRun: run,
    acceptedResults: [submitted.result],
    options: { minimumExternalReferences: 1, minimumInternalSongLinks: 1 },
  });
  assert.equal(cycle.changes[0].occurrencesAfter, 1);
  assert.equal(cycle.quality.newOccurrencesFoundByRecheck, 0);
  assert.equal(cycle.quality.heldAmbiguousRechecks, 1);
  assert.equal(cycle.artManifest.jobs.length, 1);
  assert.equal(cycle.artManifest.jobs[0].status, "planned");
});

test("records an evidence-bearing no-reference resolution without fabricating a Card", () => {
  const { run, sharpening } = fixture();
  let loop = seedEchoExternalReferenceLoop(run, sharpening);
  const claimed = claimEchoExternalReferenceJobs(loop, { runner: "codex", limit: 1 });
  loop = claimed.loop;
  const resolved = resolveEchoExternalReferenceJob(loop, {
    resolution: {
      schemaVersion: ECHO_EXTERNAL_REFERENCE_RESOLUTION_SCHEMA,
      jobId: claimed.claimed[0].id,
      disposition: "no-supported-reference",
      rationale: "The phrase behaves as ordinary connective language in this lyric and no attributable public canon was established.",
      searchQueries: ["exact lyric phrase external reference"],
      caveat: "A future creator clue may reopen the candidate.",
    },
  });
  assert.equal(resolved.valid, true);
  assert.equal(resolved.loop.jobs[0].status, "resolved-no-reference");
  assert.ok(resolved.resolution.resolutionHash);
});

test("enriches an ambiguous resolution with attributable alternative sources", () => {
  const { run, sharpening } = fixture();
  let loop = seedEchoExternalReferenceLoop(run, sharpening);
  const claimed = claimEchoExternalReferenceJobs(loop, { runner: "codex", limit: 1 });
  const resolved = resolveEchoExternalReferenceJob(claimed.loop, {
    resolution: {
      schemaVersion: ECHO_EXTERNAL_REFERENCE_RESOLUTION_SCHEMA,
      jobId: claimed.claimed[0].id,
      disposition: "ambiguous",
      rationale: "Two public canons remain plausible.",
      searchQueries: ["candidate phrase canon"],
      caveat: "Do not select one canon without another clue.",
    },
  });
  const enriched = enrichEchoExternalReferenceResolutionEvidence(resolved.loop, {
    jobId: claimed.claimed[0].id,
    sources: [{
      id: "official-alternative",
      label: "Official alternative",
      url: "https://example.com/official-alternative",
      sourceClass: "official-source",
      supportsClaim: "Establishes one of the competing public canons.",
    }],
  }, () => "2026-07-26T03:00:00.000Z");
  assert.equal(enriched.valid, true);
  assert.equal(enriched.resolution.sources.length, 1);
  assert.ok(enriched.loop.jobs[0].history.some((event) => event.event === "resolution-evidence-enriched"));
});

test("reclassifies an integrated result while preserving its audit evidence", () => {
  const { run, sharpening } = fixture();
  let loop = seedEchoExternalReferenceLoop(run, sharpening);
  const claimed = claimEchoExternalReferenceJobs(loop, { runner: "codex", limit: 1 });
  const submitted = submitEchoExternalReferenceResult(claimed.loop, run, {
    result: result(claimed.claimed[0].id),
  });
  loop = {
    ...submitted.loop,
    jobs: submitted.loop.jobs.map((job) => job.id === claimed.claimed[0].id ? {
      ...job,
      status: "integrated",
      resultHash: "prior-result-hash",
    } : job),
  };
  const reclassified = reclassifyIntegratedEchoExternalReferenceJob(loop, {
    resolution: {
      jobId: claimed.claimed[0].id,
      disposition: "ambiguous",
      rationale: "The human audit found that two public canons remain equally plausible.",
      searchQueries: ["candidate competing public canons"],
      sources: result(claimed.claimed[0].id).sources,
      caveat: "Keep both readings unresolved.",
    },
    reviewer: { id: "reviewer" },
  }, () => "2026-07-26T04:00:00.000Z");
  assert.equal(reclassified.valid, true);
  assert.equal(reclassified.loop.jobs[0].status, "resolved-ambiguous");
  assert.equal(reclassified.loop.jobs[0].rejectedResultHash, "prior-result-hash");
  assert.ok(reclassified.loop.jobs[0].history.some((event) => event.event === "integrated-result-reclassified"));
});

test("keeps an integrated Card while restricting automatic propagation signals", () => {
  const { run, sharpening } = fixture();
  let loop = seedEchoExternalReferenceLoop(run, sharpening);
  const claimed = claimEchoExternalReferenceJobs(loop, { runner: "codex", limit: 1 });
  const submitted = submitEchoExternalReferenceResult(claimed.loop, run, {
    result: result(claimed.claimed[0].id),
  });
  loop = {
    ...submitted.loop,
    jobs: submitted.loop.jobs.map((job) => job.id === claimed.claimed[0].id ? {
      ...job,
      status: "integrated",
      resultHash: "prior-result-hash",
    } : job),
  };
  const restricted = restrictIntegratedEchoExternalReferenceSignals(loop, run, {
    jobId: claimed.claimed[0].id,
    literalSignals: ["I am Carraway beside the light"],
    reviewer: { id: "reviewer" },
  }, () => "2026-07-26T05:00:00.000Z");
  assert.equal(restricted.valid, true);
  assert.deepEqual(restricted.loop.jobs[0].result.signals.literal, ["I am Carraway beside the light"]);
  assert.deepEqual(restricted.loop.jobs[0].result.signals.phonetic, []);
  assert.deepEqual(restricted.loop.jobs[0].result.propagationSignals, ["I am Carraway beside the light"]);
  const projection = projectEchoExternalReferenceResults(run, [restricted.loop.jobs[0].result]);
  assert.deepEqual(
    projection.projectedRun.cards[0].occurrences.map((occurrence) => occurrence.lyricSpan.lineStart),
    [1],
  );
  assert.ok(restricted.loop.jobs[0].history.some((event) => event.event === "integrated-result-signals-restricted"));
});

test("closes duplicate research work against an already attributable occurrence", () => {
  const { run, sharpening } = fixture();
  let loop = seedEchoExternalReferenceLoop(run, sharpening);
  const claimed = claimEchoExternalReferenceJobs(loop, { runner: "local-reconciler", limit: 1 });
  loop = claimed.loop;
  const resolved = resolveEchoExternalReferenceJob(loop, {
    resolution: {
      schemaVersion: ECHO_EXTERNAL_REFERENCE_RESOLUTION_SCHEMA,
      jobId: claimed.claimed[0].id,
      disposition: "existing-reference",
      targetCardId: "reference:the-great-gatsby",
      occurrenceId: "song-one:the-great-gatsby:lines-1-1",
      rationale: "The exact lyric target already has an attributable occurrence.",
      searchQueries: [],
      caveat: "Closing duplicate work does not promote canon.",
    },
  });
  assert.equal(resolved.valid, true);
  assert.equal(resolved.loop.jobs[0].status, "resolved-existing-reference");
});

test("accepts a local source-structure pointer instead of pretending a web search occurred", () => {
  const { run, sharpening } = fixture();
  const loop = seedEchoExternalReferenceLoop(run, sharpening);
  const claimed = claimEchoExternalReferenceJobs(loop, { runner: "local-triage", limit: 1 });
  const resolved = resolveEchoExternalReferenceJob(claimed.loop, {
    resolution: {
      schemaVersion: ECHO_EXTERNAL_REFERENCE_RESOLUTION_SCHEMA,
      jobId: claimed.claimed[0].id,
      disposition: "no-supported-reference",
      rationale: "The exact source line is a structural section label.",
      searchQueries: [],
      evidencePointers: ["hapa://echos/song-one?line=1"],
      caveat: "The decision is bound to the unchanged source line.",
    },
  });
  assert.equal(resolved.valid, true);
  assert.deepEqual(resolved.resolution.evidencePointers, ["hapa://echos/song-one?line=1"]);
});

test("reseed preserves terminal research decisions when the exact lyric target is unchanged", () => {
  const { run, sharpening } = fixture();
  let loop = seedEchoExternalReferenceLoop(run, sharpening, () => "2026-07-26T00:00:00.000Z");
  const claimed = claimEchoExternalReferenceJobs(loop, { runner: "codex", limit: 1 });
  const resolved = resolveEchoExternalReferenceJob(claimed.loop, {
    resolution: {
      schemaVersion: ECHO_EXTERNAL_REFERENCE_RESOLUTION_SCHEMA,
      jobId: claimed.claimed[0].id,
      disposition: "ambiguous",
      rationale: "Two public canons remain plausible and the lyric does not disambiguate them.",
      searchQueries: ["Carraway phrase public canon"],
      caveat: "Do not select one canon without another clue.",
    },
  });
  loop = seedEchoExternalReferenceLoop(
    { ...run, runId: "run-two", runHash: "hash-two" },
    sharpening,
    () => "2026-07-26T01:00:00.000Z",
    resolved.loop,
  );
  assert.equal(loop.jobs[0].status, "resolved-ambiguous");
  assert.ok(loop.jobs[0].history.some((event) => event.event === "reseed-preserved"));
});
