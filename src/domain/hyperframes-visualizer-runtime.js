export const HYPERFRAMES_VISUALIZER_RUNTIME_SCHEMA = "hapa.hyperframes.visualizer-runtime.v1";
export const HYPERFRAMES_VISUALIZER_DIAGNOSTIC_SCHEMA = "hapa.hyperframes.visualizer-diagnostic.v1";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, finite(value, min)));
const round = (value, digits = 9) => {
  const scale = 10 ** digits;
  return Math.round(finite(value) * scale) / scale;
};
const text = (value) => String(value ?? "").trim();
const modulo = (value, divisor) => divisor > 0 ? ((value % divisor) + divisor) % divisor : 0;
const canonicalHash = (value) => text(value).toLowerCase().replace(/^sha256:/, "");
const isSha256 = (value) => /^[a-f0-9]{64}$/.test(canonicalHash(value));

function inputName(input = {}) {
  return text(input.NAME || input.name);
}

function inputType(input = {}) {
  return text(input.TYPE || input.type).toLowerCase();
}

function inputField(input, upper, lower) {
  return input?.[upper] ?? input?.[lower];
}

function normalizeEchoIsfInputValue(input = {}, value) {
  const type = inputType(input);
  if (type === "bool" || type === "event") {
    if (typeof value === "string") return !["", "0", "false", "off", "no"].includes(value.trim().toLowerCase());
    return Boolean(value);
  }
  if (type === "long") {
    const minimum = finite(inputField(input, "MIN", "min"), -Number.MAX_SAFE_INTEGER);
    const maximum = finite(inputField(input, "MAX", "max"), Number.MAX_SAFE_INTEGER);
    const rounded = Math.round(clamp(value, minimum, maximum));
    const values = inputField(input, "VALUES", "values");
    if (!Array.isArray(values) || !values.length) return rounded;
    return values.map(Number).filter(Number.isFinite).reduce((closest, candidate) => (
      Math.abs(candidate - rounded) < Math.abs(closest - rounded) ? candidate : closest
    ), Number(values[0]));
  }
  if (type === "color" || type === "point2d") {
    const length = type === "color" ? 4 : 2;
    const fallback = type === "color" ? [0, 0, 0, 1] : [0, 0];
    const source = Array.isArray(value) ? value : fallback;
    const minimum = inputField(input, "MIN", "min");
    const maximum = inputField(input, "MAX", "max");
    return Array.from({ length }, (_, index) => round(clamp(
      source[index] ?? fallback[index],
      finite(Array.isArray(minimum) ? minimum[index] : minimum, type === "color" ? 0 : -Number.MAX_SAFE_INTEGER),
      finite(Array.isArray(maximum) ? maximum[index] : maximum, type === "color" ? 1 : Number.MAX_SAFE_INTEGER),
    ), 6));
  }
  return round(clamp(
    value,
    finite(inputField(input, "MIN", "min"), -Number.MAX_SAFE_INTEGER),
    finite(inputField(input, "MAX", "max"), Number.MAX_SAFE_INTEGER),
  ), 6);
}

function echoIsfManifestDefaults(shader = {}) {
  const values = {};
  for (const input of shader.inputs || []) {
    const name = inputName(input);
    const type = inputType(input);
    if (!name || type === "image" || !["float", "long", "bool", "event", "color", "point2d"].includes(type)) continue;
    const declared = inputField(input, "DEFAULT", "default");
    const fallback = type === "bool" || type === "event"
      ? false
      : type === "color"
        ? [0, 0, 0, 1]
        : type === "point2d"
          ? [0, 0]
          : type === "long"
            ? (inputField(input, "VALUES", "values")?.[0] ?? 0)
            : 0;
    values[name] = normalizeEchoIsfInputValue(input, declared ?? fallback);
  }
  return values;
}

function stableLayerRows(show = {}) {
  return (show.instances?.visualizers || [])
    .map((instance, sourceIndex) => ({ instance, sourceIndex }))
    .sort((left, right) => {
      const a = left.instance;
      const b = right.instance;
      const aExplicit = Number(a.layerOrder ?? a.layerIndex ?? a.zIndex);
      const bExplicit = Number(b.layerOrder ?? b.layerIndex ?? b.zIndex);
      const aHasExplicit = Number.isFinite(aExplicit);
      const bHasExplicit = Number.isFinite(bExplicit);
      if (aHasExplicit && bHasExplicit && aExplicit !== bExplicit) return aExplicit - bExplicit;
      if (aHasExplicit !== bHasExplicit) return aHasExplicit ? -1 : 1;
      return left.sourceIndex - right.sourceIndex;
    });
}

function cueWindow(instance = {}) {
  const start = finite(instance.start ?? instance.startSeconds);
  const end = finite(instance.end ?? instance.endSeconds, start);
  return { start, end, duration: Math.max(0, end - start) };
}

function activeHalfOpen(window, timeSeconds) {
  return window.end > window.start && timeSeconds >= window.start && timeSeconds < window.end;
}

function normalizedKeyframes(event = {}, property, fallback) {
  const frames = (event.keyframes || [])
    .flatMap((frame, index) => {
      const value = Number(frame?.[property]);
      if (!Number.isFinite(value)) return [];
      return [{ offset: clamp(frame.offset, 0, 1), value, index }];
    })
    .sort((a, b) => a.offset - b.offset || a.index - b.index);
  if (!frames.length) return [{ offset: 0, value: fallback }, { offset: 1, value: fallback }];
  if (frames[0].offset > 0) frames.unshift({ offset: 0, value: frames[0].value, index: -1 });
  if (frames.at(-1).offset < 1) frames.push({ offset: 1, value: frames.at(-1).value, index: Number.MAX_SAFE_INTEGER });
  return frames;
}

function interpolatedKeyframe(frames, progress) {
  const p = clamp(progress);
  const rightIndex = frames.findIndex((frame) => frame.offset >= p);
  if (rightIndex <= 0) return frames[0].value;
  if (rightIndex < 0) return frames.at(-1).value;
  const left = frames[rightIndex - 1];
  const right = frames[rightIndex];
  if (right.offset <= left.offset) return right.value;
  const amount = (p - left.offset) / (right.offset - left.offset);
  return left.value + (right.value - left.value) * amount;
}

function integratedKeyframes(frames, progress) {
  const p = clamp(progress);
  let area = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const left = frames[index - 1];
    const right = frames[index];
    if (p <= left.offset) break;
    const segmentEnd = Math.min(p, right.offset);
    const span = segmentEnd - left.offset;
    if (span <= 0) continue;
    const fullSpan = Math.max(Number.EPSILON, right.offset - left.offset);
    const endValue = left.value + (right.value - left.value) * (span / fullSpan);
    area += span * (left.value + endValue) * 0.5;
    if (p <= right.offset) break;
  }
  return area;
}

function eventWindow(event = {}) {
  const start = finite(event.startSeconds ?? event.atSeconds);
  const end = finite(event.endSeconds, start + Math.max(0, finite(event.durationSeconds)));
  return { start, end, duration: Math.max(0, end - start) };
}

function eventTargetsInstance(event = {}, instance = {}) {
  const target = event.target || {};
  if (target.clock && target.clock !== "visual-only") return false;
  if (target.layer && target.layer !== "visualizer-layer") return false;
  if (target.instanceId && target.instanceId !== instance.id) return false;
  if (target.visualizerId && target.visualizerId !== instance.visualizerId) return false;
  if (target.trackId && target.trackId !== instance.trackId) return false;
  return true;
}

function visualTimeFor(show, instance, timeSeconds, window) {
  const baseGlobal = timeSeconds;
  let sampleGlobal = baseGlobal;
  const effects = [];
  const events = (show.automation?.visualTimeTrack?.events || [])
    .filter((event) => eventTargetsInstance(event, instance))
    .map((event, sourceIndex) => ({ event, sourceIndex, window: eventWindow(event) }))
    .filter((row) => activeHalfOpen(row.window, timeSeconds))
    .sort((a, b) => a.window.start - b.window.start || text(a.event.id).localeCompare(text(b.event.id)) || a.sourceIndex - b.sourceIndex);

  for (const row of events) {
    const { event } = row;
    const elapsed = timeSeconds - row.window.start;
    const progress = row.window.duration > 0 ? elapsed / row.window.duration : 0;
    const kind = text(event.kind).toLowerCase();
    let deltaSeconds = 0;
    let visualRate = null;
    let sampleOffsetSeconds = null;
    if (["playback-rate", "rate", "hold"].includes(kind)) {
      const fallbackRate = kind === "hold" ? 0 : finite(event.visualRate ?? event.rate ?? event.playbackRate, 1);
      const frames = normalizedKeyframes(event, "visualRate", fallbackRate);
      visualRate = interpolatedKeyframe(frames, progress);
      const mappedElapsed = row.window.duration * integratedKeyframes(frames, progress);
      deltaSeconds = mappedElapsed - elapsed;
    } else {
      const hasOffsets = (event.keyframes || []).some((frame) => Number.isFinite(Number(frame?.sampleOffsetSeconds)));
      if (hasOffsets) {
        const frames = normalizedKeyframes(event, "sampleOffsetSeconds", 0);
        sampleOffsetSeconds = interpolatedKeyframe(frames, progress);
        deltaSeconds = sampleOffsetSeconds;
      } else if (kind === "repeat" && finite(event.repeatSeconds ?? event.windowSeconds) > 0) {
        const repeatSeconds = finite(event.repeatSeconds ?? event.windowSeconds);
        deltaSeconds = modulo(elapsed, repeatSeconds) - elapsed;
        sampleOffsetSeconds = deltaSeconds;
      } else if (kind === "hold") {
        deltaSeconds = finite(event.holdAtSeconds, row.window.start) - timeSeconds;
        sampleOffsetSeconds = deltaSeconds;
      }
    }
    sampleGlobal += deltaSeconds;
    effects.push({
      id: text(event.id),
      kind,
      startSeconds: row.window.start,
      endSeconds: row.window.end,
      progress: round(progress),
      visualRate: visualRate == null ? null : round(visualRate),
      sampleOffsetSeconds: sampleOffsetSeconds == null ? null : round(sampleOffsetSeconds),
      deltaSeconds: round(deltaSeconds),
    });
  }

  const unclampedLocal = sampleGlobal - window.start;
  const visualTimeSeconds = clamp(unclampedLocal, 0, window.duration);
  return {
    baseTimeSeconds: round(baseGlobal - window.start),
    visualTimeSeconds: round(visualTimeSeconds),
    unclampedVisualTimeSeconds: round(unclampedLocal),
    effects,
  };
}

function frameAt(frames = [], timeSeconds = 0) {
  if (!frames.length) return null;
  let low = 0;
  let high = frames.length - 1;
  let selected = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (finite(frames[middle]?.t) <= timeSeconds) {
      selected = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return { index: selected, frame: { ...frames[selected] } };
}

function normalizedStemRole(value = "") {
  const compact = text(value)
    .toLowerCase()
    .replace(/^(?:stem|bus)[:/_-]+/, "")
    .replace(/[^a-z0-9]+/g, "");
  const aliases = {
    master: "master",
    mastermix: "master",
    mix: "master",
    leadvocal: "vocals",
    leadvocals: "vocals",
    vocal: "vocals",
    vocals: "vocals",
    backingvocal: "backing-vocals",
    backingvocals: "backing-vocals",
    drum: "drums",
    drums: "drums",
    key: "keyboard",
    keys: "keyboard",
    keyboards: "keyboard",
    synths: "synth",
    stringssection: "strings",
  };
  return aliases[compact] || compact;
}

function resolvedSignalFrame(show, instance, timeSeconds, stemFocus = null) {
  const requestedStem = normalizedStemRole(stemFocus ?? instance.stemFocus ?? "master") || "master";
  const masterResource = show.stemFrames?.master || null;
  const stemResource = (show.stemFrames?.stems || []).find((stem) => (
    normalizedStemRole(stem.role) === requestedStem || normalizedStemRole(stem.id) === requestedStem
  )) || null;
  const master = masterResource ? { id: masterResource.id || "master", role: "master", ...frameAt(masterResource.frames, timeSeconds) } : null;
  if (requestedStem === "master") {
    return { requestedStem, resolvedStem: master ? "master" : null, fallbackUsed: false, stem: master, master };
  }
  const stem = stemResource ? { id: stemResource.id, role: stemResource.role, ...frameAt(stemResource.frames, timeSeconds) } : null;
  return {
    requestedStem,
    resolvedStem: stem ? normalizedStemRole(stemResource.role || stemResource.id) : master ? "master" : null,
    fallbackUsed: !stem && Boolean(master),
    stem: stem || master,
    master,
  };
}

function signalValue(frame = {}, signal = "") {
  const name = text(signal).toLowerCase();
  const aliases = { bass: "low", treble: "high", beat: "onset" };
  const key = aliases[name] || name;
  const value = Number(frame?.[key]);
  return Number.isFinite(value) ? clamp(value) : null;
}

function mappedInputValue(input, baseValue, signal, depth, threshold = 0.5) {
  const type = inputType(input);
  if (type === "bool" || type === "event") return normalizeEchoIsfInputValue(input, signal >= threshold ? true : baseValue);
  if (Array.isArray(baseValue)) {
    const depths = Array.isArray(depth) ? depth : Array(baseValue.length).fill(finite(depth));
    return normalizeEchoIsfInputValue(input, baseValue.map((value, index) => finite(value) + signal * finite(depths[index])));
  }
  return normalizeEchoIsfInputValue(input, finite(baseValue) + signal * finite(depth));
}

function mappedControls(instance, signalResource, resolveSignalResource = null) {
  const inputs = instance.inputs || [];
  const byName = new Map(inputs.map((input) => [inputName(input), input]).filter(([name]) => name));
  const values = echoIsfManifestDefaults({ inputs });
  const unknownControls = [];
  for (const [name, value] of Object.entries(instance.controls || {})) {
    const input = byName.get(name);
    if (!input || inputType(input) === "image") {
      unknownControls.push(name);
      continue;
    }
    values[name] = normalizeEchoIsfInputValue(input, value);
  }
  const bindings = [];
  const invalidAudioMapUniforms = [];
  for (const [uniform, rawMapping] of Object.entries(instance.audioMap || {})) {
    const mapping = typeof rawMapping === "string"
      ? { signal: rawMapping.split(":").at(-1) || "off", stemFocus: rawMapping.includes(":") ? rawMapping.slice(0, rawMapping.lastIndexOf(":")) : null, depth: 0.2 }
      : rawMapping || {};
    const mappingSignals = mapping.stemFocus && typeof resolveSignalResource === "function"
      ? resolveSignalResource(mapping.stemFocus)
      : signalResource;
    const bindingStem = {
      requestedStem: mappingSignals.requestedStem,
      resolvedStem: mappingSignals.resolvedStem,
      fallbackUsed: mappingSignals.fallbackUsed,
    };
    const input = byName.get(uniform);
    if (!input) {
      invalidAudioMapUniforms.push(uniform);
      bindings.push({ uniform, signal: text(mapping?.signal || "off"), status: "uniform-not-declared", ...bindingStem, value: null });
      continue;
    }
    const signal = text(mapping?.signal || "off").toLowerCase();
    const baseValue = values[uniform];
    if (inputType(input) === "image") {
      bindings.push({ uniform, signal, status: "image-input-handled-separately", ...bindingStem, baseValue: null, signalValue: null, value: null });
      continue;
    }
    if (signal === "off" || !signal) {
      bindings.push({ uniform, signal: "off", status: "disabled", ...bindingStem, baseValue, signalValue: null, value: baseValue });
      continue;
    }
    const resolved = signalValue(mappingSignals.stem?.frame, signal);
    if (resolved == null) {
      bindings.push({ uniform, signal, status: "missing-signal", ...bindingStem, baseValue, signalValue: null, value: baseValue });
      continue;
    }
    const value = mappedInputValue(input, baseValue, resolved, mapping?.depth ?? 0, mapping?.threshold ?? 0.5);
    values[uniform] = value;
    bindings.push({
      uniform,
      signal,
      status: "mapped",
      ...bindingStem,
      baseValue,
      signalValue: round(resolved),
      depth: mapping?.depth ?? 0,
      value,
    });
  }
  return {
    values,
    bindings,
    unknownControls: unknownControls.sort(),
    invalidAudioMapUniforms: invalidAudioMapUniforms.sort(),
  };
}

function transitionEnvelope(instance, timeSeconds, window) {
  const declaration = instance.transition;
  const kind = text(typeof declaration === "object" ? declaration.kind || declaration.type || declaration.name : declaration || "cut").toLowerCase();
  const fades = /(fade|cross|dissolve)/.test(kind);
  const durationSeconds = Math.max(0.001, finite(
    typeof declaration === "object" ? declaration.durationSeconds : instance.transitionDurationSeconds,
    0.35,
  ));
  const inProgress = clamp((timeSeconds - window.start) / durationSeconds);
  const outProgress = clamp((window.end - timeSeconds) / durationSeconds);
  const alpha = fades ? Math.min(inProgress, outProgress) : 1;
  return { kind: kind || "cut", durationSeconds: round(durationSeconds), inProgress: round(inProgress), outProgress: round(outProgress), alpha: round(alpha) };
}

function proxyContract(instance = {}) {
  const declaredNativeRoute = instance.nativeRoute || instance.execution?.nativeRoute || null;
  const executionExact = instance.execution?.route === "hash-bound-exact-proxy"
    && instance.execution?.status === "exact"
    && instance.execution?.drawable === true
    && instance.execution?.silentDefault === false;
  const nativeRoute = declaredNativeRoute || (executionExact ? {
    schemaVersion: "hapa.music-viz.native-shader-route.v1",
    requested: { id: instance.visualizerId, title: instance.rendererTruth?.requested?.title || instance.visualizerId, sourceHash: instance.sourceHash },
    route: "hash-bound-exact-proxy",
    status: "exact",
    nativeKey: null,
    proxy: instance.proxy || instance.execution?.proxy || null,
    fidelityLoss: [],
    reason: instance.execution?.reason || "hash-bound-exact-proxy-instance-ready",
    silentDefault: false,
  } : null);
  const proxy = { ...(nativeRoute?.proxy || {}), ...(instance.proxy || instance.execution?.proxy || {}) };
  const sourceHash = text(instance.sourceHash || nativeRoute?.requested?.sourceHash || proxy.sourceHash || instance.rendererTruth?.requested?.sourceHash);
  const issues = [];
  const nativeRouteExact = nativeRoute?.status === "exact" && ["hash-bound-exact-proxy", "exact-native"].includes(nativeRoute?.route);
  if (!nativeRouteExact && !executionExact) issues.push("native-route-not-exact");
  if (!isSha256(sourceHash) || !isSha256(proxy.sourceHash) || canonicalHash(sourceHash) !== canonicalHash(proxy.sourceHash)) issues.push("proxy-source-hash-mismatch");
  if (!isSha256(proxy.assetSha256)) issues.push("proxy-asset-hash-missing");
  if (!text(proxy.compiledUri || proxy.assetPath || proxy.repositoryPath || proxy.assetName)) issues.push("proxy-asset-path-missing");
  const frameCount = Math.floor(finite(proxy.frameCount));
  const fps = finite(proxy.fps);
  const frameWidth = Math.floor(finite(proxy.frameWidth ?? proxy.width));
  const frameHeight = Math.floor(finite(proxy.frameHeight ?? proxy.height));
  if (frameCount <= 0 || fps <= 0 || frameWidth <= 0 || frameHeight <= 0) issues.push("proxy-frame-contract-invalid");
  const atlasWidth = Math.floor(finite(proxy.atlasWidth, frameWidth * frameCount));
  const atlasHeight = Math.floor(finite(proxy.atlasHeight, frameHeight));
  if (atlasWidth < frameWidth * frameCount || atlasHeight < frameHeight) issues.push("proxy-atlas-bounds-invalid");
  return { ok: issues.length === 0, issues, nativeRoute, proxy: { ...proxy, frameCount, fps, frameWidth, frameHeight, atlasWidth, atlasHeight }, sourceHash };
}

function proxyFrame(contract, visualTimeSeconds, modulation = null) {
  const { proxy } = contract;
  const playableFrameIndices = Array.isArray(proxy.playableFrameIndices)
    ? proxy.playableFrameIndices.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < proxy.frameCount)
    : [];
  const playable = playableFrameIndices.length
    ? [...new Set(playableFrameIndices)]
    : Array.from({ length: proxy.frameCount }, (_, index) => index);
  const loopDuration = playable.length / proxy.fps;
  const loopTimeSeconds = modulo(visualTimeSeconds, loopDuration);
  let frameIndex;
  const frameTimes = Array.isArray(proxy.frameTimes) ? proxy.frameTimes.map(Number) : [];
  if (playable.length === proxy.frameCount && frameTimes.length === proxy.frameCount && frameTimes.every(Number.isFinite)) {
    frameIndex = 0;
    for (let index = 0; index < frameTimes.length; index += 1) if (frameTimes[index] <= loopTimeSeconds + Number.EPSILON) frameIndex = index;
  } else {
    frameIndex = playable[Math.min(playable.length - 1, Math.floor(loopTimeSeconds * proxy.fps))];
  }
  const baseFrameIndex = frameIndex;
  const audioFrameOffset = Math.round(finite(modulation?.frameOffsetFrames));
  if (audioFrameOffset !== 0 && playable.length > 1) {
    const basePlayableIndex = Math.max(0, playable.indexOf(frameIndex));
    frameIndex = playable[modulo(basePlayableIndex + audioFrameOffset, playable.length)];
  }
  const sourceRect = [frameIndex * proxy.frameWidth, 0, proxy.frameWidth, proxy.frameHeight];
  return {
    frameIndex,
    baseFrameIndex,
    audioFrameOffset,
    frameTimeSeconds: round(frameTimes[frameIndex] ?? frameIndex / proxy.fps),
    loopTimeSeconds: round(loopTimeSeconds),
    frameSelectionPolicy: text(proxy.frameSelectionPolicy || "declared-sampled-loop"),
    sourceRect,
    rect: { x: sourceRect[0], y: 0, width: proxy.frameWidth, height: proxy.frameHeight },
    assetPath: text(proxy.assetPath) || null,
    repositoryPath: text(proxy.repositoryPath) || null,
    compiledUri: text(proxy.compiledUri) || null,
    assetName: text(proxy.assetName) || null,
    assetSha256: text(proxy.assetSha256),
    sourceHash: text(proxy.sourceHash),
  };
}

function executionTruth(instance, contract) {
  const declared = instance.rendererTruth || {};
  const requested = {
    id: text(contract.nativeRoute?.requested?.id || instance.visualizerId),
    title: text(contract.nativeRoute?.requested?.title || declared.requested?.title || instance.visualizerId),
    sourceHash: contract.sourceHash,
    cueBoundary: { startSeconds: cueWindow(instance).start, endSeconds: cueWindow(instance).end },
  };
  return {
    schemaVersion: "hapa.visualizer-renderer-truth.v1",
    rendererId: "hyperframes",
    requested,
    status: "exact",
    readiness: "ready",
    route: "hash-bound-exact-proxy",
    substitute: null,
    reason: "hash-bound-proxy-instance-scheduled",
    fidelityLoss: [],
    visible: true,
    silentDefault: false,
  };
}

function controlEnergy(values = {}) {
  const numbers = Object.values(values).flatMap((value) => Array.isArray(value) ? value : [value]).map(Number).filter(Number.isFinite);
  return numbers.length ? round(numbers.reduce((sum, value) => sum + clamp(Math.abs(value)), 0) / numbers.length) : 0;
}

function resolvedPresentationModulation(instance, signalResource) {
  const declaration = instance.presentationModulation;
  if (!declaration || declaration.mode !== "audio-conditioned-proxy") return null;
  const primarySignal = text(declaration.primarySignal || "rms").toLowerCase();
  const accentSignal = text(declaration.accentSignal || "beat").toLowerCase();
  const primaryValue = signalValue(signalResource.stem?.frame, primarySignal)
    ?? signalValue(signalResource.master?.frame, primarySignal)
    ?? 0;
  const accentValue = signalValue(signalResource.stem?.frame, accentSignal)
    ?? signalValue(signalResource.master?.frame, accentSignal)
    ?? 0;
  const primaryWeight = Math.max(0, finite(declaration.primaryWeight, 0.7));
  const accentWeight = Math.max(0, finite(declaration.accentWeight, 0.3));
  const weightTotal = Math.max(Number.EPSILON, primaryWeight + accentWeight);
  const energy = clamp((primaryValue * primaryWeight + accentValue * accentWeight) / weightTotal);
  const frameOffsetFrames = Math.round(energy * Math.max(0, finite(declaration.frameOffsetFrames, 3)));
  const opacityDepth = clamp(declaration.opacityDepth, 0, 0.5);
  return {
    schemaVersion: "hapa.hyperframes.resolved-presentation-modulation.v1",
    mode: "audio-conditioned-proxy",
    source: text(declaration.source || "declared-audio-map"),
    primarySignal,
    accentSignal,
    primaryValue: round(primaryValue),
    accentValue: round(accentValue),
    energy: round(energy),
    frameOffsetFrames,
    brightness: round(1 + energy * clamp(declaration.brightnessDepth, 0, 1)),
    saturation: round(1 + energy * clamp(declaration.saturationDepth, 0, 1.5)),
    scale: round(1 + energy * clamp(declaration.scaleDepth, 0, 0.15)),
    opacityMultiplier: round(1 - opacityDepth + energy * opacityDepth),
  };
}

function diagnostic(instance, window, issues) {
  const truth = instance.rendererTruth || {};
  return {
    schemaVersion: HYPERFRAMES_VISUALIZER_DIAGNOSTIC_SCHEMA,
    instanceId: text(instance.id),
    visualizerId: text(instance.visualizerId),
    trackId: text(instance.trackId),
    cue: { startSeconds: window.start, endSeconds: window.end, activeInterval: "half-open" },
    status: "unsupported",
    route: "unsupported",
    reason: issues[0] || truth.reason || "visualizer-instance-unsupported",
    issues: [...new Set(issues.length ? issues : truth.fidelityLoss || instance.unsupported || ["visualizer-instance-unsupported"])],
    rendererTruth: truth,
    visible: true,
    silentDefault: false,
    drawableFrame: null,
  };
}

function accentEnvelope(event, timeSeconds) {
  const window = eventWindow(event);
  const progress = window.duration > 0 ? (timeSeconds - window.start) / window.duration : 0;
  const frames = normalizedKeyframes(event, "value", 0);
  return {
    id: text(event.id),
    cueId: text(event.cueId),
    kind: text(event.kind),
    preset: text(event.preset),
    atSeconds: window.start,
    endSeconds: window.end,
    progress: round(progress),
    value: round(interpolatedKeyframe(frames, progress)),
    intensity: round(event.intensity),
    target: event.target || {},
    source: event.source || {},
    safety: event.safety || {},
  };
}

function activeAccents(show, timeSeconds) {
  return (show.automation?.accentTrack?.events || [])
    .filter((event) => event.target?.layer === "visualizer-layer")
    .filter((event) => activeHalfOpen(eventWindow(event), timeSeconds))
    .map(accent => accentEnvelope(accent, timeSeconds))
    .sort((a, b) => a.atSeconds - b.atSeconds || a.id.localeCompare(b.id));
}

function assignAccents(instances, accents) {
  const assigned = new Map(instances.map((instance) => [instance.id, []]));
  const resolved = accents.map((accent) => {
    const target = accent.target || {};
    let instance = instances.find((candidate) => target.instanceId && candidate.id === target.instanceId)
      || instances.find((candidate) => target.visualizerId && candidate.visualizerId === target.visualizerId)
      || instances.find((candidate) => target.trackId && candidate.trackId === target.trackId);
    if (!instance && Number.isInteger(target.layerIndex)) instance = instances[target.layerIndex] || null;
    if (!instance) instance = instances[0] || null;
    if (instance) assigned.get(instance.id).push(accent);
    return { ...accent, assignedInstanceId: instance?.id || null };
  });
  return {
    accents: resolved,
    instances: instances.map((instance) => ({ ...instance, accents: assigned.get(instance.id) || [] })),
  };
}

export function evaluateHyperFramesVisualizers(show = {}, timeSeconds = 0) {
  const time = Number(timeSeconds);
  if (!Number.isFinite(time)) {
    return {
      schemaVersion: HYPERFRAMES_VISUALIZER_RUNTIME_SCHEMA,
      timeSeconds: null,
      layers: [],
      instances: [],
      diagnostics: [{ schemaVersion: HYPERFRAMES_VISUALIZER_DIAGNOSTIC_SCHEMA, status: "unsupported", reason: "invalid-time", issues: ["time-seconds-must-be-finite"], visible: true, silentDefault: false, drawableFrame: null }],
      accents: [],
      receipt: { activeCandidateIds: [], drawableInstanceIds: [], unsupportedInstanceIds: [], stableLayerOrder: true, halfOpenCueIntervals: true },
    };
  }

  const drawable = [];
  const diagnostics = [];
  const activeCandidateIds = [];
  for (const { instance, sourceIndex } of stableLayerRows(show)) {
    const window = cueWindow(instance);
    if (window.end <= window.start) {
      diagnostics.push(diagnostic(instance, window, ["invalid-cue-window"]));
      continue;
    }
    if (!activeHalfOpen(window, time)) continue;
    activeCandidateIds.push(text(instance.id));
    const contract = proxyContract(instance);
    if (!contract.ok) {
      const truthIssues = instance.rendererTruth?.status === "unsupported"
        ? [instance.rendererTruth.reason || "renderer-declared-unsupported", ...(instance.rendererTruth.fidelityLoss || [])]
        : [];
      diagnostics.push(diagnostic(instance, window, [...contract.issues, ...truthIssues]));
      continue;
    }
    const visualTime = visualTimeFor(show, instance, time, window);
    const signals = resolvedSignalFrame(show, instance, time);
    const controls = mappedControls(
      instance,
      signals,
      (stemFocus) => resolvedSignalFrame(show, instance, time, stemFocus),
    );
    const presentationModulation = resolvedPresentationModulation(instance, signals);
    const transition = transitionEnvelope(instance, time, window);
    const opacity = clamp(instance.opacity, 0, 1);
    const visualizerMix = clamp(instance.visualizerMix, 0, 1);
    const declaredEffective = Number(instance.effectiveOpacity);
    const baseEffectiveOpacity = Number.isFinite(declaredEffective) ? clamp(declaredEffective) : opacity * visualizerMix;
    const effectiveOpacity = round(baseEffectiveOpacity * transition.alpha * (presentationModulation?.opacityMultiplier ?? 1));
    const bindingDiagnostics = [
      ...(signals.fallbackUsed ? ["requested-stem-absent-master-frame-used"] : []),
      ...(!signals.stem ? ["stem-and-master-frame-unavailable"] : []),
      ...controls.invalidAudioMapUniforms.map((uniform) => `audio-map-uniform-not-declared:${uniform}`),
      ...controls.bindings.filter((binding) => binding.status === "missing-signal").map((binding) => `signal-unavailable:${binding.signal}`),
    ];
    const resolvedProxyFrame = proxyFrame(contract, visualTime.visualTimeSeconds, presentationModulation);
    const declaredSignals = Array.isArray(instance.audioSignal) ? instance.audioSignal : [instance.audioSignal].filter(Boolean);
    const primarySignal = presentationModulation?.primaryValue
      ?? declaredSignals.map((signal) => signalValue(signals.stem?.frame, signal)).find((value) => value != null)
      ?? 0;
    const seed = canonicalHash(instance.pixelIdentitySeed);
    const pixelSignature = /^[a-f0-9]{64}$/.test(seed) ? `sha256:${seed}` : text(contract.proxy.assetSha256);
    drawable.push({
      id: text(instance.id),
      cueId: text(instance.cueId || instance.id),
      visualizerId: text(instance.visualizerId),
      sourceHash: contract.sourceHash,
      trackId: text(instance.trackId),
      cueIndex: Number.isFinite(Number(instance.cueIndex)) ? Number(instance.cueIndex) : null,
      layerOrder: Number.isFinite(Number(instance.layerOrder ?? instance.layerIndex ?? instance.zIndex))
        ? Number(instance.layerOrder ?? instance.layerIndex ?? instance.zIndex)
        : sourceIndex,
      cue: { startSeconds: window.start, endSeconds: window.end, durationSeconds: window.duration, activeInterval: "half-open" },
      canonicalAudioTimeSeconds: round(time),
      visualTime,
      proxy: contract.proxy,
      proxyFrame: resolvedProxyFrame,
      frame: { index: resolvedProxyFrame.frameIndex, rect: resolvedProxyFrame.sourceRect },
      pixelSignature,
      pixelFrameIdentity: `${pixelSignature}#${resolvedProxyFrame.frameIndex}`,
      stemFrame: signals.stem,
      masterFrame: signals.master,
      stemSignal: round(primarySignal),
      signalValue: round(primarySignal),
      stemFocus: signals.requestedStem,
      stemResolution: { requested: signals.requestedStem, resolved: signals.resolvedStem, fallbackUsed: signals.fallbackUsed },
      controls: { ...(instance.controls || {}) },
      mappedControls: controls,
      controlValues: controls.values,
      controlBindings: controls.bindings,
      controlEnergy: controlEnergy(controls.values),
      presentationModulation,
      opacity: round(opacity),
      visualizerMix: round(visualizerMix),
      baseEffectiveOpacity: round(baseEffectiveOpacity),
      effectiveOpacity,
      blendMode: text(instance.blendMode || "screen"),
      target: text(instance.target || "program"),
      transition,
      transitionEnvelope: transition,
      transitionAlpha: transition.alpha,
      nativeRoute: contract.nativeRoute,
      rendererTruth: executionTruth(instance, contract),
      sourceRendererTruth: instance.rendererTruth || null,
      execution: {
        ...(instance.execution || {}),
        mode: "executed-offline-instance",
        status: "exact",
        route: "hash-bound-exact-proxy",
        drawable: true,
        silentDefault: false,
        proxyFrameReady: true,
      },
      diagnostics: bindingDiagnostics,
      accents: [],
    });
  }
  const accentAssignment = assignAccents(drawable, activeAccents(show, time));
  const layers = accentAssignment.instances;
  return {
    schemaVersion: HYPERFRAMES_VISUALIZER_RUNTIME_SCHEMA,
    showHash: text(show.showHash) || null,
    timeSeconds: round(time),
    layers,
    instances: layers,
    diagnostics,
    accents: accentAssignment.accents,
    receipt: {
      activeCandidateIds,
      drawableInstanceIds: layers.map((instance) => instance.id),
      unsupportedInstanceIds: diagnostics.filter((entry) => activeCandidateIds.includes(entry.instanceId)).map((entry) => entry.instanceId),
      stableLayerOrder: true,
      halfOpenCueIntervals: true,
      runtimeDecisionCalls: false,
      runtimeAudioAnalysis: false,
      randomCalls: false,
      wallClockCalls: false,
      networkCalls: false,
    },
  };
}

export const HapaHyperFramesVisualizerRuntime = Object.freeze({
  schemaVersion: HYPERFRAMES_VISUALIZER_RUNTIME_SCHEMA,
  evaluateHyperFramesVisualizers,
});

if (typeof globalThis === "object") {
  globalThis.HapaHyperFramesVisualizerRuntime = HapaHyperFramesVisualizerRuntime;
}
