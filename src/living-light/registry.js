import {createNativeNamespace} from './native.generated.js';
import {validateThing} from '../domain/living-light-contracts.js';
export const SOURCE_DIGEST='dfbc9421a96f970931b6accbaf9d5d5ddcdf4b1cb94dec4edf4b5417974b3dbb';
export const IMPLEMENTATIONS=Object.freeze(Object.fromEntries(['ll109.continuous','ll109.passage','ll109.destination'].map(id=>[id,{version:'109-native-v1',sourceDigest:SOURCE_DIGEST}])));
const numeric=(min,max,value,units='ratio')=>({type:'number',min,max,default:value,units});
/** Metadata only: no canvas, player, image request, decoder or preparation. */
export function createLivingLightRegistry(){
 const native=createNativeNamespace(), revisionId='ll109-source-r1';
 const record=(kind,variantKind,id,title,summary,parameters)=>{
  const inherited=['circuit-basilica','circuit-transit','astral-anchorage','cloud-choir','cloud-slipstream'].includes(id);
  return {schemaVersion:'hapa.living-light.thing.v1',thingId:`ll109:${kind}:${variantKind==='continuous-profile'?'continuous':variantKind==='passage-style'?'passage':'destination'}:${id}`,revisionId,kind,variantKind,title,summary,tags:['living-light','109',variantKind],previewRef:null,
   rendererRef:{implementationId:variantKind==='continuous-profile'?'ll109.continuous':variantKind==='passage-style'?'ll109.passage':'ll109.destination',implementationVersion:'109-native-v1',sourceDigest:SOURCE_DIGEST},
   source:{artifactDigest:SOURCE_DIGEST,moduleId:id,sourceRefs:['resources/living-light-109/manifest.json'],attribution:inherited?'mojovideotech / Kali / nimitz as specified in the inherited shader ledger; Hapa adaptations':'Hapa Living Light 109 supplied source; original module notices retained',creditRefs:['resources/living-light-109/credits/SHADER_CREDITS.md'],rights:inherited?'Inherited shader adaptations: CC BY-NC-SA 3.0; see module-specific ledger. Other assets retain their rights.':'Separate original code/assets and inherited contributions retain their existing rights; no blanket license asserted.'},parameters,
   signalPorts:[{portId:'energy',feature:'energy',required:false,onUnavailable:'neutral'},{portId:'onset',feature:'onset',required:false,onUnavailable:'neutral'}],
   capabilities:{continuous:variantKind==='continuous-profile',bridge:variantKind==='passage-style',destination:variantKind==='destination',transitionIds:[],anchors:variantKind==='passage-style'?['entry','exit']:[],qualityTiers:['draft','balanced','high'],finalEncoding:'unsupported'},aliasOf:null,derivedFrom:null,worldRefs:[],readiness:{state:'catalogued',reasons:['Source definition accounted for; native visual qualification and exact source binding pending'],evidenceRefs:[]}};
 };
 const entries=[...native.HapaJourney.families.map(f=>record('tunnel','continuous-profile',f.id,f.name,f.description,{speed:numeric(.4,2,1,'travel ratio'),drift:numeric(0,1,.32),intensity:numeric(0,1,.78),variety:numeric(0,1,.65)})),
 ...native.HapaPassages.styles.map(id=>record('tunnel','passage-style',id,id.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' '),'Legacy source-time bridge style. Compatibility and anchors must be qualified before composition.',{length:numeric(12,100,36,'world units'),reveal:numeric(0,1,.32),continuity:numeric(0,1,.68)})),
 ...native.HapaPassages.worlds.map(id=>record('location','destination',id,native.HapaCore.worlds.find(w=>w.id===id)?.name||id.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' '),'Living Light destination definition. Independent catalog identity; source renderer dependencies still require qualification.',{}))];
 const alias=entries.find(e=>e.source.moduleId==='halo-vault');alias.aliasOf={thingId:'ll109:location:destination:lumen-arcade',revisionId};alias.summary='Halo Vault compatibility alias of Lumen Arcade; keeps its own identity and discussion.';
 entries.forEach(t=>validateThing(t,{implementations:IMPLEMENTATIONS}));
 const byKey=new Map(entries.map(t=>[t.thingId+'@'+t.revisionId,t]));
 return Object.freeze({entries:Object.freeze(entries),corridorDependency:'breathline-weave',resolveThing:ref=>byKey.get(ref.thingId+'@'+ref.revisionId)||null,implementations:IMPLEMENTATIONS});
}
