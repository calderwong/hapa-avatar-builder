import crypto from 'node:crypto';
import fs from 'node:fs';
import {validatePitch} from './audio-atlas-pitch.mjs';
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const implementationSha=sha(fs.readFileSync(new URL(import.meta.url)));
const median=v=>{const a=[...v].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};
const quantile=(v,q)=>{const a=[...v].sort((x,y)=>x-y);return a[Math.round((a.length-1)*q)];};
const hzMidi=hz=>69+12*Math.log2(hz/440);
const noteName=m=>`${['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((m%12)+12)%12]}${Math.floor(m/12)-1}`;
export const NOTE_METHOD='hapa.pyin-note-segmentation.v1';
const parameters={median_frames:5,change_cents:90,change_hold_frames:5,minimum_frames:8,minimum_duration_seconds:.08,bend_range_cents:40,phrase_gap_seconds:.5,motif_notes:3,motif_rhythm_log2_step:.25,low_register_max_midi:48};
const limitations=[
 'Monophonic pYIN segmentation, not polyphonic transcription or instrument identification. Overlap and harmonics can yield convincing wrong notes.',
 'Equal temperament and A4=440 Hz are display assumptions, not measured tuning. Nearest-note names do not replace raw Hz.',
 'No interpolation across abstentions or independent pYIN chunks. Repeated same-pitch attacks without a voicing gap may merge; glides may split into several candidates.',
 'Onset/offset are grid boundaries inferred from periodicity, not validated acoustic attacks or releases. Support bounds are not error bars; acoustic uncertainty is unknown.',
 'Bends are within-span pitch variation and can include vibrato or tracking errors. Motifs are repeated quantized three-note/rhythm patterns, not semantic musical identity.',
 'Low-register lines (at or below C3) are bass-line candidates only by register; they do not identify a bass instrument or arrangement role.'
];
/** Derived read-only view of immutable, validated pYIN evidence. Never writes a saved run. */
export function deriveNotes(result){
 const p=validatePitch(result);
 if(!p)return {state:'not_available',notes:[],motifs:[],bass_lines:[],notice:'This run has no pitch evidence. Enable pitch tracking on an isolated source in Analysis settings.'};
 const f=p.frames,sr=p.source_sample_rate_hz,notes=[],rejected=[];
 // Each contiguous voiced/chunk run is independent. Median windows never bridge gaps.
 const emit=(first,last)=>{
  const start=f[first].center_sample,end=Math.min(p.source_sample_count,last+1<f.length?f[last+1].center_sample:p.source_sample_count);
  if(last-first+1<parameters.minimum_frames||(end-start)/sr<parameters.minimum_duration_seconds){rejected.push({start_sample:start,end_sample:end,frame_start:first,frame_end_exclusive:last+1,reason:'insufficient_duration'});return;}
  const frames=f.slice(first,last+1),hz=frames.map(x=>x.f0_hz),middle=median(hz),midi=Math.round(hzMidi(middle)),cents=hz.map(h=>1200*Math.log2(h/middle));
  const lo=quantile(cents,.1),hi=quantile(cents,.9),edge=Math.min(5,Math.floor(frames.length/2));
  const n={id:`${p.source_asset_id}:note:${first}`,state:'candidate',start_sample:start,end_sample:end,frame_start:first,frame_end_exclusive:last+1,
   onset_support_samples:[frames[0].support_start_sample,frames[0].support_end_sample],offset_support_samples:[frames.at(-1).support_start_sample,frames.at(-1).support_end_sample],acoustic_uncertainty_samples:null,
   median_hz:middle,nearest_midi:midi,display_note:noteName(midi),cents_from_display_note:100*(hzMidi(middle)-midi),pitch_p10_hz:quantile(hz,.1),pitch_p90_hz:quantile(hz,.9),
   median_voicing_score:median(frames.map(x=>x.voicing_score)),minimum_voicing_score:Math.min(...frames.map(x=>x.voicing_score)),
   variation_cents_p90_p10:hi-lo,edge_change_cents:median(cents.slice(-edge))-median(cents.slice(0,edge)),bend_candidate:hi-lo>=parameters.bend_range_cents,
   contour_ref:{evidence_ref:'result.json#/pitch_analysis/frames',frame_start:first,frame_end_exclusive:last+1},chunk_index:frames[0].chunk_index};
  notes.push(n);
 };
 let i=0;
 while(i<f.length){
  if(!f[i].voiced){i++;continue;}
  const first=i;while(i+1<f.length&&f[i+1].voiced&&f[i+1].chunk_index===f[first].chunk_index)i++;const last=i;
  const smoothed=[];for(let j=first;j<=last;j++)smoothed.push(median(f.slice(Math.max(first,j-2),Math.min(last+1,j+3)).map(x=>hzMidi(x.f0_hz)*100)));
  let begin=first,anchor=smoothed[0],pending=null;
  for(let j=first+1;j<=last;j++){
   const v=smoothed[j-first];
   if(Math.abs(v-anchor)>=parameters.change_cents){
    if(pending===null||Math.sign(v-anchor)!==Math.sign(smoothed[pending-first]-anchor))pending=j;
    if(j-pending+1>=parameters.change_hold_frames){emit(begin,pending-1);begin=pending;anchor=median(smoothed.slice(pending-first,j-first+1));pending=null;}
   }else{pending=null; // bounded stable reference avoids a glide continually moving its own target
   }
  }
  emit(begin,last);i++;
 }
 const motifsByKey=new Map();
 for(let k=0;k+2<notes.length;k++){
  const a=notes.slice(k,k+3);if(a.some((n,j)=>j&&(n.start_sample-a[j-1].end_sample>.5*sr||n.chunk_index!==a[0].chunk_index)))continue;
  const intervals=[a[1].nearest_midi-a[0].nearest_midi,a[2].nearest_midi-a[1].nearest_midi];
  const durations=a.map(n=>n.end_sample-n.start_sample),rhythm=durations.slice(1).map(d=>Math.round(Math.log2(d/durations[0])/.25));
  const key=JSON.stringify([intervals,rhythm]);if(!motifsByKey.has(key))motifsByKey.set(key,{intervals_semitones:intervals,duration_ratio_log2_bins:rhythm,occurrences:[]});
  const g=motifsByKey.get(key);if(g.occurrences.length&&a[0].start_sample<g.occurrences.at(-1).end_sample)continue;
  g.occurrences.push({note_refs:a.map(n=>n.id),start_sample:a[0].start_sample,end_sample:a[2].end_sample});
 }
 const motifs=[...motifsByKey.values()].filter(g=>g.occurrences.length>=2).map((g,index)=>({id:`${p.source_asset_id}:motif:${index}`,state:'candidate',...g}));
 const bass_lines=[];let line=[];const flush=()=>{if(line.length>=2)bass_lines.push({id:`${p.source_asset_id}:low-line:${line[0].frame_start}`,state:'candidate',basis:'register_only_not_instrument_identity',note_refs:line.map(n=>n.id),start_sample:line[0].start_sample,end_sample:line.at(-1).end_sample});line=[];};
 for(const n of notes){if(n.nearest_midi>parameters.low_register_max_midi){flush();continue;}if(line.length&&(n.start_sample-line.at(-1).end_sample>.5*sr||n.chunk_index!==line[0].chunk_index))flush();line.push(n);}flush();
 return {schema_version:'hapa.source-notes.v1',state:'candidate',method:NOTE_METHOD,parameters,source_asset_id:p.source_asset_id,source_sha256:p.source_sha256,timeline_id:p.timeline_id,source_channel:p.source_channel,source_sample_rate_hz:sr,source_sample_count:p.source_sample_count,
  provenance:{kind:'derived_read_only_view',pitch_method:p.method,pitch_evidence_ref:'result.json#/pitch_analysis',pitch_evidence_sha256:sha(JSON.stringify(p)),implementation_sha256:implementationSha},
  tuning:{reference_hz:440,reference_midi:69,temperament:'12-tone equal temperament',measured:false},quality_qualified:false,polyphonic_separation:false,declared_role:result.assets.find(a=>a.id===p.source_asset_id)?.role||null,
  note_count:notes.length,bend_count:notes.filter(n=>n.bend_candidate).length,motif_count:motifs.length,bass_line_count:bass_lines.length,rejected_span_count:rejected.length,limitations,notes,motifs,bass_lines,rejected_spans:rejected};
}
export function notesSummary(n){const {notes,motifs,bass_lines,rejected_spans,...summary}=n;return summary;}
export function queryNotes(result,asset,{start,end}){
 const n=deriveNotes(result);if(n.state!=='candidate'||asset.id!==n.source_asset_id)return {...notesSummary(n),state:'not_available',notes:[],motifs:[],bass_lines:[],notice:n.notice||`Notes belong to ${n.source_asset_id}. Choose the analyzed source.`};
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end>asset.sample_count||end<=start||end-start>30*asset.sample_rate_hz)throw Object.assign(new Error('Note review requires a valid source window of at most 30 seconds'),{statusCode:422});
 const overlap=v=>v.start_sample<end&&v.end_sample>start;
 const notes=n.notes.filter(overlap),motifs=n.motifs.filter(g=>g.occurrences.some(overlap)),bass_lines=n.bass_lines.filter(overlap);
 // Full event spans remain untrimmed. Dense raw contour is bounded to the requested window.
 const frames=result.pitch_analysis.frames.map((v,index)=>({...v,frame_index:index})).filter(v=>v.center_sample>=start&&v.center_sample<end);
 return {...notesSummary(n),start_sample:start,end_sample:end,notes,motifs,bass_lines,rejected_spans:n.rejected_spans.filter(overlap),frames,window_complete:true,event_bounds:'original spans, not clipped to the review window'};
}
