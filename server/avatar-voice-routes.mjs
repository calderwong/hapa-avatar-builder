import {consumerRequestId,ownsVoiceJob,consumerVoiceLibrary,consumerVoiceJob} from './avatar-voice-consumer.mjs';
export function voiceBrowserContext(req,{bind,allowedOrigins,bootstrap=false}={}) {
  if(!['127.0.0.1','localhost','::1'].includes(bind))return false;
  const h=req.headers,protocol=req.socket?.encrypted?'https:':'http:';
  let origin=h.origin;if(!origin&&!bootstrap&&req.method==='GET'){try{origin=new URL(h.referer).origin;}catch{}}
  if(!origin||h['sec-fetch-site']!=='same-origin'||(req.method!=='GET'&&h['x-hapa-first-party-intent']!=='avatar-voice'))return false;
  try{return ['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname)&&origin===`${protocol}//${h.host}`&&allowedOrigins.has(origin);}catch{return false;}
}
export async function handleAvatarVoice({req,res,url,service,readBody,sendJson,serveLocalFile,requireAdmin}) {
  if(!url.pathname.startsWith('/api/avatar-voices/'))return false;
  const authorization=await requireAdmin(req,res);if(!authorization)return true;
  res.setHeader('Cache-Control','no-store');
  const match=/^\/api\/avatar-voices\/([^/]+)(?:\/(capture|scripts|generate|speak|jobs|cancel|audio|bundle|archive|delete)(?:\/([^/]+))?)?$/.exec(url.pathname);
  if(!match){sendJson(res,404,{error:'voice_route_not_found'});return true;}
  const avatarId=decodeURIComponent(match[1]),action=match[2];
  try{
    if(authorization.mode==='voice-consumer'){
      if(!authorization.avatarIds.includes(avatarId)){sendJson(res,403,{error:'voice_avatar_scope_denied'});return true;}
      const ownJob=async clipId=>{const clip=await service.job(avatarId,clipId);if(!ownsVoiceJob(authorization,clip))throw Error('This clip belongs to another caller.');return clip;};
      if(req.method==='GET'&&!action)sendJson(res,200,consumerVoiceLibrary(await service.inspect(avatarId)));
      else if(req.method==='POST'&&action==='speak'){
        const input=await readBody(req,16384);input.requestId=consumerRequestId(authorization.consumerId,input.requestId);
        sendJson(res,202,consumerVoiceJob(await service.speak(avatarId,input)));
      }else if(req.method==='GET'&&action==='jobs')sendJson(res,200,consumerVoiceJob(await ownJob(match[3])));
      else if(req.method==='GET'&&action==='bundle'){await ownJob(match[3]);sendJson(res,200,await service.bundle(avatarId,match[3]));}
      else if(req.method==='POST'&&action==='cancel'){
        const input=await readBody(req,16384);
        if(Boolean(input.requestId)===Boolean(input.clipId))throw Error('Cancel exactly one requestId or clipId.');
        if(input.requestId)input.requestId=consumerRequestId(authorization.consumerId,input.requestId);else await ownJob(input.clipId);
        await service.cancel(avatarId,input);sendJson(res,200,{ok:true,scope:'one-utterance'});
      }else sendJson(res,403,{error:'voice_operation_scope_denied'});
      return true;
    }
    if(req.method==='GET'&&!action)sendJson(res,200,await service.inspect(avatarId));
    else if(req.method==='GET'&&action==='jobs')sendJson(res,200,await service.job(avatarId,decodeURIComponent(match[3]||'')));
    else if(req.method==='GET'&&action==='bundle'){res.setHeader('Content-Disposition','attachment; filename="avatar-clip.json"');sendJson(res,200,await service.bundle(avatarId,match[3]));}
    else if(req.method==='GET'&&action==='audio')await serveLocalFile(await service.audio(avatarId,decodeURIComponent(match[3]||'')),req,res,{cacheControl:'no-store'});
    else if(req.method==='POST'&&['capture','scripts','generate','speak','cancel','archive','delete'].includes(action)){
      const method={capture:'capture',scripts:'saveScript',generate:'generate',speak:'speak',cancel:'cancel',archive:'archive',delete:'remove'}[action];
      sendJson(res,['generate','speak'].includes(action)?202:201,await service[method](avatarId,await readBody(req,action==='capture'?22*1024*1024:16384)));
    }else sendJson(res,405,{error:'method_not_allowed'});
  }catch(e){sendJson(res,400,{error:'avatar_voice_error',message:e.message});}
  return true;
}
