import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createLivingLightClient} from '../domain/living-light-client.js';
/** One bounded owner page at a time; a new song cannot receive an old page. */
export default function useLivingLightJourneyLibrary(songId,refreshToken){
 const client=useMemo(()=>createLivingLightClient(),[]),epoch=useRef(0),active=useRef(null);
 const [page,setPage]=useState({songId,rows:[],nextOffset:null,busy:false,status:''});
 const refresh=useCallback(async(offset=0)=>{
  active.current?.abort();const controller=new AbortController(),ticket=++epoch.current;active.current=controller;
  if(!songId){setPage({songId,rows:[],nextOffset:null,busy:false,status:'Choose a song to browse its saved Journeys.'});return;}
  setPage(previous=>({songId,rows:offset&&previous.songId===songId?previous.rows:[],nextOffset:null,busy:true,status:'Loading saved Journey Cards…'}));
  try{
   const result=await client.request('/journeys?songId='+encodeURIComponent(songId)+'&limit=50&offset='+offset,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
   if(epoch.current!==ticket)return;
   setPage(previous=>({songId,rows:[...new Map([...(offset?previous.rows:[]),...result.journeys].map(row=>[row.journey.journeyId,row])).values()],nextOffset:result.nextOffset,busy:false,status:''}));
  }catch(error){if(epoch.current===ticket)setPage(previous=>({...previous,busy:false,status:'Saved Journeys could not load: '+error.message}));}
 },[client,songId]);
 useEffect(()=>{refresh();return()=>{epoch.current++;active.current?.abort();};},[refresh,refreshToken]);
 return {...(page.songId===songId?page:{songId,rows:[],nextOffset:null,busy:true,status:'Loading saved Journey Cards…'}),refresh};
}
