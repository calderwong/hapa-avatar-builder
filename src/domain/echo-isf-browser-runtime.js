import { bindHyperFramesIsfFrameInputs, prepareHyperFramesIsfFrame, createHyperFramesIsfCheckpointStore, prepareHyperFramesIsfSeek } from "./hyperframes-isf-frame-runtime.js";
import {
  buildEchoIsfFrameIntent,
  validateEchoIsfCardBindings,
} from "./echo-isf-frame-intent.js";

const catalogFlights = new Map();
const sourceFlights = new Map();
const runtimeFlights = new Map();
const DEFAULT_SOURCE_CACHE_LIMIT = 32;
const DEFAULT_ISF_CLOCK_FPS = 60;
const ISF_CLOCK_SEEK_THRESHOLD_SECONDS = 0.5;
let sourceCacheLimit = DEFAULT_SOURCE_CACHE_LIMIT;
const sourceCacheStats = { hits: 0, misses: 0, evictions: 0 };
const dependencyIds = new WeakMap();
const RESOLVED_DEPENDENCIES = Symbol("echo-isf-resolved-dependencies");
const DEFAULT_FAILURE_CACHE_LIMIT = 64;
// Binding/input failures are cue-specific and may recover when the next card or
// media frame arrives, so they must never poison every use of the same shader.
const TERMINAL_PREPARE_FAILURES = new Set(["missing-id", "hash-error", "compile-error", "unsupported-quarantine"]);
let nextDependencyId = 1;

function defaultBrowserFetch(...args) {
  return globalThis.fetch(...args);
}

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
  if (injected?.[RESOLVED_DEPENDENCIES]) return injected;
  const injectedFetch = options.fetchImpl || injected.fetch;
  const globalFetch = typeof globalThis.fetch === "function"
    ? defaultBrowserFetch
    : null;
  const dependencies = {
    fetch: injectedFetch || globalFetch,
    crypto: injected.crypto || globalThis.crypto,
    document: injected.document || globalThis.document,
    global: injected.global || globalThis,
    createCanvas: injected.createCanvas,
    createRenderer: injected.createRenderer,
    loadRuntime: injected.loadRuntime,
    sha256: injected.sha256,
  };
  Object.defineProperty(dependencies, RESOLVED_DEPENDENCIES, { value: true });
  return dependencies;
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

function visualizerTracks(showGraph = {}) {
  return (showGraph.tracks || []).filter((track) => (
    track?.role === "visualizer"
    || ["track-b", "ivf-stack"].includes(track?.id)
  ));
}

function visualizerCards(showGraph = {}) {
  return visualizerTracks(showGraph).flatMap((track, trackIndex) => (
    (track.cards || []).map((card, cardIndex) => ({ card, track, trackIndex, cardIndex }))
  ));
}

export function visualizerCardsAtTime(showGraph, timeSeconds) {
  const time = Number(timeSeconds);
  if (!Number.isFinite(time)) return [];
  return visualizerCards(showGraph)
    .filter(({ card }) => (
      exactSourceId(card)
      && card?.knockedOut !== true
      && Number(card?.startSeconds) <= time
      && Number(card?.endSeconds) > time
    ))
    .sort((left, right) => (
      Number(left.card?.visualization?.layerIndex ?? 0) - Number(right.card?.visualization?.layerIndex ?? 0)
      || left.trackIndex - right.trackIndex
      || left.cardIndex - right.cardIndex
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
  const ordered = visualizerCards(showGraph)
    .filter(({ card }) => exactSourceId(card) && card?.knockedOut !== true)
    .sort((left, right) => (
      Number(left.card.startSeconds) - Number(right.card.startSeconds)
      || Number(left.card.endSeconds) - Number(right.card.endSeconds)
      || Number(left.card.visualization?.layerIndex ?? 0) - Number(right.card.visualization?.layerIndex ?? 0)
      || Number(left.card.sourceCueIndex ?? left.cardIndex) - Number(right.card.sourceCueIndex ?? right.cardIndex)
      || left.trackIndex - right.trackIndex
      || left.cardIndex - right.cardIndex
    ));
  const active = visualizerCardsAtTime(showGraph, time);
  const activeIds = new Set(active.map((card) => card.id));
  const upcoming = ordered
    .map(({ card }) => card)
    .filter((card) => !activeIds.has(card.id) && Number(card.startSeconds) >= time);
  return [...active, ...upcoming].slice(0, Math.max(limit, active.length));
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

function finitePlaybackNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function roundedClockSeconds(value) {
  return Math.round(finitePlaybackNumber(value) * 1_000_000) / 1_000_000;
}

function isfPlaybackClock(input = {}, previous = null, options = {}) {
  const time = Math.max(0, roundedClockSeconds(finitePlaybackNumber(
    input.time,
    input.playheadSeconds,
    input.audio?.playheadSeconds,
    input.audio?.timestampSeconds,
    input.audio?.currentTime,
    input.mediaElement?.currentTime,
  )));
  const requestedFrameRate = finitePlaybackNumber(
    input.clockFrameRate,
    input.frameRate,
    input.fps,
    options.clockFrameRate,
    options.frameRate,
    DEFAULT_ISF_CLOCK_FPS,
  );
  const frameRate = Math.max(1, Math.min(240, requestedFrameRate || DEFAULT_ISF_CLOCK_FPS));
  const rawDelta = previous ? roundedClockSeconds(time - previous.time) : 0;
  const seekThreshold = Math.max(ISF_CLOCK_SEEK_THRESHOLD_SECONDS, 8 / frameRate);
  const rephased = !previous
    || input.clockReset === true
    || input.seeking === true
    || previous.frameRate !== frameRate
    || rawDelta < 0
    || rawDelta > seekThreshold;
  const timeDelta = rephased ? 0 : Math.max(0, rawDelta);
  const frameIndex = Math.max(0, Math.floor(time * frameRate + Number.EPSILON * 8));
  const secondsInDay = ((time % 86_400) + 86_400) % 86_400;
  return {
    time,
    timeDelta,
    frameIndex,
    frameRate,
    date: [1970, 1, 1, roundedClockSeconds(secondsInDay)],
    rephased,
    reusedFrame: false,
  };
}

function pushRendererPlaybackClock(renderer, clock) {
  renderer?.setValue?.("TIME", clock.time);
  renderer?.setValue?.("TIMEDELTA", clock.timeDelta);
  renderer?.setValue?.("FRAMEINDEX", clock.frameIndex);
  renderer?.setValue?.("DATE", clock.date);
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
  let historySurface = null;
  let historyResolver = null;
  let historyIdentity = "";
  let historyFlight = null;
  let historyAbort = null;
  let historyResult = null;
  let historyResultKey = "";
  let historyFailureKey = "";
  let historyRequestFrame = null;
  let presentationCanvas = null;
  // Three frames of look-ahead, plus current/previous presentation. These
  // canvases never contain future pixels on the caller's displayed surface.
  const playbackFrames = new Map();
  let playbackRequestFrame = null;
  let playbackWasPlaying = false;
  const copyHistoryCanvas = () => {
    const copy = defaultCanvas(canvas.width, canvas.height, dependencies);
    copy.getContext("2d").drawImage(canvas, 0, 0);
    return copy;
  };
  let frameImages = [];
  let bindsDuringDraw = false;
  let activeClock = isfPlaybackClock({}, null, options);
  let lastRenderedClock = null;
  let lastRenderedSongTime = null;
  let lastRenderedIntentHash = null;
  let lastRenderedWidth = 0;
  let lastRenderedHeight = 0;
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
    clock: null,
    width: canvas.width,
    height: canvas.height,
  };

  const snapshot = () => ({
    ...state,
    contextCount: gl ? 1 : 0,
    programCount: renderer && currentShaderId ? 1 : 0,
    persistentHistory: historySurface?.checkpoints?.diagnostics?.() || null,
    preparingHistory: Boolean(historyFlight),
    historyLookahead: { frames: playbackFrames.size, maxFrames: 5,
      bytes: [...playbackFrames.values()].reduce((sum, frame) => sum + frame.canvas.width * frame.canvas.height * 4, 0) },
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
      if (typeof renderer.setDateUniforms === "function") {
        bindsDuringDraw = true;
        renderer.setDateUniforms = () => {
          pushRendererPlaybackClock(renderer, activeClock);
          if (renderer.model?.passes) bindHyperFramesIsfFrameInputs({ canvas, renderer, imageInputs: frameImages });
          else for (const [name, image] of frameImages) renderer.setValue?.(name, image);
        };
      }
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
      if (shader.directorEligible === false || shader.enabled === false) {
        return publish("unsupported-quarantine", {
          sourceId: shaderId,
          shaderId,
          sourceHash: normalizedHash(shader.sourceHash || shader.sourceSha256),
          error: String(shader.quarantineReason || shader.failureReason || `Shader ${shaderId} is quarantined and cannot run in browser playback`),
        });
      }
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
      historyAbort?.abort();
      if (historyFlight) await historyFlight.catch(() => {});
      if (disposed || sequence !== prepareSequence) return snapshot();
      historyResolver?.dispose?.(); historyResolver = null;
      historySurface?.checkpoints?.clear(); historySurface = null;
      historyIdentity = ""; historyResult = null; historyResultKey = ""; historyFailureKey = "";
      try {
        renderer.loadSource(verified.source);
      } catch (error) {
        return publish("compile-error", { sourceId: shaderId, shaderId, sourceHash: verified.observedHash, error: errorText(error) });
      }
      if (renderer.valid === false) {
        return publish("compile-error", { sourceId: shaderId, shaderId, sourceHash: verified.observedHash, error: errorText(rendererError(renderer, "Shader compile failed")) });
      }
      // Some verified catalog sources spell this lowercase. Their named target
      // still carries history even though the vendor's parsed flag is false.
      let sourcePasses = [];
      try { sourcePasses = JSON.parse(verified.source.match(/\/\*\s*(\{[\s\S]*?\})\s*\*\//)?.[1] || "{}").PASSES || []; } catch { /* vendor compilation remains authoritative */ }
      if (renderer.model?.passes?.some(pass => pass.persistent) || sourcePasses.some(pass => pass.PERSISTENT === true || pass.persistent === true)) {
        historySurface = { canvas, renderer, lastTime: null, lastFrameIndex: null };
        historySurface.checkpoints = createHyperFramesIsfCheckpointStore(historySurface, options.checkpointOptions);
      }
      currentShader = shader;
      currentShaderId = shaderId;
      lastRenderedClock = null;
      lastRenderedWidth = 0;
      lastRenderedHeight = 0;
      return publish("ready", { sourceId: shaderId, shaderId, sourceHash: verified.observedHash, error: "" });
    } catch (error) {
      const status = ["missing-id", "hash-error", "compile-error", "draw-error", "input-error", "unsupported-quarantine"].includes(error?.code)
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
    const clock = isfPlaybackClock(input, lastRenderedClock, options);
    const songTime = Number(input.time ?? clock.time);
    const visualTime = Number.isFinite(input.visualTime) ? input.visualTime : clock.time;
    let intent = null;
    try {
      intent = buildEchoIsfFrameIntent({
        shader: currentShader,
        card: input.card || {},
        timestampSeconds: songTime,
        sourceHash: state.sourceHash,
        values: input.values || {},
        signalFrames: input.signalFrames || {},
        preparedModulation: input.preparedModulation || null,
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
          clock,
        });
      }
      const reusePausedFrame = input.forceRedraw !== true
        && lastRenderedClock
        && intent.frameReceipt.receiptHash === lastRenderedIntentHash
        && songTime === lastRenderedSongTime
        && clock.frameRate === lastRenderedClock.frameRate
        && width === lastRenderedWidth
        && height === lastRenderedHeight;
      if (reusePausedFrame) {
        return publish("ready", {
          sourceId: shaderId,
          shaderId,
          error: "",
          composition: intent.composition,
          frameReceipt: intent.frameReceipt,
          clock: { ...clock, reusedFrame: true },
        });
      }
      for (const [name, value] of Object.entries(intent.values)) renderer.setValue?.(name, value);
      frameImages = Object.entries(intent.imageInputs);
      if (!bindsDuringDraw) for (const [name, image] of frameImages) renderer.setValue?.(name, image);
      if (historySurface && (input.historyMode === "prepared" || input.preparingHistoryFrame === true)) {
        const historyClock = prepareHyperFramesIsfFrame(historySurface, visualTime, clock.frameRate, true, songTime);
        clock.time = historyClock.time;
        clock.timeDelta = historyClock.delta;
        clock.frameIndex = historyClock.index;
        clock.songFrameIndex = Math.floor(songTime * clock.frameRate + 1e-8);
        clock.date = [1970, 1, 1, ((visualTime % 86400) + 86400) % 86400];
      } else if (Number.isFinite(input.visualTime)) {
        clock.time = visualTime;
        clock.frameIndex = Math.max(0, Math.floor(visualTime * clock.frameRate + 1e-8));
        clock.date = [1970, 1, 1, ((visualTime % 86400) + 86400) % 86400];
        clock.timeDelta = lastRenderedClock ? visualTime - lastRenderedClock.time : 0;
      }
      activeClock = clock;
      pushRendererPlaybackClock(renderer, activeClock);
      renderer.draw(canvas);
      if (historySurface && (input.historyMode === "prepared" || input.preparingHistoryFrame === true)) {
        historySurface.lastTime = visualTime;
        historySurface.lastFrameIndex = Math.floor(songTime * clock.frameRate + 1e-8);
        historySurface.checkpoints.record(historySurface.lastFrameIndex);
      }
      lastRenderedClock = clock;
      lastRenderedSongTime = songTime;
      lastRenderedIntentHash = intent.frameReceipt.receiptHash;
      lastRenderedWidth = width;
      lastRenderedHeight = height;
      return publish("ready", {
        sourceId: shaderId,
        shaderId,
        error: "",
        composition: intent.composition,
        frameReceipt: intent.frameReceipt,
        clock,
      });
    } catch (error) {
      return publish("draw-error", {
        sourceId: shaderId,
        shaderId,
        error: errorText(error),
        composition: intent?.composition || null,
        frameReceipt: intent?.frameReceipt || null,
        clock,
      });
    }
  };

  // One reconstruction per surface. Historical draws never leak into the
  // presented canvas, and the audible transport is owned by the caller.
  const prepareFrame = async (input = {}) => {
    if (!historySurface) return draw(input);
    if (historyFlight) throw new Error("ISF preview history already preparing");
    const clock = isfPlaybackClock(input, null, options);
    const targetFrame = Math.floor(Number(input.time ?? clock.time) * clock.frameRate + 1e-8);
    const identity = `${input.historyKey || input.cacheKey || ""}:${input.width || canvas.width}x${input.height || canvas.height}:${clock.frameRate}`;
    if (identity !== historyIdentity) {
      historyResolver?.dispose?.(); historyResolver = null;
      canvas.width = Math.max(1, Math.round(Number(input.width) || canvas.width));
      canvas.height = Math.max(1, Math.round(Number(input.height) || canvas.height));
      historySurface.checkpoints.clear(); historySurface.checkpoints.reset();
      lastRenderedClock = null; lastRenderedIntentHash = null;
      historyIdentity = identity; historyResult = null; historyResultKey = ""; playbackFrames.clear();
    }
    if (!historyResolver) historyResolver = input.createHistoryResolver?.();
    if (!historyResolver?.at) throw new Error("Persistent shader needs prepared or recorded historical inputs");
    const controller = new AbortController(); historyAbort = controller; historyRequestFrame = targetFrame;
    const cancel = () => controller.abort();
    input.signal?.addEventListener("abort", cancel, { once: true });
    if (input.signal?.aborted) controller.abort();
    let frameInput;
    const historyStarted = performance.now();
    let mediaPrepareMs = 0, shaderDrawMs = 0;
    const prepare = async frame => {
      const started = performance.now();
      const historical = await historyResolver.at(frame / clock.frameRate, { signal: controller.signal, requiresMedia: currentShader?.inputs?.some(row => String(row.TYPE || row.type).toLowerCase() === "image") });
      mediaPrepareMs += performance.now() - started;
      if (disposed || controller.signal.aborted) throw new Error("ISF preview history cancelled");
      frameInput = { ...input, ...historical, time: frame / clock.frameRate, frameRate: clock.frameRate, forceRedraw: true, preparingHistoryFrame: true };
    };
    const paint = () => {
      const started = performance.now();
      const result = draw(frameInput);
      shaderDrawMs += performance.now() - started;
      if (result.status !== "ready") throw new Error(result.error || result.status);
      const frame = result.clock?.songFrameIndex;
      if (input.playing && frame >= playbackRequestFrame) {
        playbackFrames.set(frame, { ...result, canvas: copyHistoryCanvas(),
          mediaFrameReceipt: frameInput.mediaFrameReceipt || null,
          historyProgress: { totalMs: performance.now() - historyStarted, mediaPrepareMs, shaderDrawMs },
          preparingHistory: false });
        while (playbackFrames.size > 5) playbackFrames.delete(playbackFrames.keys().next().value);
      }
      return result;
    };
    const flight = (async () => {
      const progress = await prepareHyperFramesIsfSeek(historySurface, targetFrame, {
        startFrame: Math.max(0, Math.ceil(Number(input.card?.startSeconds || 0) * clock.frameRate - 1e-8)),
        prepareFrame: prepare, drawFrame: paint, signal: controller.signal,
        onProgress: progress => publish("preparing-history", { error: "", historyProgress: progress }),
      });
      await prepare(targetFrame);
      const result = paint();
      if (!input.playing) {
        presentationCanvas ||= defaultCanvas(canvas.width, canvas.height, dependencies);
        if (presentationCanvas.width !== canvas.width) presentationCanvas.width = canvas.width;
        if (presentationCanvas.height !== canvas.height) presentationCanvas.height = canvas.height;
        const ctx = presentationCanvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(canvas, 0, 0);
      }
      historyResult = { ...result, preparingHistory: false, mediaFrameReceipt: frameInput.mediaFrameReceipt || null,
        historyProgress: { ...progress, totalMs: performance.now() - historyStarted, mediaPrepareMs, shaderDrawMs },
        canvas: input.playing ? playbackFrames.get(targetFrame)?.canvas : presentationCanvas };
      historyResultKey = `${identity}:${targetFrame}`;
      historyFailureKey = "";
      return historyResult;
    })();
    historyFlight = flight;
    try { return await flight; }
    finally { input.signal?.removeEventListener("abort", cancel); if (historyFlight === flight) historyFlight = null; if (historyAbort === controller) historyAbort = null; }
  };

  const present = (input = {}) => {
    if (!historySurface) return draw(input);
    if (input.historyMode !== "prepared") return { ...draw(input), historyFidelity: "live-unrecorded" };
    const clock = isfPlaybackClock(input, null, options);
    const identity = `${input.historyKey || input.cacheKey || ""}:${input.width || canvas.width}x${input.height || canvas.height}:${clock.frameRate}`;
    const requestedFrame = Math.floor(Number(input.time ?? clock.time) * clock.frameRate + 1e-8);
    const key = `${identity}:${requestedFrame}`;
    if (input.playing) {
      const discontinuity = identity !== historyIdentity || (playbackRequestFrame != null
        && (requestedFrame < playbackRequestFrame || requestedFrame - playbackRequestFrame > clock.frameRate / 2));
      if (!playbackWasPlaying || discontinuity) playbackFrames.clear();
      if (discontinuity) historyAbort?.abort();
      playbackWasPlaying = true; playbackRequestFrame = requestedFrame;
      // Keep one older frame as a truthful held frame if preparation falls behind.
      const due = [...playbackFrames.keys()].filter(frame => frame <= requestedFrame);
      const latestDue = due.length ? Math.max(...due) : null;
      for (const frame of due) if (frame !== latestDue) playbackFrames.delete(frame);
      const endFrame = Math.ceil(Number(input.card?.endSeconds ?? Infinity) * clock.frameRate - 1e-8) - 1;
      const hasDueFrame = latestDue != null || (!discontinuity && historyIdentity === identity && historyResult?.clock?.songFrameIndex <= requestedFrame);
      const aheadFrame = hasDueFrame ? Math.min(requestedFrame + 3, endFrame) : requestedFrame;
      if (!historyFlight && historyFailureKey !== key && (!hasDueFrame || identity !== historyIdentity || historySurface.lastFrameIndex < aheadFrame)) {
        prepareFrame({ ...input, time: aheadFrame / clock.frameRate }).catch(error => {
          if (disposed || /cancelled/.test(errorText(error))) return;
          historyFailureKey = key; publish("history-error", { error: errorText(error) });
        });
      }
      const available = playbackFrames.get(latestDue) || (historyResult?.clock?.songFrameIndex <= requestedFrame && historyIdentity === identity ? historyResult : null);
      if (available?.canvas && !discontinuity) return { ...available, historyPending: available.clock.songFrameIndex < requestedFrame, heldPrevious: available.clock.songFrameIndex < requestedFrame };
      return { ...snapshot(), status: "preparing-history", ok: false, error: "Preparing shader history", canvas: null };
    }
    if (playbackWasPlaying) { historyAbort?.abort(); playbackFrames.clear(); }
    playbackWasPlaying = false; playbackRequestFrame = null;
    if (historyResultKey === key && historyResult) return historyResult;
    if (historyFlight && (identity !== historyIdentity || Math.floor(Number(input.time ?? clock.time) * clock.frameRate + 1e-8) < historyRequestFrame)) historyAbort?.abort();
    if (historyFailureKey === key) return snapshot();
    if (!historyFlight) prepareFrame(input).catch(error => {
      if (disposed || /cancelled/.test(errorText(error))) return;
      historyFailureKey = key;
      publish("history-error", { error: errorText(error) });
    });
    if (historyResult && historyIdentity === identity) return { ...historyResult, historyPending: true, heldPrevious: true, heldPreviousFrame: true };
    return { ...snapshot(), status: "preparing-history", ok: false, error: "Preparing shader history", canvas: presentationCanvas };
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    prepareSequence += 1;
    historyAbort?.abort(); historyResolver?.dispose?.();
    historySurface?.checkpoints?.clear();
    historyResolver = null; historyResult = null; presentationCanvas = null; playbackFrames.clear();
    try { renderer?.cleanup?.(); } catch { /* cleanup is best effort */ }
    try { gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.(); } catch { /* context loss is best effort */ }
    renderer = null;
    gl = null;
    currentShader = null;
    currentShaderId = "";
    lastRenderedClock = null;
    publish("disposed", { sourceId: "", shaderId: "", sourceHash: "", error: "", clock: null });
  };

  return { canvas, prepare, draw, prepareFrame, present, getState: snapshot, dispose };
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

const poolCardKeys = new WeakMap();
function poolCardContentKey(card = {}) {
  if (poolCardKeys.has(card)) return poolCardKeys.get(card);
  const key = `${exactSourceId(card)}\u0000${poolCardSourceHash(card)}\u0000${card.id || ""}:${card.startSeconds ?? ""}:${card.endSeconds ?? ""}:${JSON.stringify([card.parameters || null, card.visualization || null])}`;
  poolCardKeys.set(card, key);
  return key;
}

export function createEchoIsfPlaybackPool(options = {}) {
  const maxSurfaces = Math.max(2, Math.min(6, Math.floor(Number(options.maxSurfaces) || 3)));
  const requestedFailureCacheLimit = Number(options.failureCacheMaxEntries);
  const failureCacheLimit = Number.isFinite(requestedFailureCacheLimit) && requestedFailureCacheLimit > 0
    ? Math.max(1, Math.min(512, Math.floor(requestedFailureCacheLimit)))
    : DEFAULT_FAILURE_CACHE_LIMIT;
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
  const dependencies = resolveDependencies(options);
  const slots = [];
  const warmingByKey = new Map();
  const failedByKey = new Map();
  let presentedSlot = null;
  const presentedByLayer = new Map();
  let useSequence = 0;
  let slotSequence = 0;
  let disposed = false;
  let requestedShaderId = "";
  let requestedKey = "";
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

  const cachedFailure = (key) => {
    const failure = failedByKey.get(key) || null;
    if (!failure) return null;
    failedByKey.delete(key);
    failedByKey.set(key, failure);
    return failure;
  };

  const rememberFailure = (key, failure = {}) => {
    const entry = {
      key,
      shaderId: String(failure.shaderId || ""),
      status: String(failure.status || "compile-error"),
      error: String(failure.error || ""),
      sourceHash: String(failure.sourceHash || ""),
    };
    failedByKey.delete(key);
    failedByKey.set(key, entry);
    while (failedByKey.size > failureCacheLimit) failedByKey.delete(failedByKey.keys().next().value);
    return entry;
  };

  const forgetFailure = (key) => failedByKey.delete(key);

  const attachSurface = (slot) => {
    slot.surface = createEchoIsfSurface({
      apiBase: options.apiBase,
      width: options.width,
      height: options.height,
      dependencies,
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
    for (const [layer, held] of presentedByLayer) if (held === slot) presentedByLayer.delete(layer);
    slot.generation += 1;
    try { slot.surface?.dispose?.(); } catch { /* disposal is best effort */ }
    slot.surface = null;
  };

  const evictableSlot = () => slots
    .filter((slot) => slot !== presentedSlot && slot.key !== requestedKey && slot.status !== "loading")
    .sort((left, right) => left.lastUsed - right.lastUsed || left.id.localeCompare(right.id))[0] || null;

  const allocateSlot = () => {
    if (slots.length < maxSurfaces) return newSlot();
    const slot = evictableSlot();
    if (!slot) return null;
    evictions += 1;
    for (const [layer, held] of presentedByLayer) if (held === slot) presentedByLayer.delete(layer);
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
    let existing = slots.find((slot) => slot.key === key && !slot.invalidated);
    if (existing && existing.status === "input-error" && !existing.ready) {
      // A portable-card binding error belongs to that cue, not to the shader
      // program. Recreate the surface so a later valid card with the same
      // source ID/hash can prepare normally.
      removeSlot(existing);
      existing = null;
    }
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
    const failure = cachedFailure(key);
    if (failure) {
      return Promise.resolve({ ...failure, shaderId, slot: null, cachedFailure: true });
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
        if (slot.ready) forgetFailure(key);
        else if (TERMINAL_PREPARE_FAILURES.has(slot.status)) {
          rememberFailure(key, { ...result, shaderId, status: slot.status, error: slot.error });
        }
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
        rememberFailure(key, { shaderId, status: slot.status, error: slot.error });
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

  const holdResult = (status, shaderId, error = "", layerKey = "default") => {
    const heldSlot = presentedByLayer.get(layerKey);
    const heldPrevious = Boolean(heldSlot?.lastResult?.canvas);
    if (heldPrevious) heldFrames += 1;
    else if (hasPresentedFrame && (!blackIntervals.length || blackIntervals.at(-1)?.endSequence != null)) {
      blackIntervals.push({ startSequence: useSequence, endSequence: null, shaderId });
    }
    emit(heldPrevious ? status : `${status}-without-frame`, { requestedShaderId: shaderId, presentedShaderId: heldSlot?.shaderId || "", error });
    return {
      status,
      handoff: status,
      shaderId,
      presentationLayerKey: layerKey,
      requestedShaderId: shaderId,
      presentedShaderId: heldSlot?.shaderId || "",
      canvas: heldSlot?.lastResult?.canvas || null,
      heldPrevious,
      heldPreviousFrame: heldPrevious,
      switched: false,
      error,
      composition: heldSlot?.lastResult?.composition || null,
      frameReceipt: heldSlot?.lastResult?.frameReceipt || null,
    };
  };

  const present = (cardOrInput, frameInput = null) => {
    const combinedInput = frameInput == null && cardOrInput?.card
      ? cardOrInput
      : { ...(frameInput || {}), card: cardOrInput };
    const card = combinedInput.card;
    const layerKey = String(combinedInput.presentationLayerKey || card?.trackId || card?.persistentSlotId || "default");
    const shaderId = exactSourceId(card);
    requestedShaderId = shaderId;
    requestedKey = shaderId ? poolCardContentKey(card) : "";
    if (disposed) return holdResult("disposed", shaderId, "ISF playback pool is disposed", layerKey);
    if (!shaderId) return holdResult("missing-id", "", "Presentation requires an exact shader ID", layerKey);
    const key = requestedKey;
    const candidate = slots.find((slot) => slot.key === key && !slot.invalidated);
    const slot = candidate?.ready ? candidate : null;
    if (!slot) {
      const failure = candidate ? null : cachedFailure(key);
      if (!candidate && !failure) prepareCard(card, String(combinedInput.cacheKey || "")).catch(() => {});
      const pendingStatus = failure?.status || (candidate && candidate.status !== "loading" && candidate.status !== "idle"
        ? candidate.status
        : "handoff-pending");
      const pendingError = failure?.error || candidate?.error || "Candidate shader is still prewarming";
      return holdResult(pendingStatus, shaderId, pendingError, layerKey);
    }
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const result = slot.surface.present({ ...combinedInput, card });
    const elapsed = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - startedAt);
    frameSamples.push(elapsed);
    if (frameSamples.length > 240) frameSamples.splice(0, frameSamples.length - 240);
    if (combinedInput.playing && !slot.wasPlaying) slot.historyLagSamples = [];
    slot.wasPlaying = combinedInput.playing === true;
    if (slot.wasPlaying && result?.historyProgress && Number.isFinite(result.clock?.songFrameIndex)) {
      slot.historyLagSamples ||= [];
      slot.historyLagSamples.push(Math.max(0, Number(combinedInput.time) - result.clock.songFrameIndex / Number(combinedInput.frameRate || 30)) * 1000);
      if (slot.historyLagSamples.length > 900) slot.historyLagSamples.shift();
    }
    slot.textureCount = result?.frameReceipt?.media?.bindings?.filter((binding) => binding.ready).length || 0;
    if (result?.status !== "ready") {
      slot.status = String(result?.status || "draw-error");
      slot.error = String(result?.error || "");
      return holdResult(slot.status, shaderId, slot.error, layerKey);
    }
    const previous = presentedSlot;
    if (previous && previous !== slot) previous.presented = false;
    presentedSlot = slot;
    presentedByLayer.set(layerKey, slot);
    hasPresentedFrame = true;
    slot.presented = true;
    slot.status = "ready";
    slot.error = "";
    forgetFailure(key);
    slot.lastResult = { ...result, canvas: result.canvas || slot.surface.canvas };
    rememberCard(slot, card, String(combinedInput.cacheKey || ""));
    touch(slot);
    if (previous !== slot) handoffs += 1;
    for (const interval of blackIntervals) if (interval.endSequence == null) interval.endSequence = useSequence;
    if (previous?.invalidated && previous !== slot) removeSlot(previous);
    emit(previous === slot ? "presented" : "committed", { requestedShaderId: shaderId, presentedShaderId: shaderId });
    return {
      ...result,
      status: "ready",
      handoff: result.historyPending ? "preparing-history" : previous === slot ? "presented" : "committed",
      shaderId,
      requestedShaderId: shaderId,
      presentedShaderId: shaderId,
      presentationLayerKey: layerKey,
      canvas: result.canvas || slot.surface.canvas,
      heldPrevious: result.heldPrevious === true,
      heldPreviousFrame: result.heldPreviousFrame === true,
      switched: previous !== slot,
    };
  };

  const presentLayers = (cards = [], frameInput = {}) => {
    const ordered = Array.isArray(cards) ? cards.filter(Boolean) : [];
    const layers = ordered.map((card) => ({
      card,
      result: present(card, { ...frameInput, card, presentationLayerKey: card.trackId || card.persistentSlotId || card.id }),
    }));
    const ready = layers.filter((layer) => layer.result?.status === "ready");
    return {
      status: ready.length === layers.length ? "ready" : ready.length ? "partial" : layers.length ? "loading" : "empty",
      requested: layers.length,
      ready: ready.length,
      layers,
      diagnostics: getDiagnostics(),
    };
  };

  const invalidate = (input = {}) => {
    const shaderIds = new Set((input.shaderIds || []).map(String));
    const cacheKey = String(input.cacheKey || "");
    const ranges = [...(input.ranges || []), ...(input.dirtyRanges || [])].map(normalizedDirtyRange).filter(Boolean);
    const hasShaderFilter = shaderIds.size > 0;
    const hasRangeFilter = ranges.length > 0;
    const hasCacheFilter = Boolean(cacheKey);
    if (hasShaderFilter || hasRangeFilter || hasCacheFilter) failedByKey.clear();
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
      failureCacheLimit,
      surfaceCount: slots.length,
      poolSize: slots.length,
      contextCount,
      contexts: contextCount,
      programCount,
      programs: programCount,
      historyCheckpointBytes: resourceStates.reduce((sum, state) => sum + Number(state.persistentHistory?.bytes || 0), 0),
      historyJobsPreparing: resourceStates.filter(state => state.preparingHistory).length,
      historyLookaheadBytes: resourceStates.reduce((sum, state) => sum + Number(state.historyLookahead?.bytes || 0), 0),
      historyLookaheadFrames: resourceStates.reduce((sum, state) => sum + Number(state.historyLookahead?.frames || 0), 0),
      historyPresentationTiming: slots.filter(slot => slot.historyLagSamples?.length).map(slot => {
        const samples = slot.historyLagSamples, sorted = [...samples].sort((a, b) => a - b);
        return { shaderId: slot.shaderId, samples: samples.length, lastMs: samples.at(-1),
          p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1),
          overOneFrame: samples.filter(ms => ms > 1000 / Number(slot.lastResult?.clock?.frameRate || 30) + .001).length,
          scope: "audio-playhead-to-prepared-shader-frame; excludes physical output latency" };
      }),
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
      failureCache: {
        size: failedByKey.size,
        limit: failureCacheLimit,
        entries: [...failedByKey.values()].map((failure) => ({ ...failure })),
      },
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
        history: slot.surface?.getState?.().persistentHistory || null,
      })),
      disposed,
    };
  }

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    warmingByKey.clear();
    failedByKey.clear();
    for (const slot of [...slots]) removeSlot(slot);
    presentedSlot = null;
    emit("disposed");
  };

  return { prewarm, present, presentLayers, invalidate, getDiagnostics, getState: getDiagnostics, dispose };
}
