/** Read a complete 30-second display window, bounded to two 1000-frame pages. */
export async function readSpectrogramWindow(request,route,signal){
 const first=await request(route,{signal});
 if(first.state!=='complete')return first;
 if(!Number.isSafeInteger(first.total)||first.total<0||first.total>1202||!Array.isArray(first.frames))throw new Error('Invalid bounded spectral window');
 if(!first.truncated){if(first.frames.length!==first.total)throw new Error('Incomplete spectral window');return first;}
 if(first.frames.length!==1000)throw new Error('Invalid spectral pagination');
 const next=await request(`${route}&offset=1000`,{signal});
 if(next.state!=='complete'||next.truncated||next.total!==first.total||next.offset!==1000||next.channel!==first.channel||next.artifact_sha256!==first.artifact_sha256||next.timeline_id!==first.timeline_id||!Array.isArray(next.frames)||first.frames.length+next.frames.length!==first.total)throw new Error('Spectral pages do not match; retry this window');
 return {...first,truncated:false,frames:[...first.frames,...next.frames]};
}
