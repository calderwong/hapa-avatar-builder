import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {projectToEditorGraph} from '../../src/domain/multitrack-editor.js';
import VariationLabPanel from '../../src/components/VariationLabPanel.jsx';
const source={song_id:'proof-song',duration:24,audio_uri:'/source.mp3',active_direction_script_variant:{id:'saved-source'},visualizer_timeline:Array.from({length:4},(_,index)=>({start_sec:index*6,end_sec:index*6+6,visualizer_id:"isf:fixture",visualizer_title:"Fixture",opacity:.6})),timed_lyrics:[{start:0,end:2,text:'Keep this lyric'}],timeline:Array.from({length:8},(_,index)=>({start_sec:index*3,end_sec:index*3+3,media_id:'media-'+index,media_uri:'/media/'+index+'.mp4',camera_motion:'static',camera_intensity:.1,camera_speed:1,media_contract:{type:'video',originalUri:'/media/'+index+'.mp4'},characterIds:[index%2?'cast-b':'cast-a'],sceneIds:['scene-a']}))};
source.director_show_graph={...projectToEditorGraph(source),directorV2:{cueGraph:{schemaVersion:'hapa.echo.cue-graph.v2',id:'cue:controls',sections:[{id:'song',startSeconds:0,endSeconds:24}],cues:[9.08,12.06,15.08].map(atSeconds=>({id:'cue:'+atSeconds,atSeconds,kind:'edit_pulse',source:'declared-proof-cue',approved:true,toleranceSeconds:.1,eligibleActions:['cut','accent','effect']}))}}};
window.recutProofSource=structuredClone(source);
function Proof(){
 const [project,setProject]=useState(source);
 window.recutProofProject=project;window.recutProofGraph=projectToEditorGraph(project);
 window.recutProofExternalEdit=()=>setProject(value=>({...value,timed_lyrics:[{start:0,end:2,text:'New external lyric edit'}]}));
 window.recutProofReset=()=>setProject({...structuredClone(source),song_id:'recipe-controls'});
 window.recutProofChangeSong=()=>setProject({...structuredClone(source),song_id:'another-song'});
 window.recutProofInvalidMedia=kind=>{const next=structuredClone(source);next.song_id='invalid-'+kind;next.mediaConstraints={pins:['media-0']};if(kind==='missing'){next.timeline[0].media_uri='';next.timeline[0].media_contract.originalUri='';}else{next.timeline[0].canonicalMediaIds=['canonical-first'];next.mediaConstraints.bans=['canonical-first'];}setProject(next)};
 return <VariationLabPanel project={project} currentTime={6} onCandidate={(next,receipt)=>{window.recutProofReceipt=receipt;setProject(next);}}/>;
}
createRoot(document.getElementById('root')).render(<Proof/>);
