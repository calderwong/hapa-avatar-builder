import {createLivingLightMusicSampler} from './living-light-music-response.js';
import {canonicalJSON} from './living-light-contracts.js';

/** Bounded display-envelope audit at Song time, selecting instances at Journey
 * time. This measures inputs, not pixels, certified beats or human preference. */
export function auditLivingLightResponseCue({cue,journey,bank,hz=4}) {
 if(!Number.isInteger(hz)||hz<1||hz>30)throw Error('Audit sampling must be 1–30 Hz');
 const start=cue.window.startUs,end=cue.window.endUs;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end-start>1800000000)throw Error('Invalid bounded cue window');
 if(cue.mapping!=='offset-1x'||cue.clock!=='echo-song')throw Error('Unsupported cue clock');
 const instances=new Map(journey.instances.map(i=>[i.instanceId,i])),samplers=new Map(),roles={};
 const masterId=canonicalJSON([{kind:'master'}]);
 const counts={samples:0,unbound:0,off:0,blocked:0,unavailable:0,stem:0,masterOnly:0};
 let quiet=null,strong=null;
 for(let songUs=start;songUs<end;songUs+=Math.round(1e6/hz)){
  const journeyUs=cue.journeyWindow.startUs+songUs-start;
  const row=journey.schedule.find(r=>journeyUs>=r.startUs&&journeyUs<r.endUs),instance=instances.get(row?.instanceId),response=instance?.musicResponse;
  counts.samples++;
  if(!response){counts.unbound++;continue;}
  if(response.intensity===0){counts.off++;continue;}
  if(!samplers.has(response))samplers.set(response,createLivingLightMusicSampler(bank,response));
  let stem=false,master=false,available=false,blocked=false,peak=0;
  for(const [role,binding]of Object.entries(response.roles)){
   const value=samplers.get(response)(role,'energy',Math.min(songUs,bank.identity.durationUs));
   const record=roles[role]??={samples:0,qualifiedStem:0,master:0,unavailable:0,min:null,max:null};record.samples++;
   if(!Number.isFinite(value.value)){record.unavailable++;blocked||=binding.onUnavailable==='block';continue;}
   available=true;peak=Math.max(peak,value.value);
   record.min=record.min===null?value.value:Math.min(record.min,value.value);record.max=record.max===null?value.value:Math.max(record.max,value.value);
   const effectiveRefs=value.sourceAssetId===masterId?[{kind:'master'}]:binding.sourceRefs.filter((_,i)=>binding.aggregation!=='weighted-sum'||binding.weights[i]>0);
   if(effectiveRefs.some(ref=>ref.kind==='master')){master=true;record.master++;}
   if(effectiveRefs.some(ref=>ref.kind==='stem')){stem=true;record.qualifiedStem++;}
  }
  if(blocked)counts.blocked++;
  if(!available)counts.unavailable++;else if(stem)counts.stem++;else if(master)counts.masterOnly++;
  if(available){const candidate={songUs,journeyUs,peakRoleEnergy:peak};if(!quiet||peak<quiet.peakRoleEnergy)quiet=candidate;if(!strong||peak>strong.peakRoleEnergy)strong=candidate;}
 }
 for(const r of Object.values(roles))r.range=r.min===null?null:r.max-r.min;
 const issues=[];
 for(const key of ['unbound','off','blocked','unavailable'])if(counts[key])issues.push(key);
 if(Object.keys(roles).length&&Object.values(roles).every(r=>r.range===null||r.range<=1e-5))issues.push('flat-sampled-envelope');
 return {cueId:cue.cueId,window:cue.window,journeyWindow:cue.journeyWindow,hz,counts,roles,quiet,strong,issues,
  limits:'Sampled effective display energy only. A varying envelope does not establish visible choreography; silent passages and intentional Off choices require review, not automatic repair.'};
}
