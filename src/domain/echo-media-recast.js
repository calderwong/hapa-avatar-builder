import { generateEchoHyperframeScript } from "./echo-hyperframe-script.js";
import { hasHapaDevProtoOrigin } from "./builder-direction-candidates.js";

export const SCROLL_FAL_DIRECTION_VARIANT_ID = "scroll-fal-authored-v1";
export const SCROLL_FAL_DIRECTION_VARIANT_VERSION = "hapa.echo.direction-script-variant.v1";
export const SCROLL_SCENE_AVATAR_BALANCED_VARIANT_ID = "scroll-scene-avatar-balanced-v1";
export const BALANCED_RECAST_SELECTION_MODE = "balanced-source-variety";
export const WIDE_COVERAGE_VARIATION_SET_ID = "wide-coverage-density-v1";
export const WIDE_COVERAGE_DENSITY_PROFILES = Object.freeze([
  Object.freeze({ id: "airy", label: "Airy", targetVideoRatio: 0.45, ordinal: 1 }),
  Object.freeze({ id: "rhythmic", label: "Rhythmic", targetVideoRatio: 0.7, ordinal: 2 }),
  Object.freeze({ id: "dense", label: "Dense", targetVideoRatio: 0.92, ordinal: 3 }),
]);

const DEFAULT_FORBIDDEN = ["hell week", "hell-week", "hapa-dev-proto", "hapa_dev_proto", "ltx"];
const BALANCED_SOURCE_GROUPS = ["scroll", "scene", "avatar"];

function stableNumber(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function withoutForbidden(values = [], forbidden = DEFAULT_FORBIDDEN) {
  return list(values).filter((value) => {
    const text = String(value).toLowerCase();
    return !forbidden.some((marker) => text.includes(String(marker).toLowerCase()));
  });
}

function candidateText(candidate = {}) {
  return [
    candidate.id,
    candidate.cardId,
    candidate.title,
    candidate.uri,
    candidate.runtimeUri,
    candidate.posterUri,
    candidate.sourcePath,
    candidate.cohort,
    ...(candidate.tags || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function isDirectorMediaAllowed(candidate = {}, policy = {}) {
  const forbidden = list(policy.forbiddenMarkers).length ? policy.forbiddenMarkers : DEFAULT_FORBIDDEN;
  const allowedCohorts = new Set(list(policy.allowedCohorts).length ? policy.allowedCohorts : ["root", "fal-second-cohort"]);
  const text = candidateText(candidate);
  return Boolean(
    candidate.id &&
    candidate.uri &&
    candidate.autoEligible !== false &&
    allowedCohorts.has(candidate.cohort) &&
    !forbidden.some((marker) => text.includes(String(marker).toLowerCase()))
  );
}

export function buildScrollSiteDirectorCandidates(entries = [], policy = {}) {
  return list(entries)
    .filter((entry) => isDirectorMediaAllowed(entry, policy))
    .map((entry, index) => ({
      ...entry,
      routeOrder: finite(entry.routeOrder, index),
      analyzerRole: entry.analyzerRole === "loop" ? "loop" : "transition",
      authoredRoles: list(entry.authoredRoles),
    }))
    .sort((a, b) => a.routeOrder - b.routeOrder || String(a.id).localeCompare(String(b.id)));
}

function normalizeSourceGroup(candidate = {}) {
  const source = String(candidate.sourceGroup || candidate.sourceFamily || "").trim().toLowerCase();
  if (source === "scroll" || source.includes("scroll") || source.includes("fal")) return "scroll";
  if (source === "scene" || source.includes("scene")) return "scene";
  if (source === "avatar" || source.includes("avatar")) return "avatar";
  const cohort = String(candidate.cohort || "").trim().toLowerCase();
  if (cohort === "root" || cohort.includes("fal") || cohort.includes("scroll")) return "scroll";
  if (cohort.includes("scene")) return "scene";
  if (cohort.includes("avatar")) return "avatar";
  return "";
}

function provenanceReferences(candidate = {}) {
  const roots = [
    candidate.origin,
    candidate.provenance,
    candidate.sourceProvenance,
    candidate.cardOrigin,
    candidate.hapaOrigin,
  ].filter(Boolean);
  const sourceKeys = new Set([
    "source", "sourceSystem", "cardSourceSystem", "adapterId", "sourceAdapter",
    "sourceRepo", "sourceRepository", "sourceNode", "sourcePath", "targetPath", "originalPath",
  ]);
  const nestedKeys = new Set([
    "origin", "provenance", "sourceProvenance", "cardOrigin", "hapaOrigin",
    "records", "folderIngest", "storage",
  ]);
  const references = [];
  const visited = new Set();
  const queue = [...roots];
  while (queue.length && references.length < 24) {
    const value = queue.shift();
    if (value === null || value === undefined) continue;
    if (typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) queue.push(...value);
    else {
      for (const [key, nested] of Object.entries(value)) {
        if (sourceKeys.has(key)) {
          const values = Array.isArray(nested) ? nested : [nested];
          for (const entry of values) {
            if (!["string", "number", "boolean"].includes(typeof entry)) continue;
            const text = String(entry).trim();
            if (text && text.length <= 240 && !references.includes(text)) references.push(text);
          }
        }
        if (nestedKeys.has(key)) queue.push(nested);
      }
    }
  }
  return references;
}

function normalizedMotionRole(candidate = {}) {
  const explicit = String(candidate.motionRole || "").trim().toLowerCase();
  if (["loop", "transition", "neutral"].includes(explicit)) return explicit;
  const analyzer = String(candidate.analyzerRole || "").trim().toLowerCase();
  if (analyzer === "loop" || candidate.authoredUse === "hold") return "loop";
  if (analyzer === "transition" || candidate.authoredUse === "connector") return "transition";
  return "neutral";
}

function technicalIdentity(candidate = {}) {
  return String(
    candidate.technicalIdentity
      || (candidate.sha256 ? `sha256:${candidate.sha256}` : "")
      || candidate.runtimeUri
      || candidate.uri
      || candidate.id
      || "",
  ).toLowerCase();
}

/**
 * Mixed-library eligibility is intentionally asymmetric: the approved Scroll/FAL
 * cohort keeps its existing allowlist, while native Builder media is rejected for
 * hapa-dev-proto only when explicit origin/provenance says it came from there.
 */
export function isBalancedDirectorMediaAllowed(candidate = {}, policy = {}) {
  const sourceGroup = normalizeSourceGroup(candidate);
  const allowedSourceGroups = new Set(list(policy.allowedSourceGroups).length
    ? policy.allowedSourceGroups
    : BALANCED_SOURCE_GROUPS);
  if (!candidate.id || !candidate.uri || candidate.autoEligible === false || !allowedSourceGroups.has(sourceGroup)) return false;
  if (hasHapaDevProtoOrigin(
    candidate.origin,
    candidate.provenance,
    candidate.sourceProvenance,
    candidate.cardOrigin,
    candidate.hapaOrigin,
  )) return false;
  if (sourceGroup === "scroll") {
    return isDirectorMediaAllowed(candidate, {
      allowedCohorts: policy.allowedScrollCohorts || policy.allowedCohorts,
      forbiddenMarkers: policy.scrollForbiddenMarkers || policy.forbiddenMarkers,
    });
  }
  return true;
}

export function buildBalancedDirectorCandidates(entries = [], policy = {}) {
  return list(entries)
    .filter((entry) => isBalancedDirectorMediaAllowed(entry, policy))
    .map((entry, index) => {
      const motionRole = normalizedMotionRole(entry);
      return {
        ...entry,
        sourceGroup: normalizeSourceGroup(entry),
        routeOrder: finite(entry.routeOrder, index),
        analyzerRole: motionRole === "loop" ? "loop" : "transition",
        motionRole,
        authoredRoles: list(entry.authoredRoles),
        technicalIdentity: technicalIdentity(entry),
      };
    })
    .filter((entry) => entry.authoredUse !== "card-overlay")
    .sort((a, b) => BALANCED_SOURCE_GROUPS.indexOf(a.sourceGroup) - BALANCED_SOURCE_GROUPS.indexOf(b.sourceGroup)
      || a.routeOrder - b.routeOrder
      || String(a.id).localeCompare(String(b.id)));
}

function isLowEnergyShot(shot = {}) {
  const section = String(shot.section_type || shot.section_id || "").toLowerCase();
  if (/intro|outro|ringout|bridge|interlude/.test(section)) return true;
  const stems = new Set(list(shot.active_stems).map((stem) => String(stem).toLowerCase()));
  const rhythmic = ["drums", "percussion", "bass"].some((stem) => stems.has(stem));
  const melodic = ["vocals", "keyboard", "piano", "strings", "synth"].some((stem) => stems.has(stem));
  return melodic && !rhythmic;
}

function shotHasMedia(shot = {}) {
  return Boolean(
    shot?.media_uri
    || shot?.runtime_media_uri
    || shot?.media_contract?.originalUri
    || shot?.media_contract?.runtimeUri
    || (shot?.media_id && shot.media_id !== "none")
  ) && shot?.media_id !== "none";
}

function shotDurationSeconds(shot = {}) {
  const start = finite(shot.start_sec, 0);
  return Math.max(0, finite(shot.end_sec, start) - start);
}

function normalizedDensityLock(shot = {}) {
  const value = String(shot.density_lock || shot.video_density_lock || "").trim().toLowerCase();
  if (["video", "media", "on"].includes(value)) return "video";
  if (["visualizer", "ivf", "shader", "off"].includes(value)) return "visualizer";
  return "";
}

function visualizerFullyCoversShot(shot = {}, visualizerTimeline = []) {
  const start = finite(shot.start_sec, 0);
  const end = finite(shot.end_sec, start);
  if (end <= start) return true;
  const intervals = list(visualizerTimeline)
    .filter((cue) => String(cue?.visualizer_id || "").toLowerCase() !== "none")
    .map((cue) => ({
      start: finite(cue.start_sec, 0),
      end: finite(cue.end_sec, finite(cue.start_sec, 0)),
    }))
    .filter((cue) => cue.end > start && cue.start < end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = start;
  for (const interval of intervals) {
    if (interval.start > cursor + 0.02) return false;
    cursor = Math.max(cursor, interval.end);
    if (cursor >= end - 0.02) return true;
  }
  return cursor >= end - 0.02;
}

function shotEnergyScore(shot = {}) {
  const section = String(shot.section_type || shot.section_id || "").toLowerCase();
  const stems = new Set(list(shot.active_stems).map((stem) => String(stem).toLowerCase()));
  let score = Math.min(1.5, stems.size * 0.18);
  if (["drums", "percussion", "bass"].some((stem) => stems.has(stem))) score += 0.65;
  if (["vocals", "lead", "guitar", "synth"].some((stem) => stems.has(stem))) score += 0.25;
  if (/chorus|hook|drop|climax|finale/.test(section)) score += 0.75;
  if (/intro|outro|ringout|interlude/.test(section)) score -= 0.25;
  score += Math.min(0.65, Math.max(0, finite(shot.camera_intensity, 0)) * 0.18);
  if (/flicker|flash|glitch|hard|smash/.test(String(shot.transition || "").toLowerCase())) score += 0.2;
  return Math.max(0, score);
}

function densityProfileList(profiles = WIDE_COVERAGE_DENSITY_PROFILES) {
  return list(profiles)
    .map((profile, index) => ({
      id: String(profile.id || `density-${index + 1}`),
      label: String(profile.label || profile.id || `Density ${index + 1}`),
      targetVideoRatio: Math.min(1, Math.max(0, finite(profile.targetVideoRatio, 0))),
      ordinal: finite(profile.ordinal, index + 1),
    }))
    .sort((a, b) => a.targetVideoRatio - b.targetVideoRatio || a.ordinal - b.ordinal);
}

/**
 * Build one deterministic album-director density order and take nested prefixes
 * for every requested profile. The expensive musical direction stays inherited;
 * this pass only decides which inherited shot windows carry video versus IVF.
 */
export function buildDirectorDensityPlan(project = {}, options = {}) {
  const timeline = list(project.timeline);
  if (!timeline.length) throw new Error("Cannot build a director density plan for an empty timeline.");
  const profiles = densityProfileList(options.profiles);
  const seed = options.seed || `${project.song_id || "song"}:${WIDE_COVERAGE_VARIATION_SET_ID}:density-plan`;
  const visualizerTimeline = list(project.visualizer_timeline);
  const totalSeconds = timeline.reduce((sum, shot) => sum + shotDurationSeconds(shot), 0);
  const songStart = Math.min(...timeline.map((shot) => finite(shot.start_sec, 0)));
  const songEnd = Math.max(...timeline.map((shot) => finite(shot.end_sec, finite(shot.start_sec, 0))));
  const songSpan = Math.max(0.001, songEnd - songStart);
  const lockedVideo = new Set();
  const lockedVisualizer = new Set();
  timeline.forEach((shot, index) => {
    const lock = normalizedDensityLock(shot);
    if (lock === "video") lockedVideo.add(index);
    if (lock === "visualizer") lockedVisualizer.add(index);
  });
  if (options.frameWithVideo !== false) {
    if (!lockedVisualizer.has(0)) lockedVideo.add(0);
    if (!lockedVisualizer.has(timeline.length - 1)) lockedVideo.add(timeline.length - 1);
  }
  for (const index of lockedVideo) {
    if (lockedVisualizer.has(index)) throw new Error(`Shot ${index} has conflicting video and visualizer density locks.`);
  }

  const additions = [];
  const anchors = new Set(lockedVideo);
  const remaining = new Set(timeline.map((_, index) => index).filter((index) => (
    !lockedVideo.has(index) && !lockedVisualizer.has(index)
  )));
  while (remaining.size) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (const index of remaining) {
      const shot = timeline[index];
      const center = (finite(shot.start_sec, 0) + finite(shot.end_sec, finite(shot.start_sec, 0))) / 2;
      const distance = anchors.size
        ? Math.min(...[...anchors].map((anchorIndex) => {
          const anchor = timeline[anchorIndex];
          const anchorCenter = (finite(anchor.start_sec, 0) + finite(anchor.end_sec, finite(anchor.start_sec, 0))) / 2;
          return Math.abs(center - anchorCenter) / songSpan;
        }))
        : 1;
      const energy = Math.min(1, shotEnergyScore(shot) / 3);
      const inherited = shotHasMedia(shot) ? 1 : 0;
      const jitter = stableNumber(`${seed}:density-order:${index}`) / 0xffffffff;
      const score = distance * 0.62 + energy * 0.29 + inherited * 0.04 + jitter * 0.05;
      if (score > bestScore || (score === bestScore && index < bestIndex)) {
        bestScore = score;
        bestIndex = index;
      }
    }
    additions.push(bestIndex);
    anchors.add(bestIndex);
    remaining.delete(bestIndex);
  }

  const durationFor = (indices) => [...indices].reduce((sum, index) => sum + shotDurationSeconds(timeline[index]), 0);
  const profilePlans = [];
  let previousCount = lockedVideo.size;
  for (const profile of profiles) {
    let bestCount = previousCount;
    let bestDistance = Infinity;
    const maxCount = profile.targetVideoRatio < 1 && timeline.length > 1
      ? Math.min(timeline.length - 1, lockedVideo.size + additions.length)
      : lockedVideo.size + additions.length;
    const minimumCount = Math.min(maxCount, Math.max(previousCount, Math.min(3, timeline.length)));
    for (let count = minimumCount; count <= maxCount; count += 1) {
      const indices = new Set([...lockedVideo, ...additions.slice(0, Math.max(0, count - lockedVideo.size))]);
      const ratio = totalSeconds > 0 ? durationFor(indices) / totalSeconds : indices.size / timeline.length;
      const distance = Math.abs(ratio - profile.targetVideoRatio);
      if (distance < bestDistance || (distance === bestDistance && count < bestCount)) {
        bestDistance = distance;
        bestCount = count;
      }
    }
    bestCount = Math.max(previousCount, bestCount);
    const selected = new Set([...lockedVideo, ...additions.slice(0, Math.max(0, bestCount - lockedVideo.size))]);
    for (const index of lockedVisualizer) selected.delete(index);
    const uncovered = timeline
      .map((shot, index) => ({ shot, index }))
      .filter(({ index }) => !selected.has(index))
      .filter(({ shot }) => !visualizerFullyCoversShot(shot, visualizerTimeline));
    if (uncovered.length && options.requireVisualizerCoverage !== false) {
      throw new Error(`Density profile ${profile.id} would expose ${uncovered.length} shot window(s) without full visualizer coverage: ${uncovered.slice(0, 8).map(({ index }) => index).join(", ")}.`);
    }
    const videoSeconds = durationFor(selected);
    profilePlans.push({
      ...profile,
      mediaShotIndices: [...selected].sort((a, b) => a - b),
      mediaBearingShots: selected.size,
      visualizerOnlyShots: timeline.length - selected.size,
      videoSeconds,
      visualizerSeconds: Math.max(0, totalSeconds - videoSeconds),
      actualVideoRatio: totalSeconds > 0 ? videoSeconds / totalSeconds : selected.size / timeline.length,
      actualShotRatio: selected.size / timeline.length,
      fullyCoveredVisualizerShots: timeline.length - selected.size - uncovered.length,
    });
    previousCount = bestCount;
  }
  return {
    schemaVersion: "hapa.echo.director-density-plan.v1",
    seed,
    totalShots: timeline.length,
    totalSeconds,
    ordering: [...lockedVideo].sort((a, b) => a - b).concat(additions),
    lockedVideoShotIndices: [...lockedVideo].sort((a, b) => a - b),
    lockedVisualizerShotIndices: [...lockedVisualizer].sort((a, b) => a - b),
    profiles: profilePlans,
  };
}

function deterministicShuffle(candidates = [], seed = "") {
  return [...candidates].sort((a, b) => {
    const aScore = stableNumber(`${seed}:${technicalIdentity(a)}:${a.id}`);
    const bScore = stableNumber(`${seed}:${technicalIdentity(b)}:${b.id}`);
    return aScore - bScore || a.routeOrder - b.routeOrder || String(a.id).localeCompare(String(b.id));
  });
}

function usageCount(state, candidate = {}) {
  return state.sharedUsageCounts instanceof Map
    ? finite(state.sharedUsageCounts.get(technicalIdentity(candidate)), 0)
    : 0;
}

function candidateCardKey(candidate = {}) {
  return String(candidate.cardId || `${normalizeSourceGroup(candidate)}:${candidate.ownerId || candidate.id || "unknown"}`);
}

function cardUsageCount(state, candidate = {}) {
  return state.sharedCardUsageCounts instanceof Map
    ? finite(state.sharedCardUsageCounts.get(candidateCardKey(candidate)), 0)
    : 0;
}

function refillBalancedBag(state, sourceGroup) {
  const bag = state.bags[sourceGroup];
  if (bag.remaining.length) return bag;
  bag.pass += 1;
  const shuffled = deterministicShuffle(bag.candidates, `${state.seed}:${sourceGroup}:bag:${bag.pass}`);
  const shuffleRank = new Map(shuffled.map((candidate, index) => [technicalIdentity(candidate), index]));
  bag.remaining = state.sharedUsageCounts instanceof Map
    ? shuffled.sort((a, b) => usageCount(state, a) - usageCount(state, b)
      || finite(shuffleRank.get(technicalIdentity(a)), 0) - finite(shuffleRank.get(technicalIdentity(b)), 0))
    : shuffled;
  bag.currentPassUsed = false;
  return bag;
}

function preferredRoleForShot(shot = {}) {
  return isLowEnergyShot(shot)
    ? { energyBand: "low", role: "loop" }
    : { energyBand: "high", role: "transition" };
}

function chooseBalancedCandidate(state, shot = {}) {
  const preferredSource = state.sourcePattern[state.sourceCursor % state.sourcePattern.length];
  state.sourceCursor += 1;
  const sourceOrder = [preferredSource, ...state.sourceGroups.filter((sourceGroup) => sourceGroup !== preferredSource)];
  for (const sourceGroup of sourceOrder) refillBalancedBag(state, sourceGroup);

  const groupWithFreshIdentity = sourceOrder.find((sourceGroup) => (
    state.bags[sourceGroup].remaining.some((candidate) => technicalIdentity(candidate) !== state.lastTechnicalIdentity)
  ));
  const sourceGroup = groupWithFreshIdentity || sourceOrder[0];

  const bag = state.bags[sourceGroup];
  const nonRepeating = bag.remaining.filter((candidate) => technicalIdentity(candidate) !== state.lastTechnicalIdentity);
  const eligible = nonRepeating.length ? nonRepeating : bag.remaining;
  const preference = preferredRoleForShot(shot);
  const leastUsage = state.sharedUsageCounts instanceof Map
    ? Math.min(...eligible.map((candidate) => usageCount(state, candidate)))
    : null;
  const coveragePool = leastUsage === null
    ? eligible
    : eligible.filter((candidate) => usageCount(state, candidate) === leastUsage);
  const roleMatches = coveragePool.filter((candidate) => candidate.motionRole === preference.role);
  let candidate;
  if (state.sharedUsageCounts instanceof Map) {
    candidate = [...coveragePool].sort((a, b) => {
      const aCard = candidateCardKey(a);
      const bCard = candidateCardKey(b);
      const aRecent = state.recentCardIds.includes(aCard) ? 1 : 0;
      const bRecent = state.recentCardIds.includes(bCard) ? 1 : 0;
      const aCurrent = finite(state.currentCardUsage.get(aCard), 0);
      const bCurrent = finite(state.currentCardUsage.get(bCard), 0);
      const aGlobal = cardUsageCount(state, a);
      const bGlobal = cardUsageCount(state, b);
      const aRolePenalty = a.motionRole === preference.role ? 0 : a.motionRole === "neutral" ? 1 : 2;
      const bRolePenalty = b.motionRole === preference.role ? 0 : b.motionRole === "neutral" ? 1 : 2;
      return aRecent - bRecent
        || aCurrent - bCurrent
        || aGlobal - bGlobal
        || aRolePenalty - bRolePenalty
        || bag.remaining.indexOf(a) - bag.remaining.indexOf(b);
    })[0];
  } else {
    candidate = roleMatches[0] || coveragePool[0] || eligible[0];
  }
  if (!candidate) throw new Error(`No balanced director candidate remained for ${sourceGroup}.`);
  if (technicalIdentity(candidate) === state.lastTechnicalIdentity) {
    throw new Error("Balanced director selection cannot satisfy the no-immediate-repeat contract with the supplied candidates.");
  }
  const selectedIndex = bag.remaining.indexOf(candidate);
  bag.remaining.splice(selectedIndex, 1);
  if (!bag.currentPassUsed) {
    bag.usedPasses += 1;
    bag.currentPassUsed = true;
  }

  const rolePreferenceHit = candidate.motionRole === preference.role;
  const priorAlbumUsage = usageCount(state, candidate);
  const cardKey = candidateCardKey(candidate);
  const priorAlbumCardUsage = cardUsageCount(state, candidate);
  if (state.sharedUsageCounts instanceof Map) {
    state.sharedUsageCounts.set(technicalIdentity(candidate), priorAlbumUsage + 1);
  }
  if (state.sharedCardUsageCounts instanceof Map) {
    state.sharedCardUsageCounts.set(cardKey, priorAlbumCardUsage + 1);
  }
  state.currentCardUsage.set(cardKey, finite(state.currentCardUsage.get(cardKey), 0) + 1);
  const selection = {
    candidate,
    sourceGroup,
    energyBand: preference.energyBand,
    preferredRole: preference.role,
    rolePreferenceAvailable: roleMatches.length > 0,
    rolePreferenceHit,
    priorAlbumUsage,
    albumUsageAfter: priorAlbumUsage + 1,
    priorAlbumCardUsage,
    albumCardUsageAfter: priorAlbumCardUsage + 1,
    coveragePriorityHit: leastUsage === null || priorAlbumUsage === leastUsage,
    coverageLedgerActive: state.sharedUsageCounts instanceof Map,
    shuffleBagPass: bag.pass + 1,
    strategy: rolePreferenceHit
      ? `${state.sharedUsageCounts instanceof Map ? "least-used-" : ""}balanced-${sourceGroup}-${preference.role}-shuffle-bag`
      : `${state.sharedUsageCounts instanceof Map ? "least-used-" : ""}balanced-${sourceGroup}-coverage-shuffle-bag`,
  };
  state.lastTechnicalIdentity = technicalIdentity(candidate);
  state.lastSourceGroup = sourceGroup;
  state.lastCardId = cardKey;
  state.recentCardIds = [...state.recentCardIds.filter((value) => value !== cardKey), cardKey].slice(-6);
  return selection;
}

function chooseCandidate(candidates, state, shot, shotIndex) {
  const routeCandidates = candidates.filter((candidate) => candidate.authoredUse !== "card-overlay");
  const loops = routeCandidates.filter((candidate) => candidate.analyzerRole === "loop" || candidate.authoredUse === "hold");
  const transitions = routeCandidates.filter((candidate) => candidate.analyzerRole === "transition" || candidate.authoredUse === "connector");
  const lowEnergy = isLowEnergyShot(shot);

  if (lowEnergy && loops.length && (shotIndex === 0 || shotIndex % 4 === 0)) {
    const loop = loops[(state.loopCursor + stableNumber(`${state.seed}:${shot.section_id || ""}`)) % loops.length];
    state.loopCursor += 1;
    return { candidate: loop, strategy: "authored-hold-for-low-energy-section" };
  }

  const pool = transitions.length ? transitions : routeCandidates;
  const candidate = pool[state.routeCursor % pool.length];
  state.routeCursor += 1;
  return { candidate, strategy: "authored-continuity-route" };
}

function recastShot(shot = {}, candidate = {}, evidence = {}) {
  const start = finite(shot.start_sec, 0);
  const end = finite(shot.end_sec, start);
  const duration = Math.max(0, end - start);
  const sourceDuration = finite(candidate.duration, 0);
  const playbackMode = sourceDuration > 0 && sourceDuration + 0.08 >= duration ? "once" : "loop";
  const preserved = { ...shot };
  for (const key of [
    "media_id", "media_title", "media_uri", "media_thumbnail", "runtime_media_uri",
    "media_contract", "semantic_casting", "decision_evidence", "edit_reason",
  ]) delete preserved[key];

  return {
    ...preserved,
    media_id: candidate.mediaLibraryId || candidate.id,
    media_card_id: candidate.cardId || "",
    media_title: candidate.title || candidate.id,
    media_uri: candidate.uri,
    media_thumbnail: candidate.posterUri || "",
    runtime_media_uri: candidate.runtimeUri || candidate.uri,
    media_contract: {
      schemaVersion: "hapa.echo.playback-media.v2",
      type: "video",
      originalUri: candidate.uri,
      runtimeUri: candidate.runtimeUri || candidate.uri,
      sourceInSeconds: 0,
      sourceOutSeconds: sourceDuration || duration,
      actualDurationSeconds: sourceDuration || duration,
      playbackMode,
      mimeType: "video/mp4",
      dimensions: {
        width: finite(candidate.width, 0) || null,
        height: finite(candidate.height, 0) || null,
        maxDimension: Math.max(finite(candidate.width, 0), finite(candidate.height, 0)) || null,
      },
      contentHash: candidate.sha256 || "",
      proxy: candidate.runtimeUri && candidate.runtimeUri !== candidate.uri ? {
        status: "ready",
        uri: candidate.runtimeUri,
        source: "scroll-site-authored-desktop-proxy",
      } : { status: "source-direct" },
      fallback: { status: "standby", mode: "ivf" },
      posterUri: candidate.posterUri || "",
      preloadPriority: "current",
      durationCoverage: {
        status: sourceDuration > 0 ? "measured" : "unknown",
        cueSeconds: duration,
        sourceSeconds: sourceDuration || null,
      },
    },
    edit_reason: `${evidence.strategy}; source meaning is authored only where the Scroll Site manifest says so.`,
    decision_evidence: {
      schemaVersion: "hapa.echo.shot-decision-evidence.v3",
      truthStatus: "authored-route-plus-technical-fit",
      candidateId: candidate.id,
      cardId: candidate.cardId || "",
      contentHash: candidate.sha256 || "",
      cohort: candidate.cohort,
      analyzerRole: candidate.analyzerRole,
      analyzerConfidence: candidate.analyzerConfidence || "",
      authoredUse: candidate.authoredUse || "",
      authoredRoles: withoutForbidden(candidate.authoredRoles),
      selectionStrategy: evidence.strategy,
      semanticMusicMatch: {
        value: null,
        basis: "not-claimed; preserved song timing/stems/camera plus authored visual route",
      },
      preservedDirection: {
        timing: true,
        stems: true,
        audioBindings: true,
        camera: true,
        transition: true,
      },
    },
  };
}

function recastBalancedShot(shot = {}, candidate = {}, evidence = {}) {
  const recast = recastShot(shot, candidate, evidence);
  const sourceGroup = normalizeSourceGroup(candidate);
  return {
    ...recast,
    media_card_kind: candidate.cardKind || sourceGroup,
    media_card_ref: candidate.cardRef || "",
    media_card_title: candidate.cardTitle || "",
    media_source_group: sourceGroup,
    media_technical_identity: technicalIdentity(candidate),
    media_contract: {
      ...recast.media_contract,
      proxy: candidate.runtimeUri && candidate.runtimeUri !== candidate.uri ? {
        status: "ready",
        uri: candidate.runtimeUri,
        source: `hapa-${sourceGroup}-director-proxy`,
      } : { status: "source-direct" },
    },
    edit_reason: `${evidence.strategy}; deterministic source rotation and shuffle-bag coverage preserve the inherited timing, stems, camera, and transitions.`,
    decision_evidence: {
      ...recast.decision_evidence,
      truthStatus: "balanced-source-plus-technical-fit",
      sourceGroup,
      technicalIdentity: technicalIdentity(candidate),
      motionRole: candidate.motionRole,
      selectionStrategy: evidence.strategy,
      energyRolePreference: {
        energyBand: evidence.energyBand,
        preferredRole: evidence.preferredRole,
        selectedRole: candidate.motionRole,
        hit: evidence.rolePreferenceHit,
      },
      sourceEvidence: {
        cohort: candidate.cohort || "",
        ownerId: candidate.ownerId || candidate.cardId || "",
        ownerTitle: candidate.ownerTitle || candidate.cardTitle || "",
        card: {
          id: candidate.cardId || "",
          kind: candidate.cardKind || sourceGroup,
          ref: candidate.cardRef || "",
          title: candidate.cardTitle || "",
        },
      },
      provenance: {
        scope: "explicit-origin-lineage-only",
        checked: true,
        references: provenanceReferences(candidate),
      },
      shuffleBag: {
        sourceGroup,
        pass: evidence.shuffleBagPass,
      },
      ...(evidence.densityAction ? {
        densityAction: evidence.densityAction,
        densityProfile: {
          id: evidence.densityProfileId || "",
          label: evidence.densityProfileLabel || "",
          targetVideoRatio: finite(evidence.targetVideoRatio, 0),
        },
        originalMediaPresent: evidence.originalMediaPresent === true,
      } : {}),
      ...(evidence.coverageLedgerActive === true ? {
        coverageLedger: {
          technicalIdentity: technicalIdentity(candidate),
          priorAlbumUses: evidence.priorAlbumUsage,
          albumUsesAfterSelection: evidence.albumUsageAfter,
          priorAlbumCardUses: evidence.priorAlbumCardUsage,
          albumCardUsesAfterSelection: evidence.albumCardUsageAfter,
          leastUsedPrioritySatisfied: evidence.coveragePriorityHit === true,
        },
      } : {}),
      semanticMusicMatch: {
        value: null,
        basis: "not-claimed; only energy-band motion-role preference is applied",
      },
    },
  };
}

function sanitizeVisualizerOnlyShot(shot = {}) {
  const preserved = { ...shot };
  delete preserved.semantic_casting;
  delete preserved.decision_evidence;
  preserved.edit_reason = "Pure visualizer interval preserved; legacy media alternatives were intentionally removed from this append-only revision.";
  preserved.decision_evidence = {
    schemaVersion: "hapa.echo.shot-decision-evidence.v3",
    truthStatus: "preserved-visualizer-only-cadence",
    selectionStrategy: "no-media-visualizer-interval",
    preservedDirection: {
      timing: true,
      stems: true,
      audioBindings: true,
      camera: true,
      transition: true,
    },
  };
  return preserved;
}

/** Convert a directed media window into a canonical IVF/shader-only window. */
export function convertShotToVisualizerOnly(shot = {}, evidence = {}) {
  const preserved = { ...shot };
  const hadMedia = shotHasMedia(shot);
  for (const key of [
    "media_id", "media_title", "media_uri", "media_thumbnail", "runtime_media_uri",
    "media_contract", "media_card_id", "media_card_kind", "media_card_ref", "media_card_title",
    "media_source_group", "media_technical_identity", "semantic_casting", "decision_evidence", "edit_reason",
  ]) delete preserved[key];
  const duration = shotDurationSeconds(shot);
  return {
    ...preserved,
    media_id: "none",
    media_title: "Visualizer Only",
    media_uri: "",
    media_thumbnail: "",
    runtime_media_uri: "",
    media_contract: {
      schemaVersion: "hapa.echo.playback-media.v2",
      type: "generated-visualizer",
      originalUri: "",
      runtimeUri: "",
      sourceInSeconds: 0,
      sourceOutSeconds: duration,
      actualDurationSeconds: null,
      playbackMode: "not-applicable",
      mimeType: "application/x-hapa-visualizer",
      dimensions: null,
      contentHash: null,
      proxy: { status: "not-applicable", uri: "" },
      fallback: { status: "active", mode: "ivf" },
      posterUri: "",
      preloadPriority: "lazy",
      durationCoverage: { status: "visualizer-covered", cueSeconds: duration },
    },
    edit_reason: `Density-directed visualizer window for the ${evidence.profileLabel || evidence.profileId || "selected"} cut; inherited timing, stems, camera, and transition remain unchanged.`,
    decision_evidence: {
      schemaVersion: "hapa.echo.shot-decision-evidence.v3",
      truthStatus: "density-directed-visualizer-only",
      selectionStrategy: "nested-density-mask-visualizer-window",
      densityAction: hadMedia ? "media-to-visualizer" : "visualizer-retained",
      densityProfile: {
        id: evidence.profileId || "",
        label: evidence.profileLabel || "",
        targetVideoRatio: finite(evidence.targetVideoRatio, 0),
      },
      visualizerCoverageVerified: evidence.visualizerCoverageVerified !== false,
      originalMediaPresent: hadMedia,
      preservedDirection: {
        timing: true,
        stems: true,
        audioBindings: true,
        camera: true,
        transition: true,
      },
    },
  };
}

export function recastEchoDirectorProject(project = {}, candidateEntries = [], options = {}) {
  if (options.selectionMode === BALANCED_RECAST_SELECTION_MODE) {
    return recastBalancedEchoDirectorProject(project, candidateEntries, options);
  }
  const policy = {
    allowedCohorts: options.allowedCohorts || ["root", "fal-second-cohort"],
    forbiddenMarkers: options.forbiddenMarkers || DEFAULT_FORBIDDEN,
  };
  const candidates = buildScrollSiteDirectorCandidates(candidateEntries, policy);
  if (!candidates.length) throw new Error("No eligible Scroll Site/FAL director candidates were supplied.");
  const seed = options.seed || `${project.song_id || "song"}:${SCROLL_FAL_DIRECTION_VARIANT_ID}`;
  const state = {
    seed,
    routeCursor: stableNumber(seed) % Math.max(1, candidates.filter((candidate) => candidate.analyzerRole !== "loop").length),
    loopCursor: stableNumber(`${seed}:loops`),
  };
  const selections = [];
  const timeline = list(project.timeline).map((shot, shotIndex) => {
    const hasMedia = Boolean(
      shot?.media_uri ||
      shot?.runtime_media_uri ||
      shot?.media_contract?.originalUri ||
      shot?.media_contract?.runtimeUri ||
      (shot?.media_id && shot.media_id !== "none")
    );
    if (!hasMedia || shot.media_id === "none") return sanitizeVisualizerOnlyShot(shot);
    const selected = chooseCandidate(candidates, state, shot, shotIndex);
    selections.push({
      shotIndex,
      startSeconds: finite(shot.start_sec, 0),
      endSeconds: finite(shot.end_sec, finite(shot.start_sec, 0)),
      mediaId: selected.candidate.id,
      cardId: selected.candidate.cardId || "",
      sha256: selected.candidate.sha256 || "",
      strategy: selected.strategy,
    });
    return recastShot(shot, selected.candidate, selected);
  });

  const scriptProject = { ...project, timeline };
  const createdAt = options.createdAt || new Date().toISOString();
  const variant = {
    schemaVersion: SCROLL_FAL_DIRECTION_VARIANT_VERSION,
    id: options.variantId || SCROLL_FAL_DIRECTION_VARIANT_ID,
    title: options.title || "Scroll Site + FAL · Authored Quality Recast",
    status: "ready",
    createdAt,
    updatedAt: createdAt,
    parent: {
      songId: project.song_id || "",
      projectSha256: options.parentProjectHash || "",
      immutableLegacyProject: true,
    },
    seed,
    sourcePolicy: {
      mode: "positive-allowlist",
      allowedCohorts: policy.allowedCohorts,
      forbiddenLineages: ["Hell Week", "hapa-dev-proto", "LTX"],
      authoredEligibleOnly: true,
    },
    timeline,
    hyperframe_script: generateEchoHyperframeScript(scriptProject),
    selectionEvidence: selections,
    preservation: {
      shotTiming: "preserved",
      lyricTiming: "inherited-unchanged",
      stems: "preserved",
      audioBindings: "preserved",
      cameraMovement: "preserved",
      transitions: "preserved",
      visualizerTimeline: "inherited-unchanged",
      legacyTimeline: "untouched",
      legacyHyperframeScript: "untouched",
    },
    telemetry: {
      sourceCandidates: candidates.length,
      replacementShots: selections.length,
      rootSelections: selections.filter((selection) => candidates.find((item) => item.id === selection.mediaId)?.cohort === "root").length,
      falSelections: selections.filter((selection) => candidates.find((item) => item.id === selection.mediaId)?.cohort === "fal-second-cohort").length,
      uniqueMediaCards: new Set(selections.map((selection) => selection.cardId).filter(Boolean)).size,
    },
  };
  validateDirectorRevision(variant, { policy });
  return variant;
}

function longestSourceStreak(selections = []) {
  let longest = 0;
  let current = 0;
  let previous = "";
  for (const selection of selections) {
    if (selection.sourceGroup === previous) current += 1;
    else current = 1;
    previous = selection.sourceGroup;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function recastBalancedEchoDirectorProject(project = {}, candidateEntries = [], options = {}) {
  const policy = {
    allowedSourceGroups: options.allowedSourceGroups || BALANCED_SOURCE_GROUPS,
    allowedScrollCohorts: options.allowedScrollCohorts || ["root", "fal-second-cohort"],
    scrollForbiddenMarkers: options.scrollForbiddenMarkers || DEFAULT_FORBIDDEN,
  };
  const candidates = buildBalancedDirectorCandidates(candidateEntries, policy);
  if (!candidates.length) throw new Error("No eligible Scroll, Scene, or Avatar director candidates were supplied.");
  const availableGroups = BALANCED_SOURCE_GROUPS.filter((sourceGroup) => (
    candidates.some((candidate) => candidate.sourceGroup === sourceGroup)
  ));
  const requiredGroups = list(policy.allowedSourceGroups).filter((sourceGroup) => BALANCED_SOURCE_GROUPS.includes(sourceGroup));
  const missingGroups = requiredGroups.filter((sourceGroup) => !availableGroups.includes(sourceGroup));
  if (options.requireAllSourceGroups !== false && missingGroups.length) {
    throw new Error(`Balanced director recast requires eligible candidates for: ${missingGroups.join(", ")}.`);
  }

  const seed = options.seed || `${project.song_id || "song"}:${SCROLL_SCENE_AVATAR_BALANCED_VARIANT_ID}`;
  const sourceOffset = stableNumber(`${seed}:source-rotation`) % availableGroups.length;
  const sourceGroups = [...availableGroups.slice(sourceOffset), ...availableGroups.slice(0, sourceOffset)];
  const requestedPattern = list(options.sourcePattern)
    .map((sourceGroup) => String(sourceGroup).trim().toLowerCase())
    .filter((sourceGroup) => availableGroups.includes(sourceGroup));
  let sourcePattern = requestedPattern.length ? requestedPattern : sourceGroups;
  if (requestedPattern.length && options.rotateSourcePattern !== false) {
    const patternOffset = stableNumber(`${seed}:weighted-source-pattern`) % sourcePattern.length;
    sourcePattern = [...sourcePattern.slice(patternOffset), ...sourcePattern.slice(0, patternOffset)];
  }
  if (!sourcePattern.length) throw new Error("Balanced director recast has no usable source pattern.");
  const adjacentPatternRepeats = sourcePattern.filter((sourceGroup, index) => (
    sourcePattern.length > 1 && sourceGroup === sourcePattern[(index + 1) % sourcePattern.length]
  ));
  if (adjacentPatternRepeats.length && options.allowAdjacentSourcePatternRepeats !== true) {
    throw new Error("Balanced director sourcePattern must not repeat a source family in adjacent cyclic positions.");
  }

  const densityProfile = options.densityProfile ? {
    id: String(options.densityProfile.id || "custom"),
    label: String(options.densityProfile.label || options.densityProfile.id || "Custom"),
    targetVideoRatio: Math.min(1, Math.max(0, finite(options.densityProfile.targetVideoRatio, 0))),
    ordinal: finite(options.densityProfile.ordinal, 0),
  } : null;
  let mediaShotIndices = null;
  let densityPlanProfile = null;
  if (options.mediaShotIndices instanceof Set || Array.isArray(options.mediaShotIndices)) {
    mediaShotIndices = new Set(options.mediaShotIndices);
  } else if (densityProfile) {
    const densityPlan = buildDirectorDensityPlan(project, {
      seed: options.densityPlanSeed || `${project.song_id || "song"}:${WIDE_COVERAGE_VARIATION_SET_ID}:density-plan`,
      profiles: [densityProfile],
      frameWithVideo: options.frameWithVideo,
      requireVisualizerCoverage: options.requireVisualizerCoverage,
    });
    densityPlanProfile = densityPlan.profiles[0];
    mediaShotIndices = new Set(densityPlanProfile.mediaShotIndices);
  }
  if (mediaShotIndices) {
    const invalidIndices = [...mediaShotIndices].filter((index) => (
      !Number.isInteger(index) || index < 0 || index >= list(project.timeline).length
    ));
    if (invalidIndices.length) throw new Error(`Density mask contains invalid shot indices: ${invalidIndices.join(", ")}.`);
    const uncovered = list(project.timeline)
      .map((shot, index) => ({ shot, index }))
      .filter(({ index }) => !mediaShotIndices.has(index))
      .filter(({ shot }) => !visualizerFullyCoversShot(shot, project.visualizer_timeline));
    if (uncovered.length && options.requireVisualizerCoverage !== false) {
      throw new Error(`Density mask would expose ${uncovered.length} shot window(s) without full visualizer coverage: ${uncovered.slice(0, 8).map(({ index }) => index).join(", ")}.`);
    }
  }
  const state = {
    seed,
    sourceGroups,
    sourcePattern,
    sourceCursor: 0,
    lastTechnicalIdentity: "",
    lastSourceGroup: "",
    lastCardId: "",
    recentCardIds: [],
    sharedUsageCounts: options.sharedUsageCounts instanceof Map ? options.sharedUsageCounts : null,
    sharedCardUsageCounts: options.sharedCardUsageCounts instanceof Map ? options.sharedCardUsageCounts : null,
    currentCardUsage: new Map(),
    bags: Object.fromEntries(sourceGroups.map((sourceGroup) => [sourceGroup, {
      candidates: candidates.filter((candidate) => candidate.sourceGroup === sourceGroup),
      remaining: [],
      pass: -1,
      usedPasses: 0,
      currentPassUsed: false,
    }])),
  };
  const selections = [];
  const timeline = list(project.timeline).map((shot, shotIndex) => {
    const hasMedia = shotHasMedia(shot);
    const shouldCarryMedia = mediaShotIndices ? mediaShotIndices.has(shotIndex) : hasMedia;
    if (!shouldCarryMedia) {
      return densityProfile
        ? convertShotToVisualizerOnly(shot, {
          profileId: densityProfile.id,
          profileLabel: densityProfile.label,
          targetVideoRatio: densityProfile.targetVideoRatio,
          visualizerCoverageVerified: true,
        })
        : sanitizeVisualizerOnlyShot(shot);
    }
    const selected = chooseBalancedCandidate(state, shot);
    const densityAction = mediaShotIndices ? (hasMedia ? "media-recast" : "visualizer-to-media") : "";
    Object.assign(selected, {
      densityAction,
      densityProfileId: densityProfile?.id || "",
      densityProfileLabel: densityProfile?.label || "",
      targetVideoRatio: densityProfile?.targetVideoRatio || 0,
      originalMediaPresent: hasMedia,
    });
    selections.push({
      shotIndex,
      startSeconds: finite(shot.start_sec, 0),
      endSeconds: finite(shot.end_sec, finite(shot.start_sec, 0)),
      mediaId: selected.candidate.id,
      technicalIdentity: technicalIdentity(selected.candidate),
      sourceGroup: selected.sourceGroup,
      cohort: selected.candidate.cohort || "",
      cardId: selected.candidate.cardId || "",
      cardKind: selected.candidate.cardKind || selected.sourceGroup,
      cardRef: selected.candidate.cardRef || "",
      sha256: selected.candidate.sha256 || "",
      motionRole: selected.candidate.motionRole,
      energyBand: selected.energyBand,
      preferredRole: selected.preferredRole,
      rolePreferenceAvailable: selected.rolePreferenceAvailable,
      rolePreferenceHit: selected.rolePreferenceHit,
      priorAlbumUsage: selected.priorAlbumUsage,
      albumUsageAfter: selected.albumUsageAfter,
      priorAlbumCardUsage: selected.priorAlbumCardUsage,
      albumCardUsageAfter: selected.albumCardUsageAfter,
      coveragePriorityHit: selected.coveragePriorityHit,
      coverageLedgerActive: selected.coverageLedgerActive,
      densityAction,
      originalMediaPresent: hasMedia,
      shuffleBagPass: selected.shuffleBagPass,
      strategy: selected.strategy,
    });
    return recastBalancedShot(shot, selected.candidate, selected);
  });

  const createdAt = options.createdAt || new Date().toISOString();
  const sourceCandidatesByGroup = Object.fromEntries(BALANCED_SOURCE_GROUPS.map((sourceGroup) => [
    sourceGroup,
    candidates.filter((candidate) => candidate.sourceGroup === sourceGroup).length,
  ]));
  const selectionsBySource = Object.fromEntries(BALANCED_SOURCE_GROUPS.map((sourceGroup) => [
    sourceGroup,
    selections.filter((selection) => selection.sourceGroup === sourceGroup).length,
  ]));
  const immediateMediaRepeats = selections.filter((selection, index) => (
    index > 0 && selection.technicalIdentity === selections[index - 1].technicalIdentity
  )).length;
  const immediateCardRepeats = selections.filter((selection, index) => (
    index > 0 && selection.cardId && selection.cardId === selections[index - 1].cardId
  )).length;
  const selectionCounts = Object.values(selectionsBySource);
  const originalMediaShots = list(project.timeline).filter((shot) => shotHasMedia(shot)).length;
  const videoCoverageSeconds = timeline
    .filter((shot) => shotHasMedia(shot))
    .reduce((sum, shot) => sum + shotDurationSeconds(shot), 0);
  const totalTimelineSeconds = timeline.reduce((sum, shot) => sum + shotDurationSeconds(shot), 0);
  const mediaBearingShots = timeline.filter((shot) => shotHasMedia(shot)).length;
  const visualizerOnlyShots = timeline.length - mediaBearingShots;
  const convertedToVisualizerOnly = timeline.filter((shot) => (
    shot.decision_evidence?.densityAction === "media-to-visualizer"
  )).length;
  const promotedToMedia = selections.filter((selection) => selection.densityAction === "visualizer-to-media").length;
  const retainedOriginalMedia = selections.filter((selection) => selection.originalMediaPresent).length;
  const scriptProject = { ...project, timeline };
  const variant = {
    schemaVersion: SCROLL_FAL_DIRECTION_VARIANT_VERSION,
    id: options.variantId || SCROLL_SCENE_AVATAR_BALANCED_VARIANT_ID,
    title: options.title || "Scroll + FAL + Builder Scenes/Avatars · Balanced Recast",
    status: "ready",
    createdAt,
    updatedAt: createdAt,
    selectionMode: BALANCED_RECAST_SELECTION_MODE,
    parent: {
      songId: project.song_id || "",
      projectSha256: options.parentProjectHash || "",
      immutableLegacyProject: true,
    },
    seed,
    ...(options.variationSet ? { variationSet: structuredClone(options.variationSet) } : {}),
    ...(options.cut ? { cut: structuredClone(options.cut) } : {}),
    ...(densityProfile ? { densityProfile } : {}),
    ...(options.coveragePass ? { coveragePass: structuredClone(options.coveragePass) } : {}),
    ...(densityProfile ? {
      densityPlan: {
        seed: options.densityPlanSeed || `${project.song_id || "song"}:${WIDE_COVERAGE_VARIATION_SET_ID}:density-plan`,
        planHash: options.densityPlanHash || "",
        mediaShotIndices: [...(mediaShotIndices || [])].sort((a, b) => a - b),
      },
      visualizer_timeline: structuredClone(list(project.visualizer_timeline)),
    } : {}),
    sourcePolicy: {
      mode: "balanced-mixed-library-allowlist",
      allowedSourceGroups: policy.allowedSourceGroups,
      allowedScrollCohorts: policy.allowedScrollCohorts,
      forbiddenProvenanceLineages: ["hapa-dev-proto"],
      provenanceExclusionScope: "explicit-origin-lineage-only",
      technicallyEligibleOnly: true,
      ...(state.sharedUsageCounts instanceof Map ? {
        coverageStrategy: "album-least-used-clip-then-card-fairness-with-soft-motion-role",
      } : {}),
    },
    timeline,
    hyperframe_script: generateEchoHyperframeScript(scriptProject),
    selectionEvidence: selections,
    preservation: {
      shotTiming: "preserved",
      lyricTiming: "inherited-unchanged",
      stems: "preserved",
      audioBindings: "preserved",
      cameraMovement: "preserved",
      transitions: "preserved",
      visualizerTimeline: "inherited-unchanged",
      legacyTimeline: "untouched",
      legacyHyperframeScript: "untouched",
    },
    telemetry: {
      selectionMode: BALANCED_RECAST_SELECTION_MODE,
      sourceCandidates: candidates.length,
      sourceCandidatesByGroup,
      replacementShots: selections.length,
      selectionsBySource,
      sourceSelectionBalanceSpread: selectionCounts.length ? Math.max(...selectionCounts) - Math.min(...selectionCounts) : 0,
      sourceRotation: sourceGroups,
      sourcePattern,
      uniqueMedia: new Set(selections.map((selection) => selection.technicalIdentity).filter(Boolean)).size,
      uniqueMediaCards: new Set(selections.map((selection) => selection.cardId).filter(Boolean)).size,
      immediateMediaRepeats,
      immediateCardRepeats,
      longestSourceStreak: longestSourceStreak(selections),
      rolePreferenceOpportunities: selections.filter((selection) => selection.rolePreferenceAvailable).length,
      rolePreferenceHits: selections.filter((selection) => selection.rolePreferenceHit).length,
      previouslyUnseenSelections: selections.filter((selection) => (
        selection.coverageLedgerActive && selection.priorAlbumUsage === 0
      )).length,
      coveragePriorityHits: selections.filter((selection) => (
        selection.coverageLedgerActive && selection.coveragePriorityHit
      )).length,
      originalMediaShots,
      totalShots: timeline.length,
      mediaBearingShots,
      visualizerOnlyShots,
      convertedToVisualizerOnly,
      promotedToMedia,
      retainedOriginalMedia,
      targetVideoRatio: densityProfile?.targetVideoRatio ?? null,
      actualVideoRatio: totalTimelineSeconds > 0 ? videoCoverageSeconds / totalTimelineSeconds : 0,
      actualVideoShotRatio: timeline.length ? mediaBearingShots / timeline.length : 0,
      videoCoverageSeconds,
      visualizerCoverageSeconds: Math.max(0, totalTimelineSeconds - videoCoverageSeconds),
      videoEventsPerMinute: totalTimelineSeconds > 0 ? mediaBearingShots / (totalTimelineSeconds / 60) : 0,
      densityPlanActualVideoRatio: densityPlanProfile?.actualVideoRatio ?? null,
      shuffleBagPassesBySource: Object.fromEntries(sourceGroups.map((sourceGroup) => [
        sourceGroup,
        state.bags[sourceGroup].usedPasses,
      ])),
    },
  };
  validateBalancedDirectorRevision(variant, { policy });
  return variant;
}

export function validateDirectorRevision(variant = {}, options = {}) {
  if (variant.selectionMode === BALANCED_RECAST_SELECTION_MODE) {
    return validateBalancedDirectorRevision(variant, options);
  }
  const policy = options.policy || {};
  const failures = [];
  const timeline = list(variant.timeline);
  if (!variant.id) failures.push("missing variant id");
  if (!timeline.length) failures.push("empty variant timeline");
  for (const [index, shot] of timeline.entries()) {
    if (shot.media_id === "none" || !shot.media_uri) continue;
    const candidate = {
      id: shot.media_id,
      cardId: shot.media_card_id,
      title: shot.media_title,
      uri: shot.media_uri,
      runtimeUri: shot.runtime_media_uri,
      posterUri: shot.media_thumbnail,
      cohort: shot.decision_evidence?.cohort,
      autoEligible: true,
      tags: [],
    };
    if (!isDirectorMediaAllowed(candidate, policy)) failures.push(`shot ${index} violates source policy`);
    if (!shot.media_card_id) failures.push(`shot ${index} is missing its media Card id`);
  }
  if (failures.length) throw new Error(`Invalid direction-script revision: ${failures.join("; ")}`);
  return { ok: true, timelineShots: timeline.length };
}

export function validateBalancedDirectorRevision(variant = {}, options = {}) {
  const policy = options.policy || {
    allowedSourceGroups: variant.sourcePolicy?.allowedSourceGroups,
    allowedScrollCohorts: variant.sourcePolicy?.allowedScrollCohorts,
  };
  const failures = [];
  const timeline = list(variant.timeline);
  if (!variant.id) failures.push("missing variant id");
  if (!timeline.length) failures.push("empty variant timeline");
  let previousTechnicalIdentity = "";
  for (const [index, shot] of timeline.entries()) {
    if (shot.media_id === "none" || !shot.media_uri) {
      if (variant.densityProfile) {
        const staleFields = [
          "media_card_id", "media_card_kind", "media_card_ref", "media_card_title",
          "media_source_group", "media_technical_identity",
        ].filter((key) => Boolean(shot[key]));
        if (shot.media_uri || shot.runtime_media_uri || shot.media_contract?.originalUri || shot.media_contract?.runtimeUri) {
          staleFields.push("media runtime URI");
        }
        if (shot.media_contract?.type !== "generated-visualizer") staleFields.push("generated-visualizer contract");
        if (staleFields.length) failures.push(`shot ${index} retains stale media state (${staleFields.join(", ")})`);
        if (!visualizerFullyCoversShot(shot, variant.visualizer_timeline)) {
          failures.push(`shot ${index} lacks full visualizer coverage`);
        }
      }
      continue;
    }
    const evidence = shot.decision_evidence || {};
    const references = list(evidence.provenance?.references);
    const candidate = {
      id: shot.media_id,
      cardId: shot.media_card_id,
      title: shot.media_title,
      uri: shot.media_uri,
      runtimeUri: shot.runtime_media_uri,
      posterUri: shot.media_thumbnail,
      cohort: evidence.sourceEvidence?.cohort,
      sourceGroup: evidence.sourceGroup,
      technicalIdentity: evidence.technicalIdentity,
      autoEligible: true,
      origin: { records: references.map((source) => ({ source })) },
    };
    if (!isBalancedDirectorMediaAllowed(candidate, policy)) failures.push(`shot ${index} violates balanced source policy`);
    if (!shot.media_card_id) failures.push(`shot ${index} is missing its media Card id`);
    if (!evidence.sourceGroup || !evidence.sourceEvidence?.card?.id) failures.push(`shot ${index} is missing source/Card evidence`);
    if (evidence.sourceEvidence?.card?.id && evidence.sourceEvidence.card.id !== shot.media_card_id) {
      failures.push(`shot ${index} has mismatched media Card evidence`);
    }
    if (evidence.provenance?.checked !== true || evidence.provenance?.scope !== "explicit-origin-lineage-only") {
      failures.push(`shot ${index} is missing provenance-scoped exclusion evidence`);
    }
    if (hasHapaDevProtoOrigin(...references.map((source) => ({ source })))) {
      failures.push(`shot ${index} has forbidden explicit provenance`);
    }
    const identity = evidence.technicalIdentity || technicalIdentity(candidate);
    if (identity && identity === previousTechnicalIdentity) failures.push(`shot ${index} immediately repeats media identity`);
    previousTechnicalIdentity = identity;
  }
  if (variant.densityProfile) {
    const mediaBearingShots = timeline.filter((shot) => shotHasMedia(shot)).length;
    const telemetry = variant.telemetry || {};
    if (finite(telemetry.mediaBearingShots, -1) !== mediaBearingShots) failures.push("density telemetry media shot count is stale");
    if (finite(telemetry.visualizerOnlyShots, -1) !== timeline.length - mediaBearingShots) failures.push("density telemetry visualizer shot count is stale");
    if ((Array.isArray(variant.densityPlan?.mediaShotIndices) ? variant.densityPlan.mediaShotIndices.length : 0) !== mediaBearingShots) {
      failures.push("density plan mask does not match timeline media count");
    }
  }
  if (failures.length) throw new Error(`Invalid balanced direction-script revision: ${failures.join("; ")}`);
  return {
    ok: true,
    timelineShots: timeline.length,
    replacementShots: timeline.filter((shot) => shot.media_id !== "none" && shot.media_uri).length,
  };
}
