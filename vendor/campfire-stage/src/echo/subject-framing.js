// Bounds measured once when targets change; the camera follows their smoothed
// envelope rather than guessing from a shape's name. Units are stage metres.
export function measureSubjectBounds(points){
 let low=Infinity,high=-Infinity,radius=0;
 for(let i=0;i<points.length;i+=3){
  const x=points[i],y=points[i+1],z=points[i+2];
  if(![x,y,z].every(Number.isFinite))continue;
  low=Math.min(low,y);high=Math.max(high,y);radius=Math.max(radius,Math.hypot(x,z));
 }
 return Number.isFinite(low)?{low,high,radius}:{low:-1,high:1,radius:1};
}
export function followSubjectBounds(current,target,dt){
 const alpha=1-Math.exp(-Math.max(0,Math.min(.1,dt))/.28);
 for(const key of ['low','high','radius','flat']){
  if(key==='flat'){current[key]??=0;}
  current[key]+=((target[key]??0)-current[key])*alpha;
 }
 return current;
}
export function fitSubjectFrame({bounds,scale,anchor,pitch,aspect,fov,minimumDistance=3.2,flat=false,subjectFocus=0}){
 const margin=.22,radius=Math.max(.72,bounds.radius*scale+margin);
 const low=Math.min(0,anchor+bounds.low*scale-margin),high=Math.max(1.1,anchor+bounds.high*scale+margin);
 const ordinary=Math.max(1.02,Math.min(1.7,(low+high)*.5+.04));
 const subject=anchor+(bounds.low+bounds.high)*scale*.5;
 const targetY=Math.max(1.02,Math.min(2.1,ordinary+(subject-ordinary)*Math.max(0,Math.min(1,subjectFocus))));
 const tan=Math.tan(fov*Math.PI/360),a=Math.max(.4,Math.min(3,aspect));
 let distance=minimumDistance;
 // Conservative horizontal cylinder plus the fire base, with generous screen
 // margins for captions/headroom. The real deformation fits within the pad.
 const flatWeight=Math.max(0,Math.min(1,Number(flat)||0));
 const thickness=radius+(.22-radius)*flatWeight;
 for(const y of [low,high])for(const depth of [-thickness,thickness]){
  const dy=y-targetY,offset=depth*Math.cos(pitch)+dy*Math.sin(pitch);
  distance=Math.max(distance,radius/(.84*tan*a)+offset,
   Math.abs(dy*Math.cos(pitch)-depth*Math.sin(pitch))/(.78*tan)+offset);
 }
 return {targetY,distance:Math.min(6.2,distance),limited:distance>6.2};
}

// Conservative union of the central form and its three grouped attractors.
// The GPU uses a fixed .34 local scale and offsets bounded by this envelope.
export function pocketSubjectBounds(bounds,amount=0){
 const p=Math.max(0,Math.min(1,Number(amount)||0)),scale=1-.66*p;
 return {...bounds,low:Math.min(bounds.low,bounds.low*scale-.12*p),high:Math.max(bounds.high,bounds.high*scale+.18*p),radius:Math.max(bounds.radius,bounds.radius*scale+.90*p)};
}

// Union of the single performer and all authored duplicate paths. The offset
// stays below 1.05 horizontally and .6 vertically before stage scale.
export function copySubjectBounds(bounds,mix=[]){
 const amount=Math.max(0,Math.min(1,mix.reduce((a,b)=>a+b,0))),scale=1-.5*amount;
 return {...bounds,flat:(bounds.flat??0)*(1-amount),low:Math.min(bounds.low,bounds.low*scale-.6*amount),high:Math.max(bounds.high,bounds.high*scale+.6*amount),radius:Math.max(bounds.radius,bounds.radius*scale+1.05*amount)};
}
