import { normalizeHyperFramesStemRole } from "../src/domain/hyperframes-visualizer-runtime.js";
import {
  STEM_TELEMETRY_CORE_SIGNALS as CORE_SIGNALS,
  STEM_TELEMETRY_EVENT_DRIVEN_SIGNALS as EVENT_DRIVEN_SIGNALS,
  STEM_TELEMETRY_EVENT_THRESHOLD,
  STEM_TELEMETRY_REACTIVE_SIGNALS as REACTIVE_SIGNALS,
  STEM_TELEMETRY_SIGNAL_VARIANCE_THRESHOLD,
  stemTelemetryRawActivityCoverage,
  stemTelemetryFiniteRange as finiteRange,
  stemTelemetryReactiveSignal as reactiveSignal,
  stemTelemetrySignalActivityClass as signalActivityClass,
  stemTelemetrySignalValue as signalValue,
} from "../src/domain/stem-telemetry-signal-semantics.js";
import { renderDurationToleranceSeconds } from "./render-audio-input-preflight.mjs";

export const STEM_TELEMETRY_BUNDLE_SCHEMA = "hapa.stem-telemetry-bundle.v1";
export const STEM_TELEMETRY_PREFLIGHT_SCHEMA = "hapa.stem-telemetry-preflight.v1";
export const STEM_TELEMETRY_PREFLIGHT_ERROR_CODE = "stem_telemetry_not_render_ready";

const VERIFIED_STEM_STATUS = "verified-local-analysis";
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const round = (value, digits = 9) => {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
};

function role(value, fallback = "") {
  return normalizeHyperFramesStemRole(value) || fallback;
}

function normalizedMapping(value, fallback = null) {
  const base = fallback && typeof fallback === "object" && !Array.isArray(fallback)
    ? structuredClone(fallback)
    : {};
  if (typeof value === "string") {
    const parts = value.split(":").map(text).filter(Boolean);
    const signal = text(parts.pop() || base.signal || "off").toLowerCase();
    return {
      ...base,
      signal,
      ...(parts.length ? { stemFocus: parts.join(":") } : {}),
    };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...base, ...structuredClone(value), signal: text(value.signal || base.signal || "off").toLowerCase() };
  }
  return Object.keys(base).length ? base : null;
}

function normalizedAudioMap(portable = {}, overrides = {}) {
  const declared = portable?.audioMap && typeof portable.audioMap === "object" && !Array.isArray(portable.audioMap)
    ? portable.audioMap
    : {};
  const replacements = overrides && typeof overrides === "object" && !Array.isArray(overrides)
    ? overrides
    : {};
  const names = [...new Set([...Object.keys(declared), ...Object.keys(replacements)])].sort();
  return Object.fromEntries(names.flatMap((uniform) => {
    const base = normalizedMapping(declared[uniform]);
    const mapping = Object.hasOwn(replacements, uniform)
      ? normalizedMapping(replacements[uniform], base)
      : base;
    return mapping ? [[uniform, mapping]] : [];
  }));
}

function appendBinding(bindings, {
  stemRole,
  signal,
  cueId = null,
  uniform = null,
  source,
  startSeconds = null,
  endSeconds = null,
  activityClass = "continuous",
  variationRequired = true,
} = {}) {
  const normalizedRole = role(stemRole, "master");
  const normalizedSignal = reactiveSignal(signal);
  if (!normalizedSignal) return;
  bindings.push({
    stemRole: normalizedRole,
    signal: normalizedSignal,
    cueId: text(cueId) || null,
    uniform: text(uniform) || null,
    source: text(source) || "visualizer",
    startSeconds: Number.isFinite(Number(startSeconds)) ? Number(startSeconds) : null,
    endSeconds: Number.isFinite(Number(endSeconds)) ? Number(endSeconds) : null,
    activityClass: activityClass === "event" ? "event" : "continuous",
    variationRequired: variationRequired !== false,
  });
}

function appendPresentationBindings(bindings, {
  audioMap,
  defaultRole,
  cueId,
  source,
  startSeconds,
  endSeconds,
}) {
  const signals = [...new Set(Object.values(audioMap).map((mapping) => reactiveSignal(mapping?.signal)).filter(Boolean))];
  const mappedRoles = [...new Set(Object.values(audioMap).map((mapping) => role(mapping?.stemFocus)).filter(Boolean))];
  const presentationRole = mappedRoles.length === 1 ? mappedRoles[0] : role(defaultRole, "master");
  const primarySignal = signals.find((signal) => !["beat", "onset"].includes(signal)) || "rms";
  const accentSignal = signals.find((signal) => ["beat", "onset"].includes(signal)) || "beat";
  const activityClass = signalActivityClass(signals);
  appendBinding(bindings, {
    stemRole: presentationRole,
    signal: primarySignal,
    cueId,
    source: `${source}.presentation.primary`,
    startSeconds,
    endSeconds,
    activityClass,
    // With no declared signal at all, RMS is the actual default driver. When
    // an event-only map exists, the injected RMS fallback may remain flat
    // while the requested onset/beat signal correctly drives the cue.
    variationRequired: signals.includes(primarySignal) || !signals.length,
  });
  appendBinding(bindings, {
    stemRole: presentationRole,
    signal: accentSignal,
    cueId,
    source: `${source}.presentation.accent`,
    startSeconds,
    endSeconds,
    activityClass,
    variationRequired: signals.includes(accentSignal),
  });
}

function graphBindings(showGraph = {}) {
  const bindings = [];
  for (const track of list(showGraph?.tracks)) {
    for (const card of list(track?.cards)) {
      const portable = card?.visualization?.card || {};
      const isVisualizer = Boolean(card?.visualization) && track?.role !== "accent" && (
        track?.role === "visualizer"
        || track?.id === "track-b"
        || portable?.schemaVersion === "hapa.visualizer-card.v2"
      );
      if (!isVisualizer) continue;
      const defaultRole = portable.stemFocus
        || card?.visualization?.stemFocus
        || card?.parameters?.stemFocus
        || card?.provenance?.stemFocus
        || "master";
      const audioMap = normalizedAudioMap(portable, card?.parameters?.visualizerMappings);
      for (const [uniform, mapping] of Object.entries(audioMap)) {
        appendBinding(bindings, {
          stemRole: mapping.stemFocus || defaultRole,
          signal: mapping.signal,
          cueId: card?.id,
          uniform,
          source: "show-graph.audio-map",
          startSeconds: card?.startSeconds,
          endSeconds: card?.endSeconds,
          activityClass: signalActivityClass([mapping.signal]),
        });
      }
      for (const signal of list(portable.audioSignal)) {
        appendBinding(bindings, {
          stemRole: defaultRole,
          signal,
          cueId: card?.id,
          source: "show-graph.audio-signal",
          startSeconds: card?.startSeconds,
          endSeconds: card?.endSeconds,
          activityClass: signalActivityClass([signal]),
        });
      }
      appendPresentationBindings(bindings, {
        audioMap,
        defaultRole,
        cueId: card?.id,
        source: "show-graph",
        startSeconds: card?.startSeconds,
        endSeconds: card?.endSeconds,
      });
    }
  }
  return bindings;
}

function executableShowBindings(show = {}) {
  const bindings = [];
  for (const instance of list(show?.instances?.visualizers)) {
    const defaultRole = role(instance?.stemFocus, "master");
    const audioMap = normalizedAudioMap({ audioMap: instance?.audioMap });
    const mappedSignals = Object.values(audioMap).map((mapping) => mapping?.signal).map(reactiveSignal).filter(Boolean);
    const presentationSource = text(instance?.presentationModulation?.source);
    for (const [uniform, mapping] of Object.entries(audioMap)) {
      appendBinding(bindings, {
        stemRole: mapping.stemFocus || defaultRole,
        signal: mapping.signal,
        cueId: instance?.cueId || instance?.id,
        uniform,
        source: "executable-show.audio-map",
        startSeconds: instance?.startSeconds ?? instance?.start,
        endSeconds: instance?.endSeconds ?? instance?.end,
        activityClass: signalActivityClass([mapping.signal]),
      });
    }
    const presentation = instance?.presentationModulation || {};
    const defaultSignals = [
      ...list(instance?.audioSignal),
      presentation.primarySignal,
      presentation.accentSignal,
    ].map(reactiveSignal).filter(Boolean);
    const mappedRoles = [...new Set(Object.values(audioMap).map((mapping) => role(mapping?.stemFocus || defaultRole)).filter(Boolean))];
    const mappingsDriveDefaultRole = mappedSignals.length > 0
      && mappedRoles.length === 1
      && mappedRoles[0] === defaultRole;
    const defaultActivityClass = mappingsDriveDefaultRole
      ? signalActivityClass(mappedSignals)
      : presentationSource === "generic-rms-beat-fallback"
        ? "continuous"
        : signalActivityClass(defaultSignals);
    for (const signal of list(instance?.audioSignal)) {
      appendBinding(bindings, {
        stemRole: defaultRole,
        signal,
        cueId: instance?.cueId || instance?.id,
        source: "executable-show.audio-signal",
        startSeconds: instance?.startSeconds ?? instance?.start,
        endSeconds: instance?.endSeconds ?? instance?.end,
        activityClass: defaultActivityClass,
        variationRequired: mappedSignals.includes(reactiveSignal(signal)) || !mappedSignals.length,
      });
    }
    appendBinding(bindings, {
      stemRole: defaultRole,
      signal: presentation.primarySignal,
      cueId: instance?.cueId || instance?.id,
      source: "executable-show.presentation.primary",
      startSeconds: instance?.startSeconds ?? instance?.start,
      endSeconds: instance?.endSeconds ?? instance?.end,
      activityClass: defaultActivityClass,
      variationRequired: mappedSignals.includes(reactiveSignal(presentation.primarySignal)) || !mappedSignals.length,
    });
    appendBinding(bindings, {
      stemRole: defaultRole,
      signal: presentation.accentSignal,
      cueId: instance?.cueId || instance?.id,
      source: "executable-show.presentation.accent",
      startSeconds: instance?.startSeconds ?? instance?.start,
      endSeconds: instance?.endSeconds ?? instance?.end,
      activityClass: defaultActivityClass,
      variationRequired: mappedSignals.includes(reactiveSignal(presentation.accentSignal)),
    });
  }
  return bindings;
}

export function deriveRequiredStemTelemetryBindings({ showGraph = {}, show = {} } = {}) {
  const bindings = [...graphBindings(showGraph), ...executableShowBindings(show)];
  const unique = new Map();
  for (const binding of bindings) {
    const key = [binding.stemRole, binding.signal, binding.cueId, binding.uniform, binding.source, binding.startSeconds, binding.endSeconds, binding.activityClass, binding.variationRequired].join("\u0000");
    if (!unique.has(key)) unique.set(key, binding);
  }
  return [...unique.values()].sort((left, right) => (
    left.stemRole.localeCompare(right.stemRole)
    || left.signal.localeCompare(right.signal)
    || String(left.cueId).localeCompare(String(right.cueId))
    || String(left.uniform).localeCompare(String(right.uniform))
    || left.source.localeCompare(right.source)
  ));
}

function explicitAllowSilentRoles({ allowSilentRoles = [], telemetry = {}, showGraph = {}, show = {} } = {}) {
  const roles = new Set(list(allowSilentRoles).map((value) => role(value)).filter(Boolean));
  const collect = (contracts) => {
    if (!contracts || typeof contracts !== "object" || Array.isArray(contracts)) return;
    for (const [candidateRole, contract] of Object.entries(contracts)) {
      if (contract?.allowSilent === true || contract?.allow_silent === true) roles.add(role(candidateRole));
    }
  };
  collect(showGraph?.stems?.signalContracts);
  collect(showGraph?.stems?.telemetryContracts);
  collect(show?.stemFrames?.signalContracts);
  collect(telemetry?.signalContracts);
  for (const stem of list(telemetry?.stems)) {
    if (stem?.allowSilent === true || stem?.allow_silent === true || stem?.signalContract?.allowSilent === true) {
      roles.add(role(stem?.role || stem?.id));
    }
  }
  if (
    telemetry?.masterMix?.allowSilent === true
    || telemetry?.masterMix?.allow_silent === true
    || telemetry?.masterMix?.signalContract?.allowSilent === true
  ) roles.add("master");
  return [...roles].filter(Boolean).sort();
}

function bindingWindows(bindings, expectedDurationSeconds) {
  const groups = new Map();
  for (const binding of bindings) {
    const declaredStart = Number(binding?.startSeconds);
    const declaredEnd = Number(binding?.endSeconds);
    const hasDeclaredWindow = Number.isFinite(declaredStart) && Number.isFinite(declaredEnd) && declaredEnd > declaredStart;
    const startSeconds = hasDeclaredWindow ? Math.max(0, declaredStart) : 0;
    const endSeconds = hasDeclaredWindow ? Math.min(expectedDurationSeconds, declaredEnd) : expectedDurationSeconds;
    if (!(endSeconds > startSeconds)) continue;
    const key = `${text(binding?.cueId)}\u0000${startSeconds}\u0000${endSeconds}`;
    if (!groups.has(key)) groups.set(key, {
      cueId: text(binding?.cueId) || null,
      startSeconds,
      endSeconds,
      timingScope: hasDeclaredWindow ? "declared-cue-window" : "full-show-fallback",
      signals: new Set(),
      requiredSignals: new Set(),
      bindingSources: new Set(),
      activityClasses: new Set(),
    });
    groups.get(key).signals.add(binding.signal);
    if (binding.variationRequired !== false) groups.get(key).requiredSignals.add(binding.signal);
    groups.get(key).bindingSources.add(binding.source);
    groups.get(key).activityClasses.add(binding.activityClass === "event" ? "event" : "continuous");
  }
  return [...groups.values()].map((window) => ({
    ...window,
    signals: [...window.signals].sort(),
    requiredSignals: [...window.requiredSignals].sort(),
    bindingSources: [...window.bindingSources].sort(),
    activityClass: window.activityClasses.size > 0 && [...window.activityClasses].every((value) => value === "event")
      ? "event"
      : "continuous",
    activityClasses: [...window.activityClasses].sort(),
  })).sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds || String(left.cueId).localeCompare(String(right.cueId)));
}

function resourceSummary(resource, {
  expectedDurationSeconds,
  toleranceSeconds,
  fps,
  relevantSignals,
  bindings = [],
  requireGlobalVariation = false,
  allowSilent,
  addFinding,
}) {
  const resourceRole = role(resource?.role || resource?.id, "unknown");
  const frames = list(resource?.frames);
  const resourceDuration = positive(resource?.durationSeconds);
  const cadenceSeconds = 1 / fps;
  const maximumFrameGapSeconds = cadenceSeconds * 1.5 + 1e-6;
  const signals = [...new Set([...CORE_SIGNALS, ...relevantSignals])].sort();
  const signalStats = {};
  let firstTimeSeconds = null;
  let lastTimeSeconds = null;
  let largestGapSeconds = 0;

  if (!frames.length) {
    addFinding("stem-telemetry-frames-empty", `Telemetry for ${resourceRole} has no frames.`, { role: resourceRole });
  } else {
    for (let index = 0; index < frames.length; index += 1) {
      const timestamp = Number(frames[index]?.t);
      if (!Number.isFinite(timestamp)) {
        addFinding("stem-telemetry-frame-time-invalid", `Telemetry for ${resourceRole} has a non-finite frame time.`, { role: resourceRole, frameIndex: index });
        continue;
      }
      if (index === 0) firstTimeSeconds = timestamp;
      if (Number.isFinite(lastTimeSeconds)) {
        const gap = timestamp - lastTimeSeconds;
        if (!(gap > 0)) {
          addFinding("stem-telemetry-frames-nonmonotonic", `Telemetry for ${resourceRole} is not strictly monotonic.`, {
            role: resourceRole,
            frameIndex: index,
            previousTimeSeconds: lastTimeSeconds,
            timeSeconds: timestamp,
          });
        } else {
          largestGapSeconds = Math.max(largestGapSeconds, gap);
        }
      }
      lastTimeSeconds = timestamp;
    }
    if (Number.isFinite(firstTimeSeconds) && (firstTimeSeconds < -1e-6 || firstTimeSeconds > toleranceSeconds)) {
      addFinding("stem-telemetry-coverage-start-mismatch", `Telemetry for ${resourceRole} does not begin at the show origin.`, {
        role: resourceRole,
        firstTimeSeconds,
        toleranceSeconds,
      });
    }
    if (largestGapSeconds > maximumFrameGapSeconds) {
      addFinding("stem-telemetry-frame-gap", `Telemetry for ${resourceRole} contains a gap larger than its declared frame cadence.`, {
        role: resourceRole,
        largestGapSeconds,
        maximumFrameGapSeconds,
      });
    }
    if (
      Number.isFinite(lastTimeSeconds)
      && (
        lastTimeSeconds > expectedDurationSeconds + toleranceSeconds
        || lastTimeSeconds + cadenceSeconds < expectedDurationSeconds - toleranceSeconds
      )
    ) {
      addFinding("stem-telemetry-coverage-end-mismatch", `Telemetry for ${resourceRole} does not cover the show ending.`, {
        role: resourceRole,
        lastTimeSeconds,
        cadenceSeconds,
        expectedDurationSeconds,
        toleranceSeconds,
      });
    }
  }

  if (resourceDuration && Math.abs(resourceDuration - expectedDurationSeconds) > toleranceSeconds) {
    addFinding("stem-telemetry-resource-duration-mismatch", `Telemetry duration for ${resourceRole} does not match the show.`, {
      role: resourceRole,
      resourceDurationSeconds: resourceDuration,
      expectedDurationSeconds,
      toleranceSeconds,
    });
  }

  for (const signal of signals) {
    const values = frames.map((frame) => signalValue(frame, signal));
    const firstInvalid = values.findIndex((value) => !Number.isFinite(value));
    if (firstInvalid >= 0) {
      addFinding("stem-telemetry-signal-nonfinite", `Telemetry for ${resourceRole} cannot provide finite ${signal} values.`, {
        role: resourceRole,
        signal,
        frameIndex: firstInvalid,
      });
      signalStats[signal] = { finite: false, minimum: null, maximum: null, varianceRange: null };
      continue;
    }
    let minimum = null;
    let maximum = null;
    for (const value of values) {
      minimum = minimum === null ? value : Math.min(minimum, value);
      maximum = maximum === null ? value : Math.max(maximum, value);
    }
    signalStats[signal] = {
      finite: values.length > 0,
      minimum,
      maximum,
      varianceRange: values.length ? maximum - minimum : null,
    };
  }

  const varianceRange = Math.max(0, ...CORE_SIGNALS.map((signal) => signalStats[signal]?.varianceRange || 0));
  if (requireGlobalVariation && !allowSilent && frames.length && varianceRange <= STEM_TELEMETRY_SIGNAL_VARIANCE_THRESHOLD) {
    addFinding("stem-telemetry-audio-variance-missing", `Telemetry for ${resourceRole} is flat and cannot drive audio-reactive visuals.`, {
      role: resourceRole,
      varianceRange,
      threshold: STEM_TELEMETRY_SIGNAL_VARIANCE_THRESHOLD,
      activityScope: "full-resource",
    });
  }
  const cueWindows = bindingWindows(bindings, expectedDurationSeconds).map((window) => {
    const windowFrames = frames.filter((frame) => {
      const timestamp = Number(frame?.t);
      return Number.isFinite(timestamp) && timestamp + 1e-9 >= window.startSeconds && timestamp < window.endSeconds - 1e-9;
    });
    if (!windowFrames.length) {
      addFinding("stem-telemetry-binding-window-frames-empty", `Telemetry for ${resourceRole} has no frames inside requested cue ${window.cueId || "window"}.`, {
        role: resourceRole,
        cueId: window.cueId,
        startSeconds: window.startSeconds,
        endSeconds: window.endSeconds,
      });
    }
    const coreVarianceRange = Math.max(0, ...CORE_SIGNALS.map((signal) => finiteRange(windowFrames, signal) || 0));
    const signalVariance = Object.fromEntries(window.signals.map((signal) => [signal, finiteRange(windowFrames, signal)]));
    const rawActivity = stemTelemetryRawActivityCoverage(windowFrames, {
      fps,
      startSeconds: window.startSeconds,
      endSeconds: window.endSeconds,
    });
    if (!allowSilent && window.activityClass === "continuous" && !rawActivity.sufficient) {
      addFinding(
        rawActivity.measured ? "stem-telemetry-continuous-coverage-insufficient" : "stem-telemetry-raw-activity-unmeasured",
        rawActivity.measured
          ? `The continuous signal source ${resourceRole} is active for too little of requested cue ${window.cueId || "window"}.`
          : `The continuous signal source ${resourceRole} has no absolute RMS/peak activity proof for requested cue ${window.cueId || "window"}.`,
        {
          role: resourceRole,
          cueId: window.cueId,
          startSeconds: window.startSeconds,
          endSeconds: window.endSeconds,
          activeSeconds: rawActivity.activeSeconds,
          activeRatio: rawActivity.activeRatio,
          minimumActiveRatio: rawActivity.minimumActiveRatio,
          activityScope: "bound-cue-window",
        },
      );
    }
    if (!allowSilent && windowFrames.length && coreVarianceRange <= STEM_TELEMETRY_SIGNAL_VARIANCE_THRESHOLD) {
      addFinding("stem-telemetry-audio-variance-missing", `Telemetry for ${resourceRole} is flat during requested cue ${window.cueId || "window"}.`, {
        role: resourceRole,
        cueId: window.cueId,
        startSeconds: window.startSeconds,
        endSeconds: window.endSeconds,
        varianceRange: coreVarianceRange,
        threshold: STEM_TELEMETRY_SIGNAL_VARIANCE_THRESHOLD,
        activityScope: "bound-cue-window",
      });
    }
    for (const signal of window.requiredSignals) {
      const signalRange = signalVariance[signal];
      if (!allowSilent && Number.isFinite(signalRange) && signalRange <= STEM_TELEMETRY_SIGNAL_VARIANCE_THRESHOLD) {
        addFinding("stem-telemetry-signal-flat", `The ${signal} signal for ${resourceRole} is flat during requested cue ${window.cueId || "window"}.`, {
          role: resourceRole,
          signal,
          cueId: window.cueId,
          startSeconds: window.startSeconds,
          endSeconds: window.endSeconds,
          varianceRange: signalRange,
          threshold: STEM_TELEMETRY_SIGNAL_VARIANCE_THRESHOLD,
          activityScope: "bound-cue-window",
        });
      }
    }
    const eventSignals = window.requiredSignals.filter((signal) => EVENT_DRIVEN_SIGNALS.has(signal));
    const eventEvidence = Object.fromEntries(eventSignals.map((signal) => {
      const values = windowFrames.map((frame) => signalValue(frame, signal)).filter(Number.isFinite);
      const peak = values.length ? Math.max(...values) : null;
      const eventFrameCount = values.filter((value) => value > STEM_TELEMETRY_EVENT_THRESHOLD).length;
      if (!allowSilent && window.activityClass === "event" && windowFrames.length && !(eventFrameCount > 0)) {
        addFinding("stem-telemetry-event-missing", `The event-driven ${signal} signal for ${resourceRole} never fires during requested cue ${window.cueId || "window"}.`, {
          role: resourceRole,
          signal,
          cueId: window.cueId,
          startSeconds: window.startSeconds,
          endSeconds: window.endSeconds,
          eventThreshold: STEM_TELEMETRY_EVENT_THRESHOLD,
          eventFrameCount,
          peak,
          activityScope: "bound-cue-window",
        });
      }
      return [signal, { eventThreshold: STEM_TELEMETRY_EVENT_THRESHOLD, eventFrameCount, peak }];
    }));
    return {
      ...window,
      frameCount: windowFrames.length,
      coreVarianceRange,
      signalVariance,
      eventEvidence,
      rawActivity,
    };
  });

  return {
    role: resourceRole,
    id: text(resource?.id) || null,
    status: text(resource?.status) || null,
    frameCount: frames.length,
    firstTimeSeconds,
    lastTimeSeconds,
    largestGapSeconds: round(largestGapSeconds),
    declaredDurationSeconds: resourceDuration,
    relevantSignals,
    signalStats,
    allowSilent,
    activeVariationRequired: requireGlobalVariation || cueWindows.length > 0,
    activeVariationScope: requireGlobalVariation ? "full-resource" : cueWindows.length ? "bound-cue-windows" : "structural-only",
    bindingWindows: cueWindows,
  };
}

export function preflightStemTelemetryBundle({
  telemetry = {},
  showGraph = {},
  show = {},
  expectedDurationSeconds,
  expectedMasterPath = "",
  expectedMasterSha256 = "",
  expectedStemSources = [],
  allowSilentRoles = [],
} = {}) {
  const findings = [];
  const findingKeys = new Set();
  const addFinding = (code, message, details = {}) => {
    const finding = { code, severity: "blocker", message, ...details };
    const key = JSON.stringify(finding);
    if (!findingKeys.has(key)) {
      findingKeys.add(key);
      findings.push(finding);
    }
  };
  const expectedDuration = positive(expectedDurationSeconds)
    || positive(show?.duration)
    || positive(showGraph?.song?.durationSeconds)
    || positive(telemetry?.durationSeconds);
  const toleranceSeconds = renderDurationToleranceSeconds(expectedDuration);
  const fps = positive(telemetry?.fps);
  const stems = list(telemetry?.stems);
  const bindings = deriveRequiredStemTelemetryBindings({ showGraph, show });
  const silentRoles = explicitAllowSilentRoles({ allowSilentRoles, telemetry, showGraph, show });
  const silentRoleSet = new Set(silentRoles);

  if (telemetry?.schemaVersion !== STEM_TELEMETRY_BUNDLE_SCHEMA) {
    addFinding("stem-telemetry-schema-invalid", `Expected ${STEM_TELEMETRY_BUNDLE_SCHEMA}.`, {
      actualSchemaVersion: text(telemetry?.schemaVersion) || null,
    });
  }
  if (!text(telemetry?.analysisVersion)) addFinding("stem-telemetry-analysis-version-missing", "The telemetry analysis version is missing.");
  if (telemetry?.truthStatus !== "offline-decoded-local-stems") {
    addFinding("stem-telemetry-truth-status-invalid", "Telemetry must come from fully decoded local stems.", {
      truthStatus: text(telemetry?.truthStatus) || null,
    });
  }
  if (!expectedDuration || !toleranceSeconds) addFinding("stem-telemetry-show-duration-missing", "A positive show duration is required.");
  if (!fps) addFinding("stem-telemetry-fps-invalid", "Telemetry must declare a positive frame rate.");
  if (!positive(telemetry?.sampleRate)) addFinding("stem-telemetry-sample-rate-invalid", "Telemetry must declare a positive analysis sample rate.");
  const requiredIsolatedRoles = [...new Set(bindings.map((binding) => binding.stemRole).filter((bindingRole) => bindingRole !== "master"))];
  if (!stems.length && requiredIsolatedRoles.length) {
    addFinding("stem-telemetry-stems-empty", "The telemetry bundle contains no analyzed isolated stem resources.", { requiredRoles: requiredIsolatedRoles });
  }

  const masterMix = telemetry?.masterMix;
  const normalizedExpectedMasterHash = text(expectedMasterSha256).replace(/^sha256:/iu, "").toLowerCase();
  const observedMasterHash = text(masterMix?.audioHash).replace(/^sha256:/iu, "").toLowerCase();
  const masterHashMatches = /^[a-f0-9]{64}$/iu.test(normalizedExpectedMasterHash)
    && observedMasterHash === normalizedExpectedMasterHash;
  if (masterMix?.method !== "authoritative-registry-master") {
    addFinding("stem-telemetry-master-source-not-authoritative", "Master telemetry must be analyzed from the exact registry master used for playback, not reconstructed from isolated stems.", {
      method: text(masterMix?.method) || null,
    });
  }
  if (!text(masterMix?.audioPath) || !/^[a-f0-9]{64}$/iu.test(observedMasterHash)) {
    addFinding("stem-telemetry-master-source-proof-invalid", "Master telemetry is missing its decoded source path or SHA-256 proof.", {
      audioPathPresent: Boolean(text(masterMix?.audioPath)),
      audioHashPresent: /^[a-f0-9]{64}$/iu.test(observedMasterHash),
    });
  }
  if (text(expectedMasterPath) && text(masterMix?.audioPath) !== text(expectedMasterPath) && !masterHashMatches) {
    addFinding("stem-telemetry-master-path-mismatch", "Master telemetry was not derived from the playback master path.", {
      expectedMasterPath: text(expectedMasterPath),
      observedMasterPath: text(masterMix?.audioPath) || null,
    });
  }
  if (normalizedExpectedMasterHash && observedMasterHash !== normalizedExpectedMasterHash) {
    addFinding("stem-telemetry-master-hash-mismatch", "Master telemetry bytes do not match the master that will be packaged for playback.", {
      expectedMasterSha256: `sha256:${normalizedExpectedMasterHash}`,
      observedMasterSha256: observedMasterHash ? `sha256:${observedMasterHash}` : null,
    });
  }

  const verifiedStems = [];
  const stemByRole = new Map();
  const expectedSourceByRole = new Map();
  for (const source of list(expectedStemSources)) {
    const sourceRole = role(source?.role || source?.stemRole || source?.id);
    if (!sourceRole) continue;
    if (expectedSourceByRole.has(sourceRole)) {
      addFinding("stem-telemetry-expected-source-role-duplicate", `The verified Show Graph declares more than one source for ${sourceRole}.`, {
        role: sourceRole,
      });
      continue;
    }
    expectedSourceByRole.set(sourceRole, source);
  }
  for (const [index, stem] of stems.entries()) {
    const stemRole = role(stem?.role || stem?.id, `unknown-${index + 1}`);
    if (stemByRole.has(stemRole)) {
      addFinding("stem-telemetry-role-duplicate", `More than one telemetry stem claims ${stemRole}.`, { role: stemRole, stemIndex: index });
    } else {
      stemByRole.set(stemRole, stem);
    }
    if (stem?.status !== VERIFIED_STEM_STATUS) {
      addFinding("stem-telemetry-stem-unverified", `Stem ${stemRole} was not verified by local audio analysis.`, {
        role: stemRole,
        status: text(stem?.status) || null,
      });
    } else {
      verifiedStems.push(stem);
    }
    if (!text(stem?.audioPath) || !/^[a-f0-9]{64}$/iu.test(text(stem?.audioHash))) {
      addFinding("stem-telemetry-source-proof-invalid", `Stem ${stemRole} is missing its decoded source path or SHA-256 proof.`, {
        role: stemRole,
        audioPathPresent: Boolean(text(stem?.audioPath)),
        audioHashPresent: /^[a-f0-9]{64}$/iu.test(text(stem?.audioHash)),
      });
    }
    if (expectedSourceByRole.size) {
      const expectedSource = expectedSourceByRole.get(stemRole);
      if (!expectedSource) {
        addFinding("stem-telemetry-source-unexpected", `Telemetry includes ${stemRole}, but that role is not present in the verified Show Graph audio inputs.`, {
          role: stemRole,
          observedPath: text(stem?.audioPath) || null,
        });
      } else {
        const expectedPath = text(expectedSource?.path || expectedSource?.audioPath);
        const expectedHash = text(expectedSource?.sha256 || expectedSource?.audioHash).replace(/^sha256:/iu, "").toLowerCase();
        const observedPath = text(stem?.audioPath);
        const observedHash = text(stem?.audioHash).replace(/^sha256:/iu, "").toLowerCase();
        const expectedHashValid = /^[a-f0-9]{64}$/iu.test(expectedHash);
        const sourceHashMatches = expectedHashValid && observedHash === expectedHash;
        if (!expectedPath || !expectedHashValid) {
          addFinding("stem-telemetry-expected-source-proof-invalid", `The verified Show Graph source proof for ${stemRole} is incomplete.`, {
            role: stemRole,
            expectedPathPresent: Boolean(expectedPath),
            expectedHashPresent: expectedHashValid,
          });
        }
        if (expectedPath && observedPath !== expectedPath && !sourceHashMatches) {
          addFinding("stem-telemetry-source-path-mismatch", `Telemetry for ${stemRole} came from a different file than the verified Show Graph stem.`, {
            role: stemRole,
            expectedPath,
            observedPath: observedPath || null,
          });
        }
        if (expectedHashValid && observedHash !== expectedHash) {
          addFinding("stem-telemetry-source-hash-mismatch", `Telemetry for ${stemRole} does not match the verified stem bytes.`, {
            role: stemRole,
            expectedSha256: `sha256:${expectedHash}`,
            observedSha256: observedHash ? `sha256:${observedHash}` : null,
          });
        }
      }
    }
  }
  for (const [expectedRole, expectedSource] of expectedSourceByRole.entries()) {
    if (stemByRole.has(expectedRole)) continue;
    addFinding("stem-telemetry-source-missing", `The verified Show Graph stem ${expectedRole} has no matching analyzed telemetry resource.`, {
      role: expectedRole,
      expectedPath: text(expectedSource?.path || expectedSource?.audioPath) || null,
    });
  }
  if (Number(telemetry?.canonicalStemCount) !== stems.length) {
    addFinding("stem-telemetry-canonical-count-mismatch", "The canonical stem count does not match the telemetry resources.", {
      declaredCount: Number.isFinite(Number(telemetry?.canonicalStemCount)) ? Number(telemetry.canonicalStemCount) : null,
      actualCount: stems.length,
    });
  }
  if (Number(telemetry?.usableStemCount) !== verifiedStems.length) {
    addFinding("stem-telemetry-usable-count-mismatch", "The usable stem count does not match the verified telemetry resources.", {
      declaredCount: Number.isFinite(Number(telemetry?.usableStemCount)) ? Number(telemetry.usableStemCount) : null,
      actualCount: verifiedStems.length,
    });
  }
  if (expectedDuration && positive(telemetry?.durationSeconds) && Math.abs(Number(telemetry.durationSeconds) - expectedDuration) > toleranceSeconds) {
    addFinding("stem-telemetry-bundle-duration-mismatch", "The telemetry bundle duration does not match the show.", {
      telemetryDurationSeconds: Number(telemetry.durationSeconds),
      expectedDurationSeconds: expectedDuration,
      toleranceSeconds,
    });
  }

  const requiredRoles = [...new Set(bindings.map((binding) => binding.stemRole))].sort();
  for (const requiredRole of requiredRoles) {
    if (requiredRole === "master") {
      if (!masterMix || !list(masterMix.frames).length) {
        addFinding("stem-telemetry-master-missing", "A visualizer requests master telemetry, but the analyzed master mix is unavailable.", { role: "master" });
      }
      continue;
    }
    const stem = stemByRole.get(requiredRole);
    if (!stem || stem?.status !== VERIFIED_STEM_STATUS) {
      addFinding("visualizer-stem-role-missing", `A visualizer requests ${requiredRole}, but no verified ${requiredRole} telemetry exists; master fallback is not accepted.`, {
        role: requiredRole,
        masterFallbackRejected: true,
        affectedBindings: bindings.filter((binding) => binding.stemRole === requiredRole),
      });
    }
  }

  if (requiredIsolatedRoles.length) {
    const reconstruction = masterMix?.isolatedStemReconstructionDiagnostic;
    const alignment = reconstruction?.alignment;
    const bestCorrelation = Number(alignment?.bestCorrelation);
    const zeroLagCorrelation = Number(alignment?.zeroLagCorrelation);
    const bestLagSeconds = Number(alignment?.bestLagSeconds);
    const alignmentAvailable = reconstruction?.available === true
      && alignment?.version === "rms-envelope-cross-correlation.v1"
      && Number.isFinite(bestCorrelation)
      && Number.isFinite(zeroLagCorrelation)
      && Number.isFinite(bestLagSeconds);
    if (!alignmentAvailable) {
      addFinding("stem-telemetry-alignment-proof-missing", "Isolated stems are active, but their timing alignment to the playback master was not measured.", {
        requiredRoles: requiredIsolatedRoles,
      });
    } else {
      const allowedLagSeconds = Math.max(0.15, 2 / fps);
      const correlationImprovement = bestCorrelation - zeroLagCorrelation;
      if (
        Math.abs(bestLagSeconds) > allowedLagSeconds
        && bestCorrelation >= 0.35
        && correlationImprovement >= 0.1
      ) {
        addFinding("stem-telemetry-alignment-offset", "The isolated stems line up with the playback master only after a timing shift, so audio-reactive visuals would be detached.", {
          requiredRoles: requiredIsolatedRoles,
          bestLagSeconds,
          allowedLagSeconds,
          zeroLagCorrelation,
          bestCorrelation,
          correlationImprovement: round(correlationImprovement, 6),
        });
      }
    }
    for (const requiredRole of requiredIsolatedRoles) {
      const stem = stemByRole.get(requiredRole);
      if (!stem || stem?.status !== VERIFIED_STEM_STATUS) continue;
      const alignment = stem?.masterAlignmentDiagnostic;
      const bestCorrelation = Number(alignment?.bestCorrelation);
      const zeroLagCorrelation = Number(alignment?.zeroLagCorrelation);
      const bestLagSeconds = Number(alignment?.bestLagSeconds);
      const alignmentAvailable = alignment?.version === "rms-power-reconstruction-role-shift.v2"
        && Number.isFinite(bestCorrelation)
        && Number.isFinite(zeroLagCorrelation)
        && Number.isFinite(bestLagSeconds);
      if (!alignmentAvailable) {
        addFinding("stem-telemetry-role-alignment-proof-missing", `The active ${requiredRole} stem has no contribution-aware timing-alignment proof inside the reconstructed playback mix.`, {
          role: requiredRole,
        });
        continue;
      }
      const allowedLagSeconds = Math.max(0.15, 2 / fps);
      const correlationImprovement = bestCorrelation - zeroLagCorrelation;
      if (
        Math.abs(bestLagSeconds) > allowedLagSeconds
        && bestCorrelation >= 0.35
        && correlationImprovement >= 0.1
      ) {
        addFinding("stem-telemetry-role-alignment-offset", `The active ${requiredRole} stem improves the reconstructed playback mix only after a timing shift.`, {
          role: requiredRole,
          bestLagSeconds,
          allowedLagSeconds,
          zeroLagCorrelation,
          bestCorrelation,
          correlationImprovement: round(correlationImprovement, 6),
        });
      }
    }
  }

  const signalsByRole = new Map();
  const bindingsByRole = new Map();
  for (const binding of bindings) {
    if (!signalsByRole.has(binding.stemRole)) signalsByRole.set(binding.stemRole, new Set());
    signalsByRole.get(binding.stemRole).add(binding.signal);
    if (!bindingsByRole.has(binding.stemRole)) bindingsByRole.set(binding.stemRole, []);
    bindingsByRole.get(binding.stemRole).push(binding);
  }
  const resources = [];
  if (expectedDuration && toleranceSeconds && fps) {
    for (const stem of stems) {
      const stemRole = role(stem?.role || stem?.id, "unknown");
      resources.push(resourceSummary(stem, {
        expectedDurationSeconds: expectedDuration,
        toleranceSeconds,
        fps,
        relevantSignals: [...(signalsByRole.get(stemRole) || [])].sort(),
        bindings: bindingsByRole.get(stemRole) || [],
        requireGlobalVariation: false,
        allowSilent: silentRoleSet.has(stemRole),
        addFinding,
      }));
    }
    if (masterMix) {
      resources.push(resourceSummary({ ...masterMix, id: masterMix.id || "master", role: "master", durationSeconds: masterMix.durationSeconds || telemetry.durationSeconds }, {
        expectedDurationSeconds: expectedDuration,
        toleranceSeconds,
        fps,
        relevantSignals: [...(signalsByRole.get("master") || [])].sort(),
        bindings: bindingsByRole.get("master") || [],
        requireGlobalVariation: true,
        allowSilent: silentRoleSet.has("master"),
        addFinding,
      }));
    }
  }

  const errors = [...new Set(findings.map((finding) => finding.code))];
  return {
    schemaVersion: STEM_TELEMETRY_PREFLIGHT_SCHEMA,
    ok: findings.length === 0,
    errors,
    findings,
    expectedDurationSeconds: expectedDuration,
    toleranceSeconds,
    fps,
    bundle: {
      schemaVersion: text(telemetry?.schemaVersion) || null,
      analysisVersion: text(telemetry?.analysisVersion) || null,
      truthStatus: text(telemetry?.truthStatus) || null,
      declaredDurationSeconds: positive(telemetry?.durationSeconds),
      canonicalStemCount: stems.length,
      verifiedStemCount: verifiedStems.length,
    },
    bindings: {
      count: bindings.length,
      requiredRoles,
      requiredSignals: [...new Set(bindings.map((binding) => binding.signal))].sort(),
      entries: bindings,
      masterFallbackAllowedForIsolatedRoles: false,
    },
    allowSilentRoles: silentRoles,
    resources,
    summary: {
      findingCount: findings.length,
      requiredRoleCount: requiredRoles.length,
      analyzedResourceCount: resources.length,
      frameCount: resources.reduce((sum, resource) => sum + resource.frameCount, 0),
    },
  };
}

export function createStemTelemetryPreflightError(preflight = {}) {
  const first = list(preflight?.findings)[0];
  const suffix = first?.message ? ` ${first.message}` : "";
  const error = new Error(`The analyzed stems cannot safely drive this music video.${suffix}`);
  error.name = "StemTelemetryPreflightError";
  error.code = STEM_TELEMETRY_PREFLIGHT_ERROR_CODE;
  error.statusCode = 409;
  error.httpStatus = 409;
  error.details = {
    stage: "stem-telemetry-preflight",
    preflight: structuredClone(preflight),
  };
  return error;
}
