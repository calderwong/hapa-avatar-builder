import {
  inferEchoRecordMediaKind,
  resolveEchoRecordMediaUri,
} from "./echo-record-garden.js";

export const ECHO_RECORD_ENTITY_STATE_SCHEMA = "hapa.echo-record-garden.entity-state.v1";
export const ECHO_RECORD_FACE_CONTRACT_SCHEMA = "hapa.echo-record-garden.record-face.v1";
export const ECHO_RECORD_VIDEO_COORDINATOR_SCHEMA = "hapa.echo-record-garden.video-coordinator.v1";
export const ECHO_RECORD_PLACEMENT_LATENCY_SCHEMA = "hapa.echo-record-garden.placement-latency.v1";

export const ECHO_RECORD_LIFECYCLE_STATES = Object.freeze([
  "crate",
  "hand",
  "platter",
  "playing",
  "lifted",
  "returned",
  "restored",
]);

export const ECHO_RECORD_VIDEO_LIMITS = Object.freeze({
  visible: 6,
  prewarm: 1,
  resident: 7,
});

export const ECHO_RECORD_PLACEMENT_BUDGETS_MS = Object.freeze({
  interactionFrame: 17,
  warmAudioStart: 500,
  coldAudioStart: 1_500,
});

export const ECHO_RECORD_PLACEMENT_MILESTONES = Object.freeze([
  "intent",
  "seated",
  "audio-unlock-start",
  "audio-unlocked",
  "fetch-start",
  "fetch-complete",
  "metadata",
  "decoded",
  "audio-start",
  "first-frame",
  "director-graph-ready",
  "failed",
  "cancelled",
]);

const HARD_VIDEO_LIMIT = ECHO_RECORD_VIDEO_LIMITS.resident;
const MAX_LATENCY_SAMPLES = 500;
const LIFECYCLE_STATE_SET = new Set(ECHO_RECORD_LIFECYCLE_STATES);
const PLACEMENT_MILESTONE_SET = new Set(ECHO_RECORD_PLACEMENT_MILESTONES);

const LIFECYCLE_TRANSITIONS = Object.freeze({
  crate: Object.freeze({ pickup: "hand", restore: "restored", recover: "restored" }),
  hand: Object.freeze({ place: "platter", return: "returned", cancel: "returned", recover: "restored" }),
  platter: Object.freeze({ play: "playing", remove: "lifted", recover: "restored" }),
  playing: Object.freeze({ pause: "platter", remove: "lifted", recover: "restored" }),
  lifted: Object.freeze({ place: "platter", return: "returned", cancel: "returned", recover: "restored" }),
  returned: Object.freeze({ settle: "crate", pickup: "hand", restore: "restored", recover: "restored" }),
  restored: Object.freeze({ settle: "crate", pickup: "hand", place: "platter", return: "returned", recover: "restored" }),
});

const STATE_PARENT = Object.freeze({
  crate: "record-crate",
  hand: "interaction-hand",
  platter: "record-platter",
  playing: "record-platter",
  lifted: "interaction-hand",
  returned: "record-crate",
  restored: "record-garden-world",
});

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampInteger(value, fallback, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Math.round(finite(value, fallback))));
}

function vector(value, length, fallback) {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? length === 4
        ? [value.x, value.y, value.z, value.w]
        : [value.x, value.y, value.z]
      : [];
  if (source.length !== length || source.some((entry) => !Number.isFinite(Number(entry)))) {
    return [...fallback];
  }
  return source.map(Number);
}

function stableRecordIdentity(record = {}) {
  const source = object(record);
  const identity = object(source.identity);
  const songId = text(source.songId || identity.sourceId || source.source?.id);
  if (!songId) throw new TypeError("A Record requires a stable source song ID.");
  const candidates = [identity.stableId, source.id].map((value) => text(value)).filter(Boolean);
  if (new Set(candidates).size > 1) {
    throw new TypeError("A Record cannot declare conflicting stable IDs.");
  }
  if (identity.sourceId && text(identity.sourceId) !== songId) {
    throw new TypeError("A Record identity source ID must match its song ID.");
  }
  const recordId = candidates[0] || `echo-record:${songId}`;
  return {
    recordId,
    songId,
    objectKey: `echo-record-object:${recordId}`,
    identityBasis: text(identity.identityBasis, "source-song-id"),
  };
}

export function echoRecordEntityIdentity(record = {}) {
  return stableRecordIdentity(record);
}

export function normalizeEchoRecordWorldTransform(value = {}) {
  const source = object(value);
  return {
    position: vector(source.position, 3, [0, 0, 0]),
    rotation: vector(source.rotation, 3, [0, 0, 0]),
    quaternion: vector(source.quaternion, 4, [0, 0, 0, 1]),
    scale: vector(source.scale, 3, [1, 1, 1]).map((entry) => (
      Math.abs(entry) < Number.EPSILON ? 1 : entry
    )),
  };
}

function declaredFaceMedia({ record = {}, visual = {}, media = {}, apiBase = "" } = {}) {
  const recordSource = object(record);
  const visualSource = object(visual);
  const visualMedia = object(visualSource.media);
  const declared = Object.keys(object(media)).length ? object(media) : visualMedia;
  const uri = resolveEchoRecordMediaUri(
    declared.uri
    || declared.videoUri
    || visualSource.videoUri
    || recordSource.videoUri
    || recordSource.video?.uri,
    apiBase,
  );
  const posterUri = resolveEchoRecordMediaUri(
    declared.posterUri
    || declared.imageUri
    || visualSource.posterUri
    || recordSource.posterUri
    || recordSource.cover?.uri
    || recordSource.coverUri,
    apiBase,
  );
  const kind = inferEchoRecordMediaKind(uri, declared.kind || declared.type);
  const revisionId = text(
    declared.revisionId
    || visualSource.source?.revisionId
    || visualSource.provenance?.referenceRevisionId
    || recordSource.source?.revisionId,
  );
  const contentHash = text(
    declared.contentHash
    || visualSource.provenance?.contentHash
    || recordSource.source?.contentHash,
  );
  return {
    uri,
    posterUri: posterUri || (kind === "image" ? uri : ""),
    kind,
    revisionId,
    contentHash,
  };
}

export function buildEchoRecordFaceContract({
  record,
  visual = {},
  media = {},
  visible = true,
  reducedMotion = false,
  mediaFailed = false,
  apiBase = "",
} = {}) {
  const identity = stableRecordIdentity(record);
  const faceMedia = declaredFaceMedia({ record, visual, media, apiBase });
  const videoCapable = faceMedia.kind === "video" && Boolean(faceMedia.uri);
  const posterCapable = Boolean(faceMedia.posterUri)
    || (faceMedia.kind === "image" && Boolean(faceMedia.uri));
  let state = "unavailable";
  let shouldAllocateVideo = false;
  let shouldPlay = false;
  if (!visible) {
    state = "virtualized";
  } else if (mediaFailed) {
    state = posterCapable ? "failed-poster" : "failed-labelled-fallback";
  } else if (videoCapable && reducedMotion) {
    state = posterCapable ? "reduced-motion-poster" : "reduced-motion-first-frame";
    shouldAllocateVideo = !posterCapable;
  } else if (videoCapable) {
    state = "looping";
    shouldAllocateVideo = true;
    shouldPlay = true;
  } else if (posterCapable) {
    state = "poster";
  }
  const mediaIdentity = [
    identity.recordId,
    faceMedia.uri,
    faceMedia.revisionId,
    faceMedia.contentHash,
  ].join("|");
  const title = text(record?.title, "Untitled Echo song");
  return {
    schemaVersion: ECHO_RECORD_FACE_CONTRACT_SCHEMA,
    recordId: identity.recordId,
    songId: identity.songId,
    identity: {
      ...identity,
      mediaIdentity,
    },
    composition: {
      mediaSurfaceId: `${identity.recordId}:face-media`,
      titleSurfaceId: `${identity.recordId}:face-title`,
      separateSurfaces: true,
    },
    media: {
      ...faceMedia,
      identity: mediaIdentity,
      state,
      visible: Boolean(visible),
      shouldAllocateVideo,
      shouldPlay,
      autoplay: shouldPlay,
      muted: true,
      loop: true,
      playsInline: true,
      preload: shouldAllocateVideo ? "auto" : "metadata",
      retainPosterOrLastFrame: true,
      blackFallbackAllowed: false,
    },
    title: {
      text: title,
      visible: Boolean(visible),
      surfaceId: `${identity.recordId}:face-title`,
      ariaLabel: `${title} record`,
      independentOfMediaTexture: true,
      fallbackState: state,
    },
  };
}

export function createEchoRecordEntityState(record = {}, {
  state = "crate",
  parentId = "",
  worldTransform = {},
  atMs = 0,
} = {}) {
  const identity = stableRecordIdentity(record);
  const initialState = LIFECYCLE_STATE_SET.has(state) ? state : "crate";
  const playing = initialState === "playing";
  return {
    schemaVersion: ECHO_RECORD_ENTITY_STATE_SCHEMA,
    ...identity,
    state: initialState,
    parentId: text(parentId, STATE_PARENT[initialState]),
    worldTransform: normalizeEchoRecordWorldTransform(worldTransform),
    sequence: 0,
    playback: {
      playing,
      session: playing ? 1 : 0,
      stopGeneration: 0,
    },
    restoredFromState: null,
    lastTransition: null,
    updatedAtMs: finite(atMs, 0),
  };
}

function rejectedTransition(entity, reason) {
  return {
    accepted: false,
    reason,
    entity,
    effects: {
      reparent: false,
      preserveWorldTransform: true,
      startPlayback: false,
      stopPlayback: false,
    },
  };
}

export function transitionEchoRecordEntity(entityState, event, {
  eventId = "",
  recordId = "",
  parentId = "",
  worldTransform,
  atMs,
} = {}) {
  const entity = object(entityState);
  if (entity.schemaVersion !== ECHO_RECORD_ENTITY_STATE_SCHEMA) {
    return rejectedTransition(entityState, "invalid-entity-state");
  }
  if (recordId && text(recordId) !== entity.recordId) {
    return rejectedTransition(entityState, "identity-mismatch");
  }
  const normalizedEvent = text(event).toLowerCase();
  const normalizedEventId = text(eventId);
  if (normalizedEventId && entity.lastTransition?.eventId === normalizedEventId) {
    return rejectedTransition(entityState, "duplicate-event");
  }
  const nextState = LIFECYCLE_TRANSITIONS[entity.state]?.[normalizedEvent];
  if (!nextState) return rejectedTransition(entityState, "invalid-transition");
  if (nextState === entity.state) return rejectedTransition(entityState, "already-in-state");

  const wasPlaying = entity.playback?.playing === true || entity.state === "playing";
  const startsPlayback = nextState === "playing" && !wasPlaying;
  const stopsPlayback = wasPlaying && nextState !== "playing";
  const nextParentId = text(parentId, STATE_PARENT[nextState] || entity.parentId);
  const parentChanged = nextParentId !== entity.parentId;
  const nextTransform = worldTransform === undefined
    ? normalizeEchoRecordWorldTransform(entity.worldTransform)
    : normalizeEchoRecordWorldTransform(worldTransform);
  const transitionAtMs = finite(atMs, finite(entity.updatedAtMs, 0));
  const nextEntity = {
    ...entity,
    state: nextState,
    parentId: nextParentId,
    worldTransform: nextTransform,
    sequence: Math.max(0, Math.round(finite(entity.sequence, 0))) + 1,
    playback: {
      playing: startsPlayback,
      session: Math.max(0, Math.round(finite(entity.playback?.session, 0))) + Number(startsPlayback),
      stopGeneration: Math.max(0, Math.round(finite(entity.playback?.stopGeneration, 0))) + Number(stopsPlayback),
    },
    restoredFromState: nextState === "restored" ? entity.state : entity.restoredFromState || null,
    lastTransition: {
      event: normalizedEvent,
      eventId: normalizedEventId || null,
      from: entity.state,
      to: nextState,
      atMs: transitionAtMs,
    },
    updatedAtMs: transitionAtMs,
  };
  return {
    accepted: true,
    reason: "accepted",
    entity: nextEntity,
    effects: {
      reparent: parentChanged,
      reparentTo: parentChanged ? nextParentId : null,
      preserveWorldTransform: true,
      startPlayback: startsPlayback,
      stopPlayback: stopsPlayback,
      stopGeneration: nextEntity.playback.stopGeneration,
    },
  };
}

export function snapshotEchoRecordEntityState(entityState = {}) {
  const entity = object(entityState);
  return {
    schemaVersion: ECHO_RECORD_ENTITY_STATE_SCHEMA,
    recordId: text(entity.recordId),
    songId: text(entity.songId),
    state: LIFECYCLE_STATE_SET.has(entity.state) ? entity.state : "crate",
    parentId: text(entity.parentId),
    worldTransform: normalizeEchoRecordWorldTransform(entity.worldTransform),
    sequence: Math.max(0, Math.round(finite(entity.sequence, 0))),
    playback: {
      playing: entity.playback?.playing === true,
      session: Math.max(0, Math.round(finite(entity.playback?.session, 0))),
      stopGeneration: Math.max(0, Math.round(finite(entity.playback?.stopGeneration, 0))),
    },
  };
}

export function restoreEchoRecordEntityState(record = {}, snapshot = {}, { atMs = 0 } = {}) {
  const identity = stableRecordIdentity(record);
  const source = object(snapshot);
  if (source.recordId && text(source.recordId) !== identity.recordId) {
    throw new TypeError("A Record snapshot cannot restore into a different stable entity.");
  }
  if (source.songId && text(source.songId) !== identity.songId) {
    throw new TypeError("A Record snapshot cannot restore into a different song identity.");
  }
  const restoredFromState = LIFECYCLE_STATE_SET.has(source.state) ? source.state : "crate";
  const stalePlayback = source.playback?.playing === true || restoredFromState === "playing";
  const entity = createEchoRecordEntityState(record, {
    state: "restored",
    parentId: source.parentId,
    worldTransform: source.worldTransform,
    atMs,
  });
  return {
    ...entity,
    sequence: Math.max(0, Math.round(finite(source.sequence, 0))) + 1,
    playback: {
      playing: false,
      session: Math.max(0, Math.round(finite(source.playback?.session, 0))),
      stopGeneration: Math.max(0, Math.round(finite(source.playback?.stopGeneration, 0))) + Number(stalePlayback),
    },
    restoredFromState,
    lastTransition: {
      event: "restore",
      eventId: null,
      from: restoredFromState,
      to: "restored",
      atMs: finite(atMs, 0),
    },
    recovery: {
      resumePlayback: false,
      stoppedStalePlayback: stalePlayback,
      preserveWorldTransform: true,
    },
  };
}

function worldMatrixElements(object3d) {
  object3d?.updateWorldMatrix?.(true, false);
  const elements = object3d?.matrixWorld?.elements;
  if (!elements || typeof elements.length !== "number") return null;
  const result = Array.from(elements, Number);
  return result.every(Number.isFinite) ? result : null;
}

function matricesMatch(left, right, tolerance = 1e-7) {
  if (!left || !right || left.length !== right.length) return null;
  return left.every((entry, index) => Math.abs(entry - right[index]) <= tolerance);
}

export function attachEchoRecordObjectPreservingWorldTransform(object3d, nextParent, {
  tolerance = 1e-7,
} = {}) {
  if (!object3d || typeof object3d !== "object") {
    throw new TypeError("A Record Object3D is required.");
  }
  if (!nextParent || typeof nextParent.attach !== "function") {
    throw new TypeError("The destination must support Object3D.attach().");
  }
  if (object3d === nextParent) throw new TypeError("A Record cannot be parented to itself.");
  const previousParent = object3d.parent || null;
  if (previousParent === nextParent) {
    return { changed: false, reason: "already-parented", worldTransformPreserved: true };
  }
  const before = worldMatrixElements(object3d);
  nextParent.attach(object3d);
  const after = worldMatrixElements(object3d);
  return {
    changed: true,
    reason: "attached",
    previousParent,
    nextParent,
    worldTransformPreserved: matricesMatch(before, after, Math.max(0, finite(tolerance, 1e-7))),
    worldMatrixBefore: before,
    worldMatrixAfter: after,
  };
}

export function createEchoRecordEntityRegistry({ now = () => Date.now() } = {}) {
  const entries = new Map();
  const objectOwners = new WeakMap();
  let duplicateObjectRejections = 0;

  const bindObject = (entry, object3d) => {
    if (!object3d || typeof object3d !== "object") return entry;
    const existingOwner = objectOwners.get(object3d);
    if (existingOwner && existingOwner !== entry.state.recordId) {
      duplicateObjectRejections += 1;
      throw new TypeError("One Record Object3D cannot represent two stable Record identities.");
    }
    if (entry.object3d && entry.object3d !== object3d) {
      duplicateObjectRejections += 1;
      throw new TypeError("A stable Record identity cannot bind a second Object3D.");
    }
    entry.object3d = object3d;
    objectOwners.set(object3d, entry.state.recordId);
    return entry;
  };

  const ensure = (record, { object3d = null, ...stateOptions } = {}) => {
    const identity = stableRecordIdentity(record);
    let entry = entries.get(identity.recordId);
    if (!entry) {
      entry = {
        state: createEchoRecordEntityState(record, { ...stateOptions, atMs: finite(stateOptions.atMs, now()) }),
        record,
        object3d: null,
      };
      entries.set(identity.recordId, entry);
    } else if (entry.state.songId !== identity.songId) {
      throw new TypeError("A stable Record ID cannot be reassigned to another song.");
    } else {
      entry.record = record;
    }
    return bindObject(entry, object3d);
  };

  return {
    ensure,
    get(recordId) {
      return entries.get(text(recordId)) || null;
    },
    transition(recordId, event, options = {}) {
      const entry = entries.get(text(recordId));
      if (!entry) return rejectedTransition(null, "record-not-registered");
      const result = transitionEchoRecordEntity(entry.state, event, {
        ...options,
        recordId: entry.state.recordId,
        atMs: finite(options.atMs, now()),
      });
      if (result.accepted) entry.state = result.entity;
      return result;
    },
    restore(record, snapshot, options = {}) {
      const entry = ensure(record);
      entry.state = restoreEchoRecordEntityState(record, snapshot, {
        atMs: finite(options.atMs, now()),
      });
      return entry;
    },
    unbind(recordId, object3d = null) {
      const entry = entries.get(text(recordId));
      if (!entry || (object3d && entry.object3d !== object3d)) return false;
      if (entry.object3d) objectOwners.delete(entry.object3d);
      entry.object3d = null;
      return true;
    },
    snapshot() {
      return Array.from(entries.values(), (entry) => snapshotEchoRecordEntityState(entry.state));
    },
    diagnostics() {
      const values = Array.from(entries.values());
      return {
        schemaVersion: ECHO_RECORD_ENTITY_STATE_SCHEMA,
        entities: values.length,
        boundObjects: values.filter((entry) => entry.object3d).length,
        playing: values.filter((entry) => entry.state.playback.playing).length,
        duplicateObjectRejections,
      };
    },
  };
}

function coordinatorCandidate(value, role, index) {
  const source = object(value);
  const contract = source.schemaVersion === ECHO_RECORD_FACE_CONTRACT_SCHEMA
    ? source
    : source.contract?.schemaVersion === ECHO_RECORD_FACE_CONTRACT_SCHEMA
      ? source.contract
      : null;
  if (!contract || contract.media?.kind !== "video" || !contract.media?.uri) return null;
  return {
    key: text(contract.media.identity, `${contract.recordId}:video:${index}`),
    role,
    contract,
  };
}

export function createEchoRecordVideoCoordinator({
  maxVisible = ECHO_RECORD_VIDEO_LIMITS.visible,
  maxPrewarm = ECHO_RECORD_VIDEO_LIMITS.prewarm,
  maxResident = ECHO_RECORD_VIDEO_LIMITS.resident,
  createResource = (contract) => ({ key: contract.media.identity }),
  disposeResource = (resource) => resource?.dispose?.(),
  now = () => Date.now(),
} = {}) {
  const residentLimit = clampInteger(maxResident, HARD_VIDEO_LIMIT, 1, HARD_VIDEO_LIMIT);
  const visibleLimit = Math.min(residentLimit, clampInteger(maxVisible, ECHO_RECORD_VIDEO_LIMITS.visible, 1, HARD_VIDEO_LIMIT));
  const prewarmLimit = Math.min(residentLimit, clampInteger(maxPrewarm, ECHO_RECORD_VIDEO_LIMITS.prewarm, 0, HARD_VIDEO_LIMIT));
  const entries = new Map();
  const totals = { created: 0, disposed: 0, promotions: 0, reconciliations: 0, failures: 0 };
  let generation = 0;
  let disposed = false;

  const uniqueCandidates = (values, role, excluded = new Set()) => {
    const seen = new Set(excluded);
    const candidates = [];
    for (const [index, value] of list(values).entries()) {
      const candidate = coordinatorCandidate(value, role, index);
      if (!candidate || seen.has(candidate.key)) continue;
      seen.add(candidate.key);
      candidates.push(candidate);
    }
    return candidates;
  };

  const disposeEntry = (entry) => {
    try {
      disposeResource(entry.resource, entry.contract);
    } finally {
      totals.disposed += 1;
    }
  };

  const snapshot = (change = {}) => {
    const values = Array.from(entries.values());
    return {
      schemaVersion: ECHO_RECORD_VIDEO_COORDINATOR_SCHEMA,
      generation,
      limits: { visible: visibleLimit, prewarm: prewarmLimit, resident: residentLimit },
      visibleKeys: values.filter((entry) => entry.role === "visible").map((entry) => entry.key),
      prewarmKeys: values.filter((entry) => entry.role === "prewarm").map((entry) => entry.key),
      residentCount: values.length,
      readyCount: values.filter((entry) => entry.status === "ready").length,
      failedCount: values.filter((entry) => entry.status === "failed").length,
      totals: { ...totals },
      ...change,
    };
  };

  return {
    reconcile({ visible = [], prewarm = [] } = {}) {
      if (disposed) throw new Error("The Record video coordinator is disposed.");
      generation += 1;
      totals.reconciliations += 1;
      const selectedVisible = uniqueCandidates(visible, "visible").slice(0, visibleLimit);
      const visibleKeys = new Set(selectedVisible.map((candidate) => candidate.key));
      const availablePrewarm = Math.min(prewarmLimit, residentLimit - selectedVisible.length);
      const selectedPrewarm = uniqueCandidates(prewarm, "prewarm", visibleKeys).slice(0, availablePrewarm);
      const selected = [...selectedVisible, ...selectedPrewarm];
      const selectedKeys = new Set(selected.map((candidate) => candidate.key));
      const createdKeys = [];
      const promotedKeys = [];
      const evictedKeys = [];

      for (const [key, entry] of entries) {
        if (selectedKeys.has(key)) continue;
        disposeEntry(entry);
        entries.delete(key);
        evictedKeys.push(key);
      }
      for (const candidate of selected) {
        const existing = entries.get(candidate.key);
        if (existing) {
          if (existing.role === "prewarm" && candidate.role === "visible") {
            totals.promotions += 1;
            promotedKeys.push(candidate.key);
          }
          existing.role = candidate.role;
          existing.contract = candidate.contract;
          existing.generation = generation;
          existing.lastUsedAtMs = finite(now(), 0);
          continue;
        }
        const entry = {
          ...candidate,
          generation,
          createdAtMs: finite(now(), 0),
          lastUsedAtMs: finite(now(), 0),
          status: candidate.role === "prewarm" ? "prewarming" : "loading",
          resource: null,
          error: null,
        };
        try {
          entry.resource = createResource(candidate.contract, { role: candidate.role, key: candidate.key });
        } catch (error) {
          entry.status = "failed";
          entry.error = text(error?.message, "Record video resource creation failed.");
          totals.failures += 1;
        }
        entries.set(candidate.key, entry);
        totals.created += 1;
        createdKeys.push(candidate.key);
      }
      if (entries.size > residentLimit) {
        throw new Error("The Record video coordinator exceeded its hard resident limit.");
      }
      return snapshot({ createdKeys, promotedKeys, evictedKeys });
    },
    mark(key, status, { error = "" } = {}) {
      const entry = entries.get(text(key));
      if (!entry) return false;
      const normalizedStatus = text(status).toLowerCase();
      if (!["loading", "prewarming", "ready", "buffering", "failed"].includes(normalizedStatus)) {
        return false;
      }
      entry.status = normalizedStatus;
      entry.error = normalizedStatus === "failed" ? text(error, "Record video failed.") : null;
      if (normalizedStatus === "failed") totals.failures += 1;
      return true;
    },
    getResource(key) {
      return entries.get(text(key))?.resource || null;
    },
    getEntry(key) {
      return entries.get(text(key)) || null;
    },
    diagnostics() {
      return snapshot();
    },
    dispose() {
      if (disposed) return snapshot({ disposed: true });
      for (const entry of entries.values()) disposeEntry(entry);
      entries.clear();
      disposed = true;
      return snapshot({ disposed: true });
    },
  };
}

function milestoneDuration(milestones, start, end) {
  if (!Number.isFinite(milestones[start]) || !Number.isFinite(milestones[end])) return null;
  return Math.max(0, milestones[end] - milestones[start]);
}

function placementMetrics(state) {
  const milestones = object(state.milestones);
  const classification = state.warmed ? "warm" : "cold";
  const budgetMs = state.warmed
    ? ECHO_RECORD_PLACEMENT_BUDGETS_MS.warmAudioStart
    : ECHO_RECORD_PLACEMENT_BUDGETS_MS.coldAudioStart;
  const audioStartMs = milestoneDuration(milestones, "intent", "audio-start");
  const seatingMs = milestoneDuration(milestones, "intent", "seated");
  return {
    classification,
    budgetMs,
    seatingMs,
    seatingWithinInteractionFrame: seatingMs === null
      ? null
      : seatingMs <= ECHO_RECORD_PLACEMENT_BUDGETS_MS.interactionFrame,
    audioUnlockMs: milestoneDuration(milestones, "audio-unlock-start", "audio-unlocked"),
    fetchMs: milestoneDuration(milestones, "fetch-start", "fetch-complete"),
    metadataFromIntentMs: milestoneDuration(milestones, "intent", "metadata"),
    decodeMs: milestoneDuration(milestones, "metadata", "decoded"),
    audioStartMs,
    firstFrameMs: milestoneDuration(milestones, "intent", "first-frame"),
    directorGraphMs: milestoneDuration(milestones, "intent", "director-graph-ready"),
    audioStartBudgetStatus: audioStartMs === null
      ? "pending"
      : audioStartMs <= budgetMs
        ? "within-budget"
        : "over-budget",
  };
}

export function createEchoRecordPlacementLatencyState({
  recordId,
  songId = "",
  mediaIdentity = "",
  warmed = false,
  intentAtMs = 0,
  retainedVisual = "poster",
} = {}) {
  const stableId = text(recordId);
  if (!stableId) throw new TypeError("Placement latency requires a stable Record ID.");
  const visual = ["poster", "retained-frame", "labelled-fallback"].includes(retainedVisual)
    ? retainedVisual
    : "labelled-fallback";
  const state = {
    schemaVersion: ECHO_RECORD_PLACEMENT_LATENCY_SCHEMA,
    recordId: stableId,
    songId: text(songId),
    mediaIdentity: text(mediaIdentity),
    warmed: warmed === true,
    status: "pending",
    retainedVisual: visual,
    blackFrameAllowed: false,
    milestones: { intent: finite(intentAtMs, 0) },
    error: null,
  };
  return { ...state, metrics: placementMetrics(state) };
}

function assertMilestoneOrder(milestones, milestone, atMs) {
  const pairs = {
    "audio-unlocked": "audio-unlock-start",
    "fetch-complete": "fetch-start",
    decoded: "metadata",
  };
  const prerequisite = pairs[milestone];
  if (prerequisite && Number.isFinite(milestones[prerequisite]) && atMs < milestones[prerequisite]) {
    throw new RangeError(`${milestone} cannot precede ${prerequisite}.`);
  }
}

export function markEchoRecordPlacementMilestone(stateValue, milestone, {
  atMs,
  error = "",
  retainedVisual = "",
} = {}) {
  const state = object(stateValue);
  if (state.schemaVersion !== ECHO_RECORD_PLACEMENT_LATENCY_SCHEMA) {
    throw new TypeError("A valid placement latency state is required.");
  }
  const normalizedMilestone = text(milestone).toLowerCase();
  if (!PLACEMENT_MILESTONE_SET.has(normalizedMilestone) || normalizedMilestone === "intent") {
    throw new TypeError(`Unsupported placement milestone: ${normalizedMilestone || "empty"}.`);
  }
  if (Number.isFinite(state.milestones?.[normalizedMilestone])) return stateValue;
  const timestamp = finite(atMs, Number.NaN);
  if (!Number.isFinite(timestamp) || timestamp < state.milestones.intent) {
    throw new RangeError("Placement milestones cannot precede the placement intent.");
  }
  assertMilestoneOrder(state.milestones, normalizedMilestone, timestamp);
  const milestones = { ...state.milestones, [normalizedMilestone]: timestamp };
  let status = state.status;
  if (normalizedMilestone === "failed") status = "failed";
  else if (normalizedMilestone === "cancelled") status = "cancelled";
  else if (Number.isFinite(milestones["audio-start"]) && Number.isFinite(milestones["first-frame"])) status = "ready";
  else if (Number.isFinite(milestones["audio-start"])) status = "playing";
  else if (Number.isFinite(milestones.seated)) status = "seated";
  const next = {
    ...state,
    status,
    milestones,
    retainedVisual: ["poster", "retained-frame", "labelled-fallback"].includes(retainedVisual)
      ? retainedVisual
      : state.retainedVisual,
    error: normalizedMilestone === "failed"
      ? text(error, "Record placement failed.")
      : state.error,
  };
  return { ...next, metrics: placementMetrics(next) };
}

function percentile95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

export function summarizeEchoRecordPlacementLatencies(states = []) {
  const source = list(states).slice(-MAX_LATENCY_SAMPLES);
  const summarize = (warmed) => {
    const values = source
      .filter((state) => state?.schemaVersion === ECHO_RECORD_PLACEMENT_LATENCY_SCHEMA && state.warmed === warmed)
      .map((state) => finite(state.metrics?.audioStartMs, Number.NaN))
      .filter(Number.isFinite);
    const p95Ms = percentile95(values);
    const budgetMs = warmed
      ? ECHO_RECORD_PLACEMENT_BUDGETS_MS.warmAudioStart
      : ECHO_RECORD_PLACEMENT_BUDGETS_MS.coldAudioStart;
    return {
      count: values.length,
      p95Ms,
      budgetMs,
      pass: p95Ms === null ? null : p95Ms <= budgetMs,
    };
  };
  return {
    schemaVersion: ECHO_RECORD_PLACEMENT_LATENCY_SCHEMA,
    sampleCount: source.length,
    truncated: list(states).length > source.length,
    warm: summarize(true),
    cold: summarize(false),
  };
}
