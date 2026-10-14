import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import LivingLightWorkspace from '../../src/components/LivingLightWorkspace.jsx';
import {createLivingLightRegistry} from '../../src/living-light/registry.js';
import {newJourneyDraft,editJourneyDraft} from '../../src/domain/living-light-journey.js';
import {livingLightRecordDestination,LIVING_LIGHT_DESTINATION_SCHEMA as schemaVersion} from '../../src/domain/living-light-navigation.js';
import {normalizeEchoRecordSummaryRows} from '../../src/domain/echo-record-garden.js';
const songId='fixture:album-navigation',registry=createLivingLightRegistry(),thing=id=>registry.entries.find(t=>t.source.moduleId===id),ref=thing=>({thingId:thing.thingId,revisionId:thing.revisionId});
const projects=[{song_id:songId,song_title:'Fixture record',duration:60,updated_at:'fixture:r1',timeline_count:2,record_preview:{latestCutId:'fixture:cut',cutFingerprint:'fixture:cut-r1'}}];
let draft=newJourneyDraft({songId,title:'Three places · album navigation',durationUs:60e6,thing:thing('solar-reliquary'),mode:'tour'},registry);
for(const [location,bridge]of [['tidal-observatory','fractal-loom'],['resonance-vault','silken-current']])draft=editJourneyDraft(draft,{type:'add',thingRef:ref(thing(location)),bridgeRef:ref(thing(bridge))},registry);
draft=editJourneyDraft(draft,{type:'destination',instanceId:draft.instances[0].instanceId,destination:livingLightRecordDestination(normalizeEchoRecordSummaryRows(projects)[0])},registry);
draft=editJourneyDraft(draft,{type:'destination',instanceId:draft.schedule[2].instanceId,destination:{schemaVersion,kind:'card',ref:{kind:'thing',id:thing('tidal-observatory').thingId,revision:thing('tidal-observatory').revisionId}}},registry);
localStorage.setItem('hapa.living-light.journey-draft.v1:'+songId,JSON.stringify({draft,identity:null,dirty:true}));
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
 const path=String(url);if(!path.startsWith('/api/'))return originalFetch(url,options);
 if(options.method&&options.method!=='GET')return new Response(JSON.stringify({error:'fixture_read_only',message:'This browser fixture performs no owner mutations.'}),{status:422});
 let result;if(path.startsWith('/api/echos/director-projects?'))result={projects};
 else if(path.startsWith('/api/echos/living-light/things?'))result={things:registry.entries.map(thing=>({thing,currentHead:thing.revisionId,revisionNumber:1,noteCount:0})),nextOffset:null};
 else if(path.startsWith('/api/echos/living-light/things/')){const parts=path.split('/');const id=decodeURIComponent(parts[5]),t=registry.entries.find(t=>t.thingId===id);result={thing:t,currentHead:t?.revisionId,noteCount:0};}
 else if(path.startsWith('/api/echos/living-light/journeys?'))result={journeys:[],nextOffset:null};
 else if(path.startsWith('/api/echos/living-light/notes?'))result={notes:[],nextOffset:null};
 else if(path.startsWith('/api/echos/living-light/performance?'))result={performance:null};
 else return new Response(JSON.stringify({error:'fixture_unavailable',message:'Unavailable in read-only fixture.'}),{status:404});
 return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
};
function silentAudio(){const bytes=new Uint8Array(44+60*8000),view=new DataView(bytes.buffer),str=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};str(0,'RIFF');view.setUint32(4,bytes.length-8,true);str(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,8000,true);view.setUint16(32,1,true);view.setUint16(34,8,true);str(36,'data');view.setUint32(40,bytes.length-44,true);bytes.fill(128,44);return URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));}
const audioURI=silentAudio();
function Proof(){const audioRef=useRef(),clock=useRef(7),[hidden,setHidden]=useState(false),[time,setTime]=useState(0);return <main><h1>Album navigation · native workspace proof</h1><p>Synthetic record and silent audio; real Workspace, Journey editor, navigation and renderer. API reads are fixtures; all API mutations refuse.</p><audio ref={audioRef} src={audioURI} onTimeUpdate={()=>setTime(audioRef.current.currentTime)} controls/><button onClick={()=>{audioRef.current.currentTime=7;setTime(7);}}>Set song bookmark to 7 seconds</button><button onClick={()=>setHidden(!hidden)}>{hidden?'Return to workspace':'Hide workspace'}</button><output>Song clock: {time.toFixed(3)}s</output><div hidden={hidden}><LivingLightWorkspace songId={songId} title="Fixture album record" duration={60} audioRef={audioRef} songClockRef={clock} directorCutKey="fixture:cut" powerMode={hidden?'hidden':'active'}/></div></main>;}
const root=createRoot(document.getElementById('root'));root.render(<Proof/>);if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();URL.revokeObjectURL(audioURI);globalThis.fetch=originalFetch;});
