// Authored display accents from the existing normalized RMS-delta envelope.
// These are not musical beats or a new acoustic analysis. Unknown intervals
// disarm the crossing detector, so entering a qualified span cannot fake a hit.
export const MUSIC_ONSET_BASIS='measured display-onset threshold crossing; not certified beats';
export function musicOnsetEvents(sample,duration,{hz=30,threshold=.3,rearm=.15,refractory=.12}={}){
 const events=[];let armed=false,last=-Infinity;
 for(let i=0;i<Math.ceil(duration*hz);i++){
  const time=i/hz,row=sample(time),available=['present','silent'].includes(row.availability)&&Number.isFinite(row.value);
  if(!available){armed=false;continue;}
  if(row.value<=rearm)armed=true;
  if(armed&&row.value>=threshold){
   armed=false;
   if(time-last>=refractory){events.push({time,strength:Math.min(1,row.value)});last=time;}
  }
 }
 return events;
}
