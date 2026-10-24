// Read-only Echo visual-score projection over one saved Atlas run.
// Composes or validates a score; never writes Atlas results, reviews or Songs.
import {
  buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, validateEchoVisualScore, normalizeDustPlaySettings,
} from '../src/domain/echo-visual-score.js';

const fail=(message,statusCode=422)=>Object.assign(new Error(`Visual score: ${message}`),{statusCode});
const MAX_DIRECTION_BYTES=64*1024;

function parseObject(value,label){
 if(value==null||value==='')return null;
 if(typeof value==='string'){if(value.length>MAX_DIRECTION_BYTES)throw fail(`${label} exceeds ${MAX_DIRECTION_BYTES} bytes`);try{value=JSON.parse(value);}catch{throw fail(`${label} must be JSON`);}}
 if(typeof value!=='object'||Array.isArray(value))throw fail(`${label} must be an object`);
 if(JSON.stringify(value).length>MAX_DIRECTION_BYTES*4)throw fail(`${label} is too large`);
 return value;
}

/** {direction?, score?, assets?, playSettings?} → timeline, score, validation and play settings. */
export function atlasVisualScore(result,input={}){
 const timeline=buildEchoMusicalTimelineFromAtlas(result);
 const direction=parseObject(input.direction,'direction')||{};
 const supplied=parseObject(input.score,'score');
 const score=supplied||composeEchoVisualScore(timeline,direction);
 const assets=Array.isArray(input.assets)?input.assets.map(String):typeof input.assets==='string'&&input.assets?input.assets.split(','):null;
 const playSettings=normalizeDustPlaySettings(parseObject(input.playSettings,'playSettings')||{pulse:input.pulse,seed:input.seed===undefined?undefined:Number(input.seed),particleCount:input.particleCount},timeline);
 return {schema_version:'hapa.audio-atlas.visual-score-response.v1',run_id:result.run_id,song_id:result.song_id,score_origin:supplied?'supplied':'composed',
  timeline,score,validation:validateEchoVisualScore(score,{timeline,assets}),playSettings,
  notice:'Read-only projection of Atlas candidates. Nothing was saved; repeat groups, events and tempo alternatives are unreviewed evidence.'};
}
