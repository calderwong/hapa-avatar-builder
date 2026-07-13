import {
  buildEchoIsfFrameIntent,
  validateEchoIsfCardBindings,
} from "./echo-isf-frame-intent.js";

const catalogFlights = new Map();
const sourceFlights = new Map();
const runtimeFlights = new Map();
const DEFAULT_SOURCE_CACHE_LIMIT = 32;
let sourceCacheLimit = DEFAULT_SOURCE_CACHE_LIMIT;
const sourceCacheStats = { hits: 0, misses: 0, evictions: 0 };
const dependencyIds = new WeakMap();
let nextDependencyId = 1;

function dependencyId(value) {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return String(value);
  if (!dependencyIds.has(value)) dependencyIds.set(value, nextDependencyId++);
  return dependencyIds.get(value);
}

function singleFlight(cache, key, work) {
  if (cache.has(key)) return cache.get(key);
  const promise = Promise.resolve().then(work);
  cache.set(key, promise);
  promise.catch(() => {
    if (cache.get(key) === promise) cache.delete(key);
  });
  return promise;
}

function sourceSingleFlight(key, work) {
  if (sourceFlights.has(key)) {
    const promise = sourceFlights.get(key);
    sourceFlights.delete(key);
    sourceFlights.set(key, promise);
    sourceCacheStats.hits += 1;
    return promise;
  }
  sourceCacheStats.misses += 1;
  const promise = Promise.resolve().then(work);
  sourceFlights.set(key, promise);
  while (sourceFlights.size > sourceCacheLimit) {
    const oldestKey = sourceFlights.keys().next().value;
    if (oldestKey === undefined) break;
    sourceFlights.delete(oldestKey);
    sourceCacheStats.evictions += 1;
  }
  promise.catch(() => {
    if (sourceFlights.get(key) === promise) sourceFlights.delete(key);
  });
  return promise;
}

export function getEchoIsfSourceCacheDiagnostics() {
  return {
    size: sourceFlights.size,
    limit: sourceCacheLimit,
    hits: sourceCacheStats.hits,
    misses: sourceCacheStats.misses,
    evictions: sourceCacheStats.evictions,
    keys: [...sourceFlights.keys()],
  };
}

export function configureEchoIsfSourceCache({ limit = DEFAULT_SOURCE_CACHE_LIMIT } = {}) {
  sourceCacheLimit = Math.max(1, Math.floor(Number(limit) || DEFAULT_SOURCE_CACHE_LIMIT));
  while (sourceFlights.size > sourceCacheLimit) {
    sourceFlights.delete(sourceFlights.keys().next().value);
    sourceCacheStats.evictions += 1;
  }
  return getEchoIsfSourceCacheDiagnostics();
}

export function resetEchoIsfBrowserRuntimeCaches() {
  catalogFlights.clear();
  sourceFlights.clear();
  runtimeFlights.clear();
  sourceCacheLimit = DEFAULT_SOURCE_CACHE_LIMIT;
  sourceCacheStats.hits = 0;
  sourceCacheStats.misses = 0;
  sourceCacheStats.evictions = 0;
}

function cleanApiBase(value = "") {
  return String(value || "").replace(/\/+$/, "");
}

function apiUrl(apiBase, value) {
  const source = String(value || "");
  if (/^(?:https?:|data:|blob:)/i.test(source)) return source;
  const base = cleanApiBase(apiBase);
  return base ? `${base}/${source.replace(/^\/+/, "")}` : source || "/";
}

function exactSourceId(cardOrId) {
  if (typeof cardOrId === "string") return cardOrId;
  return String(
    cardOrId?.shaderId
    || cardOrId?.sourceId
    || cardOrId?.visualization?.sourceId
    || cardOrId?.visualization?.card?.id
    || ""
  );
}

function normalizedHash(value) {
  return String(value || "").trim().replace(/^sha256:/i, "").toLowerCase();
}

function errorText(error) {
  return String(error?.message || error || "Unknown ISF runtime error");
}

function resolveDependencies(options = {}) {
  const injected = options.dependencies || {};
  const injectedFetch = options.fetchImpl || injected.fetch;
  const globalFetch = typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : null;
  return {
    fetch: injectedFetch || globalFetch,
    crypto: injected.crypto || globalThis.crypto,
    document: injected.document || globalThis.document,
    global: injected.global || globalThis,
    createCanvas: injected.createCanvas,
    createRenderer: injected.createRenderer,
    loadRuntime: injected.loadRuntime,
    sha256: injected.sha256,
  };
}

async function sha256Hex(text, dependencies) {
  if (typeof dependencies.sha256 === "function") return normalizedHash(await dependencies.sha256(text));
  const subtle = dependencies.crypto?.subtle;
  if (!subtle?.digest) throw new Error("Web Crypto SHA-256 is unavailable");
  const bytes = new TextEncoder().encode(String(text));
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function catalogRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.shaders)) return payload.shaders;
  throw new Error("Shader catalog response is not an array");
}

export function loadEchoIsfCatalog(options = {}) {
  const apiBase = cleanApiBase(options.apiBase);
  const dependencies = resolveDependencies(options);
  if (typeof dependencies.fetch !== "function") return Promise.reject(new Error("Fetch is unavailable"));
  const key = `${apiBase}\u0000${dependencyId(dependencies.fetch)}`;
  return singleFlight(catalogFlights, key, async () => {
    const response = await dependencies.fetch(apiUrl(apiBase, "/api/echos/shaders"), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response?.ok) throw new Error(`Shader catalog request failed (${response?.status || "network"})`);
    const rows = catalogRows(await response.json());
    return rows.map((row) => ({ ...row, id: String(row?.id || "") }));
  });
}

function visualizerTrack(showGraph = {}) {
  return (showGraph.tracks || []).find((track) => track?.id === "track-b")
    || (showGraph.tracks || []).find((track) => track?.role === "visualizer")
    || null;
}

export function visualizerCardsAtTime(showGraph, timeSeconds) {
  const time = Number(timeSeconds);
  if (!Number.isFinite(time)) return [];
  const cards = visualizerTrack(showGraph)?.cards || [];
  return cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => (
      exactSourceId(card)
      && card?.knockedOut !== true
      && Number(card?.startSeconds) <= time
      && Number(card?.endSeconds) > time
    ))
    .sort((left, right) => (
      Number(left.card?.visualization?.layerIndex ?? 0) - Number(right.card?.visualization?.layerIndex ?? 0)
      || left.index - right.index
    ))
    .map(({ card }) => card);
}

export function visualizerCardAtTime(showGraph, timeSeconds) {
  const cards = visualizerCardsAtTime(showGraph, timeSeconds);
  return cards[cards.length - 1] || null;
}

export function visualizerLookaheadCards(showGraph, timeSeconds, count = 3) {
  const time = Number(timeSeconds);
  if (!Number.isFinite(time)) return [];
  const limit = Math.max(1, Math.floor(Number(count) || 3));
  const ordered = (visualizerTrack(showGraph)?.cards || [])
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => exactSourceId(card) && card?.knockedOut !== true)
    .sort((left, right) => (
      Number(left.card.startSeconds) - Number(right.card.startSeconds)
      || Number(left.card.endSeconds) - Number(right.card.endSeconds)
      || Number(left.card.sourceCueIndex ?? left.index) - Number(right.card.sourceCueIndex ?? right.index)
      || left.index - right.index
    ));
  const active = visualizerCardAtTime(showGraph, time);
  let startIndex = active ? ordered.findIndex(({ card }) => card === active || card.id === active.id) : -1;
  if (startIndex < 0) startIndex = ordered.findIndex(({ card }) => Number(card.startSeconds) >= time);
  if (startIndex < 0) return [];
  return ordered.slice(startIndex, startIndex + limit).map(({ card }) => card);
}

function versionedRuntimeUrl(apiBase, shader) {
  const runtime = typeof shader?.runtime === "object"
    ? shader.runtime.source || shader.runtime.url
    : shader?.runtime || shader?.runtimeSource || "/api/echos/isf-runtime.js";
  const expectedHash = normalizedHash(
    (typeof shader?.runtime === "object" ? shader.runtime.sourceHash || shader.runtime.sha256 : "")
      || shader?.runtimeHash
      || shader?.runtimeSha256,
  );
  let url = apiUrl(apiBase, runtime);
  if (expectedHash && !/[?&]sha256=/i.test(url)) url += `${url.includes("?") ? "&" : "?"}sha256=${encodeURIComponent(expectedHash)}`;
  return { url, expectedHash };
}

function defaultCanvas(width, height, dependencies) {
  const canvas = typeof dependencies.createCanvas === "function"
    ? dependencies.createCanvas(width, height)
    : dependencies.document?.createElement?.("canvas");
  if (!canvas) throw new Error("Canvas creation is unavailable");
  canvas.width = Math.max(1, Math.round(Number(width) || 1));
  canvas.height = Math.max(1, Math.round(Number(height) || 1));
  return canvas;
}

function defaultRuntimeLoader(url, dependencies) {
  const existing = dependencies.global?.interactiveShaderFormat;
  if (existing?.Renderer) return Promise.resolve(existing);
  const documentRef = dependencies.document;
  if (!documentRef?.createElement || !documentRef?.head?.appendChild) {
    return Promise.reject(new Error("ISF UMD runtime loader requires a document"));
  }
  return new Promise((resolve, reject) => {
    const script = documentRef.createElement("script");
    script.async = true;
    script.src = url;
    script.dataset.echoIsfRuntime = "true";
    script.onload = () => {
      const loaded = dependencies.global?.interactiveShaderFormat;
      if (loaded?.Renderer) resolve(loaded);
      else reject(new Error("ISF UMD loaded without interactiveShaderFormat.Renderer"));
    };
    script.onerror = () => reject(new Error(`ISF UMD failed to load: ${url}`));
    documentRef.head.appendChild(script);
  });
}

function loadRuntime(url, expectedHash, dependencies) {
  const loader = dependencies.loadRuntime || defaultRuntimeLoader;
  const key = `${url}\u0000${expectedHash}\u0000${dependencyId(loader)}\u0000${dependencyId(dependencies.global)}`;
  return singleFlight(runtimeFlights, key, async () => {
    const library = await loader(url, dependencies);
    if (!library?.Renderer && typeof dependencies.createRenderer !== "function") {
      throw new Error("ISF runtime has no Renderer constructor");
    }
    return library;
  });
}

function fetchVerifiedSource({ apiBase, shader, dependencies }) {
  const shaderId = String(shader?.id || "");
  const expectedHash = normalizedHash(shader?.sourceSha256 || shader?.sourceHash || shader?.sha256);
  const sourceUrl = apiUrl(apiBase, shader?.sourceUrl || shader?.source);
  const key = [apiBase, shaderId, sourceUrl, expectedHash, dependencyId(dependencies.fetch)].join("\u0000");
  return sourceSingleFlight(key, async () => {
    if (!expectedHash) {
      const error = new Error(`Shader ${shaderId} has no SHA-256 source truth`);
      error.code = "hash-error";
      throw error;
    }
    const response = await dependencies.fetch(sourceUrl, { method: "GET", cache: "force-cache" });
    if (!response?.ok) {
      const error = new Error(`Shader source request failed for ${shaderId} (${response?.status || "network"})`);
      error.code = response?.status === 404 ? "missing-id" : response?.status === 409 ? "hash-error" : "draw-error";
      throw error;
    }
    const source = await response.text();
    const observedHash = await sha256Hex(source, dependencies);
    if (observedHash !== expectedHash) {
      const error = new Error(`Shader source hash mismatch for ${shaderId}: expected ${expectedHash}, observed ${observedHash}`);
      error.code = "hash-error";
      error.expectedHash = expectedHash;
      error.observedHash = observedHash;
      throw error;
    }
    if (Number.isFinite(Number(shader.sourceBytes)) && new TextEncoder().encode(source).byteLength !== Number(shader.sourceBytes)) {
      const error = new Error(`Shader source byte count mismatch for ${shaderId}`);
      error.code = "hash-error";
      throw error;
    }
    return { source, sourceUrl, expectedHash, observedHash };
  });
}

function rendererError(renderer, fallback) {
  return renderer?.error?.message || renderer?.error || fallback;
}

export function createEchoIsfSurface(options = {}) {
  const apiBase = cleanApiBase(options.apiBase);
  const dependencies = resolveDependencies(options);
  const canvas = options.canvas || defaultCanvas(options.width || 1280, options.height || 720, dependencies);
  if (options.canvas && Number.isFinite(Number(options.width))) canvas.width = Math.max(1, Math.round(Number(options.width)));
  if (options.canvas && Number.isFinite(Number(options.height))) canvas.height = Math.max(1, Math.round(Number(options.height)));
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
  let catalog = null;
  let library = null;
  let gl = null;
  let renderer = null;
  let currentShader = null;
  let currentShaderId = "";
  let disposed = false;
  let prepareSequence = 0;
  let state = {
    ok: false,
    status: "idle",
    sourceId: "",
    shaderId: "",
    sourceHash: "",
    error: "",
    composition: null,
    frameReceipt: null,
    width: canvas.width,
    height: canvas.height,
  };

  const snapshot = () => ({
    ...state,
    contextCount: gl ? 1 : 0,
    programCount: renderer && currentShaderId ? 1 : 0,
  });
  const publish = (status, patch = {}) => {
    state = {
      ...state,
      ...patch,
      status,
      ok: status === "ready",
      width: canvas.width,
      height: canvas.height,
    };
    try { onStatus(snapshot()); } catch { /* status observers cannot break rendering */ }
    return snapshot();
  };

  const findExactShader = (shaderId) => catalog?.find((shader) => String(shader.id || "") === shaderId) || null;

  const ensureCore = async () => {
    if (disposed) throw new Error("ISF surface is disposed");
    if (!catalog) catalog = await loadEchoIsfCatalog({ apiBase, dependencies });
    if (!catalog.length) throw new Error("ISF shader catalog is empty");
    if (!library) {
      const runtime = versionedRuntimeUrl(apiBase, catalog[0]);
      library = await loadRuntime(runtime.url, runtime.expectedHash, dependencies);
    }
    if (!gl) {
      gl = canvas.getContext?.("webgl", {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) throw new Error("WebGL is unavailable");
    }
    if (!renderer) {
      renderer = typeof dependencies.createRenderer === "function"
        ? dependencies.createRenderer({ library, gl, canvas })
        : new library.Renderer(gl);
      if (!renderer) throw new Error("ISF renderer creation failed");
    }
  };

  const prepare = async (cardOrId = null) => {
    const shaderId = exactSourceId(cardOrId);
    const sequence = ++prepareSequence;
    publish("loading", { sourceId: shaderId, shaderId, error: "", composition: null, frameReceipt: null });
    if (!shaderId) {
      return publish("missing-id", {
        sourceId: "",
        shaderId: "",
        error: "Prepare requires an exact shaderId",
      });
    }
    try {
      await ensureCore();
      const shader = findExactShader(shaderId);
      if (!shader) return publish("missing-id", { sourceId: shaderId, shaderId, error: `Shader ID is not present in the catalog: ${shaderId}` });
      const bindingValidation = validateEchoIsfCardBindings(shader, typeof cardOrId === "object" ? cardOrId : {});
      if (!bindingValidation.ok) {
        return publish("input-error", {
          sourceId: shaderId,
          shaderId,
          sourceHash: normalizedHash(shader.sourceHash || shader.sourceSha256),
          error: bindingValidation.errors.join(", "),
        });
      }
      if (currentShaderId === shaderId && renderer?.valid !== false) {
        return publish("ready", { sourceId: shaderId, shaderId, sourceHash: normalizedHash(shader.sourceHash || shader.sourceSha256), error: "" });
      }
      const verified = await fetchVerifiedSource({ apiBase, shader, dependencies });
      if (sequence !== prepareSequence) return snapshot();
      try {
        renderer.loadSource(verified.source);
      } catch (error) {
        return publish("compile-error", { sourceId: shaderId, shaderId, sourceHash: verified.observedHash, error: errorText(error) });
      }
      if (renderer.valid === false) {
        return publish("compile-error", { sourceId: shaderId, shaderId, sourceHash: verified.observedHash, error: errorText(rendererError(renderer, "Shader compile failed")) });
      }
      currentShader = shader;
      currentShaderId = shaderId;
      return publish("ready", { sourceId: shaderId, shaderId, sourceHash: verified.observedHash, error: "" });
    } catch (error) {
      const status = ["missing-id", "hash-error", "compile-error", "draw-error", "input-error"].includes(error?.code)
        ? error.code
        : "compile-error";
      return publish(status, { sourceId: shaderId, shaderId, error: errorText(error) });
    }
  };

  const draw = (input = {}) => {
    const shaderId = String(input.shaderId || exactSourceId(input.card) || "");
    if (disposed) return publish("draw-error", { sourceId: shaderId, shaderId, error: "ISF surface is disposed" });
    if (!shaderId || shaderId !== currentShaderId || !renderer) {
      return publish(shaderId ? "loading" : "missing-id", {
        sourceId: shaderId,
        shaderId,
        error: shaderId ? `Shader ${shaderId} has not been prepared` : "Draw requires an exact shaderId",
      });
    }
    const width = Math.max(1, Math.round(Number(input.width) || canvas.width || 1));
    const height = Math.max(1, Math.round(Number(input.height) || canvas.height || 1));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    let intent = null;
    try {
      intent = buildEchoIsfFrameIntent({
        shader: currentShader,
        card: input.card || {},
        timestampSeconds: Number(input.time) || 0,
        sourceHash: state.sourceHash,
        values: input.values || {},
        signalFrames: input.signalFrames || {},
        audio: input.audio || null,
        imageInputs: input.imageInputs || {},
        mediaElement: input.mediaElement || null,
        mediaIdentity: input.mediaIdentity || {},
        composition: input.composition || {},
      });
      if (!intent.ok) {
        return publish("input-error", {
          sourceId: shaderId,
          shaderId,
          error: intent.error,
          composition: intent.composition,
          frameReceipt: intent.frameReceipt,
        });
      }
      for (const [name, value] of Object.entries(intent.values)) renderer.setValue?.(name, value);
      for (const [name, value] of Object.entries(intent.imageInputs)) renderer.setValue?.(name, value);
      renderer.draw(canvas);
      return publish("ready", {
        sourceId: shaderId,
        shaderId,
        error: "",
        composition: intent.composition,
        frameReceipt: intent.frameReceipt,
      });
    } catch (error) {
      return publish("draw-error", {
        sourceId: shaderId,
        shaderId,
        error: errorText(error),
        composition: intent?.composition || null,
        frameReceipt: intent?.frameReceipt || null,
      });
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    prepareSequence += 1;
    try { renderer?.cleanup?.(); } catch { /* cleanup is best effort */ }
    try { gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.(); } catch { /* context loss is best effort */ }
    renderer = null;
    gl = null;
    currentShader = null;
    currentShaderId = "";
    publish("disposed", { sourceId: "", shaderId: "", sourceHash: "", error: "" });
  };

  return { canvas, prepare, draw, getState: snapshot, dispose };
}

function poolCardRange(card = {}) {
  const startSeconds = Number(card.startSeconds);
  const endSeconds = Number(card.endSeconds);
  return Number.isFinite(startSeconds) && Number.isFinite(endSeconds) && endSeconds > startSeconds
    ? { startSeconds, endSeconds }
    : null;
}

function normalizedDirtyRange(range = {}) {
  if (Array.isArray(range)) return poolCardRange({ startSeconds: range[0], endSeconds: range[1] });
  return poolCardRange({
    startSeconds: range.startSeconds ?? range.earliestDirtySeconds ?? range.start ?? range.fromSeconds ?? range.from,
    endSeconds: range.endSeconds ?? range.endDirtySeconds ?? range.latestDirtySeconds ?? range.end ?? range.toSeconds ?? range.to,
  });
}

function rangesOverlap(left, right) {
  return left && right && left.startSeconds < right.endSeconds && left.endSeconds > right.startSeconds;
}

function poolCardSourceHash(card = {}) {
  return String(
    card?.visualization?.card?.source?.hash
    || card?.visualization?.card?.source?.sha256
    || card?.visualization?.card?.sourceHash
    || card?.visualization?.sourceHash
    || card?.sourceHash
    || "catalog-source-truth",
  ).trim().toLowerCase();
}

function poolCardContentKey(card = {}) {
  return `${exactSourceId(card)}\u0000${poolCardSourceHash(card)}`;
}

export function createEchoIsfPlaybackPool(options = {}) {
  const maxSurfaces = Math.max(2, Math.min(3, Math.floor(Number(options.maxSurfaces) || 3)));
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
  const slots = [];
  const warmingByKey = new Map();
  let presentedSlot = null;
  let useSequence = 0;
  let slotSequence = 0;
  let disposed = false;
  let requestedShaderId = "";
  let handoffStatus = "idle";
  let handoffs = 0;
  let heldFrames = 0;
  let evictions = 0;
  let hasPresentedFrame = false;
  const blackIntervals = [];
  const frameSamples = [];

  if (options.sourceCacheMaxEntries != null) {
    configureEchoIsfSourceCache({ limit: options.sourceCacheMaxEntries });
  }

  const emit = (status, details = {}) => {
    handoffStatus = status;
    try { onStatus({ status, ...details }); } catch { /* observers cannot break playback */ }
  };

  const touch = (slot) => {
    slot.lastUsed = ++useSequence;
    return slot;
  };

  const attachSurface = (slot) => {
    slot.surface = createEchoIsfSurface({
      apiBase: options.apiBase,
      width: options.width,
      height: options.height,
      dependencies: options.dependencies,
      fetchImpl: options.fetchImpl,
      onStatus: (state) => {
        slot.runtimeStatus = state.status;
        slot.observedSourceHash = String(state.sourceHash || slot.observedSourceHash || "");
        if (state.error) slot.error = String(state.error);
      },
    });
    return slot.surface;
  };

  const newSlot = () => {
    const slot = {
      id: `isf-pool-slot:${slotSequence++}`,
      key: "",
      shaderId: "",
      declaredSourceHash: "",
      observedSourceHash: "",
      card: null,
      status: "idle",
      ready: false,
      error: "",
      invalidated: false,
      presented: false,
      lastUsed: ++useSequence,
      ranges: [],
      cacheKeys: new Set(),
      textureCount: 0,
      surface: null,
      generation: 0,
    };
    attachSurface(slot);
    slots.push(slot);
    return slot;
  };

  const removeSlot = (slot) => {
    const index = slots.indexOf(slot);
    if (index >= 0) slots.splice(index, 1);
    if (presentedSlot === slot) presentedSlot = null;
    slot.generation += 1;
    try { slot.surface?.dispose?.(); } catch { /* disposal is best effort */ }
    slot.surface = null;
  };

  const evictableSlot = () => slots
    .filter((slot) => slot !== presentedSlot && slot.status !== "loading")
    .sort((left, right) => left.lastUsed - right.lastUsed || left.id.localeCompare(right.id))[0] || null;

  const allocateSlot = () => {
    if (slots.length < maxSurfaces) return newSlot();
    const slot = evictableSlot();
    if (!slot) return null;
    evictions += 1;
    slot.generation += 1;
    try { slot.surface?.dispose?.(); } catch { /* disposal is best effort */ }
    slot.surface = null;
    slot.key = "";
    slot.shaderId = "";
    slot.declaredSourceHash = "";
    slot.observedSourceHash = "";
    slot.card = null;
    slot.status = "idle";
    slot.ready = false;
    slot.error = "";
    slot.invalidated = false;
    slot.presented = false;
    slot.ranges = [];
    slot.cacheKeys.clear();
    slot.textureCount = 0;
    slot.lastResult = null;
    attachSurface(slot);
    return touch(slot);
  };

  const rememberCard = (slot, card, cacheKey = "") => {
    slot.card = card;
    const range = poolCardRange(card);
    if (range && !slot.ranges.some((item) => item.startSeconds === range.startSeconds && item.endSeconds === range.endSeconds)) slot.ranges.push(range);
    if (cacheKey) slot.cacheKeys.add(String(cacheKey));
  };

  const prepareCard = (card, cacheKey = "") => {
    const shaderId = exactSourceId(card);
    if (!shaderId) return Promise.resolve({ status: "missing-id", shaderId: "", error: "Prewarm requires an exact shader ID", slot: null });
    const key = poolCardContentKey(card);
    const declaredSourceHash = poolCardSourceHash(card);
    const existing = slots.find((slot) => slot.key === key && !slot.invalidated);
    if (existing?.ready) {
      rememberCard(existing, card, cacheKey);
      touch(existing);
      return Promise.resolve({ status: "ready", shaderId, slot: existing });
    }
    if (existing && existing.status !== "idle" && existing.status !== "loading") {
      rememberCard(existing, card, cacheKey);
      touch(existing);
      return Promise.resolve({ status: existing.status, shaderId, error: existing.error, slot: existing });
    }
    if (warmingByKey.has(key)) return warmingByKey.get(key);
    const slot = existing || allocateSlot();
    if (!slot) return Promise.resolve({ status: "capacity-held", shaderId, error: "All pool surfaces are protected by the current presentation", slot: null });
    slot.key = key;
    slot.shaderId = shaderId;
    slot.declaredSourceHash = declaredSourceHash;
    slot.status = "loading";
    slot.ready = false;
    slot.error = "";
    slot.invalidated = false;
    rememberCard(slot, card, cacheKey);
    touch(slot);
    const generation = ++slot.generation;
    const flight = Promise.resolve(slot.surface.prepare(card))
      .then((result = {}) => {
        if (disposed || slot.generation !== generation || slot.key !== key || !slots.includes(slot)) {
          return { status: "stale", shaderId, error: "Prewarm result was invalidated", slot: null };
        }
        slot.status = String(result.status || "compile-error");
        slot.ready = slot.status === "ready";
        slot.error = String(result.error || "");
        slot.observedSourceHash = String(result.sourceHash || slot.observedSourceHash || "");
        touch(slot);
        emit(slot.ready ? "prewarm-ready" : "prewarm-error", { shaderId, error: slot.error });
        return { ...result, shaderId, slot };
      })
      .catch((error) => {
        if (disposed || slot.generation !== generation || slot.key !== key || !slots.includes(slot)) {
          return { status: "stale", shaderId, error: "Prewarm result was invalidated", slot: null };
        }
        slot.status = "compile-error";
        slot.ready = false;
        slot.error = errorText(error);
        emit("prewarm-error", { shaderId, error: slot.error });
        return { status: slot.status, shaderId, error: slot.error, slot };
      })
      .finally(() => {
        if (warmingByKey.get(key) === flight) warmingByKey.delete(key);
      });
    warmingByKey.set(key, flight);
    return flight;
  };

  const prewarm = async (input = []) => {
    if (disposed) return { status: "disposed", requested: 0, ready: 0, errors: ["pool-disposed"] };
    const cards = Array.isArray(input) ? input : Array.isArray(input?.cards) ? input.cards : [];
    const cacheKey = Array.isArray(input) ? "" : String(input?.cacheKey || "");
    const unique = [];
    const seen = new Set();
    for (const card of cards) {
      const key = poolCardContentKey(card);
      if (!exactSourceId(card) || seen.has(key)) continue;
      seen.add(key);
      unique.push(card);
      if (unique.length >= maxSurfaces) break;
    }
    const results = await Promise.all(unique.map((card) => prepareCard(card, cacheKey)));
    const ready = results.filter((result) => result.status === "ready").length;
    return {
      status: ready === results.length ? "ready" : ready > 0 ? "partial" : results.length ? "error" : "ready",
      requested: results.length,
      ready,
      shaderIds: results.filter((result) => result.status === "ready").map((result) => result.shaderId),
      errors: results.filter((result) => result.status !== "ready").map((result) => ({ shaderId: result.shaderId, status: result.status, error: result.error || "" })),
      diagnostics: getDiagnostics(),
    };
  };

  const holdResult = (status, shaderId, error = "") => {
    const heldPrevious = Boolean(presentedSlot?.surface?.canvas);
    if (heldPrevious) heldFrames += 1;
    else if (hasPresentedFrame && (!blackIntervals.length || blackIntervals.at(-1)?.endSequence != null)) {
      blackIntervals.push({ startSequence: useSequence, endSequence: null, shaderId });
    }
    emit(heldPrevious ? status : `${status}-without-frame`, { requestedShaderId: shaderId, presentedShaderId: presentedSlot?.shaderId || "", error });
    return {
      status,
      handoff: status,
      shaderId,
      requestedShaderId: shaderId,
      presentedShaderId: presentedSlot?.shaderId || "",
      canvas: presentedSlot?.surface?.canvas || null,
      heldPrevious,
      heldPreviousFrame: heldPrevious,
      switched: false,
      error,
      composition: presentedSlot?.lastResult?.composition || null,
      frameReceipt: presentedSlot?.lastResult?.frameReceipt || null,
    };
  };

  const present = (cardOrInput, frameInput = null) => {
    const combinedInput = frameInput == null && cardOrInput?.card
      ? cardOrInput
      : { ...(frameInput || {}), card: cardOrInput };
    const card = combinedInput.card;
    const shaderId = exactSourceId(card);
    requestedShaderId = shaderId;
    if (disposed) return holdResult("disposed", shaderId, "ISF playback pool is disposed");
    if (!shaderId) return holdResult("missing-id", "", "Presentation requires an exact shader ID");
    const key = poolCardContentKey(card);
    const candidate = slots.find((slot) => slot.key === key && !slot.invalidated);
    const slot = candidate?.ready ? candidate : null;
    if (!slot) {
      if (!candidate) prepareCard(card, String(combinedInput.cacheKey || "")).catch(() => {});
      const pendingStatus = candidate && candidate.status !== "loading" && candidate.status !== "idle"
        ? candidate.status
        : "handoff-pending";
      const pendingError = candidate?.error || "Candidate shader is still prewarming";
      return holdResult(pendingStatus, shaderId, pendingError);
    }
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const result = slot.surface.draw({ ...combinedInput, card });
    const elapsed = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - startedAt);
    frameSamples.push(elapsed);
    if (frameSamples.length > 240) frameSamples.splice(0, frameSamples.length - 240);
    slot.textureCount = result?.frameReceipt?.media?.bindings?.filter((binding) => binding.ready).length || 0;
    if (result?.status !== "ready") {
      slot.status = String(result?.status || "draw-error");
      slot.error = String(result?.error || "");
      return holdResult(slot.status, shaderId, slot.error);
    }
    const previous = presentedSlot;
    if (previous && previous !== slot) previous.presented = false;
    presentedSlot = slot;
    hasPresentedFrame = true;
    slot.presented = true;
    slot.status = "ready";
    slot.lastResult = result;
    rememberCard(slot, card, String(combinedInput.cacheKey || ""));
    touch(slot);
    if (previous !== slot) handoffs += 1;
    for (const interval of blackIntervals) if (interval.endSequence == null) interval.endSequence = useSequence;
    if (previous?.invalidated && previous !== slot) removeSlot(previous);
    emit(previous === slot ? "presented" : "committed", { requestedShaderId: shaderId, presentedShaderId: shaderId });
    return {
      ...result,
      status: "ready",
      handoff: previous === slot ? "presented" : "committed",
      shaderId,
      requestedShaderId: shaderId,
      presentedShaderId: shaderId,
      canvas: slot.surface.canvas,
      heldPrevious: false,
      heldPreviousFrame: false,
      switched: previous !== slot,
    };
  };

  const invalidate = (input = {}) => {
    const shaderIds = new Set((input.shaderIds || []).map(String));
    const cacheKey = String(input.cacheKey || "");
    const ranges = [...(input.ranges || []), ...(input.dirtyRanges || [])].map(normalizedDirtyRange).filter(Boolean);
    const hasShaderFilter = shaderIds.size > 0;
    const hasRangeFilter = ranges.length > 0;
    const hasCacheFilter = Boolean(cacheKey);
    const affected = slots.filter((slot) => {
      const shaderMatch = !hasShaderFilter || shaderIds.has(slot.shaderId);
      const rangeMatch = !hasRangeFilter || ranges.some((range) => slot.ranges.some((candidate) => rangesOverlap(candidate, range)));
      const cacheMatch = !hasCacheFilter || slot.cacheKeys.has(cacheKey);
      return (hasShaderFilter || hasRangeFilter || hasCacheFilter) && shaderMatch && rangeMatch && cacheMatch;
    });
    const invalidatedShaderIds = [];
    for (const slot of affected) {
      invalidatedShaderIds.push(slot.shaderId);
      warmingByKey.delete(slot.key);
      slot.generation += 1;
      if (slot === presentedSlot) {
        slot.invalidated = true;
        slot.ready = false;
        slot.status = "invalidated-holding-last-frame";
      } else {
        removeSlot(slot);
      }
    }
    emit("invalidated", { invalidatedShaderIds });
    return { invalidatedShaderIds, invalidatedSlotCount: affected.length, diagnostics: getDiagnostics() };
  };

  function getDiagnostics() {
    const times = frameSamples;
    const sourceCacheDiagnostics = getEchoIsfSourceCacheDiagnostics();
    const resourceStates = slots.map((slot) => slot.surface?.getState?.() || {});
    const contextCount = resourceStates.reduce((sum, state) => sum + Number(state.contextCount || 0), 0);
    const programCount = resourceStates.reduce((sum, state) => sum + Number(state.programCount || 0), 0);
    const sortedTimes = [...times].sort((left, right) => left - right);
    const p95Index = sortedTimes.length ? Math.min(sortedTimes.length - 1, Math.ceil(sortedTimes.length * 0.95) - 1) : 0;
    return {
      maxSurfaces,
      surfaceCount: slots.length,
      poolSize: slots.length,
      contextCount,
      contexts: contextCount,
      programCount,
      programs: programCount,
      textureCount: slots.reduce((sum, slot) => sum + slot.textureCount, 0),
      requestedShaderId,
      requestedSourceId: requestedShaderId,
      presentedShaderId: presentedSlot?.shaderId || "",
      currentShaderId: presentedSlot?.shaderId || "",
      currentSourceId: presentedSlot?.shaderId || "",
      handoffStatus,
      handoffs,
      heldFrames,
      evictions,
      blackIntervals: blackIntervals.map((interval) => ({ ...interval })),
      blackIntervalCount: blackIntervals.length,
      prewarmReady: slots.filter((slot) => slot.ready && slot !== presentedSlot).length,
      prewarm: { ready: slots.filter((slot) => slot.ready && slot !== presentedSlot).length, pending: warmingByKey.size },
      sourceCache: {
        ...sourceCacheDiagnostics,
        entryCount: sourceCacheDiagnostics.size,
        maxEntries: sourceCacheDiagnostics.limit,
      },
      sourceCacheStats: sourceCacheDiagnostics,
      frameTiming: {
        lastMs: times.at(-1) || 0,
        averageMs: times.length ? times.reduce((sum, value) => sum + value, 0) / times.length : 0,
        maxMs: times.length ? Math.max(...times) : 0,
        p95Ms: sortedTimes[p95Index] || 0,
        sampleCount: times.length,
      },
      lastFrameMs: times.at(-1) || 0,
      slots: slots.map((slot) => ({
        id: slot.id,
        key: slot.key,
        shaderId: slot.shaderId,
        declaredSourceHash: slot.declaredSourceHash,
        observedSourceHash: slot.observedSourceHash,
        status: slot.status,
        ready: slot.ready,
        presented: slot === presentedSlot,
        invalidated: slot.invalidated,
        lastUsed: slot.lastUsed,
        ranges: slot.ranges.map((range) => ({ ...range })),
        cacheKeys: [...slot.cacheKeys].sort(),
        textureCount: slot.textureCount,
        error: slot.error,
      })),
      disposed,
    };
  }

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    warmingByKey.clear();
    for (const slot of [...slots]) removeSlot(slot);
    presentedSlot = null;
    emit("disposed");
  };

  return { prewarm, present, invalidate, getDiagnostics, getState: getDiagnostics, dispose };
}
