import {NARRATIVE_VARIANT_RECIPES} from './echo-director-recipes.js';
import {buildEchoRecipeEventTracks,buildEchoRecipeModulationBindings,buildEchoRecipeAccentCards,echoRecipeBaseOpacity,echoRecipeOpacity,echoRecipeLyrics} from './echo-recipe-execution.js';
import {normalizeEchoLyricContract} from './echo-lyric-contract.js';
import {normalizeEchoPersistentShaderSlots} from './echo-persistent-shader-slots.js';

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
  const sourceLocks=[...locks,...(project.director_show_graph?.directorV2?.locks||[])];
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
  next.director_patch_lineage={...(project.director_patch_lineage||{}),recipeExecution:execution};
  receipt.limitations=[...new Set(receipt.limitations)];
  return {project:next,receipt};
}

function mergeEventWindows(base,windows,build,locks){
  const protectedEvents=(base?.events||[]).filter(event=>event.locked===true||locked(locks,event.id)||!inside(event,windows));
  let additions=windows.flatMap(window=>build(window.recipe).events.filter(event=>inside(event,[window])&&!protectedEvents.some(prior=>interval(prior).startSeconds<event.endSeconds&&interval(prior).endSeconds>(event.atSeconds??event.startSeconds))));
  const flashTimes=protectedEvents.filter(event=>event.safety?.flashCount>0).map(event=>event.atSeconds);
  additions=additions.filter(event=>{if(!(event.safety?.flashCount>0))return true;if(flashTimes.some(time=>Math.abs(time-event.atSeconds)<1/3-1e-6))return false;flashTimes.push(event.atSeconds);return true});
  const events=[...new Map([...protectedEvents,...additions].map(event=>[event.id,event])).values()].sort((a,b)=>(a.atSeconds??a.startSeconds)-(b.atSeconds??b.startSeconds)||a.id.localeCompare(b.id));
  return {...base,eventCount:events.length,events};
}

/** This projection runs in the browser, the batch worker and saved-cut replay.
 * Reapplying it replaces its owned event intervals instead of stacking them. */
export function applyEchoRecutExecutionToGraph(graph,project){
  const execution=project.director_patch_lineage?.recipeExecution;
  if(!execution)return graph;
  if(execution.schemaVersion!=='hapa.echo.recipe-execution-windows.v1')throw Error('Unsupported recipe execution version.');
  const director=graph.directorV2||{},cues=director.cueGraph?.cues||[],durationSeconds=Number(project.duration),reducedMotion=normalizeEchoLyricContract(project).reducedMotion;
  const cache=new Map();
  const tracks=recipe=>{recipe=knownRecipe(recipe);const key=JSON.stringify(recipe);if(!cache.has(key))cache.set(key,buildEchoRecipeEventTracks({cues,recipe,durationSeconds,reducedMotion}));return cache.get(key)};
  const updated={...director};
  for(const [key,field] of [['accentWindows','accentTrack'],['visualTimeWindows','visualTimeTrack']]){
    const windows=execution[key]||[];if(!windows.length)continue;
    if(windows.length>256||windows.some(row=>row.startSeconds<0||row.endSeconds>durationSeconds||row.endSeconds<=row.startSeconds))throw Error('Invalid persisted recipe interval.');
    const baseline=director[field]||{...tracks(windows[0].recipe)[field],eventCount:0,events:[]};
    updated[field]=mergeEventWindows(baseline,windows,recipe=>tracks(recipe)[field],execution.eventLocks||[]);
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
        if(!locked(execution.bindingItemLocks||[],binding.id))previous.set(binding.id,binding);
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
