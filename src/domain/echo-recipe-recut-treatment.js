import {NARRATIVE_VARIANT_RECIPES} from './echo-director-recipes.js';
import {buildEchoRecipeEventTracks,buildEchoRecipeModulationBindings,buildEchoRecipeAccentCards,echoRecipeBaseOpacity,echoRecipeOpacity,echoRecipeLyrics} from './echo-recipe-execution.js';
import {normalizeEchoLyricContract} from './echo-lyric-contract.js';
import {normalizeEchoPersistentShaderSlots} from './echo-persistent-shader-slots.js';
import {admitMergedAccentEvents} from './accent-event-track.js';
import {ECHO_SECTION_VISUAL_BUDGET_SCHEMA} from './hyperframes-visualizer-runtime.js';

const clone=value=>structuredClone(value);
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
function knownRecipe(recipe){
  const known=NARRATIVE_VARIANT_RECIPES[recipe?.id];
  if(!known||JSON.stringify(ordered(known))!==JSON.stringify(ordered(recipe)))throw Error('Recipe execution requires a supported versioned recipe snapshot.');
  return known;
}

const interval=row=>({startSeconds:Number(row.startSeconds??row.start_sec??row.atSeconds),endSeconds:Number(row.endSeconds??row.end_sec)});
const inside=(row,windows)=>{const span=interval(row);return windows.some(window=>span.startSeconds>=window.startSeconds&&span.endSeconds<=window.endSeconds&&span.endSeconds>span.startSeconds)};
const locked=(locks,id)=>Boolean(id)&&locks.some(lock=>lock.targetId===id||lock.target===id);
const rowLocked=row=>row.locked===true||(row.locks||[]).some(lock=>['shader','opacity','treatment'].includes(lock));
export function mergeEchoTreatmentWindows(windows=[]){
  const result=[];
  for(const window of windows.map(interval).sort((a,b)=>a.startSeconds-b.startSeconds)){
    if(!Number.isFinite(window.startSeconds)||!Number.isFinite(window.endSeconds)||window.endSeconds<=window.startSeconds)throw Error('Invalid recipe treatment window.');
    const previous=result.at(-1);
    if(previous&&window.startSeconds<=previous.endSeconds+1e-8)previous.endSeconds=Math.max(previous.endSeconds,window.endSeconds);
    else result.push({...window});
  }
  return result;
}
function assignWindows(prior,windows,recipe){
  let retained=clone(prior||[]);
  for(const window of windows)retained=retained.flatMap(row=>{
    if(row.endSeconds<=window.startSeconds||row.startSeconds>=window.endSeconds)return [row];
    return [...(row.startSeconds<window.startSeconds?[{...row,endSeconds:window.startSeconds}]:[]),...(row.endSeconds>window.endSeconds?[{...row,startSeconds:window.endSeconds}]:[])];
  });
  const result=[...retained,...windows.map(window=>({...window,recipe:clone(recipe)}))].sort((a,b)=>a.startSeconds-b.startSeconds);
  if(result.length>256)throw Error('Recipe treatment exceeds 256 intervals. Consolidate with a whole-song recut.');
  return result;
}

/** Durable source edits use their authored opacity as a baseline, so replaying
 * a recipe does not repeatedly dim it. A subsequent manual opacity edit becomes
 * the new baseline. Shader IDs and source evidence remain untouched. */
export function applyEchoRecutTreatment(project,{recipe,windows=[],locks=[],seed}={}){
  recipe=knownRecipe(recipe);
  windows=mergeEchoTreatmentWindows(windows);
  const receipt={schemaVersion:'hapa.echo.recipe-treatment.v1',recipeId:recipe.id,recipeRevision:recipe.revision,windows,shaderCuesChanged:0,persistentSlotsChanged:0,lyricsChanged:false,limitations:[]};
  if(!windows.length)return {project,receipt};
  const wholeSong=windows.length===1&&windows[0].startSeconds===0&&windows[0].endSeconds===Number(project.duration);
  const next={...project};
  const sourceLocks=echoRecipeOperatorLocks(project,locks);
  const shaderLocked=locked(sourceLocks,'shader-treatment');
  const applyRow=(row,fallback)=>{
    const baseOpacity=echoRecipeBaseOpacity(row.opacity??fallback,row.recipe_treatment),opacity=echoRecipeOpacity(baseOpacity,recipe);
    return {...row,opacity,recipe_treatment:{schemaVersion:'hapa.echo.recipe-opacity.v1',baseOpacity,appliedOpacity:opacity,recipeId:recipe.id,recipeRevision:recipe.revision}};
  };
  if(!shaderLocked&&Array.isArray(project.visualizer_timeline))next.visualizer_timeline=project.visualizer_timeline.map((row,index)=>{
    if(row.disabled||row.knockedOut||row.knocked_out||row.visualizer_id==='none'||rowLocked(row)||locked(sourceLocks,row.id))return row;
    if(!inside(row,windows)){receipt.limitations.push('shader-cue-outside-complete-selected-window-preserved');return row}
    const changed=applyRow(row,index%3===2?.34:.48);if(JSON.stringify(changed)!==JSON.stringify(row))receipt.shaderCuesChanged++;return changed;
  });
  if(!shaderLocked&&wholeSong&&Array.isArray(project.persistent_shader_slots)){
    const normalized=normalizeEchoPersistentShaderSlots(project);
    next.persistent_shader_slots=project.persistent_shader_slots.map((row,index)=>{
      const resolved=normalized.find(slot=>slot.id===row.id)||normalized[index];
      if(!resolved?.enabled||rowLocked(row)||locked(sourceLocks,row.id))return row;
      const changed=applyRow(row,resolved.opacity);if(JSON.stringify(changed)!==JSON.stringify(row))receipt.persistentSlotsChanged++;return changed;
    });
  }else if(!shaderLocked&&!wholeSong&&(project.persistent_shader_slots||[]).some(row=>row.enabled))receipt.limitations.push('persistent-shader-mix-needs-whole-song-window');
  const previous=project.director_patch_lineage?.recipeExecution||{};
  const execution={...clone(previous),schemaVersion:'hapa.echo.recipe-execution-windows.v1'};
  // A whole-song recut opts a legacy cut into section budgets. Partial edits
  // retain its existing policy so they cannot change layers outside the range.
  if(wholeSong&&!shaderLocked)execution.visualBudgetPolicy={schemaVersion:ECHO_SECTION_VISUAL_BUDGET_SCHEMA,sections:clone(project.director_show_graph?.directorV2?.cueGraph?.sections||[]),maxVisualizerLayers:recipe.maxVisualizerLayers};
  for(const [key,target] of [['accentWindows','accents'],['visualTimeWindows','visual-time']])if(!locked(sourceLocks,target))execution[key]=assignWindows(previous[key],windows,recipe);
  if(wholeSong){
    execution.bindingRecipe=clone(recipe);
    execution.bindingSeed=String(seed??'');
    execution.bindingRecipes={...(previous.bindingRecipes||{})};
    for(const [kind,target] of Object.entries({visualizer_uniform:'shader-treatment',camera:'camera',edit_permission:'accents',visual_time:'visual-time'}))if(!locked(sourceLocks,target))execution.bindingRecipes[kind]=clone(recipe);
    execution.bindingItemLocks=sourceLocks.filter(lock=>lock.targetKind==='binding');
    if(!locked(sourceLocks,'lyric-style')){next.lyrics=echoRecipeLyrics(project,recipe);receipt.lyricsChanged=JSON.stringify(next.lyrics)!==JSON.stringify(normalizeEchoLyricContract(project))}
  }else receipt.limitations.push('global-stem-depth-and-lyric-style-preserved-for-ranged-recut');
  execution.eventLocks=sourceLocks.filter(lock=>lock.targetKind==='event');
  // Freeze the executable event result at the edit boundary. Replaying every
  // historical recipe window against different neighboring budgets can add
  // previously suppressed accents outside the user's latest selection.
  if(project.director_show_graph){
    const current=applyEchoRecutExecutionToGraph(project.director_show_graph,project).directorV2||{};
    const eventTracks=buildEchoRecipeEventTracks({cues:current.cueGraph?.cues||[],sections:current.cueGraph?.sections||[],recipe,durationSeconds:Number(project.duration),reducedMotion:normalizeEchoLyricContract(next).reducedMotion});
    execution.materializedEventTracks=clone(previous.materializedEventTracks||{});
    for(const [field,target] of [['accentTrack','accents'],['visualTimeTrack','visual-time']]){
      if(locked(sourceLocks,target))continue;
      const baseline=current[field]||{...eventTracks[field],eventCount:0,events:[]};
      execution.materializedEventTracks[field]=mergeEventWindows(baseline,windows.map(window=>({...window,recipe})),()=>eventTracks[field],execution.eventLocks);
    }
  }
  next.director_patch_lineage={...(project.director_patch_lineage||{}),recipeExecution:execution};
  receipt.limitations=[...new Set(receipt.limitations)];
  return {project:next,receipt};
}

function mergeEventWindows(base,windows,build,locks){
  const protectedEvents=(base?.events||[]).filter(event=>event.locked===true||locked(locks,event.id)||!inside(event,windows));
  let additions=windows.flatMap(window=>build(window.recipe).events.filter(event=>inside(event,[window])&&!protectedEvents.some(prior=>interval(prior).startSeconds<event.endSeconds&&interval(prior).endSeconds>(event.atSeconds??event.startSeconds))));
  const flashTimes=protectedEvents.filter(event=>event.safety?.flashCount>0).map(event=>event.atSeconds);
  additions=additions.filter(event=>{if(!(event.safety?.flashCount>0))return true;if(flashTimes.some(time=>Math.abs(time-event.atSeconds)<1/3-1e-6))return false;flashTimes.push(event.atSeconds);return true});
  const admission = base?.sectionPolicy ? admitMergedAccentEvents(protectedEvents, additions) : null;
  const events=[...new Map((admission?.events || [...protectedEvents,...additions]).map(event=>[event.id,event])).values()].sort((a,b)=>(a.atSeconds??a.startSeconds)-(b.atSeconds??b.startSeconds)||a.id.localeCompare(b.id));
  return {...base,eventCount:events.length,events,...(admission ? { mergedSectionAdmission: admission.receipt } : {})};
}

/** This projection runs in the browser, the batch worker and saved-cut replay.
 * Reapplying it replaces its owned event intervals instead of stacking them. */
export function applyEchoRecutExecutionToGraph(graph,project){
  const execution=project.director_patch_lineage?.recipeExecution;
  if(!execution)return graph;
  if(execution.schemaVersion!=='hapa.echo.recipe-execution-windows.v1')throw Error('Unsupported recipe execution version.');
  const director=graph.directorV2||{},cues=director.cueGraph?.cues||[],durationSeconds=Number(project.duration),reducedMotion=normalizeEchoLyricContract(project).reducedMotion;
  const cache=new Map();
  const tracks=recipe=>{recipe=knownRecipe(recipe);const key=JSON.stringify(recipe);if(!cache.has(key))cache.set(key,buildEchoRecipeEventTracks({cues,sections:director.cueGraph?.sections||[],recipe,durationSeconds,reducedMotion}));return cache.get(key)};
  const updated={...director};
  if(execution.visualBudgetPolicy)updated.visualBudgetPolicy=clone(execution.visualBudgetPolicy);
  for(const [key,field] of [['accentWindows','accentTrack'],['visualTimeWindows','visualTimeTrack']]){
    const windows=execution[key]||[];if(!windows.length)continue;
    if(windows.length>256||windows.some(row=>row.startSeconds<0||row.endSeconds>durationSeconds||row.endSeconds<=row.startSeconds))throw Error('Invalid persisted recipe interval.');
    for(const window of windows)knownRecipe(window.recipe);
    const baseline=director[field]||{...tracks(windows[0].recipe)[field],eventCount:0,events:[]};
    updated[field]=execution.materializedEventTracks?.[field]
      ? clone(execution.materializedEventTracks[field])
      : mergeEventWindows(baseline,windows,recipe=>tracks(recipe)[field],execution.eventLocks||[]);
  }
  if(updated.accentTrack!==director.accentTrack){
    const oldIds=new Set((director.accentTrack?.events||[]).map(event=>event.id));
    updated.effects=[...(director.effects||[]).filter(event=>!oldIds.has(event.id)),...updated.accentTrack.events];
  }
  if(execution.bindingRecipe){
    knownRecipe(execution.bindingRecipe);
    updated.recipe=clone(execution.bindingRecipe);updated.seed=execution.bindingSeed;updated.variantSeed=execution.bindingSeed;
    const layers=(director.visualizerLayers||[]).filter(layer=>layer.layerAdmission?.status==='admitted');
    const previous=new Map((director.modulationBindings||[]).map(binding=>[binding.id,binding]));
    for(const [kind,recipe] of Object.entries(execution.bindingRecipes||{})){
      knownRecipe(recipe);
      for(const binding of buildEchoRecipeModulationBindings(layers,recipe).filter(binding=>binding.target?.kind===kind)){
        if(!previous.get(binding.id)?.locked&&!locked(execution.bindingItemLocks||[],binding.id))previous.set(binding.id,binding);
      }
    }
    updated.modulationBindings=[...previous.values()];
    updated.timeModulation=updated.modulationBindings.filter(binding=>binding.target?.kind==='visual_time');
  }
  if(execution.accentWindows?.length){
    const mediaCards=graph.tracks?.find(track=>['foundation','media'].includes(track.role))?.cards||[];
    const resolveMediaAt=time=>mediaCards.find(card=>card.startSeconds<=time&&card.endSeconds>time)?.media||mediaCards[0]?.media||{id:'none',sourceKind:'missing'};
    graph={...graph,tracks:(graph.tracks||[]).map(track=>track.role==='accent'?{...track,cards:mergeEventWindows({events:track.cards},execution.accentWindows,recipe=>({events:buildEchoRecipeAccentCards({cueGraph:{...director.cueGraph,editCues:director.cueGraph?.editCues||[],durationSeconds},recipe,resolveMediaAt})}),execution.eventLocks||[]).events}:track)};
  }
  updated.recipeExecution=clone(execution);
  return {...graph,directorV2:updated};
}

/** Full compilation and recuts use the same operator target vocabulary. */
export function echoRecipeOperatorLocks(project={},locks=[]) {
  return [...new Map([...locks,...(project.director_show_graph?.directorV2?.locks||[])]
    .map(lock=>({...lock,targetId:lock.targetId||lock.target||''}))
    .map(lock=>[JSON.stringify(ordered(lock)),lock])).values()];
}
export function hasEchoRecipeTreatmentLocks(project={},locks=[]) {
  const targets=new Set(['shader-treatment','camera','accents','visual-time','lyric-style','media-casting','timing']);
  return locks.some(lock=>targets.has(lock.targetId)||['event','binding'].includes(lock.targetKind))
    || [...(project.visualizer_timeline||[]),...(project.persistent_shader_slots||[])].some(row=>rowLocked(row)||locked(locks,row.id))
    || (project.director_show_graph?.directorV2?.modulationBindings||[]).some(row=>row.locked)
    || (project.director_show_graph?.tracks||[]).filter(track=>track.role==='visualizer').some(track=>(track.cards||[]).some(card=>locked(locks,card.id)))
    || ['accentTrack','visualTimeTrack'].some(field=>(project.director_show_graph?.directorV2?.[field]?.events||[]).some(row=>row.locked));
}

/** Preserve current projected values, including prior recipes and manual edits.
 * Only treatment values are restored: source eligibility and shader admission
 * remain the compiler's responsibility. Call before hashing the executable cut. */
export function preserveEchoCompiledRecipeLocks(graph,baseline,project,locks) {
  const director=graph.directorV2,prior=baseline.directorV2||{};
  const updated={...director},receipt={schemaVersion:'hapa.echo.recipe-lock-preservation.v1',shaderCards:[],eventIds:[],bindingIds:[],targets:[]};
  const global=target=>{const found=locked(locks,target);if(found)receipt.targets.push(target);return found};
  const shaderLocked=global('shader-treatment');
  const baselineCards=(baseline.tracks||[]).filter(t=>t.role==='visualizer').flatMap(t=>t.cards||[]);
  const cardKey=card=>card.persistentSlotId ? 'slot:'+card.persistentSlotId : 'cue:'+(card.visualization?.sourceCueIndex??card.sourceCueIndex??card.id);
  // Timeline projection may replace a shader or reuse an older template. Its
  // row order, rather than that template's sourceCueIndex, owns the current cue.
  let cueIndex=0;
  const priorCards=new Map(baselineCards.map(card=>[card.persistentSlotId?cardKey(card):Array.isArray(project.visualizer_timeline)?'cue:'+cueIndex++:cardKey(card),card]));
  const tracks=graph.tracks.map(track=>track.role!=='visualizer'?track:{...track,cards:track.cards.map(card=>{
    const row=card.persistentSlotId?(project.persistent_shader_slots||[]).find(r=>r.id===card.persistentSlotId)
      :(project.visualizer_timeline||[])[card.visualization?.sourceCueIndex];
    if(!shaderLocked&&!rowLocked(row||{})&&!locked(locks,row?.id)&&!locked(locks,card.id))return card;
    const before=priorCards.get(cardKey(card));
    if(!before)throw Error('Locked shader has no current source projection: '+card.id);
    if(before.visualization?.sourceId!==card.visualization?.sourceId){
      const error=Error('Locked shader source changed. Review and resolve the shader replacement before compiling: '+card.id);
      error.code='echo_locked_shader_source_changed';
      error.result={cardId:card.id,currentSourceId:before.visualization?.sourceId,compiledSourceId:card.visualization?.sourceId};
      throw error;
    }
    receipt.shaderCards.push(card.id);
    return {...card,parameters:{...card.parameters,...Object.fromEntries(['opacity','visualizerControls','visualizerMappings']
      .filter(key=>before.parameters?.[key]!==undefined).map(key=>[key,clone(before.parameters[key])]))}};
  })});
  const duration=Number(project.duration),windows=[{startSeconds:0,endSeconds:duration,recipe:null}];
  const eventLocks=locks.filter(lock=>lock.targetKind==='event');
  const accentsLocked=global('accents'),timeLocked=global('visual-time');
  for(const [field,whole]of [['accentTrack',accentsLocked],['visualTimeTrack',timeLocked]]){
    const generated=director[field],base=prior[field]||{...generated,eventCount:0,events:[]};
    updated[field]=whole?clone(base):mergeEventWindows(base,windows,()=>generated,eventLocks);
    receipt.eventIds.push(...(updated[field].events||[]).filter(event=>whole||event.locked||locked(eventLocks,event.id)).map(event=>event.id));
  }
  const accentIds=new Set((director.accentTrack?.events||[]).map(e=>e.id));
  updated.effects=accentsLocked?clone(prior.effects||[]):[...(director.effects||[]).filter(e=>!accentIds.has(e.id)),...updated.accentTrack.events];
  if(!tracks.some(track=>track.role==='accent')){
    const before=(baseline.tracks||[]).find(track=>track.role==='accent');
    if(before&&(accentsLocked||(before.cards||[]).some(card=>card.locked||locked(eventLocks,card.id))))tracks.push({...before,cards:[]});
  }
  for(let index=0;index<tracks.length;index++)if(tracks[index].role==='accent'){
    const before=(baseline.tracks||[]).find(t=>t.role==='accent')?.cards||[];
    tracks[index]={...tracks[index],cards:accentsLocked?clone(before):mergeEventWindows({events:before},windows,()=>({events:tracks[index].cards}),eventLocks).events};
  }
  const kindLocks={visualizer_uniform:shaderLocked,camera:global('camera'),edit_permission:accentsLocked,visual_time:timeLocked};
  const previous=prior.modulationBindings||[],next=director.modulationBindings||[];
  const itemLocks=locks.filter(lock=>lock.targetKind==='binding');
  const keep=b=>Boolean(kindLocks[b.target?.kind])||locked(itemLocks,b.id)||b.locked===true;
  const retained=previous.filter(keep),retainedIds=new Set(retained.map(b=>b.id));
  updated.modulationBindings=[...next.filter(b=>!kindLocks[b.target?.kind]&&!locked(itemLocks,b.id)&&!retainedIds.has(b.id)),...clone(retained)];
  // Preserve the source ordering; runtime binding order may be significant.
  const order=new Map(previous.map((b,index)=>[b.id,index]));
  updated.modulationBindings.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));
  receipt.bindingIds=retained.map(b=>b.id);
  updated.timeModulation=updated.modulationBindings.filter(b=>b.target.kind==='visual_time');
  let song=graph.song;
  if(global('lyric-style')){
    const style=normalizeEchoLyricContract(project);
    song={...song,lyricOverlay:{...song.lyricOverlay,...Object.fromEntries(['enabled','templateId','templateLabel','legacyVariant','position','style','reducedMotion','motionIntensity','safeArea'].map(key=>[key,clone(style[key])]))}};
  }
  updated.lockPreservation=receipt;
  return {...graph,song,tracks,directorV2:updated};
}
