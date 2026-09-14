import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  DURATION_SECONDS,
  LOCAL_CONCURRENCY,
  MAIN_COUPLE_LOOP_PROFILE,
  MAIN_MAN_LOOP_PROFILE,
  REFERENCE_ATLAS_LOOP_PROFILE,
  MODEL,
  PROMOTIONAL_PRICE_PER_SECOND_USD,
  RESOLUTION,
  createEchoTarotLoopGeneration,
  createLoopPrompt,
  flattenLoopJobs,
  loopOutputFilename,
  publicStatus,
  validateFalMediaUrl,
} = require("../electron/echo-tarot-loop-generation.cjs");

async function sourceRun(userDataPath, count = 5, imageRunsDirectory = "Echo Tarot Image Runs", titles = ["Five of Cups", "The Devil", "Knight of Swords", "The Sun", "Ten of Pentacles"]) {
  const root = path.join(userDataPath, imageRunsDirectory);
  const runId = "source-image-run";
  const outputRoot = path.join(root, runId, "outputs");
  await mkdir(outputRoot, { recursive: true });
  const jobs = [];
  for (let index = 0; index < count; index += 1) {
    const outputPath = path.join(outputRoot, `${index}.png`);
    await writeFile(outputPath, Buffer.from(`source-card-${index}`));
    jobs.push({
      id: `image-job-${index}`,
      songId: `song-${index}`,
      songTitle: `Song ${index}`,
      trackNumber: index + 1,
      cardId: `card-${index}`,
      cardTitle: titles[index],
      status: "completed",
      outputPath,
      outputSha256: `sha256:source-${index}`,
    });
  }
  await writeFile(path.join(root, "current-run.json"), JSON.stringify({ runId }));
  await writeFile(path.join(root, runId, "manifest.json"), JSON.stringify({ runId, jobs }));
  return { runId, jobs };
}

function fakeFalClient(requests) {
  let upload = 0;
  return {
    storage: {
      async upload(file, options) {
        upload += 1;
        assert.ok(file instanceof Blob);
        assert.equal(options.lifecycle.expiresIn, "7d");
        return `https://v3.fal.media/files/hapa/source-${upload}.png`;
      },
    },
    queue: {
      async submit(endpoint, options) {
        const requestId = `fal-request-${requests.length + 1}`;
        requests.push({ endpoint, options, requestId });
        return { status: "IN_QUEUE", request_id: requestId, queue_position: requests.length };
      },
      async status(endpoint, { requestId }) {
        assert.equal(endpoint, MODEL);
        return { status: "COMPLETED", request_id: requestId, logs: [], metrics: { inference_time: 1.5 } };
      },
      async result(endpoint, { requestId }) {
        assert.equal(endpoint, MODEL);
        return {
          requestId,
          data: {
            video: { url: `https://v3.fal.media/files/hapa/${requestId}.mp4`, content_type: "video/mp4", file_size: 12 },
            expanded_prompt: "Expanded restrained living-card loop.",
            timings: { inference: 1.5 },
          },
        };
      },
    },
  };
}

test("loop prompts hard-anchor both ends and preserve the Tarot card", () => {
  const prompt = createLoopPrompt({ cardTitle: "Five of Cups", songTitle: "Dear Papa" });
  assert.match(prompt, /Frame 0 and the final frame must return to the supplied card exactly/);
  assert.match(prompt, /water, reflections, mist/);
  assert.match(prompt, /Lock the ornamental frame and all typography/);
  assert.match(prompt, /No camera move, zoom, crop/);
  assert.match(prompt, /Silent loop/);
});

test("lead-specific prompts preserve the male lead and keep both couple identities separate", () => {
  const manPrompt = createLoopPrompt({ cardTitle: "Knight of Swords", songTitle: "Velocity" }, MAIN_MAN_LOOP_PROFILE);
  assert.match(manPrompt, /Keep Hapa Main Man’s face/);
  assert.doesNotMatch(manPrompt, /Keep Hapa Main Woman’s face/);

  const couplePrompt = createLoopPrompt({ cardTitle: "The Lovers", songTitle: "Dear Papa" }, MAIN_COUPLE_LOOP_PROFILE);
  assert.match(couplePrompt, /Keep both Hapa Main Man and Hapa Main Woman faces/);
  assert.match(couplePrompt, /Never merge, swap, duplicate, or replace either identity/);
});

test("only completed local Tarot images become deterministic loop jobs", () => {
  const jobs = flattenLoopJobs({
    runId: "image-run",
    jobs: [
      { id: "one", status: "completed", outputPath: "/safe/one.png", cardTitle: "The Sun", songTitle: "Green", trackNumber: 3 },
      { id: "two", status: "failed", outputPath: "", cardTitle: "The Moon", songTitle: "Blue", trackNumber: 2 },
    ],
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].sourceJobId, "one");
  assert.equal(jobs[0].status, "queued");
  assert.match(jobs[0].id, /^loop:/);
});

test("loop filenames remain unique when a song repeats the same reference title", () => {
  const first = loopOutputFilename({ id: "loop:first-123", trackNumber: 1, songTitle: "Song", cardTitle: "Repeated reference" }, REFERENCE_ATLAS_LOOP_PROFILE);
  const second = loopOutputFilename({ id: "loop:second-456", trackNumber: 1, songTitle: "Song", cardTitle: "Repeated reference" }, REFERENCE_ATLAS_LOOP_PROFILE);
  assert.notEqual(first, second);
  assert.match(first, /echo-reference-loop\.mp4$/);
});

test("Reference Atlas image jobs retain reference identity and receive living-card prompts", () => {
  const jobs = flattenLoopJobs({
    runId: "reference-image-run",
    jobs: [{
      id: "reference-image-one",
      status: "completed",
      outputPath: "/safe/reference.png",
      songId: "song-one",
      songTitle: "Brave Tongues",
      trackNumber: 1,
      referenceId: "R17",
      referenceTitle: "Walt Whitman — participant and witness",
    }],
  }, REFERENCE_ATLAS_LOOP_PROFILE);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].cardId, "R17");
  assert.equal(jobs[0].referenceId, "R17");
  assert.match(jobs[0].prompt, /Echo Album reference artwork/);
  assert.match(jobs[0].prompt, /Preserve every depicted person/);
});

test("FAL media URLs are fail-closed to HTTPS fal.media hosts", () => {
  assert.equal(validateFalMediaUrl("https://v3.fal.media/files/a/video.mp4", "video"), "https://v3.fal.media/files/a/video.mp4");
  assert.throws(() => validateFalMediaUrl("http://v3.fal.media/files/a/video.mp4", "video"), /unexpected/);
  assert.throws(() => validateFalMediaUrl("https://example.com/video.mp4", "video"), /unexpected/);
});

test("the encrypted-key runner gates a three-loop pilot, reuses it in the full queue, and keeps paths and keys private", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "hapa-echo-tarot-loops-"));
  const userDataPath = path.join(temporaryRoot, "user-data");
  const source = await sourceRun(userDataPath);
  const requests = [];
  const postprocessed = [];
  const secret = "fal-test-id:fal-test-secret-value";
  const runner = createEchoTarotLoopGeneration({
    userDataPath,
    localConcurrency: 4,
    sleep: async () => {},
    credentialStore: {
      status: async () => ({ providers: [{ id: "fal", configured: true }] }),
      read: async (providerId) => providerId === "fal" ? secret : null,
    },
    falClientFactory: (apiKey) => {
      assert.equal(apiKey, secret);
      return fakeFalClient(requests);
    },
    mediaPostprocessor: async ({ bytes, durationSeconds }) => {
      postprocessed.push({ bytes: bytes.length, durationSeconds });
      return { bytes: Buffer.concat([bytes, Buffer.from(":silent")]), metadata: { audioRemoved: true, targetDurationSeconds: durationSeconds } };
    },
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from(`video:${url}`),
    }),
  });

  const started = await runner.start();
  assert.equal(started.counts.total, source.jobs.length);
  assert.equal(started.counts.queued, 3);
  assert.equal(started.counts.held, 2);
  await runner._active();

  let status = await runner.status();
  assert.equal(status.state, "pilot-complete");
  assert.equal(status.counts.completed, 3);
  assert.equal(status.counts.held, 2);
  assert.equal(status.model, MODEL);
  assert.equal(status.resolution, RESOLUTION);
  assert.equal(status.durationSeconds, DURATION_SECONDS);
  assert.equal(status.localConcurrency, 4);
  assert.equal(status.usage.estimatedCostUsd, 3 * DURATION_SECONDS * PROMOTIONAL_PRICE_PER_SECOND_USD);
  assert.equal(postprocessed.length, 3);
  assert.ok(!JSON.stringify(status).includes(secret));
  assert.ok(!JSON.stringify(status).includes(temporaryRoot));

  for (const request of requests) {
    assert.equal(request.endpoint, MODEL);
    assert.equal(request.options.input.image_url, request.options.input.end_image_url);
    assert.equal(request.options.input.duration, DURATION_SECONDS);
    assert.equal(request.options.input.resolution, RESOLUTION);
    assert.equal(request.options.input.prompt_expansion_mode, "balanced");
    assert.equal(request.options.headers["X-Fal-Store-IO"], "0");
    assert.equal(request.options.storageSettings.expiresIn, "7d");
  }

  const pilotJob = status.jobs.find((job) => job.hasOutput);
  const asset = await runner.asset({ id: pilotJob.id });
  assert.match(asset.dataUrl, /^data:video\/mp4;base64,/);
  const reviewed = await runner.review({ jobId: pilotJob.id, decision: "approved", note: "Clean seam and preserved card typography." });
  assert.equal(reviewed.job.feedback.decision, "approved");

  await runner.continueFull({ note: "Three pilot loops passed visual review." });
  await runner._active();
  status = await runner.status();
  assert.equal(status.state, "complete");
  assert.equal(status.counts.completed, source.jobs.length);
  assert.equal(status.counts.held, 0);
  assert.equal(status.pilotReview.decision, "approved");
  assert.equal(requests.length, source.jobs.length);
  assert.equal(postprocessed.length, source.jobs.length);

  const pointer = JSON.parse(await readFile(path.join(userDataPath, "Echo Tarot Loop Runs", "current-run.json"), "utf8"));
  const manifest = await readFile(path.join(userDataPath, "Echo Tarot Loop Runs", pointer.runId, "manifest.json"), "utf8");
  assert.ok(!manifest.includes(secret));
});

test("the public defaults advertise bounded local concurrency and promotional cost", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "hapa-echo-tarot-loop-status-"));
  const runner = createEchoTarotLoopGeneration({
    userDataPath: temporaryRoot,
    credentialStore: { status: async () => ({ providers: [{ id: "fal", configured: false }] }), read: async () => null },
    falClientFactory: () => fakeFalClient([]),
  });
  const status = await runner.status();
  assert.equal(status.state, "not-started");
  assert.equal(status.localConcurrency, LOCAL_CONCURRENCY);
  assert.equal(status.usage.promotionalUnitCostUsd, 0.05);
  assert.equal(status.credentialConfigured, false);
});

test("profile runners use isolated source and output roots", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "hapa-echo-tarot-man-loops-"));
  const userDataPath = path.join(temporaryRoot, "user-data");
  await sourceRun(userDataPath, 5, MAIN_MAN_LOOP_PROFILE.imageRunsDirectory);
  const requests = [];
  const runner = createEchoTarotLoopGeneration({
    userDataPath,
    profile: MAIN_MAN_LOOP_PROFILE,
    sleep: async () => {},
    credentialStore: {
      status: async () => ({ providers: [{ id: "fal", configured: true }] }),
      read: async () => "fal-test-id:fal-test-secret-value",
    },
    falClientFactory: () => fakeFalClient(requests),
    mediaPostprocessor: async ({ bytes }) => ({ bytes, metadata: { audioRemoved: true, targetDurationSeconds: 5 } }),
    fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from("video") }),
  });

  await runner.start();
  await runner._active();
  const status = await runner.status();
  assert.equal(status.profileId, "main-man");
  assert.equal(status.profileLabel, "Hapa Main Man");
  assert.equal(status.counts.completed, 3);
  const pointer = JSON.parse(await readFile(path.join(userDataPath, MAIN_MAN_LOOP_PROFILE.runsDirectory, "current-run.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(userDataPath, MAIN_MAN_LOOP_PROFILE.runsDirectory, pointer.runId, "manifest.json"), "utf8"));
  assert.equal(manifest.profileId, "main-man");
  assert.ok(manifest.jobs.filter((job) => job.outputPath).every((job) => job.outputPath.endsWith("hapa-main-man-loop.mp4")));
});

test("Reference Atlas budget mode auto-starts only affordable jobs and records the hard cap", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "hapa-echo-reference-loops-"));
  const userDataPath = path.join(temporaryRoot, "user-data");
  await sourceRun(userDataPath, 5, REFERENCE_ATLAS_LOOP_PROFILE.imageRunsDirectory, ["One", "Two", "Three", "Four", "Five"]);
  const requests = [];
  const runner = createEchoTarotLoopGeneration({
    userDataPath,
    profile: REFERENCE_ATLAS_LOOP_PROFILE,
    maxSpendUsd: 0.16,
    localConcurrency: 4,
    sleep: async () => {},
    credentialStore: {
      status: async () => ({ providers: [{ id: "fal", configured: true }] }),
      read: async () => "fal-test-id:fal-test-secret-value",
    },
    falClientFactory: () => fakeFalClient(requests),
    mediaPostprocessor: async ({ bytes }) => ({ bytes, metadata: { audioRemoved: true, targetDurationSeconds: 5 } }),
    fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from("video") }),
  });

  await runner.start();
  await runner._active();
  const status = await runner.status();
  assert.equal(status.state, "budget-complete");
  assert.equal(status.counts.completed, 3);
  assert.equal(status.counts.held, 2);
  assert.equal(status.budget.hardLimitUsd, 0.16);
  assert.equal(status.budget.plannedSpendUsd, 0.15);
  assert.equal(requests.length, 3);
});

test("public status distinguishes provider inference from end-to-end throughput", () => {
  const manifest = {
    schemaVersion: "hapa.echo-tarot-loop-generation.v1",
    runId: "run-1",
    sourceImageRunId: "image-run-1",
    state: "complete",
    mode: "full",
    startedAt: "2026-09-13T17:44:11.000Z",
    finishedAt: "2026-09-13T17:45:11.000Z",
    durationSeconds: 5,
    resolution: "768P",
    promptExpansionMode: "balanced",
    localConcurrency: 3,
    pricePerSecondUsd: 0.01,
    pricingObservedAt: "2026-09-13",
    promotionEnds: "2026-09-14",
    retryWaves: [{ failedCount: 4, previousConcurrency: 12, retryConcurrency: 3, startedAt: "2026-09-13T17:45:00.000Z", reason: "download recovery" }],
    jobs: [
      { id: "one", status: "completed", timings: { inference: 1.2 }, usage: { estimatedCostUsd: 0.05 } },
      { id: "two", status: "completed", timings: { inference: 1.4 }, usage: { estimatedCostUsd: 0.05 } },
    ],
  };
  const status = publicStatus(manifest, { credentialConfigured: true, sourceAvailable: true });
  assert.equal(status.initialConcurrency, 12);
  assert.equal(status.localConcurrency, 3);
  assert.equal(status.retryWaves.length, 1);
  assert.equal(status.inference.sampleCount, 2);
  assert.equal(status.inference.averageSeconds, 1.3);
  assert.equal(status.inference.medianSeconds, 1.4);
  assert.equal(status.throughputPerMinute, 2);
});
