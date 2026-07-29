export const VIBES_TRANSITION_QUEUE_VERSION = "hapa.vibes-transition-link-queue.v1";
export const VIBES_TRANSITION_JOB_VERSION = "hapa.vibes-transition-link-job.v1";
export const VIBES_TRANSITION_CATALOG_VERSION = "hapa.vibes-transition-frame-catalog.v1";
export const VIBES_TRANSITION_MEDIA_VERSION = "hapa.vibes-transition-media.v1";
export const VIBES_TRANSITION_SESSION_VERSION = "hapa.vibes-transition-session.v1";

export const VIBES_TRANSITION_ACTIVE_STATUSES = Object.freeze([
  "claimed",
  "submitted",
  "generating",
]);

const FRAME_KINDS = new Set(["reference", "avatar", "scene"]);
const ACTIVE_STATUSES = new Set(VIBES_TRANSITION_ACTIVE_STATUSES);
const SESSION_STATES = new Set(["unknown", "healthy", "recovering", "auth-required"]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function text(value) {
  return String(value || "").trim();
}

function slugify(value = "") {
  return text(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function fnv1a(value = "") {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableFrameKey(frame = {}) {
  return [
    text(frame.kind),
    text(frame.cardId),
    text(frame.assetId),
    text(frame.uri),
    text(frame.path),
  ].join("\u0000");
}

export function normalizeVibesTransitionFrame(frame = {}) {
  const kind = text(frame.kind).toLowerCase();
  const cardId = text(frame.cardId);
  const assetId = text(frame.assetId);
  const uri = text(frame.uri);
  const filePath = text(frame.path);
  if (!FRAME_KINDS.has(kind)) {
    throw new Error(`Transition frame kind must be reference, avatar, or scene; received "${kind || "empty"}".`);
  }
  if (!cardId) throw new Error("Transition frame cardId is required.");
  if (!assetId) throw new Error("Transition frame assetId is required.");
  if (!uri && !filePath) throw new Error(`Transition frame ${kind}:${cardId}:${assetId} needs a URI or local path.`);
  return {
    schemaVersion: "hapa.vibes-transition-frame.v1",
    id: text(frame.id) || `transition-frame:${kind}:${slugify(cardId)}:${slugify(assetId)}`,
    kind,
    cardId,
    cardTitle: text(frame.cardTitle || frame.title || cardId),
    assetId,
    assetTitle: text(frame.assetTitle || frame.name || assetId),
    uri,
    path: filePath,
    sha256: text(frame.sha256),
    mimeType: text(frame.mimeType || "image/*"),
    width: Number(frame.width || 0) || null,
    height: Number(frame.height || 0) || null,
    authority: clone(frame.authority || {}),
    provenance: clone(frame.provenance || {}),
  };
}

export function vibesTransitionLinkId({ from = {}, to = {}, prompt = "", model = "vibes-video" } = {}) {
  const digest = fnv1a([
    stableFrameKey(normalizeVibesTransitionFrame(from)),
    stableFrameKey(normalizeVibesTransitionFrame(to)),
    text(prompt),
    text(model || "vibes-video"),
  ].join("\u0001"));
  return `vibes-transition:${digest}`;
}

export function createVibesTransitionJob(input = {}, now = new Date().toISOString()) {
  const from = normalizeVibesTransitionFrame(input.from);
  const to = normalizeVibesTransitionFrame(input.to);
  if (stableFrameKey(from) === stableFrameKey(to)) {
    throw new Error("A transition link requires two different endpoint frames.");
  }
  const prompt = text(input.prompt);
  if (!prompt) throw new Error("A transition prompt is required.");
  const provider = {
    id: "vibes.ai",
    projectUrl: text(input.provider?.projectUrl || input.projectUrl),
    projectName: text(input.provider?.projectName || input.projectName),
    model: text(input.provider?.model || input.model || "vibes-video"),
    resolution: text(input.provider?.resolution || input.resolution || "720p"),
    jobId: text(input.provider?.jobId),
    outputUrl: text(input.provider?.outputUrl),
  };
  const id = text(input.id) || vibesTransitionLinkId({ from, to, prompt, model: provider.model });
  return {
    schemaVersion: VIBES_TRANSITION_JOB_VERSION,
    id,
    linkId: id,
    title: text(input.title) || `${from.cardTitle} → ${to.cardTitle}`,
    status: "queued",
    priority: Number(input.priority || 100),
    from,
    to,
    prompt,
    negativePrompt: text(input.negativePrompt),
    provider,
    claim: null,
    attempts: 0,
    nextEligibleAt: "",
    output: null,
    failure: null,
    createdAt: now,
    updatedAt: now,
    submittedAt: "",
    completedAt: "",
    failedAt: "",
    provenance: {
      createdBy: text(input.createdBy || "hapa-avatar-builder"),
      sourceManifest: text(input.sourceManifest),
      publicActivation: false,
      canonPromotion: false,
      mint: false,
      ...(clone(input.provenance || {})),
    },
  };
}

export function createVibesTransitionQueue(input = {}, now = new Date().toISOString()) {
  const jobs = list(input.jobs);
  return {
    schemaVersion: VIBES_TRANSITION_QUEUE_VERSION,
    title: "Vibes.ai Transition Link Buffer",
    provider: "vibes.ai",
    maxConcurrent: Math.max(1, Number(input.maxConcurrent || 3)),
    jobs,
    counts: countVibesTransitionJobs(jobs),
    createdAt: text(input.createdAt) || now,
    updatedAt: text(input.updatedAt) || now,
  };
}

export function countVibesTransitionJobs(jobs = []) {
  const byStatus = {};
  for (const job of list(jobs)) byStatus[job.status] = (byStatus[job.status] || 0) + 1;
  return {
    total: list(jobs).length,
    active: list(jobs).filter((job) => ACTIVE_STATUSES.has(job.status)).length,
    queued: byStatus.queued || 0,
    ready: byStatus.ready || 0,
    failed: byStatus.failed || 0,
    byStatus,
  };
}

function withCounts(queue, now) {
  queue.counts = countVibesTransitionJobs(queue.jobs);
  queue.updatedAt = now;
  return queue;
}

export function enqueueVibesTransitionJobs(queueInput = {}, incomingJobs = [], now = new Date().toISOString()) {
  const queue = createVibesTransitionQueue(queueInput, now);
  const existingById = new Map(queue.jobs.map((job) => [job.id, job]));
  const added = [];
  for (const incoming of list(incomingJobs)) {
    const job = incoming?.schemaVersion === VIBES_TRANSITION_JOB_VERSION
      ? clone(incoming)
      : createVibesTransitionJob(incoming, now);
    if (existingById.has(job.id)) continue;
    queue.jobs.push(job);
    existingById.set(job.id, job);
    added.push(job);
  }
  queue.jobs.sort((left, right) => (
    Number(left.priority || 100) - Number(right.priority || 100)
    || String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
    || left.id.localeCompare(right.id)
  ));
  return { queue: withCounts(queue, now), added };
}

export function fillVibesTransitionBuffer(queueInput = {}, options = {}) {
  const now = text(options.now) || new Date().toISOString();
  const nowMs = Date.parse(now);
  const queue = createVibesTransitionQueue(queueInput, now);
  const maxConcurrent = Math.max(1, Number(options.maxConcurrent || queue.maxConcurrent || 3));
  const active = queue.jobs.filter((job) => ACTIVE_STATUSES.has(job.status));
  const available = Math.max(0, maxConcurrent - active.length);
  const candidates = queue.jobs
    .filter((job) => {
      if (job.status !== "queued") return false;
      const nextEligibleAt = text(job.nextEligibleAt);
      if (!nextEligibleAt) return true;
      const nextEligibleMs = Date.parse(nextEligibleAt);
      return !Number.isFinite(nextEligibleMs) || !Number.isFinite(nowMs) || nextEligibleMs <= nowMs;
    })
    .sort((left, right) => (
      Number(left.priority || 100) - Number(right.priority || 100)
      || Number(left.attempts || 0) - Number(right.attempts || 0)
      || String(left.createdAt || "").localeCompare(String(right.createdAt || ""))
      || left.id.localeCompare(right.id)
    ))
    .slice(0, available);
  const claimedIds = new Set(candidates.map((job) => job.id));
  queue.jobs = queue.jobs.map((job) => {
    if (!claimedIds.has(job.id)) return job;
    return {
      ...job,
      status: "claimed",
      attempts: Number(job.attempts || 0) + 1,
      claim: {
        id: `vibes-claim:${fnv1a(`${job.id}\u0000${now}`)}`,
        claimant: text(options.claimant || "vibes-browser-operator"),
        claimedAt: now,
        expiresAt: text(options.expiresAt),
      },
      failure: null,
      nextEligibleAt: "",
      updatedAt: now,
    };
  });
  queue.maxConcurrent = maxConcurrent;
  withCounts(queue, now);
  return {
    queue,
    claimed: queue.jobs.filter((job) => claimedIds.has(job.id)),
    capacity: {
      maxConcurrent,
      activeBefore: active.length,
      claimed: candidates.length,
      activeAfter: queue.counts.active,
      openSlots: Math.max(0, maxConcurrent - queue.counts.active),
    },
  };
}

function transitionJob(queueInput, jobId, updater, now) {
  const queue = createVibesTransitionQueue(queueInput, now);
  const index = queue.jobs.findIndex((job) => job.id === jobId);
  if (index < 0) throw new Error(`Unknown Vibes transition job: ${jobId}`);
  queue.jobs[index] = updater(clone(queue.jobs[index]));
  return withCounts(queue, now);
}

export function markVibesTransitionSubmitted(queueInput = {}, jobId = "", input = {}, now = new Date().toISOString()) {
  return transitionJob(queueInput, jobId, (job) => {
    if (!["claimed", "submitted", "generating"].includes(job.status)) {
      throw new Error(`Vibes transition ${job.id} cannot be submitted from status ${job.status}.`);
    }
    return {
      ...job,
      status: text(input.status) === "submitted" ? "submitted" : "generating",
      provider: {
        ...job.provider,
        projectUrl: text(input.projectUrl || job.provider?.projectUrl),
        projectName: text(input.projectName || job.provider?.projectName),
        jobId: text(input.providerJobId || job.provider?.jobId),
        outputUrl: text(input.outputUrl || job.provider?.outputUrl),
      },
      submittedAt: job.submittedAt || now,
      updatedAt: now,
    };
  }, now);
}

export function markVibesTransitionReady(queueInput = {}, jobId = "", output = {}, now = new Date().toISOString()) {
  return transitionJob(queueInput, jobId, (job) => {
    if (!ACTIVE_STATUSES.has(job.status) && job.status !== "ready") {
      throw new Error(`Vibes transition ${job.id} cannot complete from status ${job.status}.`);
    }
    const sha256 = text(output.sha256);
    const uri = text(output.uri);
    const filePath = text(output.path);
    if (!sha256 || (!uri && !filePath)) {
      throw new Error("Completed transition output requires sha256 and a Builder URI or local path.");
    }
    return {
      ...job,
      status: "ready",
      output: {
        schemaVersion: VIBES_TRANSITION_MEDIA_VERSION,
        mediaRecordId: text(output.mediaRecordId || `hapa-media:sha256:${sha256}`),
        assetId: text(output.assetId || `vibes-transition-asset-${sha256}`),
        uri,
        path: filePath,
        sha256,
        bytes: Number(output.bytes || 0),
        mimeType: text(output.mimeType || "video/mp4"),
        durationSeconds: Number(output.durationSeconds || 0) || null,
        width: Number(output.width || 0) || null,
        height: Number(output.height || 0) || null,
        providerOutputUrl: text(output.providerOutputUrl || job.provider?.outputUrl),
      },
      provider: {
        ...job.provider,
        outputUrl: text(output.providerOutputUrl || job.provider?.outputUrl),
      },
      claim: null,
      completedAt: now,
      failure: null,
      nextEligibleAt: "",
      updatedAt: now,
    };
  }, now);
}

export function markVibesTransitionFailed(queueInput = {}, jobId = "", reason = "", options = {}, now = new Date().toISOString()) {
  return transitionJob(queueInput, jobId, (job) => {
    const retry = options.retry === true;
    const attempts = Math.max(1, Number(job.attempts || 0));
    const baseDelayMs = Math.max(1_000, Number(options.baseDelayMs || 5 * 60 * 1_000));
    const maxDelayMs = Math.max(baseDelayMs, Number(options.maxDelayMs || 6 * 60 * 60 * 1_000));
    const retryDelayMs = retry
      ? Math.min(maxDelayMs, baseDelayMs * (2 ** Math.min(10, attempts - 1)))
      : 0;
    const nowMs = Date.parse(now);
    const nextEligibleAt = retry && Number.isFinite(nowMs)
      ? new Date(nowMs + retryDelayMs).toISOString()
      : "";
    return {
      ...job,
      status: retry ? "queued" : "failed",
      claim: null,
      nextEligibleAt,
      failure: {
        reason: text(reason || "unspecified-vibes-transition-failure"),
        retriable: options.retry !== false,
        at: now,
        retryDelayMs,
        nextEligibleAt,
      },
      failedAt: now,
      updatedAt: now,
    };
  }, now);
}

function catalogFrame(input = {}) {
  try {
    return normalizeVibesTransitionFrame(input);
  } catch {
    return null;
  }
}

export function buildVibesTransitionFrameCatalog(input = {}, now = new Date().toISOString()) {
  const frames = [];
  for (const record of list(input.referenceMedia?.records)) {
    const image = record.artifacts?.image || {};
    const frame = catalogFrame({
      kind: "reference",
      cardId: record.card?.id,
      cardTitle: record.card?.title,
      assetId: `${record.card?.id || "reference"}:image`,
      assetTitle: `${record.card?.title || "Reference"} image`,
      uri: image.uri,
      path: image.path,
      sha256: image.sha256,
      mimeType: "image/png",
      authority: record.custody || {},
      provenance: {
        source: "data/echo-reference-animated-media.json",
        cardRevisionId: record.card?.revisionId || "",
      },
    });
    if (frame) frames.push(frame);
  }
  for (const avatar of list(input.avatarStore?.avatars)) {
    for (const asset of list(avatar.assets).filter((row) => row.type === "image")) {
      const frame = catalogFrame({
        kind: "avatar",
        cardId: avatar.id,
        cardTitle: avatar.primaryName || avatar.name || avatar.id,
        assetId: asset.id,
        assetTitle: asset.name || asset.id,
        uri: asset.uri,
        path: asset.metadata?.storage?.path || asset.metadata?.sourcePath || asset.storage?.path || "",
        sha256: asset.metadata?.sha256 || asset.metadata?.contentFingerprint || "",
        mimeType: asset.metadata?.mimeType || "image/*",
        width: asset.metadata?.width,
        height: asset.metadata?.height,
        provenance: {
          source: "data/avatar-store.json",
          requirementId: asset.requirementId || "",
        },
      });
      if (frame) frames.push(frame);
    }
  }
  for (const scene of list(input.sceneStore?.scenes)) {
    for (const asset of list(scene.assets).filter((row) => row.type === "image")) {
      const frame = catalogFrame({
        kind: "scene",
        cardId: scene.id,
        cardTitle: scene.title || scene.name || scene.id,
        assetId: asset.id,
        assetTitle: asset.name || asset.id,
        uri: asset.uri,
        path: asset.metadata?.storage?.path || asset.metadata?.sourcePath || asset.storage?.path || "",
        sha256: asset.metadata?.sha256 || asset.metadata?.contentFingerprint || "",
        mimeType: asset.metadata?.mimeType || "image/*",
        width: asset.metadata?.width,
        height: asset.metadata?.height,
        provenance: {
          source: "data/scene-store.json",
          requirementId: asset.requirementId || "",
        },
      });
      if (frame) frames.push(frame);
    }
  }
  const uniqueFrames = [...new Map(frames.map((frame) => [frame.id, frame])).values()]
    .sort((left, right) => (
      left.kind.localeCompare(right.kind)
      || left.cardTitle.localeCompare(right.cardTitle)
      || left.assetTitle.localeCompare(right.assetTitle)
    ));
  return {
    schemaVersion: VIBES_TRANSITION_CATALOG_VERSION,
    provider: "vibes.ai",
    generatedAt: now,
    counts: {
      total: uniqueFrames.length,
      reference: uniqueFrames.filter((frame) => frame.kind === "reference").length,
      avatar: uniqueFrames.filter((frame) => frame.kind === "avatar").length,
      scene: uniqueFrames.filter((frame) => frame.kind === "scene").length,
    },
    frames: uniqueFrames,
  };
}

function referenceRingPrompt(from = {}, to = {}) {
  return [
    "Create a seamless cinematic transition from the first Reference Atlas frame into the last Reference Atlas frame.",
    `Begin with “${from.cardTitle}” and resolve exactly into “${to.cardTitle}”.`,
    "Preserve the principal character identities, composition, palette, and vertical framing.",
    "Use one motivated visual bridge and natural camera motion.",
    "No text, no cuts, no logos, no new characters, and no identity drift.",
  ].join(" ");
}

export function createVibesReferenceTransitionRing(catalogInput = {}, options = {}, now = new Date().toISOString()) {
  const frames = list(catalogInput.frames)
    .filter((frame) => frame.kind === "reference")
    .map((frame) => normalizeVibesTransitionFrame(frame))
    .sort((left, right) => (
      left.cardTitle.localeCompare(right.cardTitle)
      || left.assetTitle.localeCompare(right.assetTitle)
      || left.id.localeCompare(right.id)
    ));
  if (frames.length < 2) {
    throw new Error("A Reference transition ring requires at least two valid Reference frames.");
  }
  const projectUrl = text(options.projectUrl);
  const projectName = text(options.projectName);
  const model = text(options.model || "vibes-video");
  const resolution = text(options.resolution || "720p");
  const priority = Number(options.priority || 200);
  const jobs = frames.map((from, index) => {
    const to = frames[(index + 1) % frames.length];
    return createVibesTransitionJob({
      from,
      to,
      title: `${from.cardTitle} → ${to.cardTitle}`,
      prompt: referenceRingPrompt(from, to),
      priority,
      projectUrl,
      projectName,
      model,
      resolution,
      createdBy: "hapa-avatar-builder-reference-transition-ring",
      provenance: {
        campaign: "reference-transition-ring",
        coverageRole: "outbound-transition-per-reference-image",
        ringIndex: index,
        ringSize: frames.length,
      },
    }, now);
  });
  return {
    schemaVersion: "hapa.vibes-reference-transition-ring.v1",
    generatedAt: now,
    referenceCount: frames.length,
    transitionCount: jobs.length,
    frames,
    jobs,
  };
}

export function summarizeVibesReferenceTransitionCoverage(catalogInput = {}, queueInput = {}) {
  const frames = list(catalogInput.frames)
    .filter((frame) => frame.kind === "reference")
    .map((frame) => normalizeVibesTransitionFrame(frame));
  const jobs = list(queueInput.jobs);
  const byFromFrame = new Map();
  for (const job of jobs) {
    const fromId = text(job.from?.id);
    if (!fromId) continue;
    if (!byFromFrame.has(fromId)) byFromFrame.set(fromId, []);
    byFromFrame.get(fromId).push(job);
  }
  const rows = frames.map((frame) => {
    const outgoing = byFromFrame.get(frame.id) || [];
    return {
      frameId: frame.id,
      cardId: frame.cardId,
      cardTitle: frame.cardTitle,
      path: frame.path,
      outgoingTotal: outgoing.length,
      ready: outgoing.filter((job) => job.status === "ready").length,
      active: outgoing.filter((job) => ACTIVE_STATUSES.has(job.status)).length,
      queued: outgoing.filter((job) => job.status === "queued").length,
      failed: outgoing.filter((job) => job.status === "failed").length,
      satisfied: outgoing.some((job) => job.status === "ready"),
    };
  });
  return {
    schemaVersion: "hapa.vibes-reference-transition-coverage.v1",
    referenceCount: rows.length,
    satisfied: rows.filter((row) => row.satisfied).length,
    active: rows.filter((row) => row.active > 0).length,
    queued: rows.filter((row) => row.queued > 0).length,
    failedOnly: rows.filter((row) => row.outgoingTotal > 0 && row.failed === row.outgoingTotal).length,
    missing: rows.filter((row) => row.outgoingTotal === 0).length,
    rows,
  };
}

export function updateVibesTransitionSession(previousInput = {}, stateInput = "unknown", input = {}, now = new Date().toISOString()) {
  const previous = clone(previousInput || {});
  const state = text(stateInput).toLowerCase() || "unknown";
  if (!SESSION_STATES.has(state)) {
    throw new Error(`Vibes session state must be one of ${[...SESSION_STATES].join(", ")}; received "${state}".`);
  }
  const recoveryAttempts = Number(previous.recoveryAttempts || 0) + (state === "recovering" ? 1 : 0);
  return {
    schemaVersion: VIBES_TRANSITION_SESSION_VERSION,
    provider: "vibes.ai",
    state,
    resumeUrl: text(input.resumeUrl || previous.resumeUrl),
    observedUrl: text(input.observedUrl || previous.observedUrl),
    reason: text(input.reason),
    recoveryAttempts,
    lastObservedAt: now,
    lastHealthyAt: state === "healthy" ? now : text(previous.lastHealthyAt),
    authRequiredAt: state === "auth-required" ? now : state === "healthy" ? "" : text(previous.authRequiredAt),
    nextAction: state === "healthy"
      ? "resume-three-video-buffer"
      : state === "recovering"
        ? "attempt-one-safe-login-reentry"
        : state === "auth-required"
          ? "pause-provider-submissions-and-request-human-sign-in"
          : "inspect-visible-provider-state",
  };
}

export function createVibesTransitionMediaRecord(job = {}, output = {}, now = new Date().toISOString()) {
  const sha256 = text(output.sha256 || job.output?.sha256);
  if (!sha256) throw new Error("A transition media record requires a SHA-256 digest.");
  const uri = text(output.uri || job.output?.uri);
  const filePath = text(output.path || job.output?.path);
  const endpointRelationship = (frame, role) => ({
    ownerType: frame.kind,
    ownerId: frame.cardId,
    ownerName: frame.cardTitle,
    role,
    frameAssetId: frame.assetId,
    frameUri: frame.uri,
  });
  const relationships = [
    endpointRelationship(job.from, "transition-first-frame"),
    endpointRelationship(job.to, "transition-last-frame"),
    {
      ownerType: "transition-link",
      ownerId: job.linkId || job.id,
      ownerName: job.title,
      role: "vibes-provider-output",
    },
  ];
  const assetId = text(output.assetId || job.output?.assetId || `vibes-transition-asset-${sha256}`);
  const metadata = {
    schemaVersion: VIBES_TRANSITION_MEDIA_VERSION,
    mimeType: text(output.mimeType || job.output?.mimeType || "video/mp4"),
    sizeBytes: Number(output.bytes || job.output?.bytes || 0),
    duration: Number(output.durationSeconds || job.output?.durationSeconds || 0) || null,
    width: Number(output.width || job.output?.width || 0) || null,
    height: Number(output.height || job.output?.height || 0) || null,
    thumbnailUri: job.from?.uri || "",
    storage: {
      kind: "local-file",
      path: filePath,
    },
    vibesTransitionLink: {
      schemaVersion: VIBES_TRANSITION_JOB_VERSION,
      linkId: job.linkId || job.id,
      prompt: job.prompt,
      negativePrompt: job.negativePrompt || "",
      from: clone(job.from),
      to: clone(job.to),
      provider: clone(job.provider || {}),
      outputSha256: sha256,
      publicActivation: false,
      canonPromotion: false,
      mint: false,
    },
  };
  return {
    id: text(output.mediaRecordId || job.output?.mediaRecordId || `hapa-media:sha256:${sha256}`),
    sourceKind: "vibes-transition-link",
    name: job.title || `${job.from?.cardTitle || "Frame"} → ${job.to?.cardTitle || "Frame"}`,
    mediaType: "video",
    uri,
    thumbnailUri: job.from?.uri || "",
    sourcePath: filePath,
    sourceRoots: ["hapa-avatar-builder", "vibes.ai"],
    sourceRelativePaths: {},
    contentFingerprint: `sha256:${sha256}`,
    sizeBytes: metadata.sizeBytes,
    width: metadata.width,
    height: metadata.height,
    duration: metadata.duration,
    documentKind: "transition_video",
    reviewPriority: "medium",
    reviewStatus: "linked-provider-output",
    tags: unique([
      "vibes-ai",
      "transition-link",
      "first-frame",
      "last-frame",
      `from-${job.from?.kind || "frame"}`,
      `to-${job.to?.kind || "frame"}`,
    ]),
    relationships,
    asset: {
      id: assetId,
      name: job.title,
      uri,
      type: "video",
      requirementId: "scene_videos",
      tags: ["vibes-ai", "transition-link", "director-review-required"],
      source: "vibes.ai",
      notes: "Provider output linked to the exact Builder first-frame and last-frame Cards.",
      metadata,
      processing: {
        status: "indexed-carded",
        attachedToCard: true,
        indexedAt: now,
      },
      createdAt: now,
    },
    notes: "Vibes transition video; endpoint relationships are the authoritative link.",
    createdAt: now,
    updatedAt: now,
  };
}
