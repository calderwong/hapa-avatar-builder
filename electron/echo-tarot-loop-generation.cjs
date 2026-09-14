const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createFalClient } = require("@fal-ai/client");

const SCHEMA_VERSION = "hapa.echo-tarot-loop-generation.v1";
const MODEL = "minimax/h3-max-turbo/image-to-video";
const DURATION_SECONDS = 5;
const RESOLUTION = "768P";
const PROMPT_EXPANSION_MODE = "balanced";
const LOCAL_CONCURRENCY = 12;
const PILOT_COUNT = 3;
const POLL_INTERVAL_MS = 900;
const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const RUNS_DIRECTORY = "Echo Tarot Loop Runs";
const CURRENT_FILENAME = "current-run.json";
const MANIFEST_FILENAME = "manifest.json";
const IMAGE_RUNS_DIRECTORY = "Echo Tarot Image Runs";
const PROMOTIONAL_PRICE_PER_SECOND_USD = 0.01;
const PROMOTIONAL_PRICE_OBSERVED_AT = "2026-09-13";
const PROMOTIONAL_PRICE_ENDS = "2026-09-14";
const PILOT_CARD_PRIORITY = ["Five of Cups", "The Devil", "Knight of Swords"];
const MAIN_WOMAN_LOOP_PROFILE = Object.freeze({
  id: "main-woman",
  label: "Hapa Main Woman",
  schemaVersion: SCHEMA_VERSION,
  runsDirectory: RUNS_DIRECTORY,
  imageRunsDirectory: IMAGE_RUNS_DIRECTORY,
  runIdPrefix: "echo-tarot-loops",
  outputSuffix: "hapa-main-woman-loop",
  pilotCardPriority: PILOT_CARD_PRIORITY,
  identityMotionDirection: "Keep Hapa Main Woman’s face, eyes, hands, body, wardrobe, expression, and silhouette stable.",
});
const MAIN_MAN_LOOP_PROFILE = Object.freeze({
  id: "main-man",
  label: "Hapa Main Man",
  schemaVersion: "hapa.echo-tarot-main-man-loop-generation.v1",
  runsDirectory: "Echo Tarot Main Man Loop Runs",
  imageRunsDirectory: "Echo Tarot Main Man Image Runs",
  runIdPrefix: "echo-main-man-tarot-loops",
  outputSuffix: "hapa-main-man-loop",
  pilotCardPriority: ["Five of Cups", "The Devil", "Knight of Swords"],
  identityMotionDirection: "Keep Hapa Main Man’s face, eyes, hands, body, wardrobe, expression, and silhouette stable.",
});
const MAIN_COUPLE_LOOP_PROFILE = Object.freeze({
  id: "main-couple",
  label: "Hapa Main Couple",
  schemaVersion: "hapa.echo-tarot-main-couple-loop-generation.v1",
  runsDirectory: "Echo Tarot Main Couple Loop Runs",
  imageRunsDirectory: "Echo Tarot Main Couple Image Runs",
  runIdPrefix: "echo-main-couple-tarot-loops",
  outputSuffix: "hapa-main-couple-loop",
  pilotCardPriority: ["The Lovers", "The Hanged Man", "The Devil"],
  identityMotionDirection: "Keep both Hapa Main Man and Hapa Main Woman faces, eyes, hands, bodies, wardrobes, expressions, relative scale, individual silhouettes, and reciprocal relationship staging stable. Never merge, swap, duplicate, or replace either identity.",
});
const REFERENCE_ATLAS_LOOP_PROFILE = Object.freeze({
  id: "reference-atlas",
  label: "Echo Reference Atlas",
  schemaVersion: "hapa.echo-reference-loop-generation.v1",
  runsDirectory: "Echo Reference Loop Runs",
  imageRunsDirectory: "Echo Reference Image Runs",
  runIdPrefix: "echo-reference-loops",
  outputSuffix: "echo-reference-loop",
  pilotCardPriority: [],
  sourceMediaLabel: "Echo Album reference artwork",
  autoStartFull: true,
  identityMotionDirection: "Preserve every depicted person, face, hand, object, word, lyric fragment, symbol, color relationship, and compositional anchor exactly; do not invent or replace subjects.",
});

function loopError(code, message, status = 0) {
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
  return String(value || "untitled")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 72) || "untitled";
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function loopOutputFilename(job, profile) {
  const uniqueSuffix = String(job.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(-10) || crypto.randomUUID().slice(0, 10);
  return `${String(job.trackNumber || 0).padStart(3, "0")}-${slug(job.songTitle)}--${slug(job.cardTitle)}--${uniqueSuffix}--${profile.outputSuffix}.mp4`;
}

function sanitizeError(error) {
  const raw = error instanceof Error ? error.message : String(error || "FAL loop generation failed.");
  return raw
    .replace(/(?:Bearer|Key)\s+[^\s"']+/gi, (match) => `${match.split(/\s+/)[0]} [redacted]`)
    .replace(/\b[a-zA-Z0-9_-]{12,}:[a-zA-Z0-9_-]{12,}\b/g, "[redacted]")
    .slice(0, 1200);
}

function suitMotion(cardTitle = "") {
  const title = String(cardTitle).toLowerCase();
  if (title.includes("cup")) return "water, reflections, mist, and tiny highlights already present make one calm breath-like cycle";
  if (title.includes("sword")) return "air, fabric, hair tips, clouds, and blade glints already present make one controlled wind-like cycle";
  if (title.includes("wand")) return "embers, warm light, leaves, fabric, and hair tips already present make one restrained pulse-like cycle";
  if (title.includes("pentacle")) return "golden light, dust motes, leaves, fabric, and engraved surfaces already present make one grounded breath-like cycle";
  if (title.includes("devil")) return "embers, shadow, candlelight, chains, smoke, and fabric already present make one restrained tension-and-release cycle";
  if (title.includes("moon")) return "moonlight, water, mist, clouds, and hair tips already present make one quiet tidal cycle";
  if (title.includes("sun")) return "sun rays, flowers, cloth, hair tips, and dust motes already present make one gentle radiant cycle";
  if (title.includes("wheel")) return "the wheel, clouds, glints, ribbons, and surrounding currents already present make one subtle cyclic turn and return";
  return "light, atmosphere, fabric, hair tips, particles, and environmental details already present make one restrained breath-like cycle";
}

function createLoopPrompt(job, profile = MAIN_WOMAN_LOOP_PROFILE) {
  const sourceMediaLabel = profile.sourceMediaLabel || "finished Tarot card";
  return [
    `Create a seamless five-second living-card loop from the supplied ${sourceMediaLabel} “${job.cardTitle}” for the Echo Album song “${job.songTitle}”.`,
    "LOOP CONTRACT",
    "- Frame 0 and the final frame must return to the supplied card exactly: identical composition, crop, border, title lettering, character identity, pose, anatomy, objects, symbols, palette, lighting baseline, and camera.",
    "- Begin perfectly still on the card. Ease into subtle secondary motion, reach a small living peak near the middle, then smoothly reverse or settle through the same path so the final image is the original card again.",
    `- Motion vocabulary: ${suitMotion(job.cardTitle)}. Animate only details that are already visible.`,
    `- ${profile.identityMotionDirection} Preserve every canonical Tarot symbol and every song-specific visual anchor.`,
    "- Lock the ornamental frame and all typography for the entire shot. No camera move, zoom, crop, cut, reframing, parallax at the border, morphing, warping, flicker, new object, disappearing object, new text, dialogue, lip movement, or scene transition.",
    "- The movement should read at card-game scale: elegant, legible, low-amplitude, and replayable without a visible hitch.",
    "AUDIO",
    "- Silent loop. No speech, sound effects, ambience, or music.",
  ].join("\n");
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await fs.rename(temporaryPath, filePath);
    await fs.chmod(filePath, 0o600);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function validateFalMediaUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw loopError("fal_media_url_invalid", `FAL returned an invalid ${label} URL.`); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(host === "fal.media" || host.endsWith(".fal.media"))) {
    throw loopError("fal_media_url_invalid", `FAL returned an unexpected ${label} host.`);
  }
  return url.toString();
}

function flattenLoopJobs(imageManifest, profile = MAIN_WOMAN_LOOP_PROFILE) {
  return (imageManifest?.jobs || [])
    .filter((job) => job.status === "completed" && job.outputPath)
    .map((job) => {
      const normalizedJob = {
        ...job,
        cardId: job.cardId || job.referenceId || job.id,
        cardTitle: job.cardTitle || job.referenceTitle || job.referenceId || "Reference visual",
      };
      const prompt = createLoopPrompt(normalizedJob, profile);
      return {
        id: `loop:${sha256(`${profile.id}:${imageManifest.runId}:${job.id}:${MODEL}:${DURATION_SECONDS}:${RESOLUTION}`).slice(7, 23)}`,
        sourceRunId: imageManifest.runId,
        sourceJobId: job.id,
        sourceImagePath: job.outputPath,
        sourceImageSha256: job.outputSha256 || "",
        songId: job.songId,
        songTitle: job.songTitle,
        trackNumber: Number(job.trackNumber || 0),
        cardId: normalizedJob.cardId,
        cardTitle: normalizedJob.cardTitle,
        referenceId: job.referenceId || "",
        referenceTitle: job.referenceTitle || "",
        prompt,
        promptHash: sha256(prompt),
        status: "queued",
        attemptCount: 0,
        inputUrl: "",
        requestId: "",
        outputPath: "",
        outputSha256: "",
        usage: null,
        feedback: null,
      };
    })
    .sort((left, right) => left.trackNumber - right.trackNumber || left.cardTitle.localeCompare(right.cardTitle));
}

function selectPilotJobs(jobs, count = PILOT_COUNT, priority = PILOT_CARD_PRIORITY) {
  const selected = [];
  const seen = new Set();
  for (const title of priority) {
    const match = jobs.find((job) => job.cardTitle === title && !seen.has(job.id));
    if (match) { selected.push(match); seen.add(match.id); }
  }
  for (const job of jobs) {
    if (selected.length >= count) break;
    if (!seen.has(job.id)) { selected.push(job); seen.add(job.id); }
  }
  return selected.slice(0, count);
}

function publicJob(job) {
  return {
    id: job.id,
    sourceJobId: job.sourceJobId,
    songId: job.songId,
    songTitle: job.songTitle,
    trackNumber: job.trackNumber,
    cardId: job.cardId,
    cardTitle: job.cardTitle,
    status: job.status,
    remoteStatus: job.remoteStatus || "",
    queuePosition: Number.isFinite(job.queuePosition) ? job.queuePosition : null,
    attemptCount: Number(job.attemptCount || 0),
    startedAt: job.startedAt || "",
    submittedAt: job.submittedAt || "",
    finishedAt: job.finishedAt || "",
    error: job.error || "",
    usage: job.usage || null,
    timings: job.timings || null,
    feedback: job.feedback || null,
    hasOutput: Boolean(job.outputPath),
  };
}

function publicStatus(manifest, { credentialConfigured = false, sourceAvailable = false, profile = MAIN_WOMAN_LOOP_PROFILE } = {}) {
  if (!manifest) return {
    ok: true,
    schemaVersion: profile.schemaVersion,
    profileId: profile.id,
    profileLabel: profile.label,
    state: "not-started",
    credentialConfigured,
    sourceAvailable,
    model: MODEL,
    durationSeconds: DURATION_SECONDS,
    resolution: RESOLUTION,
    promptExpansionMode: PROMPT_EXPANSION_MODE,
    localConcurrency: LOCAL_CONCURRENCY,
    counts: { total: 0, held: 0, queued: 0, active: 0, completed: 0, failed: 0 },
    usage: { estimatedCostUsd: 0, promotionalUnitCostUsd: DURATION_SECONDS * PROMOTIONAL_PRICE_PER_SECOND_USD, currency: "USD" },
    jobs: [],
    pilotReview: null,
  };
  const counts = { total: manifest.jobs.length, held: 0, queued: 0, active: 0, completed: 0, failed: 0 };
  const activeStates = new Set(["claimed", "uploading", "submitted", "in_queue", "running", "downloading"]);
  let estimatedCostUsd = 0;
  for (const job of manifest.jobs) {
    if (job.status === "held") counts.held += 1;
    else if (job.status === "queued") counts.queued += 1;
    else if (job.status === "completed") counts.completed += 1;
    else if (job.status === "failed") counts.failed += 1;
    else if (activeStates.has(job.status)) counts.active += 1;
    estimatedCostUsd += Number(job.usage?.estimatedCostUsd || 0);
  }
  const startedMs = Date.parse(manifest.startedAt || "");
  const finishedMs = Date.parse(manifest.finishedAt || "");
  const elapsedSeconds = Number.isFinite(startedMs) ? Math.max(0, ((Number.isFinite(finishedMs) ? finishedMs : Date.now()) - startedMs) / 1000) : 0;
  const inferenceSeconds = manifest.jobs
    .map((job) => Number(job.timings?.inference))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const inferenceTotalSeconds = inferenceSeconds.reduce((total, value) => total + value, 0);
  const inferencePercentile = (ratio) => inferenceSeconds.length
    ? inferenceSeconds[Math.min(inferenceSeconds.length - 1, Math.floor(inferenceSeconds.length * ratio))]
    : 0;
  const retryWaves = (manifest.retryWaves || []).map((wave) => ({
    failedCount: Number(wave.failedCount || 0),
    previousConcurrency: Number(wave.previousConcurrency || 0),
    retryConcurrency: Number(wave.retryConcurrency || 0),
    startedAt: wave.startedAt || "",
    reason: wave.reason || "",
  }));
  const initialConcurrency = retryWaves[0]?.previousConcurrency || manifest.localConcurrency;
  return {
    ok: true,
    schemaVersion: manifest.schemaVersion,
    profileId: manifest.profileId || profile.id,
    profileLabel: manifest.profileLabel || profile.label,
    runId: manifest.runId,
    sourceImageRunId: manifest.sourceImageRunId,
    state: manifest.state,
    mode: manifest.mode,
    createdAt: manifest.createdAt,
    startedAt: manifest.startedAt || "",
    finishedAt: manifest.finishedAt || "",
    credentialConfigured,
    sourceAvailable,
    model: manifest.model,
    durationSeconds: manifest.durationSeconds,
    resolution: manifest.resolution,
    promptExpansionMode: manifest.promptExpansionMode,
    localConcurrency: manifest.localConcurrency,
    initialConcurrency,
    retryWaves,
    counts,
    elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
    throughputPerMinute: elapsedSeconds > 0 ? Number((counts.completed / elapsedSeconds * 60).toFixed(2)) : 0,
    inference: {
      sampleCount: inferenceSeconds.length,
      averageSeconds: inferenceSeconds.length ? Number((inferenceTotalSeconds / inferenceSeconds.length).toFixed(3)) : 0,
      medianSeconds: Number(inferencePercentile(0.5).toFixed(3)),
      p95Seconds: Number(inferencePercentile(0.95).toFixed(3)),
      maxSeconds: Number(inferencePercentile(1).toFixed(3)),
    },
    usage: {
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)),
      promotionalUnitCostUsd: Number((manifest.durationSeconds * manifest.pricePerSecondUsd).toFixed(4)),
      pricePerSecondUsd: manifest.pricePerSecondUsd,
      pricingObservedAt: manifest.pricingObservedAt,
      promotionEnds: manifest.promotionEnds,
      currency: "USD",
    },
    budget: manifest.budget || null,
    jobs: manifest.jobs.map(publicJob),
    pilotReview: manifest.pilotReview || null,
    blocker: manifest.blocker || null,
  };
}

function defaultFalClientFactory(apiKey, fetchImpl) {
  return createFalClient({
    credentials: apiKey,
    fetch: fetchImpl,
    retry: { maxRetries: 6, baseDelay: 500, maxDelay: 8_000 },
  });
}

function sleepDefault(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function executablePath(candidates) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  return "";
}

function runMediaProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-12_000); });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(loopError("loop_postprocess_failed", `Local loop post-processing failed (${signal || `exit ${code}`}). ${stderr}`.trim()));
    });
  });
}

async function defaultMediaPostprocessor({ bytes, durationSeconds = DURATION_SECONDS, sourceImagePath } = {}) {
  const ffmpegPath = await executablePath(["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"]);
  const ffprobePath = await executablePath(["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe"]);
  if (!ffmpegPath || !ffprobePath) throw loopError("loop_postprocess_unavailable", "FFmpeg and FFprobe are required to make generated card loops silent, source-anchored, and exactly five seconds.");
  if (!sourceImagePath) throw loopError("loop_source_anchor_missing", "The local Tarot source image is required to anchor both ends of the loop.");
  const token = `${process.pid}-${crypto.randomUUID()}`;
  const inputPath = path.join(os.tmpdir(), `.hapa-tarot-loop-${token}-provider.mp4`);
  const outputPath = path.join(os.tmpdir(), `.hapa-tarot-loop-${token}-silent.mp4`);
  try {
    await fs.writeFile(inputPath, bytes, { mode: 0o600, flag: "wx" });
    let probeText = "";
    await new Promise((resolve, reject) => {
      const child = spawn(ffprobePath, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration,width,height", "-of", "json", inputPath], { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stdout.on("data", (chunk) => { probeText += chunk; });
      child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-4000); });
      child.once("error", reject);
      child.once("exit", (code, signal) => code === 0 ? resolve() : reject(loopError("loop_probe_failed", `Local loop probe failed (${signal || `exit ${code}`}). ${stderr}`.trim())));
    });
    let probe;
    try { probe = JSON.parse(probeText); } catch { throw loopError("loop_probe_invalid", "FFprobe returned invalid Tarot loop metadata."); }
    const videoStream = probe?.streams?.[0] || {};
    const sourceDurationSeconds = Number(videoStream.duration);
    const width = Number(videoStream.width);
    const height = Number(videoStream.height);
    if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds <= 0) throw loopError("loop_duration_invalid", "FAL returned a video with no measurable duration.");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw loopError("loop_dimensions_invalid", "FAL returned a video with no measurable dimensions.");
    const scale = sourceDurationSeconds > durationSeconds + 0.01 ? durationSeconds / sourceDurationSeconds : 1;
    const fps = 24;
    const anchorFadeSeconds = 0.25;
    const endFadeStart = durationSeconds - 0.5;
    const targetFrames = Math.round(durationSeconds * fps);
    const filter = [
      `[0:v]scale=${width}:${height}:flags=lanczos,fps=${fps},trim=duration=${durationSeconds},setpts=PTS-STARTPTS[still]`,
      `[1:v]setpts=PTS*${scale},fps=${fps},trim=duration=${durationSeconds},setpts=PTS-STARTPTS,format=yuva420p,fade=t=in:st=0:d=${anchorFadeSeconds}:alpha=1,fade=t=out:st=${endFadeStart}:d=${anchorFadeSeconds}:alpha=1[anim]`,
      "[still][anim]overlay=shortest=1:format=auto,format=yuv420p[out]",
    ].join(";");
    const args = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-loop", "1", "-i", sourceImagePath,
      "-i", inputPath,
      "-filter_complex", filter,
      "-map", "[out]", "-an", "-r", String(fps), "-frames:v", String(targetFrames),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-threads", "2", "-movflags", "+faststart",
      outputPath,
    ];
    await runMediaProcess(ffmpegPath, args);
    const outputBytes = await fs.readFile(outputPath);
    return {
      bytes: outputBytes,
      metadata: {
        audioRemoved: true,
        sourceDurationSeconds: Number(sourceDurationSeconds.toFixed(6)),
        targetDurationSeconds: durationSeconds,
        timingScale: Number(scale.toFixed(9)),
        fps,
        targetFrames,
        sourceAnchorFadeSeconds: anchorFadeSeconds,
        sourceAnchorEndHoldSeconds: durationSeconds - endFadeStart - anchorFadeSeconds,
        videoReencoded: true,
        encoder: "libx264 veryfast CRF 15",
      },
    };
  } finally {
    await Promise.all([fs.rm(inputPath, { force: true }), fs.rm(outputPath, { force: true })]);
  }
}

function createEchoTarotLoopGeneration({
  userDataPath,
  credentialStore,
  profile = MAIN_WOMAN_LOOP_PROFILE,
  fetchImpl = globalThis.fetch,
  falClientFactory = defaultFalClientFactory,
  mediaPostprocessor = defaultMediaPostprocessor,
  sleep = sleepDefault,
  now = () => new Date(),
  localConcurrency = LOCAL_CONCURRENCY,
  maxSpendUsd = Number.POSITIVE_INFINITY,
} = {}) {
  if (!userDataPath || !credentialStore?.read || typeof fetchImpl !== "function" || typeof falClientFactory !== "function") {
    throw loopError("loop_generation_boundary", "Tarot loop generation requires local app data, the encrypted credential store, FAL client access, and fetch.");
  }
  const resolvedProfile = { ...MAIN_WOMAN_LOOP_PROFILE, ...profile };
  const userDataRoot = path.resolve(userDataPath);
  const runsRoot = path.join(userDataRoot, resolvedProfile.runsDirectory);
  const imageRunsRoot = path.join(userDataRoot, resolvedProfile.imageRunsDirectory);
  const currentPointerPath = path.join(runsRoot, CURRENT_FILENAME);
  let activePromise = null;
  let pauseRequested = false;
  let saveChain = Promise.resolve();

  async function credentialConfigured() {
    try {
      const result = await credentialStore.status();
      return Boolean(result.providers?.find((provider) => provider.id === "fal")?.configured);
    } catch { return false; }
  }

  async function loadImageManifest() {
    try {
      const pointer = await readJson(path.join(imageRunsRoot, CURRENT_FILENAME));
      const manifestPath = path.join(imageRunsRoot, pointer.runId, MANIFEST_FILENAME);
      if (!isInside(imageRunsRoot, manifestPath)) return null;
      return await readJson(manifestPath);
    } catch { return null; }
  }

  async function sourceAvailable() {
    const source = await loadImageManifest();
    return Boolean(source?.jobs?.some((job) => job.status === "completed" && job.outputPath));
  }

  async function currentManifestPath() {
    try {
      const pointer = await readJson(currentPointerPath);
      const manifestPath = path.join(runsRoot, pointer.runId, MANIFEST_FILENAME);
      return isInside(runsRoot, manifestPath) ? manifestPath : "";
    } catch { return ""; }
  }

  async function loadCurrentManifest() {
    const manifestPath = await currentManifestPath();
    if (!manifestPath) return null;
    try { return await readJson(manifestPath); } catch { return null; }
  }

  function saveManifest(manifest) {
    manifest.updatedAt = now().toISOString();
    const snapshot = structuredClone(manifest);
    const manifestPath = path.join(runsRoot, manifest.runId, MANIFEST_FILENAME);
    saveChain = saveChain.then(async () => {
      await atomicWriteJson(manifestPath, snapshot);
      await atomicWriteJson(currentPointerPath, { runId: snapshot.runId, updatedAt: snapshot.updatedAt });
    });
    return saveChain;
  }

  async function createManifest() {
    if (!await credentialConfigured()) throw loopError("fal_key_missing", "Add a FAL.com API key in Provider API keys before starting loop generation.");
    const source = await loadImageManifest();
    const allJobs = flattenLoopJobs(source, resolvedProfile);
    if (!allJobs.length) throw loopError("tarot_images_missing", "No completed Echo Album Tarot images are available to animate.");
    const unitCostUsd = DURATION_SECONDS * PROMOTIONAL_PRICE_PER_SECOND_USD;
    const requestedBudgetUsd = Number(maxSpendUsd);
    const hasBudgetCap = Number.isFinite(requestedBudgetUsd);
    const budgetJobLimit = hasBudgetCap
      ? Math.min(allJobs.length, Math.max(0, Math.floor((requestedBudgetUsd + 1e-9) / unitCostUsd)))
      : allJobs.length;
    if (budgetJobLimit < 1) throw loopError("loop_budget_too_small", `The loop budget must cover at least one $${unitCostUsd.toFixed(2)} generation.`);
    const budgetEligibleJobs = allJobs.slice(0, budgetJobLimit);
    const autoStartFull = Boolean(resolvedProfile.autoStartFull);
    const selectedIds = new Set((autoStartFull
      ? budgetEligibleJobs
      : selectPilotJobs(budgetEligibleJobs, PILOT_COUNT, resolvedProfile.pilotCardPriority)).map((job) => job.id));
    const createdAt = now().toISOString();
    const runId = `${resolvedProfile.runIdPrefix}-${createdAt.replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
    await fs.mkdir(path.join(runsRoot, runId, "outputs"), { recursive: true, mode: 0o700 });
    const manifest = {
      schemaVersion: resolvedProfile.schemaVersion,
      profileId: resolvedProfile.id,
      profileLabel: resolvedProfile.label,
      runId,
      sourceImageRunId: source.runId,
      mode: autoStartFull ? "budget" : "pilot",
      state: "queued",
      createdAt,
      updatedAt: createdAt,
      startedAt: "",
      finishedAt: "",
      model: MODEL,
      durationSeconds: DURATION_SECONDS,
      resolution: RESOLUTION,
      promptExpansionMode: PROMPT_EXPANSION_MODE,
      localConcurrency: Math.max(1, Math.min(24, Number(localConcurrency) || LOCAL_CONCURRENCY)),
      pricePerSecondUsd: PROMOTIONAL_PRICE_PER_SECOND_USD,
      pricingObservedAt: PROMOTIONAL_PRICE_OBSERVED_AT,
      promotionEnds: PROMOTIONAL_PRICE_ENDS,
      budget: {
        hardLimitUsd: hasBudgetCap ? Number(requestedBudgetUsd.toFixed(2)) : null,
        unitCostUsd: Number(unitCostUsd.toFixed(4)),
        eligibleJobs: budgetJobLimit,
        plannedSpendUsd: Number((budgetJobLimit * unitCostUsd).toFixed(4)),
        heldForBudget: allJobs.length - budgetJobLimit,
      },
      custody: {
        source: "Completed GPT Image 2.5 Tarot outputs in local app data.",
        inputTransfer: "Each selected card is uploaded to FAL CDN with a seven-day expiry and used as both first and last frame.",
        outputTransfer: "FAL output is downloaded immediately into local app data; remote URLs are not exposed to the renderer.",
        requestPayloadStorage: "Disabled with X-Fal-Store-IO: 0; CDN media remains subject to its configured lifecycle.",
      },
      pilotReview: null,
      jobs: allJobs.map((job) => ({ ...job, status: selectedIds.has(job.id) ? "queued" : "held" })),
    };
    await saveManifest(manifest);
    return manifest;
  }

  async function downloadOutput(url) {
    const safeUrl = validateFalMediaUrl(url, "video output");
    let lastError;
    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchImpl(safeUrl, { cache: "no-store", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
        if (!response.ok) throw loopError("fal_output_download_failed", `The completed FAL video could not be downloaded (${response.status}).`, response.status);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length || bytes.length > 250 * 1024 * 1024) throw loopError("fal_output_invalid", "The completed FAL video was empty or exceeded the local 250 MB safety limit.");
        return bytes;
      } catch (error) {
        lastError = error;
        if (attempt < DOWNLOAD_ATTEMPTS) await sleep(500 * attempt);
      }
    }
    throw lastError;
  }

  async function processJob(client, manifest, job) {
    job.attemptCount = Number(job.attemptCount || 0) + 1;
    job.startedAt ||= now().toISOString();
    job.error = "";
    try {
      if (!job.inputUrl) {
        job.status = "uploading";
        await saveManifest(manifest);
        if (!isInside(imageRunsRoot, job.sourceImagePath)) throw loopError("source_image_boundary", "A source Tarot image escaped the local image-run custody boundary.");
        const bytes = await fs.readFile(job.sourceImagePath);
        job.inputUrl = validateFalMediaUrl(await client.storage.upload(new Blob([bytes], { type: "image/png" }), {
          lifecycle: { expiresIn: "7d" },
        }), "input upload");
        job.uploadedAt = now().toISOString();
        await saveManifest(manifest);
      }

      if (!job.requestId) {
        job.status = "submitted";
        await saveManifest(manifest);
        const submitted = await client.queue.submit(MODEL, {
          input: {
            prompt: job.prompt,
            duration: DURATION_SECONDS,
            resolution: RESOLUTION,
            enable_safety_checker: true,
            prompt_expansion_mode: PROMPT_EXPANSION_MODE,
            image_url: job.inputUrl,
            end_image_url: job.inputUrl,
          },
          headers: { "X-Fal-Store-IO": "0" },
          storageSettings: { expiresIn: "7d" },
          startTimeout: 3600,
        });
        job.requestId = String(submitted?.request_id || "");
        if (!job.requestId) throw loopError("fal_request_id_missing", "FAL accepted no durable queue request ID.");
        job.submittedAt = now().toISOString();
        job.remoteStatus = submitted.status || "IN_QUEUE";
        job.queuePosition = Number.isFinite(submitted.queue_position) ? submitted.queue_position : null;
        job.status = "in_queue";
        await saveManifest(manifest);
      }

      while (true) {
        const remote = await client.queue.status(MODEL, { requestId: job.requestId, logs: false });
        job.remoteStatus = String(remote?.status || "");
        if (["FAILED", "CANCELLED"].includes(job.remoteStatus)) {
          throw loopError("fal_request_terminal", `FAL request ${job.remoteStatus.toLowerCase()} before producing a loop.`);
        }
        job.queuePosition = Number.isFinite(remote?.queue_position) ? remote.queue_position : null;
        job.status = remote?.status === "COMPLETED" ? "downloading" : remote?.status === "IN_PROGRESS" ? "running" : "in_queue";
        await saveManifest(manifest);
        if (remote?.status === "COMPLETED") break;
        await sleep(POLL_INTERVAL_MS);
      }

      const result = await client.queue.result(MODEL, { requestId: job.requestId });
      const video = result?.data?.video;
      const providerBytes = await downloadOutput(video?.url);
      const processed = await mediaPostprocessor({ bytes: providerBytes, durationSeconds: DURATION_SECONDS, sourceImagePath: job.sourceImagePath });
      const bytes = processed?.bytes;
      if (!Buffer.isBuffer(bytes) || !bytes.length) throw loopError("loop_postprocess_invalid", "Local loop post-processing returned no video bytes.");
      const filename = loopOutputFilename(job, resolvedProfile);
      const outputPath = path.join(runsRoot, manifest.runId, "outputs", filename);
      if (!isInside(runsRoot, outputPath)) throw loopError("loop_output_boundary", "The generated loop path escaped local app data.");
      await fs.writeFile(outputPath, bytes, { mode: 0o600 });
      job.outputPath = outputPath;
      job.outputSha256 = sha256(bytes);
      job.outputBytes = bytes.length;
      job.postprocess = processed.metadata || { audioRemoved: true, targetDurationSeconds: DURATION_SECONDS };
      job.expandedPrompt = String(result?.data?.expanded_prompt || "").slice(0, 12_000);
      job.timings = result?.data?.timings && typeof result.data.timings === "object" ? result.data.timings : null;
      job.usage = {
        estimatedCostUsd: Number((DURATION_SECONDS * manifest.pricePerSecondUsd).toFixed(4)),
        durationSeconds: DURATION_SECONDS,
        resolution: RESOLUTION,
        pricingBasis: `FAL H3 Max Turbo promotional rate observed ${PROMOTIONAL_PRICE_OBSERVED_AT}; promotion announced through ${PROMOTIONAL_PRICE_ENDS}. Actual account billing controls.`,
      };
      job.status = "completed";
      job.remoteStatus = "COMPLETED";
      job.finishedAt = now().toISOString();
      await saveManifest(manifest);
    } catch (error) {
      job.status = "failed";
      job.error = sanitizeError(error);
      job.finishedAt = now().toISOString();
      await saveManifest(manifest);
    }
  }

  async function ensureCompletedOutputsPostprocessed(manifest) {
    for (const job of manifest.jobs) {
      if (job.status !== "completed" || !job.outputPath || job.postprocess?.audioRemoved) continue;
      if (!isInside(runsRoot, job.outputPath)) throw loopError("loop_output_boundary", "A completed Tarot loop escaped local app data.");
      const processed = await mediaPostprocessor({ bytes: await fs.readFile(job.outputPath), durationSeconds: DURATION_SECONDS, sourceImagePath: job.sourceImagePath });
      if (!Buffer.isBuffer(processed?.bytes) || !processed.bytes.length) throw loopError("loop_postprocess_invalid", "Local loop post-processing returned no video bytes.");
      await fs.writeFile(job.outputPath, processed.bytes, { mode: 0o600 });
      job.outputSha256 = sha256(processed.bytes);
      job.outputBytes = processed.bytes.length;
      job.postprocess = processed.metadata || { audioRemoved: true, targetDurationSeconds: DURATION_SECONDS };
      await saveManifest(manifest);
    }
  }

  async function repairCompletedOutputs() {
    if (activePromise) throw loopError("loop_generation_busy", "Wait for the current loop queue before repairing local outputs.");
    const manifest = await loadCurrentManifest();
    if (!manifest) throw loopError("loop_generation_missing", "There is no loop run to repair.");
    const apiKey = await credentialStore.read("fal");
    if (!apiKey) throw loopError("fal_key_missing", "Add a FAL.com API key before repairing local loop outputs.");
    const repairJobs = manifest.jobs.filter((job) => job.status === "completed" && job.requestId);
    const client = falClientFactory(apiKey, fetchImpl);
    const repairStartedAt = now().toISOString();
    manifest.state = "repairing-local-outputs";
    manifest.repair = { startedAt: repairStartedAt, finishedAt: "", requested: repairJobs.length, restored: 0, failed: 0, quarantined: 0 };
    await saveManifest(manifest);

    let cursor = 0;
    async function repairWorker() {
      while (true) {
        const index = cursor;
        cursor += 1;
        const job = repairJobs[index];
        if (!job) return;
        try {
          const result = await client.queue.result(MODEL, { requestId: job.requestId });
          const providerBytes = await downloadOutput(result?.data?.video?.url);
          const processed = await mediaPostprocessor({ bytes: providerBytes, durationSeconds: DURATION_SECONDS, sourceImagePath: job.sourceImagePath });
          if (!Buffer.isBuffer(processed?.bytes) || !processed.bytes.length) throw loopError("loop_postprocess_invalid", "Local loop repair returned no video bytes.");
          const outputPath = path.join(runsRoot, manifest.runId, "outputs", loopOutputFilename(job, resolvedProfile));
          if (!isInside(runsRoot, outputPath)) throw loopError("loop_output_boundary", "A repaired loop path escaped local app data.");
          await fs.writeFile(outputPath, processed.bytes, { mode: 0o600 });
          job.outputPath = outputPath;
          job.outputSha256 = sha256(processed.bytes);
          job.outputBytes = processed.bytes.length;
          job.postprocess = processed.metadata || { audioRemoved: true, targetDurationSeconds: DURATION_SECONDS };
          job.repairedAt = now().toISOString();
          job.repairError = "";
          manifest.repair.restored += 1;
        } catch (error) {
          job.repairError = sanitizeError(error);
          manifest.repair.failed += 1;
        }
        await saveManifest(manifest);
      }
    }

    await Promise.all(Array.from({ length: Math.min(manifest.localConcurrency, repairJobs.length) }, () => repairWorker()));
    if (!manifest.repair.failed) {
      const outputRoot = path.join(runsRoot, manifest.runId, "outputs");
      const referenced = new Set(manifest.jobs.map((job) => job.outputPath).filter(Boolean).map((filePath) => path.resolve(filePath)));
      const entries = await fs.readdir(outputRoot, { withFileTypes: true });
      const superseded = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".mp4") && !referenced.has(path.resolve(outputRoot, entry.name)));
      if (superseded.length) {
        const quarantineRoot = path.join(runsRoot, manifest.runId, "superseded-collision-outputs");
        await fs.mkdir(quarantineRoot, { recursive: true, mode: 0o700 });
        for (const entry of superseded) await fs.rename(path.join(outputRoot, entry.name), path.join(quarantineRoot, entry.name));
        manifest.repair.quarantined = superseded.length;
      }
    }
    manifest.repair.finishedAt = now().toISOString();
    manifest.state = manifest.repair.failed ? "repair-complete-with-errors" : manifest.mode === "budget" ? "budget-complete" : "complete";
    await saveManifest(manifest);
    return publicStatus(manifest, { credentialConfigured: true, sourceAvailable: true, profile: resolvedProfile });
  }

  async function processQueue() {
    const manifest = await loadCurrentManifest();
    if (!manifest) return;
    const apiKey = await credentialStore.read("fal");
    if (!apiKey) {
      manifest.state = "blocked";
      manifest.blocker = { code: "fal_key_missing", message: "Add a FAL.com API key in Provider API keys, then resume.", observedAt: now().toISOString() };
      await saveManifest(manifest);
      return;
    }
    const client = falClientFactory(apiKey, fetchImpl);
    pauseRequested = false;
    manifest.state = "running";
    manifest.startedAt ||= now().toISOString();
    manifest.finishedAt = "";
    manifest.blocker = null;
    manifest.jobs = manifest.jobs.map((job) => {
      if (job.status === "uploading" && !job.inputUrl) return { ...job, status: "queued", error: "Recovered an interrupted upload." };
      if (["claimed", "submitted", "in_queue", "running", "downloading"].includes(job.status) && job.requestId) return { ...job, status: "in_queue", error: "Recovered a durable FAL request." };
      if (["claimed", "submitted", "in_queue", "running", "downloading"].includes(job.status)) return { ...job, status: "queued", error: "Recovered before FAL submission." };
      return job;
    });
    await saveManifest(manifest);

    async function worker() {
      while (!pauseRequested) {
        const job = manifest.jobs.find((candidate) => candidate.status === "queued" || (candidate.status === "in_queue" && candidate.requestId));
        if (!job) return;
        // Claim synchronously before the first await so another local worker cannot
        // attach to the same durable request or submit the same source image twice.
        job.status = "claimed";
        await saveManifest(manifest);
        await processJob(client, manifest, job);
      }
    }

    const workerCount = Math.min(manifest.localConcurrency, manifest.jobs.filter((job) => job.status === "queued" || job.status === "in_queue").length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    const remaining = manifest.jobs.some((job) => ["queued", "claimed", "uploading", "submitted", "in_queue", "running", "downloading"].includes(job.status));
    const hasFailures = manifest.jobs.some((job) => job.status === "failed");
    manifest.state = pauseRequested && remaining
      ? "paused"
      : manifest.mode === "pilot"
        ? hasFailures ? "pilot-complete-with-errors" : "pilot-complete"
        : manifest.mode === "budget"
          ? hasFailures ? "budget-complete-with-errors" : "budget-complete"
        : hasFailures ? "complete-with-errors" : "complete";
    if (!remaining) manifest.finishedAt = now().toISOString();
    await saveManifest(manifest);
  }

  function launchQueue() {
    if (!activePromise) activePromise = processQueue().finally(() => { activePromise = null; });
  }

  async function start() {
    const source = await loadImageManifest();
    const current = await loadCurrentManifest();
    if (current && current.sourceImageRunId === source?.runId) return publicStatus(current, {
      credentialConfigured: await credentialConfigured(), sourceAvailable: Boolean(source), profile: resolvedProfile,
    });
    const manifest = await createManifest();
    launchQueue();
    return publicStatus(manifest, { credentialConfigured: true, sourceAvailable: true, profile: resolvedProfile });
  }

  async function continueFull({ note = "Pilot loops visually reviewed and approved by the Hapa operator." } = {}) {
    if (activePromise) throw loopError("loop_generation_busy", "Wait for the current loop pilot to finish before opening the album queue.");
    const manifest = await loadCurrentManifest();
    if (!manifest || manifest.state !== "pilot-complete") throw loopError("loop_pilot_gate_closed", `The album queue requires a successful three-loop pilot; current state is “${manifest?.state || "not-started"}”.`);
    await ensureCompletedOutputsPostprocessed(manifest);
    manifest.pilotReview = { decision: "approved", reviewer: "Hapa operator", note: String(note || "").trim().slice(0, 4000), reviewedAt: now().toISOString() };
    manifest.jobs = manifest.jobs.map((job) => job.status === "held" ? { ...job, status: "queued" } : job);
    manifest.mode = "full";
    manifest.state = "queued";
    manifest.finishedAt = "";
    await saveManifest(manifest);
    launchQueue();
    return publicStatus(manifest, { credentialConfigured: true, sourceAvailable: true, profile: resolvedProfile });
  }

  async function pause() {
    pauseRequested = true;
    const manifest = await loadCurrentManifest();
    if (!manifest) return publicStatus(null, { credentialConfigured: await credentialConfigured(), sourceAvailable: await sourceAvailable(), profile: resolvedProfile });
    if (!manifest.jobs.some((job) => ["claimed", "uploading", "submitted", "in_queue", "running", "downloading"].includes(job.status))) {
      manifest.state = "paused";
      await saveManifest(manifest);
    }
    return publicStatus(manifest, { credentialConfigured: await credentialConfigured(), sourceAvailable: await sourceAvailable(), profile: resolvedProfile });
  }

  async function resume() {
    if (activePromise) throw loopError("loop_generation_busy", "The FAL loop queue is already running.");
    const manifest = await loadCurrentManifest();
    if (!manifest) throw loopError("loop_generation_missing", "There is no Tarot loop run to resume.");
    const failedCount = manifest.jobs.filter((job) => job.status === "failed").length;
    if (failedCount) {
      const previousConcurrency = manifest.localConcurrency;
      manifest.localConcurrency = Math.max(2, Math.ceil(previousConcurrency / 2));
      manifest.retryWaves ||= [];
      manifest.retryWaves.push({
        failedCount,
        previousConcurrency,
        retryConcurrency: manifest.localConcurrency,
        startedAt: now().toISOString(),
        reason: "Provider-terminal requests are retried at reduced fan-out.",
      });
    }
    manifest.jobs = manifest.jobs.map((job) => {
      if (job.status !== "failed") return job;
      const providerTerminated = job.remoteStatus !== "COMPLETED" && /(?:terminated|request failed|request cancelled)/i.test(job.error || "");
      return {
        ...job,
        status: providerTerminated || !job.requestId ? "queued" : "in_queue",
        requestId: providerTerminated ? "" : job.requestId,
        remoteStatus: providerTerminated ? "" : job.remoteStatus,
        error: "",
      };
    });
    manifest.state = "queued";
    manifest.finishedAt = "";
    await saveManifest(manifest);
    launchQueue();
    return publicStatus(manifest, { credentialConfigured: await credentialConfigured(), sourceAvailable: await sourceAvailable(), profile: resolvedProfile });
  }

  async function status() {
    return publicStatus(await loadCurrentManifest(), { credentialConfigured: await credentialConfigured(), sourceAvailable: await sourceAvailable(), profile: resolvedProfile });
  }

  async function review({ jobId, decision, note = "", reviewer = "Hapa operator" } = {}) {
    if (!jobId || !["approved", "revise", "rejected"].includes(decision)) throw loopError("invalid_loop_review", "Choose approved, revise, or rejected feedback.");
    const manifest = await loadCurrentManifest();
    const job = manifest?.jobs.find((candidate) => candidate.id === jobId);
    if (!job?.outputPath) throw loopError("loop_review_output_missing", "Only completed loop outputs can receive visual feedback.");
    job.feedback = { decision, note: String(note || "").trim().slice(0, 4000), reviewer: String(reviewer || "Hapa operator").slice(0, 120), reviewedAt: now().toISOString() };
    await saveManifest(manifest);
    return { ok: true, job: publicJob(job) };
  }

  async function asset({ id } = {}) {
    const manifest = await loadCurrentManifest();
    const job = manifest?.jobs.find((candidate) => candidate.id === id);
    const filePath = job?.outputPath || "";
    if (!filePath || !isInside(runsRoot, filePath)) throw loopError("loop_asset_not_found", "That local Tarot loop is unavailable.");
    const bytes = await fs.readFile(filePath);
    return { ok: true, dataUrl: `data:video/mp4;base64,${bytes.toString("base64")}` };
  }

  return Object.freeze({ start, continueFull, pause, resume, repairCompletedOutputs, status, review, asset, _active: () => activePromise });
}

module.exports = {
  DURATION_SECONDS,
  LOCAL_CONCURRENCY,
  MAIN_COUPLE_LOOP_PROFILE,
  MAIN_MAN_LOOP_PROFILE,
  MAIN_WOMAN_LOOP_PROFILE,
  REFERENCE_ATLAS_LOOP_PROFILE,
  MODEL,
  PILOT_COUNT,
  PROMOTIONAL_PRICE_PER_SECOND_USD,
  PROMPT_EXPANSION_MODE,
  RESOLUTION,
  SCHEMA_VERSION,
  createEchoTarotLoopGeneration,
  createLoopPrompt,
  defaultMediaPostprocessor,
  flattenLoopJobs,
  loopOutputFilename,
  publicStatus,
  selectPilotJobs,
  suitMotion,
  validateFalMediaUrl,
};
