export function pitchRequest(value){
 if(value==null)return null;
 if(typeof value!=='object'||Array.isArray(value)||typeof value.sourceId!=='string'||!/^master$|^stem-[1-9][0-9]*$/.test(value.sourceId)||!Number.isSafeInteger(value.channel)||value.channel<0||value.channel>7)throw Object.assign(new Error('Pitch analysis needs a registered source and zero-based channel from 0 to 7'),{statusCode:422});
 return {sourceId:value.sourceId,channel:value.channel};
}
/** A 30-second 100 Hz source window fits at most four bounded query pages. */
export async function readPitchWindow(request,url){
 let page=await request(`${url}&limit=1000&offset=0`);if(page.state!=='candidate')return page;
 const frames=[...page.frames],first=page;
 if(!Number.isInteger(page.total)||page.total<0||page.total>3002||page.offset!==0||!Array.isArray(page.frames))throw new Error('Pitch window exceeds the review budget');
 for(let i=1;page.truncated&&i<4;i++){
  page=await request(`${url}&limit=1000&offset=${frames.length}`);
  if(page.state!=='candidate'||page.source_sha256!==first.source_sha256||page.timeline_id!==first.timeline_id||page.total!==first.total||page.start_sample!==first.start_sample||page.end_sample!==first.end_sample||page.source_channel!==first.source_channel||page.method!==first.method||!Array.isArray(page.frames)||page.offset!==frames.length)throw new Error('Pitch pages do not share one source window');
  frames.push(...page.frames);
 }
 if(page.truncated||frames.length!==first.total)throw new Error('Pitch window is incomplete; retry loading');
 for(let i=0;i<frames.length;i++){const f=frames[i];if(!Number.isSafeInteger(f.center_sample)||f.center_sample<first.start_sample||f.center_sample>=first.end_sample||(i&&(f.center_sample<=frames[i-1].center_sample||f.analysis_center_sample!==frames[i-1].analysis_center_sample+160)))throw new Error('Pitch frame order or window bounds changed');}
 return {...first,frames,truncated:false};
}
