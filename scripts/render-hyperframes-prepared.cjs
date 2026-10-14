#!/usr/bin/env electron
'use strict';
// Hapa-owned prepared capture adapter over the existing Echo HTML compositor.
// One Electron window, one ffmpeg child; no CLI patch, install, API or authoring write.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {encodingPlan,encoderEnvironment,checkFrameReceipt,checkPreparedSoundtrack}=require('./lib/prepared-frame-encoding.cjs');
if(process.env.HAPA_PREPARED_CAPTURE_WORKER!=='1')throw Error('Use scripts/run-prepared-render.mjs so cancellation owns the complete process group');
if(!/^[a-f0-9-]{36}$/.test(process.env.HAPA_PREPARED_CAPTURE_ID||''))throw Error('Prepared capture ownership is missing');
if(process.env.HAPA_PREPARED_ENCODER_WORKER==='1')throw Error('Encoder child cannot enter the capture owner');
const arg=name=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);
if(!arg('project')||!arg('output'))throw Error('Use --project=<compiled-package> --output=<new-directory>');
const root=fs.realpathSync(arg('project')),output=path.resolve(arg('output'));
const userData=path.join(app.getPath('temp'),'hapa-prepared-render-'+process.pid);
app.setName('Hapa prepared cut renderer');app.setPath('userData',userData);
app.commandLine.appendSwitch('force-device-scale-factor','1');app.commandLine.appendSwitch('disable-background-timer-throttling');app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.on('window-all-closed',()=>{});
let win,server,encoder,encoderExit,exitResult,stopping=false,ownsOutput=false,frames=0,stderr='',deadline;
const hashFile=async file=>{const hash=crypto.createHash('sha256');for await(const bytes of fs.createReadStream(file))hash.update(bytes);return 'sha256:'+hash.digest('hex');};
const bounded=(promise,ms,label)=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms)})]).finally(()=>clearTimeout(timer));};
async function stopChild(){
  if(!encoder||exitResult)return;
  encoder.stdin.destroy();encoder.kill('SIGTERM');
  try{await bounded(encoderExit,3000,'Encoder termination');}catch{encoder.kill('SIGKILL');await bounded(encoderExit,3000,'Encoder force termination');}
}
async function finish(code,error){
  if(stopping)return;stopping=true;clearTimeout(deadline);
  try{await stopChild();}catch(e){code=1;error=error||e;}
  if(win&&!win.isDestroyed()){try{await bounded(win.webContents.executeJavaScript('window.HAPA_DISPOSE_RENDER?.()'),2000,'Native disposal');}catch{}win.destroy();}
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(error){console.error(error.stack||error);if(ownsOutput)await fsp.writeFile(path.join(output,'failed.json'),JSON.stringify({ok:false,frames,message:error.message,encoder:exitResult,stderr},null,2));}
  // userData is an owned per-run disposable Electron profile.
  await fsp.rm(userData,{recursive:true,force:true}).catch(()=>{});app.exit(code);
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void finish(1,Error('Prepared render canceled')));
process.once('uncaughtException',error=>void finish(1,error));process.once('unhandledRejection',error=>void finish(1,error));

app.whenReady().then(async()=>{
  await fsp.mkdir(output);ownsOutput=true;await fsp.writeFile(path.join(output,'capture-started.json'),JSON.stringify({captureId:process.env.HAPA_PREPARED_CAPTURE_ID,pid:process.pid}),{flag:'wx'}); // Refuse overwriting an earlier take or failed evidence.
  deadline=setTimeout(()=>void finish(1,Error('Prepared render exceeded 30 minutes')),1800e3);
  const show=JSON.parse(await fsp.readFile(path.join(root,'executable-show.json'),'utf8')),plan=encodingPlan(show,root,output);
  const {verifyLivingLightPackageMedia}=await import('./lib/hyperframes-living-light-package.mjs');
  const snapshot=JSON.parse(await fsp.readFile(path.join(root,'assets/data/living-light.json'),'utf8'));
  if(snapshot.snapshotDigest!==show.livingLight.snapshotDigest)throw Error('Compiled Living Light snapshot changed');
  await verifyLivingLightPackageMedia(snapshot,root);
  checkPreparedSoundtrack(snapshot,plan.audio);
  const assets=[plan.audio,...show.instances.media.filter(m=>m.source?.compiledUri).map(m=>({uri:m.source.compiledUri,sha256:m.source.compiledSha256}))];
  for(const asset of assets){const file=await fsp.realpath(path.join(root,asset.uri));if(!file.startsWith(root+path.sep)||await hashFile(file)!==asset.sha256)throw Error('Compiled media bytes changed');}
  server=http.createServer(async(req,res)=>{
    try{const uri=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),file=await fsp.realpath(path.join(root,uri==='/'?'index.html':uri.slice(1)));
      if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
      const stat=await fsp.stat(file);if(!stat.isFile())return res.writeHead(404).end();
      const match=String(req.headers.range||'').match(/^bytes=(\d+)-(\d*)$/),start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),stat.size-1):stat.size-1;
      if(start>end||start>=stat.size)return res.writeHead(416).end();
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4'}[path.extname(file)]||'application/octet-stream';
      res.writeHead(match?206:200,{'Content-Type':mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store',...(match?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})});
      if(req.method==='HEAD')res.end();else{const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}
    }catch{res.writeHead(404).end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const origin='http://127.0.0.1:'+server.address().port;
  win=new BrowserWindow({show:false,frame:false,useContentSize:true,width:plan.width,height:plan.height,backgroundColor:'#02040a',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,partition:'hapa-prepared-'+process.pid}});
  const browserErrors=[];win.webContents.on('console-message',event=>{if(event.level==='error')browserErrors.push(event.message);});
  win.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^(https?|wss?):/.test(details.url)&&!details.url.startsWith(origin+'/')}));
  win.webContents.setAudioMuted(true);
  await bounded(win.loadURL(origin+'/index.html'),60000,'Package load');
  await bounded(win.webContents.executeJavaScript('Promise.resolve(window.HAPA_ASSETS_READY).then(()=>{if(typeof window.HAPA_RENDER_FRAME_AT!=="function")throw Error("Prepared compositor missing");return true})'),60000,'Package readiness');
  await bounded(win.webContents.executeJavaScript('document.fonts.ready.then(()=>true)'),10000,'Font readiness');
  encoder=spawn('ffmpeg',plan.args,{shell:false,env:encoderEnvironment(process.env),stdio:['pipe','ignore','pipe']});
  encoderExit=new Promise(resolve=>{encoder.once('error',error=>{exitResult={error:error.message};resolve(exitResult);});encoder.once('close',(code,signal)=>{exitResult={code,signal};resolve(exitResult);});});
  encoder.stdin.on('error',()=>{});encoder.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(-8192);});
  const receipts=fs.createWriteStream(path.join(output,'frames.ndjson'),{flags:'wx'});
  try{
    for(let index=0;index<plan.frameCount;index++){
      if(stopping||exitResult)throw Error('Encoder stopped before all frames were submitted');
      const receipt=await bounded(win.webContents.executeJavaScript('window.HAPA_RENDER_FRAME_AT('+index+')'),60000,'Frame preparation');
      checkFrameReceipt(receipt,index,show);
      // Two compositor turns flush the native canvas and DOM lyric layout.
      await bounded(win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'),5000,'Compositor flush');
      const picture=await bounded(win.webContents.capturePage(),15000,'Frame capture'),size=picture.getSize();
      if(size.width!==plan.width||size.height!==plan.height)throw Error('Capture changed the output dimensions');
      const png=picture.toPNG();
      await bounded(new Promise((resolve,reject)=>encoder.stdin.write(png,error=>error?reject(error):resolve())),30000,'Encoder input');
      const row={...receipt,pngSha256:crypto.createHash('sha256').update(png).digest('hex')};
      await new Promise((resolve,reject)=>receipts.write(JSON.stringify(row)+'\n',error=>error?reject(error):resolve()));frames++;
      if(index%30===0)console.log(JSON.stringify({status:'rendering',frames,total:plan.frameCount}));
    }
  }finally{await new Promise(resolve=>receipts.end(resolve));}
  encoder.stdin.end();await bounded(encoderExit,120000,'Encoder completion');if(exitResult.code!==0)throw Error('Encoder failed: '+stderr);
  if(browserErrors.length)throw Error('Browser errors during prepared render: '+browserErrors.slice(0,3).join('; '));
  const cleanup=await win.webContents.executeJavaScript('window.HAPA_DISPOSE_RENDER()');
  const result={ok:true,stage:'encoded-awaiting-media-and-creative-acceptance',showHash:show.showHash,snapshotDigest:snapshot.snapshotDigest,frames,fps:plan.fps,width:plan.width,height:plan.height,duration:plan.duration,masterAudio:plan.audio,sha256:await hashFile(path.join(output,'cut.mp4')),cleanup};
  await fsp.writeFile(path.join(output,'render-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await finish(0);
}).catch(error=>void finish(1,error));
