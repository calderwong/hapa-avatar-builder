import { NARRATIVE_VARIANT_RECIPES } from "./echo-director-recipes.js";
import { sequenceEchoNarrative } from "./echo-narrative-sequencer.js";

const mediaFields = ["media_id", "media_title", "media_uri", "runtime_media_uri", "media_thumbnail", "media_contract", "media_card_id", "media_card_kind", "media_card_ref", "media_card_title", "characterIds", "sceneIds", "shotRoles", "paletteFamily", "comicId", "panelIndex", "roi", "technical", "availability", "cropCoverage", "sourcePolicy", "sourceAllowed", "origin", "banned", "metadata"];

function candidate(shot) {
  const contract = shot.media_contract || {};
  const uri = shot.runtime_media_uri || contract.runtimeUri || shot.media_uri || contract.originalUri || "";
  const sourceKind = shot.media_id === "none" || contract.type === "generated-visualizer" ? "pure-visualizer"
    : contract.type === "image" || /\.(png|jpe?g|webp|avif)(?:$|[?#])/i.test(uri) ? "local-photo" : "local-video";
  return { ...shot, ...contract, id: shot.media_id, uri, sourceKind, sourceShot: shot };
}

/** Cheap recuts reuse only the current cut's prepared source pool. No fetching,
 * decoding, analysis, model calls, timing guesses or source writes occur here.
 * A partial boundary shot stays byte-identical instead of adding a new cut. */
export function createEchoNarrativeRecut({ project, recipeId, seed, range, locks = [] }) {
  const recipe = NARRATIVE_VARIANT_RECIPES[recipeId];
  if (!recipe) throw new Error(`Choose a supported narrative recipe: ${recipeId}`);
  const start = Number(range?.startSeconds), end = Number(range?.endSeconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > Number(project.duration)) throw new Error("Choose a finite song range within the song duration.");
  if (project.director_show_graph_patches?.length) throw new Error("This cut has track patches. Save and resolve those edits before generating a narrative recut.");
  const timeline = project.timeline || [];
  const mediaByIdentity = new Map();
  for (const shot of timeline) {
    const row = candidate(shot);
    // Preserve distinct source contracts when an ID names several clips.
    const key = `${row.id}\0${row.uri}`;
    if (!mediaByIdentity.has(key)) mediaByIdentity.set(key, row);
  }
  const pool = [...mediaByIdentity.values()].filter(row => row.sourceKind !== "pure-visualizer");
  if (pool.length > 2048 || timeline.length > 4096) throw new Error("This cut exceeds the bounded recut workspace. Use a smaller prepared source pool.");
  const mediaLocked = locks.some(lock => lock.targetId === "media-casting");
  const slots = timeline.flatMap((shot, index) => {
    if (!(Number(shot.start_sec) >= start && Number(shot.end_sec) <= end && Number(shot.end_sec) > Number(shot.start_sec))) return [];
    const media = candidate(shot);
    return [{ id: String(index), sourceShotIndex: index, media, candidateMedia: media.sourceKind === "pure-visualizer" ? [media] : pool,
      mediaConstraints: shot.mediaConstraints, startSeconds: Number(shot.start_sec), endSeconds: Number(shot.end_sec),
      camera: { motion: shot.camera_motion || "static", intensity: shot.camera_intensity ?? 1, speed: shot.camera_speed ?? 1, focus: shot.camera_focus || "center" },
      locks: [...new Set(["timing", ...(Array.isArray(shot.locks) ? shot.locks : []), ...(index === 0 || mediaLocked || media.sourceKind === "pure-visualizer" ? ["media"] : [])])],
    }];
  });
  if (!slots.length) throw new Error("The range contains no complete shots. Extend it to include a source cut boundary.");
  if (slots.length * Math.max(1, pool.length) > 200000) throw new Error("This range exceeds the recut work budget. Select fewer complete shots.");
  const sequence = sequenceEchoNarrative({ slots, recipe, seed: String(seed), constraints: project.mediaConstraints || {} });
  const replacement = new Map(sequence.slots.map(slot => {
    const original = timeline[slot.sourceShotIndex];
    const shot = { ...original };
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
    return [slot.sourceShotIndex, shot];
  }));
  const next = { ...project, timeline: timeline.map((shot, index) => replacement.get(index) || shot), hyperframe_script_stale: true };
  const receipt = { ...sequence.receipt, parentCutId: project.active_direction_script_variant?.id || "legacy", range: { startSeconds: start, endSeconds: end },
    changedShotIndices: [...replacement.keys()].filter(index => JSON.stringify(next.timeline[index]) !== JSON.stringify(timeline[index])),
    preservedShotIndices: timeline.map((_, index) => index).filter(index => !replacement.has(index)),
    boundaryPolicy: "only-whole-source-shots-within-range", sourcePool: "current-cut-only", saved: false,
  };
  next.director_patch_lineage = { ...(project.director_patch_lineage || {}), narrativeRecut: receipt };
  return { project: next, receipt };
}
