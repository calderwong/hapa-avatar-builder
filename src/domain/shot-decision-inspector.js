import {createTasteMemory,appendTasteEvidence,setTasteEvidenceEnabled,activeTasteEvidence} from './human-taste-memory.js';
import { contextHash } from "./song-context-packet.js";

export const SHOT_INSPECTOR_SCHEMA = "hapa.director.shot-decision-inspector.v1";

export function inspectStoredShotDecision(shot = {}) {
  const evidence = shot.decision_evidence || {};
  const casting = shot.semantic_casting || null;
  const selected = casting?.selected || null;
  const narrative = evidence.schemaVersion === "hapa.echo.narrative-selection.v1";
  const alternatives = casting?.alternatives || (narrative ? evidence.alternatives : evidence.rejectedAlternatives) || [];
  const rejected = narrative ? evidence.rejected || [] : (casting?.rejected || []).map(row => ({ mediaId: row.mediaId, reasons: row.hardFilters || [] }));
  return {
    schemaVersion: SHOT_INSPECTOR_SCHEMA,
    shotId: shot.id || `${shot.section_id || "section"}:shot:${shot.shot_index ?? `${shot.start_sec}:${shot.end_sec}`}`,
    timeRange: { startSeconds: Number(shot.start_sec), endSeconds: Number(shot.end_sec) },
    selectedMedia: { id: shot.media_id, title: shot.media_title, uri: shot.runtime_media_uri || shot.media_uri, posterUri: shot.media_thumbnail || casting?.selected?.posterUri || null },
    cueEvidence: (evidence.evidence || []).filter((row) => /section|cue|transition|stem/i.test(row)),
    lyricCanonMediaEvidence: selected ? Object.entries(selected.components || {}).map(([dimension, component]) => ({ dimension, value: component.value, weight: component.weight, status: component.status, evidence: component.evidence || [] })) : Object.entries(evidence.scoreComponents || {}).map(([dimension, component]) => ({ dimension, value: component.value, weight: null, status: component.basis || "stored-legacy", evidence: [component.basis].filter(Boolean) })),
    rendererTruth: shot.media_contract || { status: "missing-media-contract" },
    selectedScore: selected ? { utility: selected.utility, confidence: selected.confidence, confidenceBasis: selected.confidenceBasis, semanticTruth: selected.semanticTruth } : narrative ? { utility: evidence.preferenceScore ?? null, confidence: null, confidenceBasis: "recipe-preference-not-semantic-confidence", semanticTruth: "unmeasured" } : { utility: null, confidence: evidence.confidence?.value ?? null, confidenceBasis: evidence.confidence?.basis || shot.confidence_basis || "unmeasured" },
    scoreLabel: narrative && !selected ? "Recipe preference" : "Score",
    selectionBasis: narrative ? evidence.selectionBasis || "stored-recipe-preference" : null,
    storedEvidence: evidence.evidence || [],
    missingData: [...new Set([...(evidence.pendingEvidence || []), ...(evidence.limitations || []), ...Object.values(evidence.scoreComponents || {}).map(row => row.basis).filter(basis => /^missing-/.test(basis || ""))])],
    alternatives: alternatives.map((candidate) => ({ mediaId: candidate.mediaId || candidate.media_id, title: candidate.title, uri: candidate.uri || null, posterUri: candidate.posterUri || null, utility: candidate.utility ?? candidate.preferenceScore ?? null, confidence: candidate.confidence ?? null, components: candidate.components || null, evidence: candidate.evidence || [], evidenceArtifact: candidate.evidenceArtifact || null, rejectionReason: candidate.reason || candidate.hardFilters || null })),
    alternativeCount: narrative ? evidence.alternativeCount ?? alternatives.length : alternatives.length,
    rejected, rejectedCount: narrative ? evidence.rejectedCount ?? rejected.length : rejected.length,
    continuityRisks: [...rejected.flatMap(row => row.reasons), ...(casting?.hardContinuityFilters || [])],
    reconstructionRule: "stored-evidence-only-no-after-the-fact-generation",
    reviewStatus: shot.semantic_casting?.selectionStatus || (casting ? "proposed-pending-human-blind-review" : narrative ? "recipe-proposal-pending-human-review" : "legacy-unmeasured"),
    sourceSnapshotHash: contextHash({ shotIndex: shot.shot_index, mediaId: shot.media_id, mediaUri: shot.runtime_media_uri || shot.media_uri, locks: shot.locks, mediaConstraints:shot.mediaConstraints, time: [shot.start_sec, shot.end_sec], evidence, casting }),
  };
}

export function appendShotPreferenceEvent(events = [], { inspector, action, targetMediaId = null, operator, rationale, at = new Date().toISOString() } = {}) {
  if (!inspector?.shotId || !["pin", "unpin", "ban", "unban", "replace"].includes(action) || !operator || !String(rationale || "").trim()) throw new Error("Shot preference events require shot, action, operator, and rationale");
  const event = { schemaVersion: "hapa.director.shot-preference-event.v1", id: `shot-review:${contextHash({ shotId: inspector.shotId, sourceSnapshotHash:inspector.sourceSnapshotHash, previousEventId:events.at(-1)?.id||null, action, targetMediaId, operator, rationale, at }).slice(0, 20)}`, shotId: inspector.shotId, action, targetMediaId, operator, rationale: String(rationale).trim(), recordedAt: at, sourceSnapshotHash: inspector.sourceSnapshotHash, sourceReviewStatus: inspector.reviewStatus, mutationPolicy: "append-only-source-shot-unchanged" };
  return { events: [...events, event], event };
}


/** Apply explicit operator controls to the existing whole-shot locks and shared
 * media gate. The event/taste ledger and working-project patch are one result;
 * source media and prior events are never rewritten. Replacement is a recorded
 * preference only; the media picker owns immediate replacement. */
export function buildShotPreferencePatch(project,{shotIndex,inspector,action,targetMediaId,operator,rationale,at}={}) {
 const shot=project.timeline?.[shotIndex];
 if(!Number.isInteger(shotIndex)||!shot||inspectStoredShotDecision(shot).sourceSnapshotHash!==inspector?.sourceSnapshotHash)throw Error('The selected shot changed. Reopen its inspector before applying a preference.');
 if(action==='replace'){
  if(!inspector.alternatives.some(row=>row.mediaId===targetMediaId))throw Error('Choose a stored alternative for this shot.');
 }else if(action==='unban'){
  if(!(shot.mediaConstraints?.bans||[]).includes(targetMediaId))throw Error('Choose an existing exclusion for this shot.');
 }else if(targetMediaId!==shot.media_id)throw Error('This control applies to the current selected media.');
 const result=appendShotPreferenceEvent(project.shot_preference_events||[],{inspector,action,targetMediaId,operator,rationale,at});
 let next=shot;
 if(action==='pin'||action==='unpin')next={...shot,locks:action==='pin'?[...new Set([...(shot.locks||[]),'media'])]:(shot.locks||[]).filter(value=>value!=='media')};
 if(action==='ban'||action==='unban'){
  if(action==='ban'&&(!shot.media_id||shot.media_id==='none'))throw Error('Choose a footage or image source to exclude.');
  const constraints=shot.mediaConstraints||{},bans=constraints.bans||[];
  next={...shot,mediaConstraints:{...constraints,bans:action==='ban'?[...new Set([...bans,shot.media_id])]:bans.filter(value=>value!==targetMediaId)}};
 }
 let taste=project.human_taste_memory?.schemaVersion?project.human_taste_memory:createTasteMemory();
 const family=action==='unpin'?'pin':action==='unban'?'ban':action;
 for(const event of activeTasteEvidence(taste,{shot:inspector.shotId}))if(event.scope==='shot'&&event.scopeId===inspector.shotId&&event.targetId===targetMediaId&&event.action===family)
  taste=setTasteEvidenceEnabled(taste,event.id,false,{operator,at:result.event.recordedAt,reason:'explicit-shot-preference-update'});
 if(!['unpin','unban'].includes(action))taste=appendTasteEvidence(taste,{scope:'shot',scopeId:inspector.shotId,actionEventId:result.event.id,action,operator,feature:`media:${targetMediaId}`,targetId:targetMediaId,recordedAt:result.event.recordedAt});
 return {timeline:project.timeline.map((row,index)=>index===shotIndex?next:row),shot_preference_events:result.events,last_shot_preference_event:result.event,human_taste_memory:taste};
}
