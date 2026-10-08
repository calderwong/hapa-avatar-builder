import {useState} from 'react';
/** No canvas or decoder belongs to a tile. Failed images leave readable Cards. */
export default function LivingLightCardStill({still,kind,title}){
 const [failed,setFailed]=useState(false);
 return <div className={'living-light-card-still '+kind}>
  {still&&!failed?<><img src={still.dataUrl} width="320" height="180" loading="lazy" alt={title+' — captured reference preview'} onError={()=>setFailed(true)}/><small>{still.receipt.context||'Saved recipe study'} · {(still.receipt.visualUs/1e6).toFixed(2)}s</small></>:<><span aria-hidden="true">{kind==='journey'?'↝':kind==='location'?'◇':'◎'}</span><small>{failed?'Preview unavailable; Card details remain below':'Preview not yet captured'}</small></>}
 </div>;
}
