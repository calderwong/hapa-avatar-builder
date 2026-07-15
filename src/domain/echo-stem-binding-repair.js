import { normalizeHyperFramesStemRole } from "./hyperframes-visualizer-runtime.js";
import {
  STEM_TELEMETRY_CORE_SIGNALS,
  STEM_TELEMETRY_SIGNAL_VARIANCE_THRESHOLD,
  evaluateStemTelemetryCueSignals,
  stemTelemetrySignalActivityClass,
  stemTelemetrySignalValue,
} from "./stem-telemetry-signal-semantics.js";

export const ECHO_STEM_BINDING_DECISION_SCHEMA = "hapa.echo.stem-binding-decision.v1";
export const ECHO_STEM_BINDING_POLICY = "retain-exact-signal-eligible-else-rebind-v2";

const ABSOLUTE_ACTIVITY_FLOOR = 10 ** (-60 / 20);
const VERIFIED_STEM_STATUS = "verified-local-analysis";
const SHA256_HEX = /^[a-f0-9]{64}$/iu;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 9) => {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
};

/**
 * The Director compiler historically used camel-case vocal names while the
 * renderer and telemetry bundle use canonical signal-resource names. Keep the
 * compiler-facing spellings at the boundary so existing graphs remain
 * compatible, but compare all activity by canonical role.
 */
export function directorStemRole(value = "") {
  const canonical = normalizeHyperFramesStemRole(value);
  if (canonical === "vocals") return "leadVocals";
  if (canonical === "backing-vocals") return "backingVocals";
  return canonical || text(value);
}

function canonicalRole(value = "") {
  return normalizeHyperFramesStemRole(value);
}

function uniqueRoles(values = []) {
  const seen = new Set();
  return list(values).flatMap((value) => {
    const role = canonicalRole(value);
    if (!role || role === "master" || seen.has(role)) return [];
    seen.add(role);
    return [role];
  });
}

export function explicitEchoAllowSilentRoles({ telemetry = {}, showGraph = {} } = {}) {
  const roles = new Set();
  const collectContracts = (contracts) => {
    if (!contracts || typeof contracts !== "object" || Array.isArray(contracts)) return;
    for (const [candidateRole, contract] of Object.entries(contracts)) {
      if (contract?.allowSilent === true || contract?.allow_silent === true) roles.add(canonicalRole(candidateRole));
    }
  };
  collectContracts(showGraph?.stems?.signalContracts);
  collectContracts(showGraph?.stems?.telemetryContracts);
  collectContracts(telemetry?.signalContracts);
  for (const stem of list(telemetry?.stems)) {
    if (stem?.allowSilent === true || stem?.allow_silent === true || stem?.signalContract?.allowSilent === true) {
      roles.add(canonicalRole(stem?.role || stem?.id));
    }
  }
  if (
    telemetry?.masterMix?.allowSilent === true
    || telemetry?.masterMix?.allow_silent === true
    || telemetry?.masterMix?.signalContract?.allowSilent === true
  ) roles.add("master");
  return [...roles].filter(Boolean).sort();
}

function rawFrameValue(frame = {}, explicitFields) {
  for (const field of explicitFields) {
    const explicit = finite(frame?.[field]);
    if (explicit !== null && explicit >= 0) return explicit;
  }
  return null;
}

function normalizedHash(value) {
  return text(value).replace(/^sha256:/iu, "").toLowerCase();
}

function sourceRole(value = {}) {
  return canonicalRole(value?.stemType || value?.role || value?.title || value?.id);
}

function sourcePath(value = {}) {
  return text(value?.audioPath || value?.localPath || value?.path);
}

function sourceHash(value = {}) {
  return normalizedHash(value?.audioHash || value?.contentSha256 || value?.sha256);
}

function certifiedSourceIndex(availableStemSources = [], availableRoles = []) {
  const roleFilter = new Set(uniqueRoles(availableRoles));
  const byRole = new Map();
  const duplicateRoles = new Set();
  for (const source of list(availableStemSources)) {
    const role = sourceRole(source);
    if (!role || role === "master" || (roleFilter.size && !roleFilter.has(role))) continue;
    if (byRole.has(role)) {
      duplicateRoles.add(role);
      continue;
    }
    byRole.set(role, source);
  }
  for (const role of duplicateRoles) byRole.delete(role);
  return { byRole, duplicateRoles: [...duplicateRoles].sort() };
}

function resourceTrust(resource = {}, telemetry = {}, expectedSource = null, { master = false, signals = [] } = {}) {
  const reasons = [];
  const fps = finite(telemetry?.fps, 0);
  const durationSeconds = finite(telemetry?.durationSeconds, 0);
  const frames = list(resource?.frames);
  const audioHash = normalizedHash(resource?.audioHash);
  const audioPath = text(resource?.audioPath);
  if (!master && resource?.status !== VERIFIED_STEM_STATUS) reasons.push("resource-status-unverified");
  if (master && resource?.method !== "authoritative-registry-master") reasons.push("master-source-not-authoritative");
  if (!audioPath) reasons.push("resource-audio-path-missing");
  if (!SHA256_HEX.test(audioHash)) reasons.push("resource-audio-hash-invalid");
  if (!frames.length) reasons.push("resource-frames-empty");
  if (!(fps > 0)) reasons.push("telemetry-fps-invalid");
  if (!(durationSeconds > 0)) reasons.push("telemetry-duration-invalid");
  if (!master && !expectedSource) reasons.push("resource-not-certified-by-show-graph");
  if (expectedSource) {
    const expectedId = text(expectedSource?.id);
    const expectedPath = sourcePath(expectedSource);
    const expectedHash = sourceHash(expectedSource);
    if (expectedId && text(resource?.id) !== expectedId) reasons.push("resource-id-mismatch");
    if (expectedPath && audioPath !== expectedPath) reasons.push("resource-path-mismatch");
    if (expectedHash && (!SHA256_HEX.test(expectedHash) || audioHash !== expectedHash)) reasons.push("resource-hash-mismatch");
    if (!expectedId && !expectedPath && !expectedHash) reasons.push("certified-source-proof-missing");
  }
  let previous = null;
  let largestGap = 0;
  let first = null;
  let last = null;
  const requiredSignals = [...new Set([...STEM_TELEMETRY_CORE_SIGNALS, ...(list(signals).length ? list(signals) : ["rms"])])];
  for (const frame of frames) {
    const at = finite(frame?.t);
    if (at === null) {
      reasons.push("resource-frame-time-invalid");
      continue;
    }
    if (first === null) first = at;
    if (previous !== null) {
      const gap = at - previous;
      if (!(gap > 0)) reasons.push("resource-frames-nonmonotonic");
      else largestGap = Math.max(largestGap, gap);
    }
    previous = at;
    last = at;
    if (rawFrameValue(frame, ["rawRms", "rmsRaw", "absoluteRms"]) === null) reasons.push("resource-raw-rms-missing");
    if (rawFrameValue(frame, ["rawPeak", "peakRaw", "absolutePeak"]) === null) reasons.push("resource-raw-peak-missing");
    if (requiredSignals.some((signal) => !Number.isFinite(stemTelemetrySignalValue(frame, signal)))) {
      reasons.push("resource-required-signal-nonfinite");
    }
  }
  if (fps > 0 && durationSeconds > 0 && frames.length) {
    const cadence = 1 / fps;
    const tolerance = Math.min(1, Math.max(0.15, durationSeconds * 0.0025));
    if (first < -1e-6 || first > tolerance) reasons.push("resource-coverage-start-mismatch");
    if (last > durationSeconds + tolerance || last + cadence < durationSeconds - tolerance) reasons.push("resource-coverage-end-mismatch");
    if (largestGap > cadence * 1.5 + 1e-6) reasons.push("resource-frame-gap");
    const resourceDuration = finite(resource?.durationSeconds);
    if (resourceDuration !== null && Math.abs(resourceDuration - durationSeconds) > tolerance) reasons.push("resource-duration-mismatch");
  }
  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)].sort(),
    firstTimeSeconds: first,
    lastTimeSeconds: last,
    largestGapSeconds: round(largestGap),
  };
}

function activityEvidence(resource = {}, {
  startSeconds,
  endSeconds,
  fps,
  signals,
  telemetry,
  expectedSource,
  master = false,
  allowSilent = false,
  activityFloor = ABSOLUTE_ACTIVITY_FLOOR,
} = {}) {
  const durationSeconds = Math.max(0, Number(endSeconds) - Number(startSeconds));
  const cadence = finite(fps, 0) > 0 ? 1 / Number(fps) : null;
  const frames = list(resource?.frames).filter((frame) => {
    const at = finite(frame?.t);
    return at !== null && at >= Number(startSeconds) && at < Number(endSeconds);
  });
  const samples = frames.flatMap((frame) => {
    const rms = rawFrameValue(frame, ["rawRms", "rmsRaw", "absoluteRms"]);
    const peak = rawFrameValue(frame, ["rawPeak", "peakRaw", "absolutePeak"]);
    return rms === null || peak === null ? [] : [{ frame, rms, peak }];
  });
  const minimumActiveSeconds = durationSeconds * 0.25;
  const activeFrames = samples.filter(({ rms, peak }) => rms >= activityFloor || peak >= activityFloor);
  const activeSeconds = Math.min(durationSeconds, activeFrames.length * (cadence || 0));
  const requiredSignals = list(signals).length ? list(signals) : ["rms"];
  const activityClass = stemTelemetrySignalActivityClass(requiredSignals);
  const cueSignals = evaluateStemTelemetryCueSignals(resource?.frames, {
    startSeconds,
    endSeconds,
    signals: requiredSignals,
    requiredSignals,
    activityClass,
    fps,
  });
  const eventFrameCount = Object.values(cueSignals.eventEvidence).reduce((sum, entry) => sum + Number(entry?.eventFrameCount || 0), 0);
  const measured = samples.length > 0 && cadence !== null;
  const trust = resourceTrust(resource, telemetry, expectedSource, { master, signals: requiredSignals });
  // Ten-fps telemetry cannot prove that a single above-floor frame stayed
  // active for the whole 100 ms bucket. Require two buckets for continuous
  // cues long enough to contain them; event-only cues intentionally retain
  // their one-event semantics.
  const minimumActiveFrames = cueSignals.rawActivity.minimumActiveFrames;
  const silentContractEligible = allowSilent
    && measured
    && cueSignals.frameCount > 0
    && cueSignals.nonfiniteSignals.length === 0
    && trust.ok;
  const activeEnough = silentContractEligible || (measured && (
    activityClass === "event"
      ? activeFrames.length > 0 && cueSignals.missingEventSignals.length === 0
      : cueSignals.rawActivity.sufficient
  ) && cueSignals.eligible && trust.ok);
  const mean = (field) => samples.length
    ? samples.reduce((sum, sample) => sum + sample[field], 0) / samples.length
    : null;
  const maximum = (field) => samples.length
    ? Math.max(...samples.map((sample) => sample[field]))
    : null;
  return {
    role: canonicalRole(resource?.role || resource?.stemRole || resource?.title || resource?.id),
    id: text(resource?.id) || null,
    audioHash: text(resource?.audioHash) || null,
    pathHash: text(resource?.pathHash) || null,
    measured,
    sufficient: activeEnough,
    allowSilent,
    silentContractEligible,
    trust,
    cueSignals,
    durationSeconds: round(durationSeconds),
    frameCount: frames.length,
    measuredFrameCount: samples.length,
    activeFrameCount: activeFrames.length,
    minimumActiveFrames,
    activeSeconds: round(activeSeconds),
    activeRatio: durationSeconds > 0 ? round(activeSeconds / durationSeconds) : 0,
    minimumActiveSeconds: round(minimumActiveSeconds),
    eventFrameCount,
    activityClass,
    meanRms: mean("rms") === null ? null : round(mean("rms"), 12),
    meanPeak: mean("peak") === null ? null : round(mean("peak"), 12),
    maxRms: maximum("rms") === null ? null : round(maximum("rms"), 12),
    maxPeak: maximum("peak") === null ? null : round(maximum("peak"), 12),
  };
}

function rankedActive(resources = [], preferredRoles = []) {
  const preference = new Map(uniqueRoles(preferredRoles).map((role, index) => [role, index]));
  return resources
    .filter((entry) => entry.measured && entry.sufficient)
    .slice()
    .sort((left, right) => (
      (left.activityClass === "event" && right.activityClass === "event"
        ? right.eventFrameCount - left.eventFrameCount
        : Number(right.meanRms || 0) - Number(left.meanRms || 0))
      || Number(right.meanRms || 0) - Number(left.meanRms || 0)
      || right.activeSeconds - left.activeSeconds
      || Number(right.meanPeak || 0) - Number(left.meanPeak || 0)
      || right.eventFrameCount - left.eventFrameCount
      || (preference.get(left.role) ?? Number.MAX_SAFE_INTEGER) - (preference.get(right.role) ?? Number.MAX_SAFE_INTEGER)
      || left.role.localeCompare(right.role)
    ));
}

function decisionBase({ requestedRole, selectedRole, startSeconds, endSeconds, signals, telemetry }) {
  return {
    schemaVersion: ECHO_STEM_BINDING_DECISION_SCHEMA,
    policy: ECHO_STEM_BINDING_POLICY,
    requestedRole: directorStemRole(requestedRole || "master") || "master",
    requestedCanonicalRole: canonicalRole(requestedRole || "master") || "master",
    selectedRole: directorStemRole(selectedRole || requestedRole || "master") || "master",
    selectedCanonicalRole: canonicalRole(selectedRole || requestedRole || "master") || "master",
    window: { startSeconds: Number(startSeconds), endSeconds: Number(endSeconds) },
    signals: [...new Set(list(signals).map((signal) => text(signal).toLowerCase()).filter(Boolean))].sort(),
    activityFloorAmplitude: ABSOLUTE_ACTIVITY_FLOOR,
    activityFloorDb: -60,
    telemetry: {
      schemaVersion: text(telemetry?.schemaVersion) || null,
      analysisVersion: text(telemetry?.analysisVersion) || null,
      truthStatus: text(telemetry?.truthStatus) || null,
      fps: finite(telemetry?.fps),
    },
  };
}

/**
 * Resolve one visualizer's signal source from fully decoded stem telemetry.
 * An already-active editorial choice is never disturbed. If it is silent in
 * this exact cue window, the strongest active declared stem wins; only when
 * all declared candidates are silent do we widen to the remaining isolated
 * stems, and only after every isolated stem fails may the master be selected.
 */
export function selectEchoActiveStemBinding({
  telemetry = null,
  requestedRole = "master",
  startSeconds = 0,
  endSeconds = 0,
  signals = [],
  declaredActiveRoles = [],
  preferredRoles = [],
  availableRoles = [],
  availableStemSources = [],
  allowSilentRoles = [],
  allowMasterFallback = true,
} = {}) {
  const base = decisionBase({ requestedRole, selectedRole: requestedRole, startSeconds, endSeconds, signals, telemetry });
  const validTelemetry = telemetry?.schemaVersion === "hapa.stem-telemetry-bundle.v1"
    && telemetry?.truthStatus === "offline-decoded-local-stems"
    && text(telemetry?.analysisVersion)
    && finite(telemetry?.fps, 0) > 0
    && finite(telemetry?.sampleRate, 0) > 0
    && finite(telemetry?.durationSeconds, 0) > 0;
  if (!validTelemetry || !(Number(endSeconds) > Number(startSeconds))) {
    return { ...base, status: "blocked-unverified-telemetry", reason: "verified-window-activity-unavailable", changed: false, candidates: [] };
  }

  const requestedCanonicalRole = canonicalRole(requestedRole || "master") || "master";
  const silentRoleSet = new Set(uniqueRoles(allowSilentRoles));
  if (list(allowSilentRoles).some((role) => canonicalRole(role) === "master")) silentRoleSet.add("master");
  const masterEvidence = activityEvidence({
    ...(telemetry?.masterMix || {}),
    role: "master",
  }, { startSeconds, endSeconds, fps: telemetry.fps, signals, telemetry, master: true, allowSilent: silentRoleSet.has("master") });
  if (requestedCanonicalRole === "master") {
    if (masterEvidence.sufficient) {
      return {
        ...base,
        status: masterEvidence.silentContractEligible ? "retained-explicit-allow-silent" : "retained-active-master",
        reason: masterEvidence.silentContractEligible ? "explicit-master-allow-silent-contract" : "explicit-master-binding-active-in-cue-window",
        changed: false,
        candidateScope: "requested-master",
        selectedEvidence: masterEvidence,
        candidates: [],
      };
    }
    return {
      ...base,
      status: "blocked-no-active-signal-source",
      reason: "requested-master-inactive-in-cue-window",
      changed: false,
      candidateScope: "requested-master",
      masterEvidence,
      candidates: [],
    };
  }

  const sourceIndex = certifiedSourceIndex(availableStemSources, availableRoles);
  const sourceResources = list(telemetry?.stems).filter((resource) => canonicalRole(resource?.role) && canonicalRole(resource?.role) !== "master");
  const telemetryRoleCounts = new Map();
  for (const resource of sourceResources) {
    const role = canonicalRole(resource?.role);
    telemetryRoleCounts.set(role, Number(telemetryRoleCounts.get(role) || 0) + 1);
  }
  const duplicateTelemetryRoles = [...telemetryRoleCounts].filter(([, count]) => count > 1).map(([role]) => role).sort();
  if (sourceIndex.duplicateRoles.length || duplicateTelemetryRoles.length || !sourceIndex.byRole.size) {
    return {
      ...base,
      status: "blocked-untrusted-candidate-scope",
      reason: sourceIndex.byRole.size ? "duplicate-normalized-stem-roles" : "show-graph-stem-certificate-missing",
      changed: false,
      candidateScope: "none",
      duplicateSourceRoles: sourceIndex.duplicateRoles,
      duplicateTelemetryRoles,
      candidates: [],
    };
  }
  const evidence = sourceResources.map((resource) => activityEvidence(resource, {
    startSeconds,
    endSeconds,
    fps: telemetry.fps,
    signals,
    telemetry,
    expectedSource: sourceIndex.byRole.get(canonicalRole(resource?.role)) || null,
    allowSilent: canonicalRole(resource?.role) === requestedCanonicalRole && silentRoleSet.has(requestedCanonicalRole),
  })).filter((entry) => sourceIndex.byRole.has(entry.role));
  const byRole = new Map(evidence.map((entry) => [entry.role, entry]));
  const requestedEvidence = byRole.get(requestedCanonicalRole);
  if (requestedCanonicalRole !== "master" && requestedEvidence?.sufficient) {
    return {
      ...base,
      status: requestedEvidence.silentContractEligible ? "retained-explicit-allow-silent" : "retained-active",
      reason: requestedEvidence.silentContractEligible ? "requested-stem-has-explicit-allow-silent-contract" : "requested-isolated-stem-active-in-cue-window",
      changed: false,
      candidateScope: "requested-role",
      selectedEvidence: requestedEvidence,
      candidates: evidence,
    };
  }

  const declared = uniqueRoles(declaredActiveRoles).filter((role) => byRole.has(role));
  const preferred = uniqueRoles([requestedRole, ...list(preferredRoles), ...list(availableRoles)]);
  const declaredRanked = rankedActive(declared.map((role) => byRole.get(role)), preferred);
  const globalRanked = rankedActive(evidence, preferred);
  const selected = declaredRanked[0] || globalRanked[0] || null;
  if (selected) {
    return {
      ...decisionBase({ requestedRole, selectedRole: selected.role, startSeconds, endSeconds, signals, telemetry }),
      status: "rebound-active-isolated-stem",
      reason: declaredRanked.length
        ? "requested-stem-silent-selected-strongest-declared-active-stem"
        : "requested-stem-silent-selected-strongest-verified-isolated-stem",
      changed: selected.role !== requestedCanonicalRole,
      candidateScope: declaredRanked.length ? "declared-active-stems" : "all-verified-isolated-stems",
      selectedEvidence: selected,
      requestedEvidence: requestedEvidence || null,
      candidates: evidence,
    };
  }

  if (allowMasterFallback && masterEvidence.sufficient) {
    return {
      ...decisionBase({ requestedRole, selectedRole: "master", startSeconds, endSeconds, signals, telemetry }),
      status: "fallback-master-after-isolated-stems-exhausted",
      reason: "no-active-isolated-stem-master-proven-active-in-cue-window",
      changed: requestedCanonicalRole !== "master",
      candidateScope: "master-last-resort",
      selectedEvidence: masterEvidence,
      requestedEvidence: requestedEvidence || null,
      candidates: evidence,
    };
  }

  return {
    ...base,
    status: "blocked-no-active-signal-source",
    reason: "requested-and-alternate-isolated-stems-inactive-in-cue-window",
    changed: false,
    candidateScope: "none",
    requestedEvidence: requestedEvidence || null,
    masterEvidence,
    candidates: evidence,
  };
}

export function declaredEchoStemRolesForWindow(timeline = [], startSeconds = 0, endSeconds = 0) {
  return uniqueRoles(list(timeline).flatMap((shot) => {
    const start = finite(shot?.start_sec ?? shot?.startSeconds);
    const end = finite(shot?.end_sec ?? shot?.endSeconds);
    if (start === null || end === null || end <= Number(startSeconds) || start >= Number(endSeconds)) return [];
    return list(shot?.active_stems ?? shot?.activeStems);
  })).map(directorStemRole);
}

export function compactEchoStemBindingDecision(decision = {}) {
  const source = decision.selectedEvidence || {};
  return {
    schemaVersion: decision.schemaVersion || null,
    policy: decision.policy || null,
    status: decision.status || null,
    reason: decision.reason || null,
    changed: decision.changed === true,
    requestedRole: decision.requestedRole || null,
    requestedCanonicalRole: decision.requestedCanonicalRole || null,
    selectedRole: decision.selectedRole || null,
    selectedCanonicalRole: decision.selectedCanonicalRole || null,
    window: decision.window || null,
    signals: decision.signals || [],
    telemetry: decision.telemetry || null,
    selectedEvidence: source.role ? {
      role: source.role,
      id: source.id || null,
      audioHash: source.audioHash || null,
      pathHash: source.pathHash || null,
      activeSeconds: source.activeSeconds,
      activeRatio: source.activeRatio,
      meanRms: source.meanRms,
      meanPeak: source.meanPeak,
      silentContractEligible: source.silentContractEligible === true,
      trust: source.trust || null,
      cueSignals: source.cueSignals || null,
    } : null,
  };
}

function mappingParts(value, fallbackRole = "master") {
  if (typeof value === "string") {
    const parts = value.split(":").map(text).filter(Boolean);
    const signal = text(parts.pop()).toLowerCase();
    return { role: canonicalRole(parts.length ? parts.join(":") : fallbackRole) || "master", signal };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      role: canonicalRole(value.stemFocus || value.stem_focus || fallbackRole) || "master",
      signal: text(value.signal).toLowerCase(),
    };
  }
  return { role: canonicalRole(fallbackRole) || "master", signal: "" };
}

function rewriteMappingRole(value, fallbackRole, selectedRoleFor) {
  if (typeof value === "string") {
    const parts = value.split(":").map(text).filter(Boolean);
    const signal = text(parts.pop()).toLowerCase();
    if (!parts.length) return value;
    return `${selectedRoleFor(parts.join(":"))}:${signal}`;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const explicit = value.stemFocus || value.stem_focus;
    if (!explicit) return value;
    return {
      ...value,
      ...(Object.hasOwn(value, "stemFocus") ? { stemFocus: selectedRoleFor(explicit) } : {}),
      ...(Object.hasOwn(value, "stem_focus") ? { stem_focus: selectedRoleFor(explicit) } : {}),
    };
  }
  return value;
}

function roleSignalMap(card = {}) {
  const portable = card?.visualization?.card || {};
  const defaultRole = portable.stemFocus
    || card?.visualization?.stemFocus
    || card?.parameters?.stemFocus
    || card?.provenance?.stemFocus
    || "master";
  const signalsByRole = new Map();
  const add = (roleValue, signalValue) => {
    const role = canonicalRole(roleValue || defaultRole) || "master";
    const signal = text(signalValue).toLowerCase();
    if (!signal || signal === "off" || signal === "canvas") return;
    if (!signalsByRole.has(role)) signalsByRole.set(role, new Set());
    signalsByRole.get(role).add(signal);
  };
  for (const mapping of Object.values(portable.audioMap || {})) {
    const parsed = mappingParts(mapping, defaultRole);
    add(parsed.role, parsed.signal);
  }
  for (const mapping of Object.values(card?.parameters?.visualizerMappings || {})) {
    const parsed = mappingParts(mapping, defaultRole);
    add(parsed.role, parsed.signal);
  }
  for (const binding of list(portable.automation)) add(binding?.stemFocus || defaultRole, binding?.signal);
  for (const signal of list(portable.audioSignal)) add(defaultRole, signal);
  if (!signalsByRole.size) signalsByRole.set(canonicalRole(defaultRole) || "master", new Set(["rms"]));
  return { defaultRole, signalsByRole };
}

const STEM_BINDING_REQUEST_SCHEMA = "hapa.echo.stem-binding-request.v1";

function restoreLegacyRequestedMapping(value, selectedRole, requestedRole) {
  const selectedCanonical = canonicalRole(selectedRole);
  if (typeof value === "string") {
    const parts = value.split(":").map(text).filter(Boolean);
    const signal = text(parts.pop()).toLowerCase();
    if (!parts.length || canonicalRole(parts.join(":")) !== selectedCanonical) return value;
    return `${directorStemRole(requestedRole)}:${signal}`;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const explicit = value.stemFocus || value.stem_focus;
    if (!explicit || canonicalRole(explicit) !== selectedCanonical) return structuredClone(value);
    return {
      ...structuredClone(value),
      ...(Object.hasOwn(value, "stemFocus") ? { stemFocus: directorStemRole(requestedRole) } : {}),
      ...(Object.hasOwn(value, "stem_focus") ? { stem_focus: directorStemRole(requestedRole) } : {}),
    };
  }
  return value;
}

function stemBindingRequestSnapshot(card = {}) {
  const portable = card?.visualization?.card || {};
  const parameters = card?.parameters || {};
  const selectedDefaultRole = portable.stemFocus
    || card?.visualization?.stemFocus
    || parameters.stemFocus
    || card?.provenance?.stemFocus
    || "master";
  const defaultRole = card?.provenance?.requestedStemFocus || selectedDefaultRole;
  const restore = (value) => restoreLegacyRequestedMapping(value, selectedDefaultRole, defaultRole);
  return {
    schemaVersion: STEM_BINDING_REQUEST_SCHEMA,
    defaultRole: directorStemRole(defaultRole) || "master",
    portableStemFocus: directorStemRole(defaultRole) || "master",
    hasVisualizationStemFocus: Object.hasOwn(card?.visualization || {}, "stemFocus"),
    visualizationStemFocus: directorStemRole(
      canonicalRole(card?.visualization?.stemFocus || selectedDefaultRole) === canonicalRole(selectedDefaultRole)
        ? defaultRole
        : card?.visualization?.stemFocus,
    ) || "master",
    hasParameterStemFocus: Object.hasOwn(parameters, "stemFocus"),
    parameterStemFocus: directorStemRole(
      canonicalRole(parameters.stemFocus || selectedDefaultRole) === canonicalRole(selectedDefaultRole)
        ? defaultRole
        : parameters.stemFocus,
    ) || "master",
    portableAudioMap: Object.fromEntries(Object.entries(portable.audioMap || {}).map(([key, value]) => [key, restore(value)])),
    portableAutomation: list(portable.automation).map((binding) => ({
      ...structuredClone(binding),
      stemFocus: canonicalRole(binding?.stemFocus || selectedDefaultRole) === canonicalRole(selectedDefaultRole)
        ? directorStemRole(defaultRole)
        : binding?.stemFocus,
    })),
    parameterVisualizerMappings: Object.fromEntries(Object.entries(parameters.visualizerMappings || {}).map(([key, value]) => [key, restore(value)])),
  };
}

function requestedCardForStemBinding(card = {}) {
  const stored = card?.provenance?.stemBindingRequest;
  const request = stored?.schemaVersion === STEM_BINDING_REQUEST_SCHEMA
    ? structuredClone(stored)
    : stemBindingRequestSnapshot(card);
  const requested = structuredClone(card);
  const portable = requested?.visualization?.card || {};
  portable.stemFocus = request.portableStemFocus || request.defaultRole;
  portable.audioMap = structuredClone(request.portableAudioMap || {});
  portable.automation = structuredClone(list(request.portableAutomation));
  requested.visualization.card = portable;
  if (request.hasVisualizationStemFocus) requested.visualization.stemFocus = request.visualizationStemFocus || request.defaultRole;
  else delete requested.visualization.stemFocus;
  requested.parameters = {
    ...(requested.parameters || {}),
    visualizerMappings: structuredClone(request.parameterVisualizerMappings || {}),
  };
  if (request.hasParameterStemFocus) requested.parameters.stemFocus = request.parameterStemFocus || request.defaultRole;
  else delete requested.parameters.stemFocus;
  return { request, requested };
}

/**
 * Repair a cloned execution graph from measured telemetry. The persisted edit
 * is never mutated: callers receive a derived graph plus an auditable receipt.
 */
export function repairEchoShowGraphStemBindings(showGraph = {}, {
  telemetry = null,
  telemetrySha256 = null,
  project = {},
  scope = "runtime-execution-graph",
} = {}) {
  if (!showGraph?.tracks || telemetry?.schemaVersion !== "hapa.stem-telemetry-bundle.v1") {
    return { graph: showGraph, changed: false, repairs: [], receipt: null };
  }
  const existingReceipt = showGraph?.directorV2?.runtimeStemBindingRepair;
  const existingStatuses = list(existingReceipt?.decisions).map((entry) => text(entry?.decision?.status || entry?.status));
  const existingBlocked = Math.max(
    Number(existingReceipt?.blockedDecisionCount || 0),
    existingStatuses.filter((status) => status === "blocked" || status.startsWith("blocked-")).length,
  );
  const existingUnmeasured = existingStatuses.filter((status) => status.includes("unmeasured") || status.includes("unverified")).length;
  if (
    existingReceipt?.policy === ECHO_STEM_BINDING_POLICY
    && ["repaired", "verified-no-change"].includes(text(existingReceipt?.status))
    && text(telemetrySha256)
    && text(existingReceipt?.telemetry?.bundleSha256) === text(telemetrySha256)
    && Number(existingReceipt?.decisionCount || 0) === list(existingReceipt?.decisions).length
    && existingBlocked === 0
    && existingUnmeasured === 0
    && Number(showGraph?.stems?.bindingActivity?.blockedCount || 0) === 0
  ) {
    return {
      graph: showGraph,
      changed: false,
      repairs: list(existingReceipt.repairs),
      receipt: existingReceipt,
      reusedCertifiedExecutionGraph: true,
    };
  }
  const graph = structuredClone(showGraph);
  const timeline = project?.music_video_project?.timeline || project?.project?.timeline || project?.timeline || [];
  const allowSilentRoles = explicitEchoAllowSilentRoles({ telemetry, showGraph: graph });
  const availableRoles = list(graph?.stems?.items).map((stem) => stem?.stemType || stem?.role || stem?.title || stem?.id);
  const visualizerTrack = list(graph.tracks).find((track) => track?.role === "visualizer" || ["track-b", "ivf-stack"].includes(track?.id));
  if (!visualizerTrack) return { graph, changed: false, repairs: [], receipt: null };
  const layers = list(graph?.directorV2?.visualizerLayers);
  const layerBySourceCue = new Map(layers.map((layer) => [Number(layer?.sourceCueIndex), layer]));
  const repairs = [];
  const decisionRecords = [];

  for (const card of list(visualizerTrack.cards)) {
    if (card?.knockedOut || !card?.visualization) continue;
    const startSeconds = finite(card.startSeconds, 0);
    const endSeconds = finite(card.endSeconds, startSeconds);
    if (!(endSeconds > startSeconds)) continue;
    // A derived graph may be re-audited after the telemetry/analyzer changes.
    // Always score the immutable editorial request snapshot, never the prior
    // repair's selected roles, so T1 -> T2 produces the same result as a fresh
    // canonical graph audited directly against T2.
    const { request, requested } = requestedCardForStemBinding(card);
    const { defaultRole, signalsByRole } = roleSignalMap(requested);
    const decisions = [...signalsByRole.entries()].map(([requestedCanonicalRole, signalSet]) => selectEchoActiveStemBinding({
      telemetry,
      requestedRole: directorStemRole(requestedCanonicalRole),
      startSeconds,
      endSeconds,
      signals: [...signalSet],
      declaredActiveRoles: declaredEchoStemRolesForWindow(timeline, startSeconds, endSeconds),
      availableRoles,
      availableStemSources: list(graph?.stems?.items),
      allowSilentRoles,
      allowMasterFallback: true,
    }));
    const decisionsByRole = new Map(decisions.map((decision) => [decision.requestedCanonicalRole, decision]));
    const selectedRoleFor = (value) => {
      const canonical = canonicalRole(value || defaultRole) || "master";
      return decisionsByRole.get(canonical)?.selectedRole || directorStemRole(value || defaultRole) || "master";
    };
    const primary = decisionsByRole.get(canonicalRole(defaultRole) || "master") || decisions[0];
    const changedDecisions = decisions.filter((decision) => decision.changed);
    const compactDecisions = decisions.map(compactEchoStemBindingDecision);
    decisionRecords.push(...compactDecisions.map((decision) => ({
      cardId: text(card.id),
      sourceCueIndex: Number.isFinite(Number(card.sourceCueIndex)) ? Number(card.sourceCueIndex) : null,
      startSeconds,
      endSeconds,
      decision,
    })));
    const portable = card.visualization.card || {};
    const originalDefaultRole = directorStemRole(defaultRole) || "master";
    const selectedDefaultRole = selectedRoleFor(defaultRole);
    portable.stemFocus = selectedDefaultRole;
    portable.audioMap = Object.fromEntries(Object.entries(request.portableAudioMap || {}).map(([uniform, mapping]) => [
      uniform,
      rewriteMappingRole(mapping, defaultRole, selectedRoleFor),
    ]));
    portable.automation = list(request.portableAutomation).map((binding) => ({
      ...binding,
      stemFocus: selectedRoleFor(binding?.stemFocus || defaultRole),
    }));
    portable.provenance = {
      ...(portable.provenance || {}),
      stemBindingDecision: compactEchoStemBindingDecision(primary),
      stemBindingDecisions: compactDecisions,
    };
    card.visualization.card = portable;
    if (request.hasVisualizationStemFocus) card.visualization.stemFocus = selectedDefaultRole;
    else delete card.visualization.stemFocus;
    card.visualization.stemBinding = compactEchoStemBindingDecision(primary);
    card.visualization.stemBindingDecisions = compactDecisions;
    card.parameters = {
      ...(card.parameters || {}),
      ...(request.hasParameterStemFocus ? { stemFocus: selectedDefaultRole } : {}),
      visualizerMappings: Object.fromEntries(Object.entries(request.parameterVisualizerMappings || {}).map(([uniform, mapping]) => [
        uniform,
        rewriteMappingRole(mapping, defaultRole, selectedRoleFor),
      ])),
    };
    card.provenance = {
      ...(card.provenance || {}),
      requestedStemFocus: text(card?.provenance?.requestedStemFocus) || originalDefaultRole,
      stemBindingRequest: request,
      stemFocus: selectedDefaultRole,
      stemBindingStatus: primary?.status || "retained-unmeasured",
      stemBindingReason: primary?.reason || "verified-window-activity-unavailable",
      stemBindingPolicy: primary?.policy || ECHO_STEM_BINDING_POLICY,
      stemTelemetryAnalysisVersion: text(telemetry?.analysisVersion),
      stemTelemetrySelectedAudioHash: text(primary?.selectedEvidence?.audioHash),
    };
    card.executionReceipt = {
      ...(card.executionReceipt || {}),
      stemBinding: compactEchoStemBindingDecision(primary),
      stemBindingDecisions: compactDecisions,
    };

    const layer = layerBySourceCue.get(Number(card.sourceCueIndex));
    if (layer) {
      layer.requestedStemFocus = layer.requestedStemFocus || originalDefaultRole;
      layer.stemFocus = selectedDefaultRole;
      layer.stemBinding = primary;
      layer.portableCard = structuredClone(portable);
      layer.requestedAudioMap = layer.requestedAudioMap || structuredClone(layer.audioMap || {});
      layer.audioMap = Object.fromEntries(Object.entries(layer.requestedAudioMap || {}).map(([uniform, mapping]) => [
        uniform,
        rewriteMappingRole(mapping, defaultRole, selectedRoleFor),
      ]));
      for (const binding of list(graph?.directorV2?.modulationBindings)) {
        if (binding?.target?.visualizerId !== layer.id || binding?.source?.kind !== "stem_signal") continue;
        binding.source.requestedStemFocus = binding.source.requestedStemFocus || binding.source.stemFocus || defaultRole;
        binding.source.stemFocus = selectedRoleFor(binding.source.requestedStemFocus);
      }
    }
    if (changedDecisions.length) repairs.push({
      cardId: text(card.id),
      sourceCueIndex: Number.isFinite(Number(card.sourceCueIndex)) ? Number(card.sourceCueIndex) : null,
      startSeconds,
      endSeconds,
      decisions: changedDecisions.map(compactEchoStemBindingDecision),
    });
  }

  const blockedDecisions = decisionRecords.filter(({ decision }) => text(decision?.status).startsWith("blocked-"));
  const receipt = {
    schemaVersion: "hapa.echo.runtime-stem-binding-repair.v1",
    scope,
    status: blockedDecisions.length ? "blocked" : repairs.length ? "repaired" : "verified-no-change",
    nonDestructiveStoredEdit: true,
    policy: ECHO_STEM_BINDING_POLICY,
    telemetry: {
      schemaVersion: text(telemetry?.schemaVersion),
      analysisVersion: text(telemetry?.analysisVersion),
      truthStatus: text(telemetry?.truthStatus),
      fps: finite(telemetry?.fps),
      bundleSha256: text(telemetrySha256) || null,
    },
    decisionCount: decisionRecords.length,
    repairedCardCount: repairs.length,
    blockedDecisionCount: blockedDecisions.length,
    decisions: decisionRecords,
    repairs,
  };
  const cardsBySourceCue = new Map(list(visualizerTrack.cards).map((card) => [Number(card?.sourceCueIndex), card]));
  graph.directorV2 = {
    ...(graph.directorV2 || {}),
    visualizerLayers: layers,
    stemBindingDecisions: layers.map((layer) => ({
      visualizerId: layer?.id || null,
      sourceCueIndex: Number.isFinite(Number(layer?.sourceCueIndex)) ? Number(layer.sourceCueIndex) : null,
      startSeconds: finite(layer?.startSeconds),
      endSeconds: finite(layer?.endSeconds),
      decision: compactEchoStemBindingDecision(layer?.stemBinding || {}),
    })),
    visualizerReceipts: list(graph?.directorV2?.visualizerReceipts).map((visualizerReceipt) => {
      const card = cardsBySourceCue.get(Number(visualizerReceipt?.sourceCueIndex));
      return card?.executionReceipt
        ? { ...visualizerReceipt, ...structuredClone(card.executionReceipt) }
        : visualizerReceipt;
    }),
    runtimeStemBindingRepair: receipt,
  };
  graph.stems = {
    ...(graph.stems || {}),
    bindingActivity: {
      policy: ECHO_STEM_BINDING_POLICY,
      telemetry: receipt.telemetry,
      decisionCount: decisionRecords.length,
      repairedCount: repairs.length,
      blockedCount: blockedDecisions.length,
    },
  };
  return { graph, changed: repairs.length > 0, repairs, receipt };
}
