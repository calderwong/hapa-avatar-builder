import {useCallback,useRef,useState} from 'react';
import {EchoLivingLightPreviewSurface} from './EchoLivingLightPreview.jsx';
import LivingLightNavigation from './LivingLightNavigation.jsx';
import {livingLightNavigationMap,livingLightNavigationAt} from '../domain/living-light-navigation.js';
/** Reuses the Director host and its exact retained recipe; owns no second clock. */
export default function LivingLightDirectorRoute({records=[],onInspect,sharedHandEnabled=false,...preview}){
 const [route,setRoute]=useState(null),signature=useRef(''),projection=useRef(null);
 const clear=useCallback(()=>{projection.current=null;if(signature.current){signature.current='';setRoute(null);}},[]);
 const onFrame=useCallback(value=>{
  try{
   if(projection.current?.journey!==value.journey)projection.current={journey:value.journey,map:livingLightNavigationMap(value.journey,value.registry)};
   const map=projection.current.map,frame=livingLightNavigationAt(map,value.visualUs);
   if(!frame){clear();return;}
   const key=JSON.stringify([map.journeyRef,value.cue.cueId,frame.locationId,frame.to,frame.traveling]);
   if(signature.current!==key){signature.current=key;setRoute({map,frame,registry:value.registry});}
  }catch{clear();}
 },[clear]);
 const onPreviewState=useCallback(value=>{if(value.state!=='ready')clear();},[clear]);
 return <><div style={{position:'relative',aspectRatio:'16/9',background:'#020617'}}><p style={{padding:12}}>Follow Director shows Living Light cues here. Use the album preview to see the full cut between them.</p><EchoLivingLightPreviewSurface {...preview} onFrame={onFrame} onPreviewState={onPreviewState}/></div>
 <LivingLightNavigation following active={preview.active!==false} map={preview.active===false?null:route?.map} frame={route?.frame} session={route} records={records} media={preview.mediaSources} registry={route?.registry} onInspect={onInspect} sharedHandEnabled={sharedHandEnabled} client={preview.client}/></>;
}
