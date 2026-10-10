export async function readRhythmWindow(request,url){
 const first=await request(`${url}&limit=1000&offset=0`);if(first.state!=='candidate')return first;
 const maxFrames=Math.ceil(30*first.sample_rate_hz/first.onset.hop_samples)+1;
 if(!Number.isFinite(maxFrames)||maxFrames>6001||!Number.isInteger(first.total)||first.total<0||first.total>maxFrames||first.offset!==0||!Array.isArray(first.frames))throw new Error('Invalid rhythm window budget');
 const frames=[...first.frames];let page=first;
 for(let i=1;page.truncated&&i<Math.ceil(maxFrames/1000);i++){page=await request(`${url}&limit=1000&offset=${frames.length}`);if(page.state!=='candidate'||page.source_sha256!==first.source_sha256||page.timeline_id!==first.timeline_id||page.start_sample!==first.start_sample||page.end_sample!==first.end_sample||page.total!==first.total||page.offset!==frames.length)throw new Error('Rhythm pages changed source or window');frames.push(...page.frames);}
 if(page.truncated||frames.length!==first.total||frames.some((f,i)=>!Number.isSafeInteger(f.center_sample)||f.center_sample<first.start_sample||f.center_sample>=first.end_sample||(i&&f.center_sample!==frames[i-1].center_sample+first.onset.hop_samples)))throw new Error('Rhythm window is incomplete or out of order; retry loading');
 return {...first,frames,truncated:false};
}
