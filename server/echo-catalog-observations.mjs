import {createHash} from 'node:crypto';

import {ECHO_CATALOG_OBSERVATION_SCHEMA} from '../src/domain/echo-observation-window.js';
export {ECHO_CATALOG_OBSERVATION_SCHEMA} from '../src/domain/echo-observation-window.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function parse(value,fallback){
 if(typeof value!=='string'||value.length>1048576)throw Error('observation-field-budget-or-schema');
 const result=JSON.parse(value);return result??fallback;
}
function annotations(value,field){
 if(!Array.isArray(value)||value.length>512)throw Error('observation-annotation-budget-or-schema');
 return value.flatMap(row=>{
  const text=typeof row==='string'?row:(row?.[field] ?? (field==='identifier'?row?.label:undefined));
  if(typeof text!=='string'||!text.trim())return [];
  if(text.length>4096)throw Error('observation-text-budget');
  const confidence=finite(row?.confidence)&&row.confidence>=0&&row.confidence<=1?row.confidence:null;
  return [{text:text.normalize('NFKC').trim(),confidence,status:'inferred',language:null,languageStatus:'unmeasured'}];
 });
}

/** Project existing catalog rows only. A sampled frame is a point observation,
 * never an invented usable interval or verified depicted identity. Current source
 * byte identity and the weaker recognition/frame binding stay separate. */
export function projectEchoCatalogObservation({video,frame,recognition,sourceInspection}) {
 const common={schemaVersion:ECHO_CATALOG_OBSERVATION_SCHEMA,mediaId:video.media_id,frameId:frame.frame_id,
  sourceSha256:video.sha256,sourceDurationSeconds:video.duration_sec,provider:recognition?.provider||null,modelRevision:null,
  sourceByteStatus:sourceInspection?.status||'unavailable',characterIds:[],sceneIds:[],actions:[],motion:null,palette:null,usableIntervals:[]};
 const unavailable=reason=>({...common,status:'unavailable',reason,labels:[],textLines:[],pointSeconds:null});
 if(!digest(video.sha256)||sourceInspection?.status!=='bytes-verified'||sourceInspection.sha256!==video.sha256)return unavailable('source-content-unverified-or-changed');
 if(frame.media_id!==video.media_id||!recognition||recognition.frame_id!==frame.frame_id||recognition.media_id!==video.media_id||recognition.marker!==frame.marker)return unavailable('recognition-frame-identity-mismatch');
 if(!['ready','partial'].includes(recognition.status))return unavailable('recognition-not-ready');
 if(!finite(frame.at_seconds)||frame.at_seconds<0||!finite(video.duration_sec)||frame.at_seconds>video.duration_sec)return unavailable('invalid-observation-time');
 const recognized=Date.parse(recognition.recognized_at),updated=Date.parse(frame.updated_at);
 if(!Number.isFinite(recognized)||!Number.isFinite(updated)||updated>recognized)return unavailable('frame-revision-newer-or-unversioned');
 try{
  const framePrint=parse(frame.fingerprint_json,{}),recognitionPrint=parse(recognition.fingerprint_json,{});
  const keys=['ahash','dhash','phash','lumaMean','lumaStd'];
  if(keys.some(key=>framePrint[key]===undefined||recognitionPrint[key]!==framePrint[key]))return unavailable('frame-recognition-fingerprint-mismatch');
  const labels=annotations(parse(recognition.labels_json,[]),'identifier'),textLines=annotations(parse(recognition.text_lines_json,[]),'text');
  const revision=hash({video:{sha256:video.sha256,duration_sec:video.duration_sec},frame,recognition});
  return {...common,status:'inferred-limited',reason:null,revision,pointSeconds:frame.at_seconds,timeSupport:'sampled-point-only',labels,textLines,
   sourceByteStatus:'bytes-verified',recognitionStatus:recognition.status,recognizedAt:recognition.recognized_at,frameUpdatedAt:frame.updated_at,
   recognitionFrameBinding:'matching-perceptual-fingerprint-not-cryptographic-image-binding',
   missing:['model-revision','language','depicted-character-identity','depicted-scene-identity','actions','motion','palette','usable-intervals','recognition-image-sha256']};
 }catch(error){return unavailable(error.message)}
}

