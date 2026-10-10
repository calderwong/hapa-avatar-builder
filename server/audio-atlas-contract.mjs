import {validateHarmony,harmonySummary} from './audio-atlas-harmony.mjs';
import {deriveActivity,activitySummary} from './audio-atlas-activity.mjs';
import {deriveNotes,notesSummary} from './audio-atlas-notes.mjs';
import {validateRhythm,rhythmSummary} from './audio-atlas-rhythm.mjs';
import {validatePitch,pitchSummary} from './audio-atlas-pitch.mjs';
import {validateTechnical,technicalSummary} from './audio-atlas-technical.mjs';
import {validateSpectrogram} from './audio-atlas-spectrogram.mjs';
import { createHash } from 'node:crypto';

export const CONTRACT_VERSION = 'hapa.audio-atlas.contract.v1';
export const EXECUTION_STATES = ['not_requested','queued','running','complete','partial','unsupported','failed','blocked_by_policy'];
export const RESULT_STATES = ['present','absent','unknown','not_applicable'];
export const REVIEW_STATES = ['unreviewed','needs_review','accepted_by_human','accepted_by_policy','rejected'];
const claims = ['measured','model_inferred','human_asserted','imported_declared','derived'];
const fail = message => { throw Object.assign(new Error(`Atlas contract: ${message}`),{statusCode:422}); };
const check = (ok,message) => { if(!ok)fail(message); };
const integer = (n,min=0) => Number.isSafeInteger(n)&&n>=min;
const finite = n => typeof n==='number'&&Number.isFinite(n);
const text = s => typeof s==='string'&&s.length>0;
const sha = s => createHash('sha256').update(s).digest('hex');
function stable(v){return JSON.stringify(v&&typeof v==='object'?(Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))]))):v);}
const identity = (prefix,value) => `${prefix}:${sha(stable(value))}`;
const gcd = (a,b) => {a=a<0n?-a:a;while(b){const r=a%b;a=b;b=r;}return a;};
function fraction(n,d=1n){check(d>0n,'rational denominator must be positive');const g=gcd(n,d);return {numerator:String(n/g),denominator:String(d/g)};}
function ratio(v){check(v&&/^-?\d+$/.test(String(v.numerator))&&/^\d+$/.test(String(v.denominator)),'invalid rational');const n=BigInt(v.numerator),d=BigInt(v.denominator);check(d>0n,'rational denominator must be positive');return [n,d];}
function round(n,d,policy){let q=n/d,r=n%d;if(policy==='floor'&&r<0n)q--;if(policy==='ceil'&&r>0n)q++;const twice=2n*(r<0n?-r:r);if((policy==='nearest_ties_away'&&twice>=d)||(policy==='nearest_ties_even'&&(twice>d||(twice===d&&q%2n!==0n))))q+=n<0n?-1n:1n;check(q>=BigInt(Number.MIN_SAFE_INTEGER)&&q<=BigInt(Number.MAX_SAFE_INTEGER),'mapped coordinate exceeds safe integer');return Number(q);}
function segments(map){return map.kind==='affine'?[map.segment]:map.segments;}
export function validateTimeMap(map){
 check(map&&text(map.id)&&text(map.source_id)&&text(map.target_timeline_id),'time map identity required');
 check(['affine','piecewise'].includes(map.kind),'unknown time map kind');
 check(['floor','ceil','nearest_ties_away','nearest_ties_even'].includes(map.rounding),'explicit rounding policy required');
 check(map.measured_delay_samples===null||Number.isSafeInteger(map.measured_delay_samples),'delay must be measured integer or unknown');
 const rows=segments(map);check(Array.isArray(rows)&&rows.length>0,'time map segments required');let last=-1;
 for(const s of rows){check(integer(s.source_start)&&integer(s.source_end)&&s.source_end>s.source_start&&s.source_start>=last,'overlapping or invalid map domain');last=s.source_end;const [n]=ratio(s.scale);ratio(s.offset);check(n>0n,'time map scale must be positive');}
 return map;
}
function mapped(s,sample,rounding){const [n,d]=ratio(s.scale),[on,od]=ratio(s.offset);const num=BigInt(sample)*n*od+on*d,den=d*od;return {exact:fraction(num,den),sample:round(num,den,rounding)};}
export function mapPoint(map,sample){validateTimeMap(map);check(integer(sample),'source coordinate must be a nonnegative safe integer');const s=segments(map).find(s=>s.source_start<=sample&&sample<s.source_end);check(s,'point outside map or inside unmapped gap');return mapped(s,sample,map.rounding);}
/** Preserve discontinuities: return separate mapped fragments, never a fabricated continuous span. */
export function mapSpan(map,start,end){
 validateTimeMap(map);check(integer(start)&&integer(end)&&end>start,'invalid source interval');let cursor=start;const out=[];
 for(const s of segments(map)){const a=Math.max(start,s.source_start),b=Math.min(end,s.source_end);if(a>=b)continue;check(a===cursor,'interval crosses unmapped gap');out.push({source_start:a,source_end:b,start:mapped(s,a,map.rounding),end:mapped(s,b,map.rounding)});cursor=b;}
 check(cursor===end,'interval extends beyond map');return out;
}

export const PAYLOAD_SCHEMAS = {
 'hapa.audio.transient':{version:1,shape:'instant',required:['strength'],units:{strength:'method-defined relative score'},implemented:true},
 'hapa.audio.word_candidate':{version:1,shape:'interval',required:['text','model_score','score_semantics'],units:{model_score:'uncalibrated score'},implemented:true},
 'hapa.audio.beat_candidate':{version:1,shape:'instant',required:['text','method'],units:{},implemented:true},
 'hapa.audio.downbeat_candidate':{version:1,shape:'instant',required:['text','method'],units:{},implemented:true},
 'hapa.audio.section_candidate':{version:1,shape:'interval',required:['text','method','functional_label','mean_rms_dbfs','boundary_evidence'],units:{mean_rms_dbfs:'mean frame RMS dBFS'},implemented:true},
 'hapa.audio.section_boundary_candidate':{version:1,shape:'instant',required:['text','method','novelty','threshold'],units:{novelty:'dimensionless squared feature distance'},implemented:true},
 'hapa.audio.transition_candidate':{version:1,shape:'interval',required:['text','method','transition_kind','evidence'],units:{delta_db:'dB',slope_db_per_second:'dB/s'},implemented:true},
 'hapa.audio.semantic_candidate':{version:1,shape:'interval',required:['text','ranked_concepts','score_semantics'],units:{cosine_similarity:'dimensionless cosine, not probability'},implemented:true},
};
export function validatePayload(kind,payload,shape){
 const schema=PAYLOAD_SCHEMAS[kind];check(schema,`unregistered observation kind ${kind}`);check(shape===schema.shape,`wrong shape for ${kind}`);
 check(payload&&typeof payload==='object'&&!Array.isArray(payload),'payload object required');for(const k of schema.required)check(Object.hasOwn(payload,k),`${kind} requires ${k}`);
 if(kind==='hapa.audio.transient')check(finite(payload.strength)&&payload.strength>=0,'invalid transient strength');
 else check(text(payload.text),'observation text required');
 if(kind==='hapa.audio.word_candidate'){check(payload.model_score===null||(finite(payload.model_score)&&payload.model_score>=0&&payload.model_score<=1),'invalid word score');check(text(payload.score_semantics),'word score semantics required');}
 if(kind==='hapa.audio.beat_candidate'||kind==='hapa.audio.downbeat_candidate')check(text(payload.method),'beat method required');
 if(['hapa.audio.section_candidate','hapa.audio.section_boundary_candidate','hapa.audio.transition_candidate'].includes(kind))check(text(payload.method),'structure method required');
 if(kind==='hapa.audio.section_candidate')check(payload.functional_label===null&&finite(payload.mean_rms_dbfs)&&text(payload.boundary_evidence),'invalid acoustic region payload or unsupported functional label');
 if(kind==='hapa.audio.section_boundary_candidate')check(finite(payload.novelty)&&payload.novelty>=0&&finite(payload.threshold)&&payload.threshold>0,'invalid boundary novelty');
 if(kind==='hapa.audio.transition_candidate'){
   check(['spectral_change_candidate','energy_rise_candidate','energy_drop_candidate','quiet_break_candidate','gradual_build_candidate'].includes(payload.transition_kind),'invalid transition kind');
   const e=payload.evidence;check(e&&e.kind===payload.transition_kind&&integer(e.start_sample)&&integer(e.end_sample)&&e.end_sample>e.start_sample&&text(e.meaning),'invalid transition evidence');
   if(e.kind==='gradual_build_candidate')check(finite(e.slope_db_per_second)&&finite(e.rise_db)&&finite(e.rising_step_fraction)&&e.rising_step_fraction>=0&&e.rising_step_fraction<=1,'invalid build evidence');
   else check(integer(e.boundary_sample)&&e.start_sample<=e.boundary_sample&&e.boundary_sample<e.end_sample&&finite(e.before_rms_dbfs)&&finite(e.after_rms_dbfs)&&finite(e.delta_db),'invalid transition boundary evidence');
 }
 if(kind==='hapa.audio.semantic_candidate'){check(text(payload.score_semantics)&&Array.isArray(payload.ranked_concepts)&&payload.ranked_concepts.length>0,'semantic ranking required');const labels=new Set();for(const c of payload.ranked_concepts){check(text(c.concept)&&!labels.has(c.concept)&&finite(c.cosine_similarity)&&c.cosine_similarity>=-1&&c.cosine_similarity<=1,'invalid or repeated semantic concept');labels.add(c.concept);}}
 return payload;
}
export function validateCoverage(c){
 check(EXECUTION_STATES.includes(c.execution_state)&&RESULT_STATES.includes(c.result_state)&&REVIEW_STATES.includes(c.review_state),'invalid independent coverage states');
 if(c.result_state==='absent')check(c.execution_state==='complete'&&text(c.absence_evidence_ref),'absence requires completed evaluation and evidence');
 if(['unsupported','failed','not_requested','blocked_by_policy','queued','running'].includes(c.execution_state))check(c.result_state==='unknown'||c.result_state==='not_applicable','unexecuted/failed capability cannot establish presence or absence');
 return c;
}
/** Dependency graph only; symmetric musical relations are not computational dependencies. */
export function validateDependencies(nodes){
 check(Array.isArray(nodes),'dependency nodes required');const byId=new Map();for(const n of nodes){check(text(n.id)&&!byId.has(n.id)&&Array.isArray(n.depends_on),'invalid dependency identity');byId.set(n.id,n);}
 const incoming=new Map(nodes.map(n=>[n.id,n.depends_on.length])),children=new Map(nodes.map(n=>[n.id,[]]));
 for(const n of nodes){check(new Set(n.depends_on).size===n.depends_on.length,'repeated dependency');for(const id of n.depends_on){check(byId.has(id),`missing dependency ${id}`);children.get(id).push(n.id);}}
 const ready=nodes.filter(n=>!incoming.get(n.id)).map(n=>n.id);let visited=0;for(let i=0;i<ready.length;i++){visited++;for(const id of children.get(ready[i])){incoming.set(id,incoming.get(id)-1);if(!incoming.get(id))ready.push(id);}}
 check(visited===nodes.length,'cyclic computational dependencies');return nodes;
}
function assessment(o,count){
 check(o.confidence===null||o.confidence===undefined,'legacy confidence without explicit semantics is not admissible');
 const u=o.timing_uncertainty_samples??null;
 if(u!==null){check(text(u.meaning),'uncertainty meaning required');for(const k of ['start_earliest','start_latest','end_earliest','end_latest'])check(integer(u[k])&&u[k]<=count,'invalid timing uncertainty');check(u.start_earliest<=o.start_sample&&o.start_sample<=u.start_latest&&u.end_earliest<=o.end_sample&&o.end_sample<=u.end_latest,'uncertainty must bracket boundaries');}
 const score=o.kind==='hapa.audio.word_candidate'?o.payload.model_score:null;
 return {confidence_kind:score==null?'not_provided':'uncalibrated_model_score',score,score_semantics:score==null?null:o.payload.score_semantics,calibration_ref:null,timing_uncertainty_samples:u,warnings:u===null?['Timing uncertainty is unknown; sample coordinates are not an accuracy guarantee.']:[]};
}
function decoded(a){if(a.decoded_sha256!=null)check(/^[a-f0-9]{64}$/.test(a.decoded_sha256),'invalid decoded hash');return text(a.decoded_sha256)?`sha256:${a.decoded_sha256}`:null;}
const supportedCoverage=['waveform','rms','sample_peak','spectral_centroid','transients','word_timing','beats','downbeats','semantic_audio','acoustic_embeddings','sections','spectrogram','technical_audio','pitch','rhythm','harmony'];
export const UNSUPPORTED_CONTRACTS=['phonemes','syllables','notes','diarization','language_spans','phrases','vocalizations','source_activity','vocal_delivery','sound_events','fingerprints','relations'];

/** Validate the structure summary against the same immutable observations. */
export function validateStructureEvidence(result){
 const s=result.musical_structure;if(!s)return;
 const a=result.assets.find(a=>a.id==='master');
 check(a?.status==='ready'&&s.source_asset_id===a.id&&s.source_sha256===a.source_sha256&&s.timeline_id===a.timeline_id&&s.sample_rate_hz===a.sample_rate_hz&&s.sample_count===a.sample_count,'structure source mismatch');
 check(s.quality_qualified===false&&text(s.method)&&Array.isArray(s.regions)&&s.regions.length>0&&Array.isArray(s.boundaries)&&Array.isArray(s.repeats)&&Array.isArray(s.transitions)&&Array.isArray(s.frames),'invalid structure summary');
 const obs=new Map(result.observations.map(o=>[o.id,o])),regions=new Map();let cursor=0;
 for(const r of s.regions){
   const o=obs.get(r.id);check(text(r.id)&&!regions.has(r.id)&&r.start_sample===cursor&&integer(r.end_sample)&&r.end_sample>cursor&&r.end_sample<=a.sample_count&&r.functional_label===null,'invalid structure region coverage');
   check(o?.kind==='hapa.audio.section_candidate'&&o.subject_id===a.id&&o.start_sample===r.start_sample&&o.end_sample===r.end_sample,'structure region observation mismatch');
   regions.set(r.id,r);cursor=r.end_sample;
 }
 check(cursor===a.sample_count&&s.boundaries.length===s.regions.length-1,'incomplete structure partition');
 for(const [i,b] of s.boundaries.entries()){
   check(b.sample===s.regions[i].end_sample&&finite(b.novelty)&&b.novelty>=0&&finite(b.threshold)&&b.threshold>0,'structure boundary mismatch');
 }
 const pairs=new Set();for(const r of s.repeats){const key=`${r.left_id}:${r.right_id}`;
   check(regions.has(r.left_id)&&regions.has(r.right_id)&&r.left_id!==r.right_id&&!pairs.has(key)&&finite(r.similarity)&&r.similarity>=-1&&r.similarity<=1&&finite(r.duration_ratio)&&r.duration_ratio>0&&text(r.score_semantics),'invalid structure repetition');pairs.add(key);
 }
 let last=-1;for(const f of s.frames){check(integer(f.sample)&&f.sample>last&&f.sample<a.sample_count&&finite(f.novelty)&&f.novelty>=0&&finite(f.rms_dbfs),'invalid structure evidence frame');last=f.sample;}
 check(text(s.raw_evidence)&&/^[a-f0-9]{64}$/.test(s.raw_evidence_sha256),'structure raw evidence required');
}

/** Deterministic read-time projection; never modifies legacy result bytes or Song records. */
export function buildAtlasContract(result){
 check(text(result.run_id)&&text(result.song_id),'run and Song-owner identities required');check(Array.isArray(result.assets)&&result.assets.length&&Array.isArray(result.observations),'result assets and observations required');
 const master=result.assets.find(a=>a.id==='master');check(master?.status==='ready','ready master required');validateStructureEvidence(result);
 const catalog={schema_version:CONTRACT_VERSION,run_id:result.run_id,source_schema_version:result.schema_version??'legacy-unspecified',
   composition:{owner:'hapa-avatar-builder Song store',owner_ref:result.song_id,composition_id:null,status:'unresolved',reason:'A Song record, title or audio hash alone does not establish composition identity.'},
   recording:{id:identity('recording-instance',{owner_ref:result.song_id,master_bytes:master.source_sha256}),owner_ref:result.song_id,identity_basis:'local Song registration plus exact master source bytes; not cross-transcode recording equivalence',composition_id:null},
   assets:[],timelines:[],analysis_views:[],time_maps:[],observations:[],feature_arrays:[],coverage:[],dependencies:[],
   conformance:{state:'validated-projection',payload_schemas:PAYLOAD_SCHEMAS,unsupported_contracts:UNSUPPORTED_CONTRACTS,warnings:['No composition equivalence or cross-transcode recording equivalence inferred.','Declared coordinate transforms do not verify acoustic delay or stem-to-master alignment.','Original observations and reviews remain in their original run.']}};
 const timelines=new Map(),views=new Map(),maps=new Map(),assetById=new Map(),ids=new Set();
 for(const a of result.assets){
   check(text(a.id)&&!assetById.has(a.id)&&/^[a-f0-9]{64}$/.test(a.source_sha256),'asset identity or source hash invalid');assetById.set(a.id,a);
   check(['ready','failed'].includes(a.status),'invalid asset execution state');
   const ref={id:a.id,source_bytes_id:`sha256:${a.source_sha256}`,recording_id:catalog.recording.id,role:a.role??null,origin_kind:'registered_source',timeline_id:a.status==='ready'?a.timeline_id:null,status:a.status};catalog.assets.push(ref);
   if(a.status!=='ready')continue;
   check(integer(a.sample_rate_hz,1)&&integer(a.sample_count,1)&&integer(a.channels,1)&&text(a.timeline_id),'invalid decoded timeline');
   const timeline={id:a.timeline_id,decoded_content_id:decoded(a),sample_rate_hz:a.sample_rate_hz,sample_count:a.sample_count,channels:a.channels,sample_format:'float32 little endian interleaved',decoder:result.runtime?.ffmpeg??null,decoder_sha256:result.runtime?.ffmpeg_sha256??null,delay_trim_policy:a.decoder_delay_policy??null};
   if(timelines.has(timeline.id))check(stable(timelines.get(timeline.id))===stable(timeline),'conflicting shared timeline');else timelines.set(timeline.id,timeline);
   if(!timeline.decoded_content_id)catalog.conformance.warnings.push(`Decoded byte identity unavailable for ${a.id}; no content equivalence claimed.`);
   const spectral=validateSpectrogram(a);
   const technical=validateTechnical(a);if(technical)catalog.feature_arrays.push({id:`technical:${a.id}`,source_asset_id:a.id,timeline_id:a.timeline_id,...technicalSummary(technical),frame_count:technical.frames.length,frame_coordinates:'explicit start/end source samples; non-centered; partial final frame retained',evidence_ref:`result.json#/assets/${catalog.assets.length-1}/technical`});
   if(spectral)catalog.feature_arrays.push({id:`spectrogram:${a.id}`,source_asset_id:a.id,timeline_id:a.timeline_id,...structuredClone(spectral),frame_coordinates:'center_sample = first_frame_sample + index * hop_samples; zero-padded centered FFT support; display cells use nearest snapshots',evidence_ref:spectral.artifact});
   const f=a.features;
   if(f){check(Array.isArray(f.frames),'feature frames required');for(const k of ['hop_samples','window_samples'])if(f[k]!=null)check(integer(f[k],1),'invalid feature grid');if(f.first_frame_sample!=null)check(integer(f.first_frame_sample),'invalid first frame');if(f.centered!=null)check(typeof f.centered==='boolean','invalid centering');if(f.normalization!=null)check(f.normalization==='none','unregistered feature normalization');for(const [k,u] of Object.entries(f.units??{}))check(({rms:'linear full scale',peak:'linear full scale',spectral_centroid_hz:'Hz'})[k]===u,'unregistered feature units');let previousStart=-1;for(const frame of f.frames){check(integer(frame.start_sample)&&integer(frame.end_sample)&&frame.start_sample>previousStart&&frame.end_sample>frame.start_sample&&frame.end_sample<=a.sample_count,'invalid feature frame domain');previousStart=frame.start_sample;for(const key of ['minimum','maximum','rms','peak'])if(frame[key]!==undefined)check(Array.isArray(frame[key])&&frame[key].length===a.channels&&frame[key].every(finite),`invalid ${key} channel axis`);for(const key of ['rms','peak'])if(frame[key])check(frame[key].every(v=>v>=0),`negative ${key}`);for(const key of ['spectral_centroid_hz','onset_strength'])if(frame[key]!=null)check(finite(frame[key])&&frame[key]>=0,`invalid ${key}`);}
     catalog.feature_arrays.push({id:`features:${a.id}`,timeline_id:a.timeline_id,source_asset_id:a.id,frame_count:f.frames.length,sample_rate_hz:a.sample_rate_hz,hop_samples:f.hop_samples??null,window_samples:f.window_samples??null,centered:f.centered??null,first_frame_sample:f.first_frame_sample??null,frame_coordinates:'explicit start_sample/end_sample on each frame; final frame retains actual length',normalization:f.normalization??null,channel_axis:{count:a.channels,order:f.channel_axis??'unknown'},units:{minimum:'linear full scale',maximum:'linear full scale',rms:'linear full scale',peak:'linear full scale',onset_strength:'positive mono RMS difference, linear full scale',spectral_centroid_hz:'Hz'},missing_value_encoding:'null; no interpolation',evidence_ref:`result.json#/assets/${catalog.assets.length-1}/features`});
   }
 }
 const harmony=validateHarmony(result);if(harmony)catalog.feature_arrays.push({id:'harmony:master',...harmonySummary(harmony),evidence_ref:'result.json#/harmony_analysis',frame_coordinates:'explicit source grid and centered FFT support; unknown acoustic boundary accuracy'});
 const rhythm=validateRhythm(result);if(rhythm)catalog.feature_arrays.push({id:'rhythm:master',...rhythmSummary(rhythm),evidence_ref:'result.json#/rhythm_analysis',frame_coordinates:'explicit source centers and clipped support; tempo/bar intervals reference original model beats'});
 catalog.derived_views={notes:notesSummary(deriveNotes(result)),activity:result.assets.map(a=>activitySummary(deriveActivity(result,a)))};
 const pitch=validatePitch(result);if(pitch)catalog.feature_arrays.push({id:`vocal-pitch:${pitch.source_asset_id}`,...pitchSummary(pitch),evidence_ref:'result.json#/pitch_analysis',frame_coordinates:'centered analysis frames mapped to own source clock; explicit centers/support; nulls preserve abstentions'});
 for(const o of result.observations){
   const a=assetById.get(o.subject_id);check(a?.status==='ready'&&text(o.id)&&!ids.has(o.id),'invalid observation reference or duplicate ID');ids.add(o.id);
   check(integer(o.start_sample)&&integer(o.end_sample)&&o.end_sample<=a.sample_count&&(o.shape==='instant'?o.start_sample===o.end_sample&&o.start_sample<a.sample_count:o.shape==='interval'&&o.end_sample>o.start_sample),'invalid observation span');
   check(o.timeline_id===a.timeline_id&&o.reference_sample_rate_hz===a.sample_rate_hz,'observation clock differs from source timeline');check(claims.includes(o.claim_type),'invalid observation claim');validatePayload(o.kind,o.payload,o.shape);
   if(o.kind==='hapa.audio.transition_candidate')check(o.payload.evidence.start_sample===o.start_sample&&o.payload.evidence.end_sample===o.end_sample,'transition evidence span mismatch');
   const p=o.provenance;check(p?.run_id===result.run_id&&p.source_sha256===a.source_sha256&&p.evidence_asset_id===a.id,'observation provenance differs from source/run');
   check(p.analysis_view&&typeof p.analysis_view==='object','analysis view provenance required');const spec=p.analysis_view,viewId=identity('view',{asset:a.id,source:a.source_sha256,timeline:a.timeline_id,spec});
   if(!views.has(viewId)){
     const numerator=spec.map_numerator??spec.stride??1,denominator=spec.map_denominator??1,offset=spec.crop_start_sample??spec.offset_samples??0;
     check(integer(numerator,1)&&integer(denominator,1)&&integer(offset),'invalid analysis-view transform');
     const valid=spec.valid_samples??(a.sample_count-offset);check(integer(valid,1)&&offset+valid<=a.sample_count,'invalid view crop');
     const domain=Number(BigInt(valid)*BigInt(denominator)/BigInt(numerator));check(integer(domain,1),'empty view coordinate domain');
     const view={id:viewId,source_asset_id:a.id,reference_timeline_id:a.timeline_id,transform:spec,sample_count:null,sample_count_status:'not retained by legacy adapter',coordinate_map_status:p.analysis_view?'declared-not-acoustically-qualified':'unspecified',time_map_id:`map:${viewId}`,depends_on:[`asset:${a.id}`]};
     const map={id:view.time_map_id,source_id:viewId,target_timeline_id:a.timeline_id,kind:'affine',rounding:'nearest_ties_even',measured_delay_samples:null,domain_meaning:'bounded mathematical valid-content domain; excludes right padding, not a measured view length',segment:{source_start:0,source_end:domain,scale:fraction(BigInt(numerator),BigInt(denominator)),offset:fraction(BigInt(offset))}};
     validateTimeMap(map);views.set(viewId,view);maps.set(map.id,map);
   }
   const v=views.get(viewId),raw=p.raw_evidence??null;
   if(raw)check(text(p.raw_evidence_sha256)&&/^[a-f0-9]{64}$/.test(p.raw_evidence_sha256),'raw evidence hash required');
   catalog.observations.push({schema_version:CONTRACT_VERSION,id:o.id,kind:o.kind,payload_schema_version:1,claim_type:o.claim_type,subject_id:a.id,span:{timeline_id:a.timeline_id,reference_sample_rate_hz:a.sample_rate_hz,start_sample:o.start_sample,end_sample:o.end_sample,shape:o.shape},payload:structuredClone(o.payload),provenance:{analyzer_run_id:result.run_id,analyzed_asset_id:a.id,analysis_view_id:viewId,time_map_id:v.time_map_id,evidence_artifact_ref:raw??`source:${a.source_sha256}`,evidence_sha256:p.raw_evidence_sha256??a.source_sha256,adapter_provenance:structuredClone(p)},assessment:assessment(o,a.sample_count),review:{state:o.review_state??'unreviewed',reviewer_id:null,supersedes:[]},depends_on:[viewId,...(o.depends_on??[])]});
 }
 catalog.timelines=[...timelines.values()];catalog.analysis_views=[...views.values()];catalog.time_maps=[...maps.values()];
 for(const [cap,c] of Object.entries(result.coverage??{})){
   const legacy=c.state,execution=legacy==='candidate'||legacy==='imported_unverified'?'complete':legacy;
   const matches=cap==='word_timing'?catalog.observations.filter(o=>o.kind==='hapa.audio.word_candidate'):cap==='transients'?catalog.observations.filter(o=>o.kind==='hapa.audio.transient'):cap==='semantic_audio'?catalog.observations.filter(o=>o.kind==='hapa.audio.semantic_candidate'):catalog.observations.filter(o=>o.kind===`hapa.audio.${cap.replace(/s$/,'')}_candidate`);
   const has=(cap==='harmony'&&(result.harmony_analysis?.active_frame_count||0)>0)||(cap==='rhythm'&&(result.rhythm_analysis?.tempo_intervals?.length||0)>0)||(cap==='pitch'&&(result.pitch_analysis?.voiced_frame_count||0)>0)||matches.length>0||(['waveform','rms','sample_peak','spectral_centroid'].includes(cap)&&catalog.feature_arrays.length>0)||(cap==='acoustic_embeddings'&&(result.acoustic_index?.windows?.length??0)>0);
   const coverage={capability:cap,execution_state:EXECUTION_STATES.includes(execution)?execution:'unsupported',result_state:['complete','partial'].includes(execution)&&has?'present':'unknown',review_state:'unreviewed',legacy_state:legacy,method:c.method??null,reason:c.reason??c.error??null,absence_evidence_ref:null};validateCoverage(coverage);catalog.coverage.push(coverage);
 }
 for(const cap of [...supportedCoverage,...UNSUPPORTED_CONTRACTS])if(!catalog.coverage.some(c=>c.capability===cap))catalog.coverage.push({capability:cap,execution_state:'not_requested',result_state:'unknown',review_state:'unreviewed',reason:'No execution record in this run.',absence_evidence_ref:null});
 catalog.dependencies=[...catalog.assets.map(a=>({id:`asset:${a.id}`,depends_on:[]})),...catalog.analysis_views.map(v=>({id:v.id,depends_on:v.depends_on})),...catalog.observations.map(o=>({id:o.id,depends_on:o.depends_on}))];validateDependencies(catalog.dependencies);
 for(const o of catalog.observations)check(REVIEW_STATES.includes(o.review.state),'invalid observation review state');
 return catalog;
}

export function summarizeAtlasContract(c){
 const {observations,dependencies,...summary}=c;
 return {...summary,detail:'summary',omitted:{observations:observations.length,dependencies:dependencies.length},full_detail:'Use op=contract&detail=full or the JSON export for all observation envelopes and dependencies.'};
}
