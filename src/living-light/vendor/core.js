
/* Hapa Spatial Lab reference contracts v0.2. All controls and diagnostics are local.
   The host owns transport/clock/assets. Visual modules never create an AudioContext. */
'use strict';
window.HapaCore=(()=>{
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const sample=(a,t,fps=30,scale=255)=>{if(!a?.length)return 0;const x=clamp(t*fps,0,a.length-1),i=Math.floor(x),j=Math.min(i+1,a.length-1);return(a[i]+(a[j]-a[i])*(x-i))/scale;};
const parameters=[
 {id:'world.breath',label:'Structural breath',group:'World',unit:'world units',default:.07,min:0,max:.40,step:.005,bindings:[['bass','energy',.22]]},
 {id:'material.warp',label:'Weave distortion',group:'Material',unit:'ratio',default:.16,min:0,max:.7,step:.01,bindings:[['lead-vocals','energy',.40],['synth','energy',.12]]},
 {id:'material.scale',label:'Weave density',group:'Material',unit:'cycles',default:5.5,min:2,max:12,step:.1,bindings:[]},
 {id:'material.emission',label:'Luminous threads',group:'Material',unit:'linear gain',default:.25,min:0,max:2.4,step:.01,bindings:[['synth','energy',.85],['guitar','brightness',.25]]},
 {id:'vocal.presence',label:'Vocal ribbons',group:'Material',unit:'gain',default:.10,min:0,max:1.5,step:.01,bindings:[['lead-vocals','energy',.85],['backing-vocals','energy',.30]]},
 {id:'world.impulse',label:'Drum light waves',group:'World',unit:'gain',default:.03,min:0,max:1.3,step:.01,bindings:[['drums','onset',1.10]]},
 {id:'optics.bloom',label:'Selective bloom',group:'Optics',unit:'gain',default:.24,min:0,max:1.3,step:.01,bindings:[['synth','energy',.36]]},
 {id:'optics.flare',label:'Beacon lens flare',group:'Optics',unit:'gain',default:.40,min:0,max:1.5,step:.01,bindings:[['backing-vocals','energy',.4],['lead-vocals','energy',.12]]},
 {id:'optics.exposure',label:'Exposure',group:'Optics',unit:'linear gain',default:1.18,min:.3,max:2.8,step:.01,bindings:[]},
 {id:'atmosphere.dust',label:'Suspended motes',group:'Atmosphere',unit:'gain',default:.30,min:0,max:1.2,step:.01,bindings:[['other','energy',.65]]},
 {id:'camera.motion',label:'Camera travel',group:'Camera',unit:'gain',default:.55,min:0,max:.95,step:.01,bindings:[]},
 {id:'finish.amount',label:'Brushed finish',group:'Finish',unit:'blend',default:.16,min:0,max:.65,step:.01,bindings:[]}
];
const palettes=[
 {id:'gilded-tide',name:'Gilded tide',description:'Petrol, turquoise and warm gold',roles:{background:'#050d13',shadow:'#10212e',body:'#215b67',accent:'#55bbbe',highlight:'#ffdd9b',emission:'#ffc977',fog:'#11272f'}},
 {id:'rose-vellum',name:'Rose vellum',description:'Plum shadows, coral silk, ivory light',roles:{background:'#100810',shadow:'#251728',body:'#6e364e',accent:'#da8688',highlight:'#fff0c9',emission:'#ffbc82',fog:'#2d1d30'}},
 {id:'blue-hour',name:'Blue hour',description:'Cobalt, lilac and moonlit mint',roles:{background:'#050918',shadow:'#101b38',body:'#36559c',accent:'#977ede',highlight:'#d7fcf1',emission:'#80ddd3',fog:'#111e3b'}},
 {id:'solar-ivory',name:'Solar ivory',description:'Ochre bronze, ivory and electric blue',roles:{background:'#100d08',shadow:'#2c271e',body:'#79694d',accent:'#4e9ec9',highlight:'#fff1cc',emission:'#ffd181',fog:'#2b2c28'}}
];
const worlds=[
 {id:'breathline-weave',name:'Golden Loom',subtitle:'Breathline / recursive passage',kind:0,modules:['field.menger-passage','material.weave','mesh.ribbon','optics.beacon','optics.bloom'],camera:'corridor'},
 {id:'solar-reliquary',name:'Solar Reliquary',subtitle:'Orbit / sculptural counterpoint',kind:1,modules:['field.mandelbulb','material.weave','mesh.ribbon','optics.beacon','optics.bloom'],camera:'orbit'},
 {id:'weave-study',name:'Weave Study',subtitle:'Material / living textile specimen',kind:2,modules:['field.pedestal','material.weave','mesh.ribbon','optics.beacon','optics.bloom'],camera:'orbit'}
];
const modules=[
 {id:'field.menger-passage',version:'0.2.0',kind:'world',backend:'webgl2',outputs:['linearColor','linearEmission','projectedDepth']},
 {id:'field.mandelbulb',version:'0.2.0',kind:'world',backend:'webgl2',outputs:['linearColor','linearEmission','projectedDepth']},
 {id:'field.pedestal',version:'0.2.0',kind:'world',backend:'webgl2',outputs:['linearColor','linearEmission','projectedDepth']},
 {id:'material.weave',version:'0.2.0',kind:'material',modes:['extracted GLSL function','qualified single-pass ISF generator texture'],not:'not an SDF or a general ISF host'},
 {id:'mesh.ribbon',version:'0.2.0',kind:'geometry',description:'Parametric triangle ribbons; share field depth'},
 {id:'optics.beacon',version:'0.2.0',kind:'screen-effect',inputs:['sceneDepth','sourcePosition'],visibility:'9-tap projected-depth source visibility'},
 {id:'optics.bloom',version:'0.2.0',kind:'screen-effect',inputs:['linearEmission'],description:'Half-resolution separable blur'},
 {id:'finish.brushed',version:'0.2.0',kind:'screen-effect',inputs:['displayColor'],description:'Original ISF-style finishing filter after single display transform'}
];
class FeatureCache{
 constructor(score){this.score=score;this.curves=new Map(score.stems.map(s=>[s.id,Object.fromEntries(Object.entries(s.features).map(([k,v])=>[k,decode(v)]))]));this.master=decode(score.master);this.fixture='song';}
 get(id,key,t){
  const stem=this.score.stems.find(s=>s.id===id);
  if(!stem)return {value:null,availability:'missing',sourceAssetId:null,confidence:null};
  if(this.fixture!=='song'){
   if(this.fixture==='silence')return {value:0,availability:'silent',sourceAssetId:stem.sha256,confidence:null};
   const order=this.score.stems.findIndex(s=>s.id===id);let v=0;
   if(this.fixture==='impulse')v=Math.exp(-Math.max(0,t%4-1)*9)*(t%4>=1?1:0);
   if(this.fixture==='ramp')v=clamp((t%12)/10,0,1);
   if(this.fixture==='alternating')v=Math.floor(t/2)%this.score.stems.length===order?1:0;
   return {value:key==='pan'?.5:v,availability:'synthetic',sourceAssetId:'fixture:'+this.fixture,confidence:null};
  }
  const a=this.curves.get(id)?.[key];
  return {value:a?sample(a,t,this.score.fps):null,availability:!a?'missing':stem.availability,sourceAssetId:stem.sha256,confidence:null};
 }
 level(t){return this.fixture==='song'?sample(this.master,t,this.score.fps):this.fixture==='silence'?0:clamp((t%12)/10,0,1);}
 phase(t){return sample(this.score.travel,t,this.score.fps,1);}
}
function initialState(score){return {schema:'hapa.performance.reference/0.2',world:'breathline-weave',palette:'gilded-tide',materialMode:'direct',quality:'balanced',aspect:'16:9',camera:'directed',yaw:0,pitch:0,fov:53,reduced:false,response:1,
 effects:{weave:true,bloom:true,flare:true,dust:true,finish:true,meshes:true},overrides:{},offsets:{},inspector:'material.warp',debug:'beauty',fixture:'song',occluder:false,beaconTest:false,
 stems:Object.fromEntries(score.stems.map(s=>[s.id,{visual:s.availability==='present',mute:false,solo:false,strength:1}]))};}
function evaluate(cache,state,t){
 const result={},traces={};
 for(const def of parameters){let base=def.default+(Number(state.offsets[def.id])||0),value=base,contributions=[];
  for(const [id,key,weight] of def.bindings){const f=cache.get(id,key,t),enabled=state.stems[id]?.visual!==false;const raw=f.value,shaped=raw===null?0:clamp(raw,0,1);const mapped=enabled?shaped*weight*state.response*(state.stems[id]?.strength??1):0;
   value+=mapped;contributions.push({source:id,feature:key,availability:f.availability,sourceAssetId:f.sourceAssetId,raw,shaped,mapped,enabled,operation:'add'});
  }
  const hold=state.overrides[def.id];if(typeof hold==='number')value=hold;
  const beforeLimits=value,limitingReasons=[];value=clamp(value,def.min,def.max);if(value!==beforeLimits)limitingReasons.push('parameter hard range');
  if(state.reduced&&def.id==='camera.motion'&&value>.1){value=.1;limitingReasons.push('reduced motion');}
  result[def.id]=value;traces[def.id]={parameterId:def.id,time:t,preset:def.default,score:base,contributions,manualOverride:typeof hold==='number'?hold:null,beforeLimits,final:value,limitingReasons};
 }
 return {values:result,traces,energy:cache.level(t),phase:cache.phase(t)};
}
function validatePreset(p,score){
 if(!p||p.schema!=='hapa.performance.reference/0.2')throw Error('Unsupported preset schema.');
 if(p.song&&p.song!==score.title)throw Error('This score is bound to a different song.');
 if(p.sourceHashes&&JSON.stringify(p.sourceHashes)!==JSON.stringify(score.stems.map(s=>s.sha256)))throw Error('Source hash mismatch; refusing to apply a score to different audio.');
 if(!worlds.some(w=>w.id===p.world)||!palettes.some(w=>w.id===p.palette))throw Error('Unknown world or palette.');
 for(const [k,v] of Object.entries(p.overrides||{})){const d=parameters.find(d=>d.id===k);if(!d||!Number.isFinite(v)||v<d.min||v>d.max)throw Error('Invalid override: '+k);}
 return true;
}
const srgb=x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);
const linearHex=s=>[1,3,5].map(i=>srgb(parseInt(s.slice(i,i+2),16)/255));
return{clamp,decode,sample,parameters,palettes,worlds,modules,FeatureCache,initialState,evaluate,validatePreset,linearHex};
})();

