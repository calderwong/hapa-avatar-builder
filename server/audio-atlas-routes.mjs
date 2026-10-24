/** Mount in the Builder's existing API/auth boundary. Reads never trigger analysis. */
export async function handleAudioAtlas({req,res,url,atlas,uploads,requireAdmin,readBody,sendJson,serveLocalFile}) {
  const prefix='/api/echos/audio-atlas';if(!url.pathname.startsWith(prefix))return false;
  // Atlas requires exact same-origin browser context, including authenticated reads.
  if(req.headers.origin && (req.headers.origin!==`http://${req.headers.host}`||req.headers['sec-fetch-site']!=='same-origin')){
    sendJson(res,403,{error:'atlas_origin_rejected'});return true;
  }
  if(!requireAdmin(req,res))return true;
  try{
    const suffix=url.pathname.slice(prefix.length),params=Object.fromEntries(url.searchParams);
    const media=suffix.match(/^\/jobs\/([a-zA-Z0-9_-]+)\/audio\/([a-zA-Z0-9_-]+)$/);
    if(media&&['GET','HEAD'].includes(req.method)){await serveLocalFile(await atlas.audio(media[1],media[2]),req,res);return true;}
    const files=suffix.match(/^\/songs\/([^/]+)\/files$/);
    if(files){
      const songId=decodeURIComponent(files[1]);
      if(req.method==='GET')sendJson(res,200,{ok:true,...await uploads.status(songId)});
      else if(req.method==='POST'){
        if(Number(req.headers['content-length'])>1024*1024*1024)throw Object.assign(new Error('File exceeds 1 GiB upload limit'),{statusCode:413});
        sendJson(res,201,{ok:true,...await uploads.upload({...params,songId,replace:params.replace==='true',stream:req})});
      }else sendJson(res,405,{error:'method_not_allowed'});
      return true;
    }
    const descriptionReview=suffix.match(/^\/jobs\/([a-zA-Z0-9_-]+)\/descriptions\/([a-f0-9-]{36})\/review$/);
    if(descriptionReview){
      if(req.method!=='POST')throw Object.assign(new Error('Method not allowed'),{statusCode:405});
      const value=atlas.reviewDescription(descriptionReview[1],descriptionReview[2],await readBody(req));sendJson(res,200,{ok:true,...value});return true;
    }
    let value;
    if(suffix==='/songs'&&req.method==='GET')value={songs:atlas.list()};
    else if(suffix==='/inventory'&&req.method==='GET')value=await atlas.inventory();
    else if(suffix==='/jobs'&&req.method==='GET')value={jobs:atlas.jobs(params.songId)};
    else if(suffix==='/jobs'&&req.method==='POST'){const body=await readBody(req);value=await atlas.start(body.songId,{alignmentBaseRunId:body.alignmentBaseRunId||null,transcriptionBaseRunId:body.transcriptionBaseRunId||null,transcriptionSourceId:body.transcriptionSourceId||null,transcriptionLanguage:body.transcriptionLanguage||'en',transcribe:body.transcribe===true,beats:body.beats===true,acoustic:body.acoustic===true,alignment:body.alignment,pitch:body.pitch});}
    else {
      const match=suffix.match(/^\/jobs\/([a-zA-Z0-9_-]+)(?:\/(query|review|export|reference|text-search|noise-reference|descriptions))?$/);
      if(!match)throw Object.assign(new Error('Atlas route not found'),{statusCode:404});
      const [,id,action]=match;
      if(action==='descriptions'){
        if(req.method==='POST')value=atlas.describe(id,await readBody(req));
        else if(req.method==='GET')value=atlas.descriptions(id,params.id);
        else if(req.method==='DELETE')value=await atlas.cancelDescription(id,params.id);
        else throw Object.assign(new Error('Method not allowed'),{statusCode:405});
      }else if(action==='text-search'){
        if(req.method==='POST')value=await atlas.searchText(id,await readBody(req));
        else if(req.method==='GET')value=atlas.textSearches(id,params.id,params.limit);
        else if(req.method==='DELETE')value=await atlas.cancelTextSearch(id);
        else throw Object.assign(new Error('Method not allowed'),{statusCode:405});
      }else if(req.method==='GET')value=action==='query'?atlas.query(id,params):action==='review'?atlas.reviews(id):action==='export'?{result:atlas.result(id),reviews:atlas.reviews(id),contract:atlas.contract(id),derived:atlas.derived?.(id)||{}}:atlas.status(id);
      else if(req.method==='DELETE'&&!action)value=await atlas.cancel(id);
      else if(req.method==='POST'&&action==='noise-reference')value=atlas.noiseReference(id,await readBody(req));
      else if(req.method==='POST'&&action==='reference')value=atlas.reference(id,await readBody(req));
      else if(req.method==='POST'&&action==='review')value=atlas.review(id,await readBody(req));
      else throw Object.assign(new Error('Method not allowed'),{statusCode:405});
    }
    sendJson(res,req.method==='POST'?202:200,{ok:true,...value});
  }catch(e){sendJson(res,e.statusCode||(e.code==='OWNED_FILE_LOCK_BUSY'?409:500),{ok:false,error:e.code||'atlas_request_failed',message:e.message});}
  return true;
}
