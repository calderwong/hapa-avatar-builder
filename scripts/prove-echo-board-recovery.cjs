#!/usr/bin/env electron
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
app.on('window-all-closed',()=>{});
const ROOT=path.resolve(__dirname,'..');
const output=path.resolve(process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||'artifacts/echo-board-recovery-proof');
let server,win,temporary,exitStatus=1;
const timer=setTimeout(()=>app.exit(1),120000);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(expression){for(let i=0;i<150;i++){if(await win.webContents.executeJavaScript(expression))return;await delay(100);}throw new Error('UI did not reach: '+expression);}
function check(value,message){if(!value)throw new Error(message);}
async function key(keyCode){win.webContents.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode});if(keyCode==='Return')win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode});await delay(50);}
async function choose(status){await win.webContents.executeJavaScript(`(()=>{const select=document.querySelector('select[aria-label="Requirement status"]');select.value=${JSON.stringify(status)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(20);await win.webContents.executeJavaScript('document.querySelector("button[type=submit]").click()');}
app.whenReady().then(async()=>{
 try{
  temporary=await fs.mkdtemp(path.join(os.tmpdir(),'echo-board-ui-'));
  await fs.mkdir(output,{recursive:true});
  const boardPath=path.join(temporary,'board.json'),stateRoot=path.join(temporary,'state');
  const original={lanes:[{id:'lane',title:'Requirements',cards:[{id:'card',title:'Image camera requirement',owner:'DirectorSystems',priority:'P1',status:'backlog',reviewStatus:'approved-for-implementation',acceptance:['Keep source pixels and text visible'],metadata:{accepted:false}},{id:'other',title:'Unrelated requirement',owner:'Playback',status:'todo',description:'Preserve this card'}]}]};
  await fs.writeFile(boardPath,JSON.stringify(original));
  const {createEchoKanbanStore}=await import('../server/echo-kanban-store.mjs');
  let failProjection=false,posts=0,mirrorLag=false;
  const store=createEchoKanbanStore({boardPath,stateRoot,io:{...fs,rename:async(...args)=>{if(failProjection)throw new Error('Injected projection disk failure');return fs.rename(...args);}},readMirror:async()=>({status:mirrorLag?'different':'aligned',matched:mirrorLag?1:2,total:2,checkedAt:new Date().toISOString(),differences:mirrorLag?[{cardId:'card',overwatchStatus:'backlog',localStatus:'done'}]:[]})});
  const {createServer}=await import('vite'),react=(await import('@vitejs/plugin-react')).default;
  server=await createServer({configFile:false,root:ROOT,publicDir:false,cacheDir:path.join(temporary,'vite-cache'),resolve:{dedupe:['react','react-dom']},optimizeDeps:{include:['react','react-dom/client']},logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[react(),{name:'board-proof',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
   try{
    if(req.url==='/__board-proof'){res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,'<!doctype html><html><body style="margin:0;background:#101722;color:white;font:16px system-ui"><div id="root"></div><script type="module" src="/scripts/lib/echo-board-recovery-proof.jsx"></script></body></html>'));return;}
    if(!['/api/echos/kanban','/api/echos/kanban/reconcile'].includes(req.url))return next();
    let result;if(req.method==='GET')result=await store.read();else{posts++;let body='';for await(const chunk of req){body+=chunk;if(body.length>16384)throw new Error('Request too large');}result=await store[req.url.endsWith('/reconcile')?'resolveProjection':'changeStatus'](JSON.parse(body));}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
   }catch(error){res.statusCode=error.statusCode||500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.code,message:error.message}));}
  });}}]});
  await server.listen();win=new BrowserWindow({width:1280,height:720,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  await win.loadURL(`http://127.0.0.1:${server.httpServer.address().port}/__board-proof`);
  if(process.argv.includes('--force-failure'))throw new Error('Forced proof failure for exit-code verification');
  await waitFor('window.boardProofState?._sync?.revision');
  await win.webContents.executeJavaScript('document.querySelector("button[aria-label^=Inspect]").focus()');await key('Return');await waitFor('document.querySelector("dialog")?.open');check(posts===0,'Inspecting/Enter changed status');
  await choose('in_progress');await waitFor('window.boardProofState?.lanes[0].cards[0].status==="in_progress"');check(posts===1,'Status action was not one command');
  failProjection=true;await choose('review');await waitFor('window.boardProofNotice?.includes("projection is pending")');
  const external=JSON.parse(await fs.readFile(boardPath,'utf8'));external.lanes[0].cards[0].status='done';external.lanes[0].cards[1].description='New external metadata';await fs.writeFile(boardPath,JSON.stringify(external));failProjection=false;mirrorLag=true;
  await key('Escape');await waitFor('!document.querySelector("dialog")');
  await win.webContents.executeJavaScript('[...document.querySelectorAll("button")].find(button=>button.textContent==="Refresh board").click()');await waitFor('window.boardProofState?._sync?.localProjection==="conflict"');
  await win.webContents.executeJavaScript('(()=>{const button=document.querySelector("button[aria-label^=Inspect]");button.focus();button.click();})()');await waitFor('document.querySelector("dialog")?.open');
  check(await win.webContents.executeJavaScript('document.querySelector("button[type=submit]").disabled'),'Ordinary save was enabled over a conflict');
  await win.webContents.executeJavaScript('(()=>{const field=document.querySelector("textarea");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(field,"Keep the newer reviewed status");field.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await delay(50);await win.webContents.executeJavaScript('[...document.querySelectorAll("button")].find(button=>button.textContent.startsWith("Keep current status:")).click()');await waitFor('window.boardProofState?._sync?.localProjection==="current"');
  const final=JSON.parse(await fs.readFile(boardPath,'utf8'));
  check(final.lanes[0].cards[0].status==='done','Resolution overwrote current status');check(final.lanes[0].cards[1].description==='New external metadata','Resolution lost unrelated edit');check(final.lanes[0].cards[0].metadata.accepted===false,'Status resolution invented acceptance');
  check(await win.webContents.executeJavaScript('document.body.textContent.includes("Overwatch status: backlog")'),'Mirror difference was hidden');
  win.webContents.setZoomFactor(2);await delay(100);const bounds=await win.webContents.executeJavaScript('(()=>{const r=document.querySelector("dialog").getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth};})()');check(bounds.left>=0&&bounds.right<=bounds.width,'Dialog overflows at 200% zoom');
  await fs.writeFile(path.join(output,'conflict-resolved-200-percent.png'),(await win.webContents.capturePage()).toPNG());
  await key('Escape');await waitFor('!document.querySelector("dialog")');check(await win.webContents.executeJavaScript('document.activeElement?.getAttribute("aria-label")?.startsWith("Inspect")'),'Dialog did not restore keyboard focus');
  const events=(await fs.readFile(path.join(stateRoot,'events.ndjson'),'utf8')).trim().split('\n').map(JSON.parse);
  const report={pass:true,scope:'Automated actual-component keyboard/status/disk-failure/conflict/mirror-lag/zoom proof on an isolated board, not a human pilot',posts,events:events.map(({type,commandId,resolution})=>({type,commandId,resolution})),finalStatus:final.lanes[0].cards[0].status,unrelatedEditPreserved:true,acceptancePreserved:true,zoom:2,bounds};await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));exitStatus=0;
 }catch(error){console.error(error.stack);}
 finally{clearTimeout(timer);if(win&&!win.isDestroyed())win.destroy();if(server)await server.close();if(temporary)await fs.rm(temporary,{recursive:true,force:true});app.exit(exitStatus);}
});
