import { materializeMultitrackProject } from "./multitrack-editor.js";
import {contextHash} from "./song-context-packet.js";
import {echoLyricSourceLines,normalizeEchoLyricContract} from "./echo-lyric-contract.js";
import {applyEchoRecutTreatment,echoRecipeOperatorLocks} from './echo-recipe-recut-treatment.js';
import { NARRATIVE_VARIANT_RECIPES } from "./echo-director-recipes.js";
import { sequenceEchoNarrative } from "./echo-narrative-sequencer.js";
import { mergeEchoMediaConstraints } from "./echo-media-eligibility.js";
import { applyEchoPortraitScanCamera } from "./echo-horizontal-portrait-camera-doctrine.js";

const mediaFields = ["media_id", "media_title", "media_uri", "runtime_media_uri", "media_thumbnail", "media_contract", "media_card_id", "media_card_kind", "media_card_ref", "media_card_title", "characterIds", "sceneIds", "cast", "identityEvidence", "contentEvidence", "canonicalMediaIds", "shotRoles", "paletteFamily", "comicId", "panelIndex", "roi", "technical", "availability", "cropCoverage", "sourcePolicy", "sourceAllowed", "origin", "banned", "metadata"];

function candidate(shot) {
  const contract = shot.media_contract || {};
  const uri = shot.runtime_media_uri || contract.runtimeUri || shot.media_uri || contract.originalUri || "";
  const sourceKind = shot.media_id === "none" || shot.knockedOut === true || contract.type === "generated-visualizer" || (!shot.media_id && !uri) ? "pure-visualizer"
    : contract.type === "image" || /\.(png|jpe?g|webp|avif)(?:$|[?#])/i.test(uri) ? "local-photo" : "local-video";
  return { ...shot, ...contract, id: shot.media_id, uri, sourceKind, sourceShot: shot,
    sourceSelectionKey:contextHash({id:shot.media_id,uri,type:contract.type,sourceInSeconds:contract.sourceInSeconds??contract.source_in_seconds,sourceOutSeconds:contract.sourceOutSeconds??contract.source_out_seconds,timeMapping:contract.timeMapping||contract.time_mapping}),
    ...(sourceKind === "pure-visualizer" ? { characterIds: [], sceneIds: [], cast: null } : {}) };
}

// Only declared identities in this prepared cut are offered. Titles and file
// names are not identity evidence, and this inventory performs no lookup.
export function echoRecutIdentityOptions(project) {
  const collect = field => [...new Set((project?.timeline || []).flatMap(shot => {
    const row = candidate(shot);
    return (Array.isArray(row[field]) ? row[field] : row.cast?.[field] || []).filter(value => typeof value === "string" && value.length);
  }))].sort();
  return { characterIds: collect("characterIds"), sceneIds: collect("sceneIds") };
}

// These are the existing enrichment compiler's indivisible endpoint/clip
// declarations. This checks structure, not decoded endpoint certification.
export function echoRecutAtomicGroups(timeline = []) {
  const atomic = shot => shot?.decision_evidence?.atomicTransition || shot?.decisionEvidence?.atomicTransition;
  const groups = [], protectedIndices = new Set();
  const fail = index => {
    throw Object.assign(new Error(`Transition sequence at shot ${index + 1} is incomplete or inconsistent. Recompile the complete Reference A/transition/Reference B sequence before recutting.`), {
      code: "echo_recut_atomic_transition_invalid", shotIndex: index,
    });
  };
  for (let index = 0; index < timeline.length; index++) {
    const declaration = atomic(timeline[index]);
    if (!declaration || declaration.role !== "authored-transition") continue;
    const members = [index - 1, index, index + 1], rows = members.map(i => timeline[i]), parts = rows.map(atomic);
    if (!rows.every(Boolean)
      || !["entry-reference-still", "entry-reference-loop"].includes(parts[0]?.role)
      || !["exit-reference-still", "exit-reference-loop"].includes(parts[2]?.role)
      || !declaration.transitionMediaId || declaration.transitionMediaId !== timeline[index].media_id) fail(index);
    // Incomplete declarations must give the actionable structural error, not
    // reach a hash operation on an absent endpoint or timing contract.
    const contracts = ["firstReference", "lastReference", "timeMapping"];
    if (parts.some(part => contracts.some(field => !part[field] || typeof part[field] !== "object" || Array.isArray(part[field]))
      || part.transitionMediaId !== declaration.transitionMediaId
      || part.transitionJobId !== declaration.transitionJobId
      || (part.centerShotIndex !== undefined && part.centerShotIndex !== index)
      || contracts.some(field => contextHash(part[field]) !== contextHash(declaration[field])))) fail(index);
    if (rows.some(row => !Number.isFinite(Number(row.start_sec)) || !Number.isFinite(Number(row.end_sec)) || Number(row.end_sec) <= Number(row.start_sec))
      || Math.abs(Number(rows[0].end_sec) - Number(rows[1].start_sec)) > 1e-6
      || Math.abs(Number(rows[1].end_sec) - Number(rows[2].start_sec)) > 1e-6
      || members.some(i => protectedIndices.has(i))) fail(index);
    for (const i of members) protectedIndices.add(i);
    groups.push({ centerShotIndex: index, shotIndices: members, transitionMediaId: declaration.transitionMediaId,
      transitionJobId: declaration.transitionJobId || null, startSeconds: Number(rows[0].start_sec),
      endSeconds: Number(rows[2].end_sec), sourceContractHash: contextHash(rows) });
  }
  for (let index = 0; index < timeline.length; index++) if (atomic(timeline[index]) && !protectedIndices.has(index)) fail(index);
  return { groups, protectedIndices };
}

function selectionRank(seed, index) {
  let value = 2166136261;
  for (const char of `${seed}:change:${index}`) value = Math.imul(value ^ char.codePointAt(0), 16777619) >>> 0;
  return value;
}

/** Cheap recuts reuse only the current cut's prepared source pool. No fetching,
 * decoding, analysis, model calls, timing guesses or source writes occur here.
 * A partial boundary shot stays byte-identical instead of adding a new cut. */
export function createEchoNarrativeRecut({ project, recipeId, seed, range, locks = [], changeAmount = 1, requiredCharacterIds = [], requiredSceneIds = [], timingMode = "preserve" }) {
  locks = echoRecipeOperatorLocks(project, locks);
  const recipe = NARRATIVE_VARIANT_RECIPES[recipeId];
  if (!recipe) throw new Error(`Choose a supported narrative recipe: ${recipeId}`);
  const start = Number(range?.startSeconds), end = Number(range?.endSeconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > Number(project.duration)) throw new Error("Choose a finite song range within the song duration.");
  const materialized = materializeMultitrackProject(project);
  project = materialized.project;
  if (!Number.isFinite(changeAmount) || changeAmount < 0 || changeAmount > 1) throw new Error("Change amount must be between zero and one.");
  for (const values of [requiredCharacterIds, requiredSceneIds]) if (!Array.isArray(values) || values.length > 64 || values.some(value => typeof value !== "string" || !value.length || value.length > 240)) throw new Error("Choose declared cast and scene identities from the current cut.");
  const timeline = project.timeline || [];
  const atomic = echoRecutAtomicGroups(timeline);
  const mediaByIdentity = new Map();
  for (const [index, shot] of timeline.entries()) {
    if (atomic.protectedIndices.has(index)) continue;
    const row = candidate(shot);
    // Preserve distinct source contracts when an ID names several clips.
    const key = row.sourceSelectionKey;
    if (!mediaByIdentity.has(key)) mediaByIdentity.set(key, row);
  }
  const pool = [...mediaByIdentity.values()].filter(row => row.sourceKind !== "pure-visualizer");
  if (pool.length > 2048 || timeline.length > 4096) throw new Error("This cut exceeds the bounded recut workspace. Use a smaller prepared source pool.");
  const mediaLocked = locks.some(lock => lock.targetId === "media-casting");
  const cameraLocked = locks.some(lock => lock.targetId === "camera");
  const sectionRanges = new Map();
  for(let first=0;first<timeline.length;){
    const id=timeline[first].section_id;
    let endIndex=first+1;
    while(id&&endIndex<timeline.length&&timeline[endIndex].section_id===id)endIndex++;
    const range={startSeconds:Number(timeline[first].start_sec),endSeconds:Number(timeline[endIndex-1].end_sec)};
    for(let index=first;index<endIndex;index++)sectionRanges.set(index,range);
    first=endIndex;
  }
  const slots = timeline.flatMap((shot, index) => {
    if (!(Number(shot.start_sec) >= start && Number(shot.end_sec) <= end && Number(shot.end_sec) > Number(shot.start_sec))) return [];
    const media = candidate(shot);
    return [{ id: String(index), sourceShotIndex: index, media, candidateMedia: media.sourceKind === "pure-visualizer" ? [media] : pool,
      sectionLabel:shot.section_label||"",sectionType:shot.section_type||"",
      sectionStartSeconds:sectionRanges.get(index)?.startSeconds,sectionEndSeconds:sectionRanges.get(index)?.endSeconds,
      mediaConstraints: shot.mediaConstraints, startSeconds: Number(shot.start_sec), endSeconds: Number(shot.end_sec),
      camera: { motion: shot.camera_motion || "static", intensity: shot.camera_intensity ?? 1, speed: shot.camera_speed ?? 1, focus: shot.camera_focus || "center" },
      locks: [...new Set([...(atomic.protectedIndices.has(index) ? ["media","camera","timing"] : []), ...(timingMode === "preserve" || locks.some(lock => lock.targetId === "timing") ? ["timing"] : []), ...(Array.isArray(shot.locks) ? shot.locks : []), ...(cameraLocked ? ["camera"] : []), ...(index === 0 || mediaLocked || media.sourceKind === "pure-visualizer" ? ["media"] : [])])],
    }];
  });
  if (!slots.length) throw new Error("The range contains no complete shots. Extend it to include a source cut boundary.");
  if (slots.length * Math.max(1, pool.length) > 200000) throw new Error("This range exceeds the recut work budget. Select fewer complete shots.");
  const editable = slots.filter(slot => !slot.locks.includes("media") || !slot.locks.includes("camera") || !slot.locks.includes("timing"));
  if (slots.every(slot => atomic.protectedIndices.has(slot.sourceShotIndex))) throw new Error("This range contains only a protected transition sequence. Include ordinary shots to create a recut; changing the bridge requires its complete transition compiler.");
  const selected = new Set([...editable].sort((a, b) => selectionRank(seed, a.sourceShotIndex) - selectionRank(seed, b.sourceShotIndex) || a.sourceShotIndex - b.sourceShotIndex)
    .slice(0, Math.ceil(editable.length * changeAmount)).map(slot => slot.sourceShotIndex));
  for (const slot of slots) {
    if (!selected.has(slot.sourceShotIndex)) slot.locks = [...new Set([...slot.locks, "media", "camera", "timing"])];
    else slot.mediaConstraints = mergeEchoMediaConstraints(slot.mediaConstraints, { requiredCharacterIds, requiredSceneIds });
  }
  const lyricContract=normalizeEchoLyricContract(project);
  const sequence = sequenceEchoNarrative({ lyricCues:echoLyricSourceLines(project),lyricTiming:{timingSource:lyricContract.timingSource,timingHash:lyricContract.timingHash,audioHash:lyricContract.audioHash},slots, recipe, seed: String(seed), constraints: project.mediaConstraints || {}, timingMode, locks,
    cueGraph: project.director_show_graph?.directorV2?.cueGraph ? {
      ...project.director_show_graph.directorV2.cueGraph,
      cueGraphId: project.director_show_graph.directorV2.cueGraph.cueGraphId || project.director_show_graph.directorV2.cueGraph.id,
      // Compact editor graphs omit lyricCues. Protect the source phrases even
      // when caption display is disabled, without changing their timing truth.
      lyricCues: Array.isArray(project.timed_lyrics) ? project.timed_lyrics.map((line, index) => ({ id: `lyric:${index}`,
        startSeconds: Number(line.startSeconds ?? line.start ?? line.start_sec), endSeconds: Number(line.endSeconds ?? line.end ?? line.end_sec) }))
        : project.director_show_graph.directorV2.cueGraph.lyricCues,
    } : null });
  const replacement = new Map(sequence.slots.filter(slot => selected.has(slot.sourceShotIndex)).map(slot => {
    const original = timeline[slot.sourceShotIndex];
    const shot = { ...original };
    if (slot.startSeconds !== Number(original.start_sec)) shot.start_sec = slot.startSeconds;
    if (slot.endSeconds !== Number(original.end_sec)) shot.end_sec = slot.endSeconds;
    if (!slot.locks.includes("media")) {
      for (const field of mediaFields) {
        delete shot[field];
        if (Object.hasOwn(slot.selectedMedia.sourceShot, field)) shot[field] = structuredClone(slot.selectedMedia.sourceShot[field]);
      }
      delete shot.semantic_casting;
      shot.confidence = 0;
      shot.confidence_basis = "deterministic-recut-unmeasured-semantics";
    }
    if (!slot.locks.includes("camera")) {
      shot.camera_motion = slot.camera.motion;
      shot.camera_intensity = slot.camera.intensity;
      shot.camera_speed = slot.camera.speed;
    }
    shot.decision_evidence = { ...slot.decisionEvidence, parentDecisionEvidence: original.decision_evidence || null };
    if (requiredCharacterIds.length || requiredSceneIds.length) shot.mediaConstraints = slot.mediaConstraints;
    return [slot.sourceShotIndex, shot];
  }));
  let next = { ...project, timeline: timeline.map((shot, index) => replacement.get(index) || shot), hyperframe_script_stale: true };
  const ordinarySlots = slots.filter(slot => !atomic.protectedIndices.has(slot.sourceShotIndex));
  const treatmentSlots = ordinarySlots.sort((a, b) => selectionRank(seed, a.sourceShotIndex) - selectionRank(seed, b.sourceShotIndex) || a.sourceShotIndex - b.sourceShotIndex)
    .slice(0, Math.ceil(ordinarySlots.length * changeAmount));
  const treatmentIndices=new Set(treatmentSlots.map(slot=>slot.sourceShotIndex));
  const treatment=applyEchoRecutTreatment(next,{recipe,locks,seed,windows:!atomic.groups.length&&start===0&&end===Number(project.duration)&&changeAmount===1?[{startSeconds:start,endSeconds:end}]:sequence.slots.filter(slot=>treatmentIndices.has(slot.sourceShotIndex))});
  if (atomic.groups.length) treatment.receipt.limitations.push("source-declared-transition-sequences-and-overlapping-global-treatments-preserved");
  next=treatment.project;
  // Tall clips that land in a landscape cut scan their full height unless the operator locked camera.
  if (!cameraLocked) next = { ...next, timeline: applyEchoPortraitScanCamera({ project: next }).timeline };
  const receipt = { ...sequence.receipt, atomicTransitions: {policy:"preserve-complete-source-declared-sequences",groups:atomic.groups,excludedFromOrdinaryPool:atomic.protectedIndices.size,certificationRevalidated:false}, trackEditMaterialization: materialized.receipt ? {patchHash:materialized.receipt.patchHash,changedRows:materialized.receipt.changedRows,projectionPreserved:true} : null, treatment: treatment.receipt, parentCutId: project.active_direction_script_variant?.id || "legacy", range: { startSeconds: start, endSeconds: end },
    controls: { changeAmount, requiredCharacterIds: [...requiredCharacterIds], requiredSceneIds: [...requiredSceneIds], locks: structuredClone(locks), timingMode },
    changeBudget: { editableShots: editable.length, selectedShots: selected.size, policy: "seeded-ceiling-of-editable-whole-shots" },
    changedShotIndices: [...replacement.keys()].filter(index => JSON.stringify(next.timeline[index]) !== JSON.stringify(timeline[index])),
    preservedShotIndices: timeline.map((_, index) => index).filter(index => !replacement.has(index)),
    boundaryPolicy: "only-whole-source-shots-within-range", sourcePool: "current-cut-only", saved: false,
  };
  next.director_patch_lineage = { ...(next.director_patch_lineage || {}), narrativeRecut: receipt };
  return { project: next, receipt };
}
