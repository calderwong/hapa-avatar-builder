import { evaluateEchoMediaEligibility, echoUnsatisfiedMediaConstraint, mergeEchoMediaConstraints } from "./echo-media-eligibility.js";
import { echoObservedSourceWindow } from "./echo-observed-source-window.js";
import { echoObservationsInSourceWindow } from "./echo-observation-window.js";
import { echoLyricBoundary } from "./echo-lyric-time.js";
import { echoLyricWordTimingPolicy } from "./echo-lyric-template-runtime.js";
const STOP = new Set(["the", "and", "for", "with", "from", "this", "that", "video", "scene", "card", "media", "shot", "into", "over", "under"]);
export const ECHO_SEMANTIC_TOKENIZER_VERSION = "unicode-nfkc-v1";

export function echoSemanticTokens(values) {
  return [...new Set((Array.isArray(values) ? values : [values]).flat(Infinity)
    .flatMap(value => String(value || "").normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u))
    .filter(value => (value.length > 2 || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value)) && !STOP.has(value)))];
}
const tokens = echoSemanticTokens;

/** Prepared observations supply lexical inferences only. Cache tokenization by
 * immutable frame object, score only the destination's actual source window,
 * and retain compact revision references instead of copying raw annotations. */
export function createEchoObservedContentRanker({lyricCues=[],timingSource="missing"}={}) {
  if(!Array.isArray(lyricCues)||lyricCues.length>4096)throw Error("Observed matching exceeds the lyric cue budget.");
  let textBytes=0;
  const lines=lyricCues.flatMap((line,index)=>{
    const start=echoLyricBoundary(line,"start",NaN),end=echoLyricBoundary(line,"end",NaN);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)return [];
    const text=String(line.text||line.line||"");textBytes+=text.length;
    const words=Array.isArray(line.words)?line.words:[];
    if(words.length>1024)throw Error("Observed matching exceeds the lyric word budget.");
    textBytes+=words.reduce((sum,word)=>sum+String(word.word||word.text||"").length,0);
    if(textBytes>1024*1024)throw Error("Observed matching exceeds the lyric text budget.");
    return [{id:String(line.id||`lyric:${index}`),start,end,text,words,policy:echoLyricWordTimingPolicy(line,timingSource)}];
  });
  const frameTokens=new WeakMap();
  function lexemes(row){
    if(frameTokens.has(row))return frameTokens.get(row);
    const result=new Map();let characters=0;
    const annotations=[...(row.labels||[]),...(row.textLines||[])];
    if(annotations.length>1024){frameTokens.set(row,null);return null;}
    for(const annotation of annotations){
      const text=String(annotation.text||"");characters+=text.length;
      if(text.length>4096||characters>65536){frameTokens.set(row,null);return null;}
      if(typeof annotation.confidence!=="number"||!Number.isFinite(annotation.confidence)||annotation.confidence<=0||annotation.confidence>1)continue;
      for(const token of tokens(text))result.set(token,Math.max(result.get(token)||0,annotation.confidence));
      if(result.size>4096){frameTokens.set(row,null);return null;}
    }
    frameTokens.set(row,result);return result;
  }
  function context(slot){
    const start=slot.startSeconds,end=slot.endSeconds;
    const active=lines.filter(line=>line.start<end&&line.end>start);
    const phraseTokens=tokens(active.flatMap(line=>line.policy.mode==="word"
      ? line.words.filter(word=>echoLyricBoundary(word,"start",NaN)<end&&echoLyricBoundary(word,"end",NaN)>start).map(word=>word.word||word.text||"")
      : [line.text]));
    const sectionLines=Number.isFinite(slot.sectionStartSeconds)&&Number.isFinite(slot.sectionEndSeconds)
      ? lines.filter(line=>line.start<slot.sectionEndSeconds&&line.end>slot.sectionStartSeconds) : [];
    const sectionTokens=tokens([slot.sectionLabel,slot.sectionType,...sectionLines.map(line=>line.text)]);
    return {phraseTokens,sectionTokens,budgetExceeded:phraseTokens.length>256||sectionTokens.length>256,
      lyricTimingSource:timingSource,phraseCount:active.length,
      phrases:active.slice(0,8).map(({id,start,end,policy})=>({id,startSeconds:start,endSeconds:end,mode:policy.mode,reason:policy.reason})),
      sectionRange:sectionLines.length?{startSeconds:slot.sectionStartSeconds,endSeconds:slot.sectionEndSeconds}:null};
  }
  function score(asset,slot,cueContext=context(slot)){
    const mapping=echoObservedSourceWindow(asset,slot),prepared=asset.contentEvidence||{};
    const observations=prepared.observations||[];
    const selection=mapping.window&&!cueContext.budgetExceeded&&Array.isArray(observations)&&observations.length<=64
      ? echoObservationsInSourceWindow(observations,mapping.window) : {observations:[],reason:cueContext.budgetExceeded?"lyric-context-budget-exceeded":observations.length>64?"source-observation-budget-exceeded":mapping.reason};
    const usable=selection.observations.map(row=>({row,tokens:lexemes(row)})).filter(item=>item.tokens?.size);
    const match=wanted=>{
      if(!wanted.length||!usable.length)return {value:null,matches:[],matchCount:0,tokenCount:wanted.length};
      const matches=wanted.flatMap(token=>{const confidence=Math.max(...usable.map(item=>item.tokens.get(token)||0));return confidence>0?[{token,confidence}]:[];});
      return {value:matches.reduce((sum,item)=>sum+item.confidence,0)/wanted.length,matches:matches.slice(0,12),matchCount:matches.length,tokenCount:wanted.length};
    };
    const phrase=match(cueContext.phraseTokens),section=match(cueContext.sectionTokens);
    return {schemaVersion:"hapa.echo.observed-lexical-match.v1",status:usable.length?"inferred-limited":"unavailable",
      reason:usable.length?null:selection.reason||"no-confidence-bearing-annotations",semanticConfidence:null,
      sourceSha256:mapping.window?.sourceSha256||null,sourceWindow:mapping.window||null,artifactRevision:prepared.revision||null,
      tokenizerVersion:ECHO_SEMANTIC_TOKENIZER_VERSION,phrase,section,lyricTimingSource:cueContext.lyricTimingSource,
      phrases:cueContext.phrases,phraseCount:cueContext.phraseCount,sectionRange:cueContext.sectionRange,
      frameCount:usable.length,frames:usable.slice(0,8).map(({row})=>({frameId:row.frameId,revision:row.revision,pointSeconds:row.pointSeconds,provider:row.provider,recognitionFrameBinding:row.recognitionFrameBinding})),
      limitations:["sampled-label-and-ocr-overlap-not-scene-understanding","no-calibrated-cut-confidence","no-depicted-identity-action-or-emotion-inference","sampled-points-not-continuous-coverage"]};
  }
  return {context,score};
}

function overlap(wanted, offered) {
  if (!wanted.length || !offered.length) return null;
  const offeredSet = new Set(offered);
  return wanted.filter((value) => offeredSet.has(value)).length / wanted.length;
}

export function prepareSemanticMediaCandidate(asset, parent = {}) {
  const technical = asset.metadata?.echosTechnicalAffordance || {};
  const semantic = asset.metadata?.echosSemanticAffordance || {};
  const fieldValues = Object.values(semantic.fields || {}).flatMap((field) => Array.isArray(field?.value) ? field.value : [field?.value]);
  return {
    ...asset,
    owner: parent,
    id: String(asset.id || asset.uri),
    title: String(asset.title || asset.name || parent.title || asset.id || "Untitled media"),
    uri: String(asset.uri || ""),
    posterUri: String(technical.posterUri || asset.thumbnailUri || ""),
    technical,
    semantic,
    tokens: tokens([asset.title, asset.name, parent.title, parent.name, fieldValues]),
    objects: tokens(semantic.fields?.objects?.value || asset.metadata?.objects || []),
    actions: tokens(semantic.fields?.actions?.value || asset.metadata?.actions || []),
    motion: semantic.fields?.motion?.value || asset.metadata?.motion || null,
    shotType: semantic.fields?.shotType?.value || asset.metadata?.shotType || null,
    flowType: asset.metadata?.flowType || null,
    truthStatus: technical.status === "verified-source-file" ? "technical-verified-semantic-inferred" : "unverified",
  };
}

export function rankSemanticMediaCandidates({ slot, candidates, canon = {}, contextPacket = null, lyricText = "", previous = [], pins = [], bans = [], topK = 5, constraints = {} }) {
  const wanted = tokens([slot.sectionLabel, slot.sectionType, lyricText, (canon.motifs || []).map((item) => item.token || item), canon.character?.avatarName]);
  const actionWanted = tokens([slot.sectionType, slot.editReason, lyricText]);
  const contextNodes = contextPacket ? [contextPacket.song, ...(contextPacket.allowedCharacters || []), ...(contextPacket.cards || []), ...(contextPacket.scenes || [])].filter(Boolean) : [];
  const contextTokens = tokens(contextNodes.flatMap((node) => [node.title, node.summary, node.tags]));
  const pinSet = new Set(pins);
  const eligibilityConstraints = mergeEchoMediaConstraints(
    mergeEchoMediaConstraints(constraints, slot.mediaConstraints), { pins, bans, previous },
  );
  const ranked = candidates.map((candidate) => {
    const eligibility = evaluateEchoMediaEligibility(candidate, eligibilityConstraints);
    const hardFilters = eligibility.reasons;
    const motif = overlap(wanted, candidate.tokens);
    const objectAction = overlap(actionWanted, [...candidate.objects, ...candidate.actions]);
    const technicalTruth = candidate.technical?.status === "verified-source-file" ? 1 : 0;
    const exactContextNodes = contextNodes.filter((node) => (node.mediaAttachPack || []).some((media) => media.id === candidate.id));
    const contextOverlap = overlap(contextTokens, candidate.tokens);
    const contextValue = exactContextNodes.length ? 1 : contextOverlap;
    const contextEvidence = exactContextNodes.length
      ? exactContextNodes.map((node) => `${node.kind}:${node.id}:${node.source?.file || "source-unavailable"}${node.source?.linkPaths?.[0] || ""}`)
      : contextValue === null ? [] : contextNodes.filter((node) => tokens([node.title, node.summary, node.tags]).some((token) => candidate.tokens.includes(token))).slice(0, 4).map((node) => `${node.kind || "context"}:${node.id}:${node.source?.file || "source-unavailable"}${node.source?.linkPaths?.[0] || ""}`);
    const aspect = candidate.technical?.width && candidate.technical?.height
      ? (slot.preferredAspect === "portrait" ? candidate.technical.height > candidate.technical.width : candidate.technical.width >= candidate.technical.height) ? 1 : 0
      : null;
    const motion = slot.energy === null || slot.energy === undefined || !candidate.motion
      ? null
      : slot.energy >= 0.65 ? /continuous|progressive|motion/.test(candidate.motion) ? 1 : 0.25 : /loop|hold|still/.test(candidate.motion) ? 1 : 0.5;
    const components = {
      characterCanon: { value: contextValue, weight: 0.16, status: contextValue === null ? "unmeasured" : exactContextNodes.some((node) => node.humanVerified) ? "measured" : "inferred", evidence: contextEvidence },
      lyricMotif: { value: motif, weight: 0.25, status: motif === null ? "unmeasured" : "inferred", evidence: wanted.filter((value) => candidate.tokens.includes(value)) },
      emotion: { value: null, weight: 0.12, status: "unmeasured", evidence: [] },
      objectAction: { value: objectAction, weight: 0.15, status: objectAction === null ? "unmeasured" : "inferred", evidence: actionWanted.filter((value) => candidate.objects.includes(value) || candidate.actions.includes(value)) },
      shotRoleAspect: { value: aspect, weight: 0.10, status: aspect === null ? "unmeasured" : "measured", evidence: aspect === null ? [] : [`${candidate.technical.width}x${candidate.technical.height}`] },
      motionEnergy: { value: motion, weight: 0.10, status: motion === null ? "unmeasured" : "inferred", evidence: candidate.motion ? [candidate.motion] : [] },
      flowContinuity: { value: candidate.flowType ? 0.5 : null, weight: 0.04, status: candidate.flowType ? "inferred" : "unmeasured", evidence: candidate.flowType ? [candidate.flowType] : [] },
      technicalTruth: { value: technicalTruth, weight: 0.08, status: technicalTruth ? "measured" : "missing", evidence: technicalTruth ? [`sha256:${candidate.technical.contentHash?.value || "missing"}`] : [] },
    };
    const measured = Object.values(components).filter((component) => component.value !== null);
    const weight = measured.reduce((sum, component) => sum + component.weight, 0);
    const utility = weight ? measured.reduce((sum, component) => sum + component.value * component.weight, 0) / weight : null;
    const semanticStatuses = measured.filter((component) => component.status === "inferred");
    const confidence = utility === null ? null : Math.min(semanticStatuses.length ? 0.55 : 0.7, 0.25 + weight * 0.45);
    return {
      mediaId: candidate.id,
      title: candidate.title,
      uri: candidate.uri,
      posterUri: candidate.posterUri,
      eligible: eligibility.eligible,
      eligibility,
      pinned: pinSet.has(candidate.id),
      hardFilters,
      utility: utility === null ? null : Number(utility.toFixed(4)),
      confidence: confidence === null ? null : Number(confidence.toFixed(3)),
      confidenceBasis: semanticStatuses.length ? "capped-inferred-unreviewed-semantic-metadata" : "measured-technical-only",
      components,
      evidenceArtifact: candidate.semantic?.artifactId || null,
      semanticTruth: candidate.semantic?.status || "unmeasured",
    };
  }).sort((left, right) => Number(right.pinned) - Number(left.pinned) || Number(right.eligible) - Number(left.eligible) || Number(right.utility ?? -1) - Number(left.utility ?? -1) || left.mediaId.localeCompare(right.mediaId));
  const eligible = ranked.filter((item) => item.eligible).slice(0, Math.max(1, topK));
  return { schemaVersion: "hapa.echo.semantic-media-ranking.v2", tokenizerVersion: ECHO_SEMANTIC_TOKENIZER_VERSION, status: eligible.length ? "satisfied" : "unsatisfied", unsatisfied: eligible.length ? null : echoUnsatisfiedMediaConstraint(ranked.map(item => item.eligibility)), selected: eligible[0] || null, alternatives: eligible.slice(1), rejected: ranked.filter((item) => !item.eligible).slice(0, Math.max(1, topK)), pins, bans, hardContinuityFilters: ["runtime-uri-required", "operator-bans", "source-policy", "source-bytes", "required-cast-scene", "output-crop", "six-shot-repeat-window"], confidenceRule: "Inferred-unreviewed semantic metadata is capped at 0.55 and never becomes verified truth." };
}
