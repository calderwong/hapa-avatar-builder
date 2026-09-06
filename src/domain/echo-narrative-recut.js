import { materializeMultitrackProject } from "./multitrack-editor.js";
import {contextHash} from "./song-context-packet.js";
import {echoLyricSourceLines,normalizeEchoLyricContract} from "./echo-lyric-contract.js";
import {applyEchoRecutTreatment,echoRecipeOperatorLocks} from './echo-recipe-recut-treatment.js';
import { NARRATIVE_VARIANT_RECIPES } from "./echo-director-recipes.js";
import { sequenceEchoNarrative } from "./echo-narrative-sequencer.js";
import { mergeEchoMediaConstraints } from "./echo-media-eligibility.js";

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
  const mediaByIdentity = new Map();
  for (const shot of timeline) {
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
      locks: [...new Set([...(timingMode === "preserve" || locks.some(lock => lock.targetId === "timing") ? ["timing"] : []), ...(Array.isArray(shot.locks) ? shot.locks : []), ...(cameraLocked ? ["camera"] : []), ...(index === 0 || mediaLocked || media.sourceKind === "pure-visualizer" ? ["media"] : [])])],
    }];
  });
  if (!slots.length) throw new Error("The range contains no complete shots. Extend it to include a source cut boundary.");
  if (slots.length * Math.max(1, pool.length) > 200000) throw new Error("This range exceeds the recut work budget. Select fewer complete shots.");
  const editable = slots.filter(slot => !slot.locks.includes("media") || !slot.locks.includes("camera") || !slot.locks.includes("timing"));
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
  const treatmentSlots=[...slots].sort((a,b)=>selectionRank(seed,a.sourceShotIndex)-selectionRank(seed,b.sourceShotIndex)||a.sourceShotIndex-b.sourceShotIndex).slice(0,Math.ceil(slots.length*changeAmount));
  const treatmentIndices=new Set(treatmentSlots.map(slot=>slot.sourceShotIndex));
  const treatment=applyEchoRecutTreatment(next,{recipe,locks,seed,windows:start===0&&end===Number(project.duration)&&changeAmount===1?[{startSeconds:start,endSeconds:end}]:sequence.slots.filter(slot=>treatmentIndices.has(slot.sourceShotIndex))});
  next=treatment.project;
  const receipt = { ...sequence.receipt, trackEditMaterialization: materialized.receipt ? {patchHash:materialized.receipt.patchHash,changedRows:materialized.receipt.changedRows,projectionPreserved:true} : null, treatment: treatment.receipt, parentCutId: project.active_direction_script_variant?.id || "legacy", range: { startSeconds: start, endSeconds: end },
    controls: { changeAmount, requiredCharacterIds: [...requiredCharacterIds], requiredSceneIds: [...requiredSceneIds], locks: structuredClone(locks), timingMode },
    changeBudget: { editableShots: editable.length, selectedShots: selected.size, policy: "seeded-ceiling-of-editable-whole-shots" },
    changedShotIndices: [...replacement.keys()].filter(index => JSON.stringify(next.timeline[index]) !== JSON.stringify(timeline[index])),
    preservedShotIndices: timeline.map((_, index) => index).filter(index => !replacement.has(index)),
    boundaryPolicy: "only-whole-source-shots-within-range", sourcePool: "current-cut-only", saved: false,
  };
  next.director_patch_lineage = { ...(next.director_patch_lineage || {}), narrativeRecut: receipt };
  return { project: next, receipt };
}
