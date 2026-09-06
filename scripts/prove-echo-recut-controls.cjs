#!/usr/bin/env electron
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const ROOT=path.resolve(__dirname,'..');
const output=path.resolve(process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'artifacts/echo-recut-controls-proof');
let server,win,temporary,exitStatus=1;
app.on('window-all-closed',()=>{});
const timer=setTimeout(()=>app.exit(1),120000),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(value,message)=>{if(!value)throw new Error(message);};
async function waitFor(expression){for(let i=0;i<150;i++){if(await win.webContents.executeJavaScript(expression))return;await delay(100);}throw new Error('UI did not reach: '+expression);}
async function click(text){const result=await win.webContents.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('button')].find(row=>row.textContent===${JSON.stringify(text)});if(!button||button.disabled)return {error:'Button unavailable',alert:document.querySelector('[role=alert]')?.textContent,buttons:[...document.querySelectorAll('button')].map(row=>row.textContent)};button.click();return {ok:true};})()`);check(result.ok,JSON.stringify({action:text,...result}));await delay(60);}
async function set(label,value){await win.webContents.executeJavaScript(`(()=>{const field=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(field.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);await delay(30);}
app.whenReady().then(async()=>{
 try{
  temporary=await fs.mkdtemp(path.join(os.tmpdir(),'echo-recut-controls-'));await fs.mkdir(output,{recursive:true});
  const {createServer}=await import('vite'),react=(await import('@vitejs/plugin-react')).default;
  server=await createServer({configFile:false,root:ROOT,publicDir:false,cacheDir:path.join(temporary,'vite-cache'),resolve:{dedupe:['react','react-dom']},optimizeDeps:{include:['react','react-dom/client']},logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[react(),{name:'recut-proof',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url!=='/__recut-proof')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html><body style="margin:0;background:#101722;color:white;font:16px system-ui"><div id="root"></div><script type="module" src="/scripts/lib/echo-recut-controls-proof.jsx"></script></body></html>'));});}}]});
  await server.listen();win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  await win.loadURL(`http://127.0.0.1:${server.httpServer.address().port}/__recut-proof`);
  if(process.argv.includes('--force-failure'))throw new Error('Forced proof failure');
  await waitFor(`document.querySelector('select[aria-label="Recut cast"]')?.options.length===3`);
  await set('Director recipe','performance-kinetic');await set('Recut start seconds','6');await set('Recut end seconds','18');await set('Recut change amount','0.5');await set('Recut cast','cast-a');await set('Recut scene','scene-a');
  await click('Generate A/B/C');await click('Review A in player');
  const first=await win.webContents.executeJavaScript('({project:window.recutProofProject,receipt:window.recutProofReceipt,source:window.recutProofSource})');
  check(first.receipt.changedShotIndices.length===2,'Change amount did not limit edits to two shots');
  for(const index of first.receipt.changedShotIndices)check(first.project.timeline[index].characterIds.includes('cast-a'),'Cast choice was not applied');
  for(const index of first.receipt.preservedShotIndices)check(JSON.stringify(first.project.timeline[index])===JSON.stringify(first.source.timeline[index]),'Unselected source changed');
  await click('Review B in player');await click('Restore comparison source');
  check(await win.webContents.executeJavaScript('JSON.stringify(window.recutProofProject)===JSON.stringify(window.recutProofSource)'),'Restore lost pre-comparison state');
  await click('Review A in player');await win.webContents.executeJavaScript('window.recutProofExternalEdit()');await delay(60);await click('Restore comparison source');
  await waitFor('document.querySelector("[role=alert]")?.textContent.includes("current cut changed")');
  check(await win.webContents.executeJavaScript('window.recutProofProject.timed_lyrics[0].text==="New external lyric edit"'),'Restore erased intervening edits');
  const layouts=[];
  for(const [width,zoom]of [[1280,1],[1280,2],[480,1]]){win.webContents.setZoomFactor(zoom);win.setContentSize(width,720);await delay(100);const state=await win.webContents.executeJavaScript('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controlSize:getComputedStyle(document.querySelector("select")).fontSize})');check(state.scrollWidth<=state.width+1,'Controls overflow viewport');check(parseFloat(state.controlSize)>=14,'Critical controls are too small');layouts.push({width,zoom,...state});await fs.writeFile(path.join(output,`controls-${width}-${zoom}x.png`),(await win.webContents.capturePage()).toPNG());}
  await win.webContents.executeJavaScript('window.recutProofChangeSong()');await waitFor('![...document.querySelectorAll("button")].some(button=>button.textContent==="Restore comparison source")');
  await set('Recut start seconds','6');await set('Recut end seconds','18');await set('Recut change amount','1');await set('Recut timing','supported-cues');
  await click('Generate A/B/C');await click('Review A in player');
  const timing=await win.webContents.executeJavaScript('({receipt:window.recutProofReceipt.cueReflow,times:window.recutProofProject.timeline.map(shot=>[shot.start_sec,shot.end_sec])})');
  check(timing.receipt.movedBoundaries.length===3,'Cue timing control did not move the three eligible boundaries');
  check(JSON.stringify(timing.times.slice(2,6))===JSON.stringify([[6,9.08],[9.08,12.06],[12.06,15.08],[15.08,18]]),'Cue timing was not applied to the candidate');
  await fs.writeFile(path.join(output,'cue-timing.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript('window.recutProofReset()');await waitFor('window.recutProofProject.song_id==="recipe-controls"');
  await set('Director recipe','performance-kinetic');await set('Recut change amount','1');await click('Whole song');await click('Generate A/B/C');await click('Review A in player');
  const treatment=await win.webContents.executeJavaScript('({receipt:window.recutProofReceipt.treatment,opacities:window.recutProofProject.visualizer_timeline.map(row=>row.opacity),lyrics:window.recutProofProject.lyrics,accentCount:window.recutProofGraph.directorV2.accentTrack.eventCount,bindings:window.recutProofGraph.directorV2.modulationBindings})');
  check(treatment.receipt.shaderCuesChanged===4&&treatment.opacities.every(value=>value===.312),'Recipe shader mix did not reach the candidate');
  check(treatment.lyrics.templateId==='kinetic-word-burst-v1'&&treatment.accentCount===3,'Recipe event/lyric treatment did not execute in the browser');
  await click('Lock: Keep shader mix');await click('Lock: Keep accents');await click('Lock: Keep lyric style');await set('Director recipe','letter-intimate');await click('Generate A/B/C');await click('Review A in player');
  const lockedTreatment=await win.webContents.executeJavaScript('({opacities:window.recutProofProject.visualizer_timeline.map(row=>row.opacity),lyrics:window.recutProofProject.lyrics,accentCount:window.recutProofGraph.directorV2.accentTrack.eventCount})');
  check(JSON.stringify(lockedTreatment.opacities)===JSON.stringify(treatment.opacities)&&JSON.stringify(lockedTreatment.lyrics)===JSON.stringify(treatment.lyrics)&&lockedTreatment.accentCount===treatment.accentCount,'Locks lost the current recipe treatment');
  await fs.writeFile(path.join(output,'recipe-treatment.png'),(await win.webContents.capturePage()).toPNG());
  const report={pass:true,scope:'Actual VariationLabPanel on isolated declared-identity/cue fixture; this does not measure media playback or human usability',recipeTreatment:{...treatment,locksPreserved:true},changeAmount:.5,changedShots:2,castAndSceneApplied:true,restoreExact:true,staleRestoreRejected:true,songSwitchClearsCandidates:true,cueTiming:timing,layouts};await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));exitStatus=0;
 }catch(error){console.error(error.stack);}
 finally{clearTimeout(timer);if(win&&!win.isDestroyed())win.destroy();if(server)await server.close();if(temporary)await fs.rm(temporary,{recursive:true,force:true});app.exit(exitStatus);}
});
