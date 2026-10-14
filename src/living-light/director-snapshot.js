import {validateLivingLightRenderSnapshot} from '../domain/echo-living-light-render-snapshot.js';
import {createLivingLightFeatureCache} from '../domain/living-light-feature-cache.js';
import {createLivingLightPreparedInputResolver} from '../domain/living-light-prepared-input.js';
import {createEchoLivingLightOfflineRenderer} from './director-offline.js';

/** Offline snapshot consumer. No authoring/API lookup or latest-head fallback. */
export function createEchoLivingLightSnapshotRenderer(snapshot,options={}){
 const pinned=structuredClone(snapshot),resolved=validateLivingLightRenderSnapshot(pinned);
 const cache=createLivingLightFeatureCache({maxInactive:0});
 const prepareInput=createLivingLightPreparedInputResolver({songId:resolved.songId,...resolved.preparedSource,cache,request:()=>{throw Error('Offline render preparation must be packaged.');}});
 const recipe=ref=>{
  const value=resolved.recipes.get(JSON.stringify([ref.journeyId,ref.revisionId]));
  if(!value)throw Error('The exact Journey is absent from the render snapshot.');return value;
 };
 let renderer;
 try{renderer=createEchoLivingLightOfflineRenderer({...options,cues:resolved.cues,songId:resolved.songId,durationUs:resolved.durationUs,prepareInput,
  resolveJourney:async ref=>recipe(ref).journey,
  resolveRegistry:async journey=>recipe(journey).registry,
  resolveMedia:async journey=>recipe(journey).sources});}
 catch(error){cache.dispose();throw error;}
 const dispose=()=>{try{renderer.dispose();}finally{cache.dispose();}};
 return {...renderer,dispose,async prepareFrame(...args){try{return await renderer.prepareFrame(...args);}catch(error){dispose();throw error;}},diagnostics:()=>({...renderer.diagnostics(),snapshotDigest:pinned.snapshotDigest,features:cache.diagnostics()})};
}
