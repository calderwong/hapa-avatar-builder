const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  COST_PER_MILLION,
  MODEL,
  MODEL_SNAPSHOT,
  FALLBACK_MODEL,
  FALLBACK_MODEL_SNAPSHOT,
  extractUsage,
} = require("./echo-tarot-image-generation.cjs");

const SCHEMA_VERSION = "hapa.echo-reference-image-generation.v1";
const RUNS_DIRECTORY = "Echo Reference Image Runs";
const CURRENT_FILENAME = "current-run.json";
const MANIFEST_FILENAME = "manifest.json";
const SIZE = "1024x1536";
const QUALITY = "high";
const DEFAULT_BUDGET_RESERVATION_USD = 0.05;
const SUNBURST_MODELS = [MODEL, MODEL_SNAPSHOT];
const FLARE_MODELS = [FALLBACK_MODEL, FALLBACK_MODEL_SNAPSHOT];

function generationError(code, message, status = 0) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function isInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function slug(value = "") {
  return String(value || "untitled").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 72) || "untitled";
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function sanitizeError(error) {
  return String(error?.message || error || "Image generation failed.")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[redacted]")
    .slice(0, 1200);
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await fs.rename(temporary, filePath);
    await fs.chmod(filePath, 0o600);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function publicJob(job = {}) {
  return {
    id: job.id,
    promptId: job.promptId,
    songId: job.songId,
    songTitle: job.songTitle,
    trackNumber: job.trackNumber,
    referenceId: job.referenceId,
    referenceTitle: job.referenceTitle,
    status: job.status,
    attemptCount: job.attemptCount || 0,
    requestDurationSeconds: Number(job.requestDurationSeconds || 0),
    apiAttempts: Number(job.apiAttempts || 0),
    retryWaitMs: Number(job.retryWaitMs || 0),
    error: job.error || "",
    usage: job.usage || null,
    feedback: job.feedback || null,
    hasOutput: Boolean(job.outputPath),
  };
}

function publicStatus(manifest, credentialConfigured = false) {
  if (!manifest) return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    state: "not-started",
    credentialConfigured,
    model: MODEL,
    size: SIZE,
    quality: QUALITY,
    counts: { total: 0, held: 0, queued: 0, running: 0, completed: 0, failed: 0 },
    concurrency: { pilot: 6, full: 12, active: 0 },
    performance: { elapsedSeconds: 0, completedPerMinute: 0, medianRequestSeconds: 0, p95RequestSeconds: 0, rateLimitEvents: 0, retryEvents: 0 },
    usage: { estimatedCostUsd: 0, currency: "USD" },
    budget: null,
    jobs: [],
  };
  const counts = { total: manifest.jobs.length, held: 0, queued: 0, running: 0, completed: 0, failed: 0 };
  let cost = 0;
  for (const job of manifest.jobs) {
    if (Object.hasOwn(counts, job.status)) counts[job.status] += 1;
    cost += Number(job.usage?.estimatedCostUsd || 0);
  }
  const durations = manifest.jobs.map((job) => Number(job.requestDurationSeconds || 0)).filter((value) => value > 0).sort((a, b) => a - b);
  const percentile = (fraction) => durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * fraction) - 1)] : 0;
  const start = Date.parse(manifest.startedAt || manifest.createdAt || "");
  const finish = Date.parse(manifest.finishedAt || "");
  const elapsedSeconds = Number.isFinite(start) ? Math.max(0, ((Number.isFinite(finish) ? finish : Date.now()) - start) / 1000) : 0;
  return {
    ok: true,
    schemaVersion: manifest.schemaVersion,
    runId: manifest.runId,
    passId: manifest.passId,
    state: manifest.state,
    mode: manifest.mode,
    createdAt: manifest.createdAt,
    startedAt: manifest.startedAt,
    finishedAt: manifest.finishedAt,
    credentialConfigured,
    model: manifest.model,
    modelSnapshot: manifest.modelSnapshot,
    modelAccessConfirmed: manifest.modelAccessConfirmed,
    size: manifest.size,
    quality: manifest.quality,
    counts,
    concurrency: manifest.concurrency,
    performance: {
      elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
      completedPerMinute: elapsedSeconds > 0 ? Number((counts.completed * 60 / elapsedSeconds).toFixed(3)) : 0,
      medianRequestSeconds: Number(percentile(0.5).toFixed(3)),
      p95RequestSeconds: Number(percentile(0.95).toFixed(3)),
      rateLimitEvents: Number(manifest.performance?.rateLimitEvents || 0),
      retryEvents: Number(manifest.performance?.retryEvents || 0),
    },
    usage: { estimatedCostUsd: Number(cost.toFixed(6)), currency: "USD", pricingBasis: COST_PER_MILLION },
    budget: manifest.budget ? {
      ...manifest.budget,
      remainingEstimatedUsd: Number(Math.max(0, Number(manifest.budget.limitUsd || 0) - cost).toFixed(6)),
    } : null,
    blocker: manifest.blocker || null,
    jobs: manifest.jobs.map(publicJob),
  };
}

function flattenJobs(albumPayload = {}) {
  const jobs = [];
  const seen = new Set();
  for (const song of albumPayload.songs || []) {
    for (const item of song.knowledge?.referenceImagePrompts || []) {
      if (!item.id || !item.prompt || seen.has(item.id)) continue;
      seen.add(item.id);
      jobs.push({
        id: `job:${sha256(item.id).slice(7, 23)}`,
        promptId: item.id,
        passId: item.passId || "",
        songId: song.id || item.songId,
        songTitle: song.title || item.songTitle,
        trackNumber: Number(song.trackNumber || item.trackNumber || 0),
        referenceId: item.referenceId || "",
        referenceTitle: item.referenceTitle || "Lyric-only visual thesis",
        evidenceClass: item.evidenceClass || "U",
        reviewPrompt: item.prompt,
        prompt: item.generationPrompt || item.prompt,
        promptHash: sha256(item.generationPrompt || item.prompt),
        status: "queued",
        attemptCount: 0,
        outputPath: "",
        usage: null,
        feedback: null,
      });
    }
  }
  return jobs.sort((left, right) => left.trackNumber - right.trackNumber || left.referenceId.localeCompare(right.referenceId));
}

function flattenIntelligenceJobs(intelligenceManifest = {}) {
  const jobs = [];
  const seen = new Set();
  for (const songJob of intelligenceManifest.jobs || []) {
    for (const connection of songJob.plan?.connections || []) {
      for (const [conceptIndex, concept] of (connection.concepts || []).entries()) {
        if (!concept.id || !concept.imagePrompt || !concept.qualityAssessment?.ready || seen.has(concept.id)) continue;
        seen.add(concept.id);
        jobs.push({
          id: `job:${sha256(concept.id).slice(7, 23)}`,
          promptId: concept.id,
          passId: intelligenceManifest.runId || "",
          songId: songJob.songId,
          songTitle: songJob.songTitle,
          trackNumber: Number(songJob.trackNumber || 0),
          referenceId: connection.referenceId || "",
          referenceTitle: connection.referenceTitle || "Lyric-only visual intelligence",
          evidenceClass: "reasoning-authored",
          reviewPrompt: concept.foundationRationale || concept.memoryHook,
          prompt: concept.imagePrompt,
          promptHash: sha256(concept.imagePrompt),
          intelligencePlanId: songJob.plan?.planId || "",
          visualConceptTitle: concept.title || "",
          memoryHook: concept.memoryHook || "",
          retrievalTags: concept.retrievalTags || [],
          qualityAssessment: concept.qualityAssessment,
          conceptOrdinal: conceptIndex + 1,
          status: "queued",
          attemptCount: 0,
          outputPath: "",
          usage: null,
          feedback: null,
        });
      }
    }
  }
  return jobs.sort((left, right) => left.trackNumber - right.trackNumber || left.referenceId.localeCompare(right.referenceId) || left.promptId.localeCompare(right.promptId));
}

function prioritizeCoverageJobs(jobs = []) {
  return [...jobs].sort((left, right) => Number(left.conceptOrdinal || 1) - Number(right.conceptOrdinal || 1)
    || left.trackNumber - right.trackNumber
    || left.referenceId.localeCompare(right.referenceId)
    || left.promptId.localeCompare(right.promptId));
}

function selectPilotJobs(jobs = [], count = 6) {
  const preferred = [
    (job) => job.songTitle === "Miss Infinity" && job.referenceId === "R54",
    (job) => job.songTitle === "Brave Tongues" && job.referenceId === "R17",
    (job) => job.songTitle === "Orange",
    (job) => job.songTitle === "Asuna with the Tea" && job.referenceId === "R01",
    (job) => !job.referenceId,
    (job) => job.evidenceClass === "T",
  ];
  const selected = [];
  const ids = new Set();
  for (const predicate of preferred) {
    const match = jobs.find((job) => predicate(job) && !ids.has(job.id));
    if (match) { selected.push(match); ids.add(match.id); }
  }
  for (const job of jobs) {
    if (selected.length >= count) break;
    if (!ids.has(job.id)) { selected.push(job); ids.add(job.id); }
  }
  return selected.slice(0, count);
}

function sleepDefault(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createEchoReferenceImageGeneration({
  userDataPath,
  credentialStore,
  pilotConcurrency = 6,
  fullConcurrency = 12,
  pilotCount = 6,
  fetchImpl = globalThis.fetch,
  sleep = sleepDefault,
  now = () => new Date(),
  maxAttempts = 4,
} = {}) {
  if (!userDataPath || !credentialStore?.read || typeof fetchImpl !== "function") throw generationError("generation_boundary", "Reference image generation requires local app data, the encrypted credential store, and fetch.");
  const runsRoot = path.join(path.resolve(userDataPath), RUNS_DIRECTORY);
  const intelligenceRunsRoot = path.join(path.resolve(userDataPath), "Echo Reference Intelligence Runs");
  const currentPointerPath = path.join(runsRoot, CURRENT_FILENAME);
  let activePromise = null;
  let pauseRequested = false;
  let saveChain = Promise.resolve();
  let rateLimitGateUntil = 0;

  const boundedConcurrency = (value) => Math.max(1, Math.min(24, Math.floor(Number(value) || 1)));

  async function credentialConfigured() {
    try { return Boolean((await credentialStore.status()).providers?.find((provider) => provider.id === "openai")?.configured); } catch { return false; }
  }

  async function currentManifestPath() {
    try {
      const pointer = await readJson(currentPointerPath);
      const candidate = path.join(runsRoot, pointer.runId, MANIFEST_FILENAME);
      return isInside(runsRoot, candidate) ? candidate : "";
    } catch { return ""; }
  }

  async function loadCurrentManifest() {
    const manifestPath = await currentManifestPath();
    if (!manifestPath) return null;
    try { return await readJson(manifestPath); } catch { return null; }
  }

  async function saveManifest(manifest) {
    manifest.updatedAt = now().toISOString();
    await atomicWriteJson(path.join(runsRoot, manifest.runId, MANIFEST_FILENAME), manifest);
    await atomicWriteJson(currentPointerPath, { runId: manifest.runId, updatedAt: manifest.updatedAt });
  }

  async function persistManifest(manifest) {
    const operation = saveChain.then(() => saveManifest(manifest));
    saveChain = operation.catch(() => {});
    return operation;
  }

  async function resolveAvailableModel(apiKey) {
    try {
      const response = await fetchImpl("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!response.ok) throw new Error(`model list failed (${response.status})`);
      const ids = new Set(((await response.json())?.data || []).map((model) => model.id));
      const sunburst = SUNBURST_MODELS.find((id) => ids.has(id));
      const flare = FLARE_MODELS.find((id) => ids.has(id));
      if (sunburst) return { model: sunburst, modelSnapshot: MODEL_SNAPSHOT, fallbackModel: flare || FALLBACK_MODEL, accessConfirmed: true };
      if (flare) return { model: flare, modelSnapshot: FALLBACK_MODEL_SNAPSHOT, fallbackModel: flare, accessConfirmed: true };
    } catch {}
    return { model: MODEL, modelSnapshot: MODEL_SNAPSHOT, fallbackModel: FALLBACK_MODEL, accessConfirmed: false };
  }

  async function loadAlbumPrompts(apiBase, { songIds = [] } = {}) {
    const response = await fetchImpl(new URL("/api/echos/song-notebook", apiBase), { cache: "no-store" });
    if (!response.ok) throw generationError("prompt_corpus_unavailable", `The Echo Album prompt corpus could not be loaded (${response.status}).`, response.status);
    const payload = await response.json();
    let intelligenceJobs = [];
    try {
      const pointer = await readJson(path.join(intelligenceRunsRoot, CURRENT_FILENAME));
      const manifestPath = path.join(intelligenceRunsRoot, pointer.runId, MANIFEST_FILENAME);
      if (isInside(intelligenceRunsRoot, manifestPath)) {
        const intelligenceManifest = await readJson(manifestPath);
        if (["complete", "complete-with-errors"].includes(intelligenceManifest.state)) intelligenceJobs = flattenIntelligenceJobs(intelligenceManifest);
      }
    } catch { /* The legacy staged corpus remains available until an intelligence pass completes. */ }
    const stagedJobs = flattenJobs(payload);
    const jobsByPrompt = new Map(stagedJobs.map((job) => [job.promptId, job]));
    for (const job of intelligenceJobs) jobsByPrompt.set(job.promptId, job);
    let jobs = [...jobsByPrompt.values()];
    const requestedSongIds = new Set((songIds || []).map((value) => String(value || "").trim()).filter(Boolean));
    if (requestedSongIds.size) jobs = jobs.filter((job) => requestedSongIds.has(String(job.songId || "")));
    if (!jobs.length) throw generationError("prompt_corpus_empty", "The Echo Album has no staged Reference Atlas image prompts.");
    return { payload, jobs };
  }

  async function createManifest(apiBase, { mode = "pilot", budgetUsd = 0, reservationPerImageUsd = DEFAULT_BUDGET_RESERVATION_USD, songIds = [] } = {}) {
    if (!await credentialConfigured()) throw generationError("openai_key_missing", "Add an OpenAI API key in Provider API keys before starting generation.");
    const apiKey = await credentialStore.read("openai");
    const selectedModel = await resolveAvailableModel(apiKey);
    const { payload, jobs: loadedJobs } = await loadAlbumPrompts(apiBase, { songIds });
    const jobs = mode === "budget" ? prioritizeCoverageJobs(loadedJobs) : loadedJobs;
    const pilot = selectPilotJobs(jobs, pilotCount);
    const pilotIds = new Set(pilot.map((job) => job.id));
    const createdAt = now().toISOString();
    const runId = `echo-reference-images-${createdAt.replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
    const runDirectory = path.join(runsRoot, runId);
    await fs.mkdir(path.join(runDirectory, "outputs"), { recursive: true, mode: 0o700 });
    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      runId,
      passId: jobs[0]?.passId || "",
      mode,
      state: "queued",
      createdAt,
      updatedAt: createdAt,
      startedAt: "",
      finishedAt: "",
      model: selectedModel.model,
      modelSnapshot: selectedModel.modelSnapshot,
      fallbackModel: selectedModel.fallbackModel,
      modelAccessConfirmed: selectedModel.accessConfirmed,
      size: SIZE,
      quality: QUALITY,
      outputFormat: "png",
      pilotCount,
      concurrency: { pilot: boundedConcurrency(pilotConcurrency), full: boundedConcurrency(fullConcurrency), active: boundedConcurrency(pilotConcurrency) },
      performance: { rateLimitEvents: 0, retryEvents: 0 },
      album: { title: payload.album?.title || "Echo Album / Dear Papa", songCount: new Set(jobs.map((job) => job.songId)).size, promptCount: jobs.length, requestedSongIds: [...songIds] },
      custody: { storage: "local-app-data", repositoryWrites: false, credentialExposure: false, humanReviewRequired: true },
      budget: mode === "budget" ? {
        limitUsd: Number(budgetUsd),
        reservationPerImageUsd: Number(reservationPerImageUsd),
        basis: "Hard local dispatch ceiling using a conservative per-image reservation; actual usage is recorded from each API response.",
      } : null,
      jobs: jobs.map((job) => ({ ...job, status: ["budget", "selected"].includes(mode) || pilotIds.has(job.id) ? "queued" : "held" })),
    };
    await saveManifest(manifest);
    return manifest;
  }

  async function requestImage(apiKey, manifest, job) {
    let lastError = null;
    let requestModel = manifest.model;
    let retryEvents = 0;
    let rateLimitEvents = 0;
    let retryWaitMs = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const gateWait = Math.max(0, rateLimitGateUntil - Date.now());
      if (gateWait) await sleep(gateWait);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
      try {
        const response = await fetchImpl("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: requestModel, prompt: job.prompt, size: SIZE, quality: QUALITY, output_format: "png", n: 1 }),
          signal: controller.signal,
        });
        const requestId = response.headers?.get?.("x-request-id") || "";
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = payload?.error?.message || `OpenAI image request failed (${response.status}).`;
          if (SUNBURST_MODELS.includes(requestModel) && !manifest.modelAccessConfirmed && /does not have access to model/i.test(message)) {
            requestModel = manifest.fallbackModel || FALLBACK_MODEL;
            manifest.model = requestModel;
            manifest.modelSnapshot = FALLBACK_MODEL_SNAPSHOT;
            continue;
          }
          const error = generationError("openai_request_failed", message, response.status);
          error.requestId = requestId;
          error.retryAfter = Number(response.headers?.get?.("retry-after") || 0);
          throw error;
        }
        const encoded = payload?.data?.[0]?.b64_json;
        if (!encoded) throw generationError("openai_output_missing", "OpenAI returned no image bytes.");
        return { bytes: Buffer.from(encoded, "base64"), usage: extractUsage(payload.usage || {}), requestId, apiAttempts: attempt, retryEvents, rateLimitEvents, retryWaitMs };
      } catch (error) {
        lastError = error;
        const retryable = error?.name === "AbortError" || error?.name === "TypeError" || /fetch failed/i.test(String(error?.message || "")) || [408, 409, 429].includes(error?.status) || Number(error?.status || 0) >= 500;
        if (!retryable || attempt >= maxAttempts) break;
        const waitMs = Math.max(Number(error.retryAfter || 0) * 1000, Math.min(60_000, 2_000 * (2 ** (attempt - 1))));
        retryEvents += 1;
        retryWaitMs += waitMs;
        if (error?.status === 429) { rateLimitEvents += 1; rateLimitGateUntil = Math.max(rateLimitGateUntil, Date.now() + waitMs); }
        await sleep(waitMs);
      } finally { clearTimeout(timeout); }
    }
    const terminal = lastError || generationError("openai_request_failed", "OpenAI image generation failed.");
    terminal.retryEvents = retryEvents;
    terminal.rateLimitEvents = rateLimitEvents;
    terminal.retryWaitMs = retryWaitMs;
    throw terminal;
  }

  async function processQueue() {
    const manifest = await loadCurrentManifest();
    if (!manifest) return;
    const apiKey = await credentialStore.read("openai");
    if (!apiKey) { manifest.state = "blocked"; manifest.blocker = { code: "openai_key_missing", message: "OpenAI credential is not configured." }; await saveManifest(manifest); return; }
    pauseRequested = false;
    manifest.state = "running";
    manifest.startedAt ||= now().toISOString();
    manifest.jobs = manifest.jobs.map((job) => job.status === "running" ? { ...job, status: "queued", error: "Recovered after interrupted session." } : job);
    await persistManifest(manifest);
    async function worker() {
      while (!pauseRequested) {
        if (manifest.budget) {
          const spent = manifest.jobs.reduce((sum, item) => sum + Number(item.usage?.estimatedCostUsd || 0), 0);
          const running = manifest.jobs.filter((item) => item.status === "running").length;
          const reservation = Number(manifest.budget.reservationPerImageUsd || DEFAULT_BUDGET_RESERVATION_USD);
          if (spent + ((running + 1) * reservation) > Number(manifest.budget.limitUsd || 0)) return;
        }
        const job = manifest.jobs.find((item) => item.status === "queued");
        if (!job) return;
        job.status = "running";
        job.startedAt = now().toISOString();
        job.attemptCount = Number(job.attemptCount || 0) + 1;
        job.error = "";
        await persistManifest(manifest);
        try {
          const result = await requestImage(apiKey, manifest, job);
          const filename = `${String(job.trackNumber).padStart(3, "0")}-${slug(job.songTitle)}--${slug(job.referenceId || "lyric-only")}--${job.promptHash.slice(-8)}.png`;
          const outputPath = path.join(runsRoot, manifest.runId, "outputs", filename);
          if (!isInside(runsRoot, outputPath)) throw generationError("output_boundary", "Generated output escaped local app data.");
          await fs.writeFile(outputPath, result.bytes, { mode: 0o600 });
          Object.assign(job, { outputPath, outputSha256: sha256(result.bytes), requestId: result.requestId, usage: result.usage, apiAttempts: result.apiAttempts, retryWaitMs: result.retryWaitMs, status: "completed", finishedAt: now().toISOString() });
          job.requestDurationSeconds = Math.max(0, (Date.parse(job.finishedAt) - Date.parse(job.startedAt)) / 1000);
          manifest.performance.rateLimitEvents += result.rateLimitEvents;
          manifest.performance.retryEvents += result.retryEvents;
        } catch (error) {
          Object.assign(job, { status: "failed", error: sanitizeError(error), requestId: error?.requestId || "", retryWaitMs: Number(error?.retryWaitMs || 0), finishedAt: now().toISOString() });
          job.requestDurationSeconds = Math.max(0, (Date.parse(job.finishedAt) - Date.parse(job.startedAt)) / 1000);
          manifest.performance.rateLimitEvents += Number(error?.rateLimitEvents || 0);
          manifest.performance.retryEvents += Number(error?.retryEvents || 0);
        }
        await persistManifest(manifest);
      }
    }
    await Promise.all(Array.from({ length: boundedConcurrency(manifest.concurrency.active) }, () => worker()));
    const remaining = manifest.jobs.some((job) => ["queued", "running"].includes(job.status));
    const failures = manifest.jobs.some((job) => job.status === "failed");
    if (manifest.mode === "budget" && remaining && !pauseRequested) {
      manifest.jobs = manifest.jobs.map((job) => job.status === "queued" ? { ...job, status: "held" } : job);
      manifest.state = failures ? "budget-complete-with-errors" : "budget-complete";
      manifest.finishedAt = now().toISOString();
    } else {
      manifest.state = pauseRequested && remaining ? "paused" : manifest.mode === "pilot" ? (failures ? "pilot-complete-with-errors" : "pilot-complete") : (failures ? "complete-with-errors" : "complete");
      if (!remaining) manifest.finishedAt = now().toISOString();
    }
    await persistManifest(manifest);
  }

  function launchQueue() {
    if (!activePromise) activePromise = processQueue().finally(() => { activePromise = null; });
  }

  async function start({ apiBase } = {}) {
    if (!apiBase) throw generationError("invalid_generation_request", "Choose a valid loopback Echo Album API.");
    const current = await loadCurrentManifest();
    if (current?.state === "running" || activePromise) return publicStatus(current, await credentialConfigured());
    if (current) throw generationError("generation_exists", `A current reference-image run already exists in state “${current.state}”.`);
    const manifest = await createManifest(apiBase);
    launchQueue();
    return publicStatus(manifest, true);
  }

  async function startSelected({ apiBase, songIds = [] } = {}) {
    const selectedSongIds = [...new Set((songIds || []).map((value) => String(value || "").trim()).filter(Boolean))];
    if (!apiBase || !selectedSongIds.length) throw generationError("invalid_generation_request", "Choose a valid loopback Echo Album API and at least one Song Card ID.");
    if (activePromise) throw generationError("generation_busy", "The current request must finish before a song-scoped run starts.");
    const manifest = await createManifest(apiBase, { mode: "selected", songIds: selectedSongIds });
    manifest.concurrency.active = boundedConcurrency(Math.min(fullConcurrency, manifest.jobs.length));
    await saveManifest(manifest);
    launchQueue();
    return publicStatus(manifest, true);
  }

  async function startBudget({ apiBase, budgetUsd, reservationPerImageUsd = DEFAULT_BUDGET_RESERVATION_USD } = {}) {
    const limitUsd = Number(budgetUsd);
    const reservation = Number(reservationPerImageUsd);
    if (!apiBase) throw generationError("invalid_generation_request", "Choose a valid loopback Echo Album API.");
    if (!Number.isFinite(limitUsd) || limitUsd <= 0) throw generationError("invalid_budget", "Choose a positive image-generation budget.");
    if (!Number.isFinite(reservation) || reservation <= 0 || reservation > limitUsd) throw generationError("invalid_budget_reservation", "Choose a valid per-image reservation.");
    if (activePromise) throw generationError("generation_busy", "The current request must finish before a budget run starts.");
    const manifest = await createManifest(apiBase, { mode: "budget", budgetUsd: limitUsd, reservationPerImageUsd: reservation });
    manifest.concurrency.active = 24;
    await saveManifest(manifest);
    launchQueue();
    return publicStatus(manifest, true);
  }

  async function continueFull({ apiBase } = {}) {
    if (activePromise) throw generationError("generation_busy", "The current request must finish before the queue expands.");
    const manifest = await loadCurrentManifest();
    if (!manifest || manifest.state !== "pilot-complete") throw generationError("pilot_gate_closed", `The full queue requires a successful ${pilotCount}-image pilot; current state is “${manifest?.state || "not-started"}”.`);
    const { jobs: latestJobs } = await loadAlbumPrompts(apiBase);
    const existing = new Map(manifest.jobs.map((job) => [job.promptId, job]));
    manifest.jobs = latestJobs.map((job) => {
      const prior = existing.get(job.promptId);
      if (prior?.status === "completed" && prior.promptHash === job.promptHash) return prior;
      return {
        ...job,
        status: "queued",
        supersededOutputs: prior?.outputPath
          ? [...(prior.supersededOutputs || []), { outputPath: prior.outputPath, outputSha256: prior.outputSha256 || "", promptHash: prior.promptHash || "", supersededAt: now().toISOString() }]
          : prior?.supersededOutputs || [],
      };
    });
    manifest.mode = "full";
    manifest.state = "queued";
    manifest.finishedAt = "";
    manifest.concurrency = { pilot: boundedConcurrency(pilotConcurrency), full: boundedConcurrency(fullConcurrency), active: boundedConcurrency(fullConcurrency) };
    await saveManifest(manifest);
    launchQueue();
    return publicStatus(manifest, await credentialConfigured());
  }

  async function refreshPilot({ apiBase } = {}) {
    if (activePromise) throw generationError("generation_busy", "The current request must finish before the pilot is refreshed.");
    const manifest = await loadCurrentManifest();
    if (!manifest || !["pilot-complete", "pilot-complete-with-errors"].includes(manifest.state)) throw generationError("pilot_refresh_closed", `A completed pilot is required; current state is “${manifest?.state || "not-started"}”.`);
    const { jobs: latestJobs } = await loadAlbumPrompts(apiBase);
    const latest = new Map(latestJobs.map((job) => [job.promptId, job]));
    let changed = 0;
    manifest.jobs = manifest.jobs.map((prior) => {
      const job = latest.get(prior.promptId);
      if (!job || prior.status === "held") return job ? { ...job, status: "held" } : prior;
      if (prior.status === "completed" && prior.promptHash === job.promptHash) return prior;
      changed += 1;
      return {
        ...job,
        status: "queued",
        supersededOutputs: prior.outputPath
          ? [...(prior.supersededOutputs || []), { outputPath: prior.outputPath, outputSha256: prior.outputSha256 || "", promptHash: prior.promptHash || "", supersededAt: now().toISOString() }]
          : prior.supersededOutputs || [],
      };
    });
    if (!changed) return publicStatus(manifest, await credentialConfigured());
    manifest.mode = "pilot";
    manifest.state = "queued";
    manifest.finishedAt = "";
    manifest.concurrency.active = boundedConcurrency(pilotConcurrency);
    await saveManifest(manifest);
    launchQueue();
    return publicStatus(manifest, await credentialConfigured());
  }

  async function pause() {
    pauseRequested = true;
    const manifest = await loadCurrentManifest();
    if (manifest && !manifest.jobs.some((job) => job.status === "running")) { manifest.state = "paused"; await saveManifest(manifest); }
    return publicStatus(manifest, await credentialConfigured());
  }

  async function resume() {
    const manifest = await loadCurrentManifest();
    if (!manifest) throw generationError("generation_missing", "There is no reference-image run to resume.");
    const apiKey = await credentialStore.read("openai");
    if (!apiKey) throw generationError("openai_key_missing", "Add an OpenAI API key before resuming.");
    const selected = await resolveAvailableModel(apiKey);
    Object.assign(manifest, { model: selected.model, modelSnapshot: selected.modelSnapshot, fallbackModel: selected.fallbackModel, modelAccessConfirmed: selected.accessConfirmed, blocker: null, state: "queued", finishedAt: "" });
    manifest.jobs = manifest.jobs.map((job) => job.status === "failed" ? { ...job, status: "queued", error: "" } : job);
    manifest.concurrency.active = boundedConcurrency(manifest.mode === "pilot" ? pilotConcurrency : fullConcurrency);
    await saveManifest(manifest);
    launchQueue();
    return publicStatus(manifest, true);
  }

  async function status() { return publicStatus(await loadCurrentManifest(), await credentialConfigured()); }

  return Object.freeze({ start, startSelected, startBudget, refreshPilot, continueFull, pause, resume, status, _active: () => activePromise });
}

module.exports = { SCHEMA_VERSION, SIZE, QUALITY, DEFAULT_BUDGET_RESERVATION_USD, createEchoReferenceImageGeneration, flattenJobs, flattenIntelligenceJobs, prioritizeCoverageJobs, selectPilotJobs };
