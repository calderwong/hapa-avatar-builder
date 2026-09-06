#!/usr/bin/env electron
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const manifestPath=option('manifest'),output=option('output');
if(!manifestPath||!output)throw new Error('--manifest and --output are required');
let server,win;
let exitStatus=1;
const timeout=setTimeout(()=>{console.error('Image camera proof timed out');app.exit(1);},180000);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(expression){for(let i=0;i<200;i++){if(await win.webContents.executeJavaScript(expression))return;await delay(100);}throw new Error('Image proof did not become ready');}
app.whenReady().then(async()=>{
 try{
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  await fs.mkdir(output,{recursive:true});
  const {createServer}=await import('vite');
  const react=(await import('@vitejs/plugin-react')).default;
  const errors=[];
  const html=`<!doctype html><html><body style="margin:0;background:#020617"><div id="live" style="position:absolute;overflow:hidden"></div><canvas id="expected" style="position:absolute"></canvas><script type="module" src="/scripts/lib/echo-image-camera-proof.jsx"></script></body></html>`;
  server=await createServer({configFile:false,root:ROOT,cacheDir:path.resolve(output,'vite-cache'),publicDir:false,optimizeDeps:{include:['react','react-dom/client']},plugins:[react(),{name:'image-proof-page',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(req.url!=='/__echo-image-proof')return next();res.setHeader('Content-Type','text/html');res.end(await vite.transformIndexHtml(req.url,html));});}}],resolve:{dedupe:['react','react-dom']},server:{host:'127.0.0.1',port:0},logLevel:'error'});
  await server.listen();
  win=new BrowserWindow({width:3840,height:2160,show:false,useContentSize:true,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message.slice(0,500));});
  await win.loadURL(`http://127.0.0.1:${server.httpServer.address().port}/__echo-image-proof`);
  await waitFor('window.proofReady===true');
  const {buildProtectedCameraPath}=await import('../src/domain/media-role-camera.js');
  const results=[];
  for(const asset of manifest.assets){
   const uri='data:image/png;base64,'+(await fs.readFile(asset.sourcePath)).toString('base64');
   const geometry={...asset.mediaContract.imageShot,original:{...asset.mediaContract.imageShot.original,uri}};
   for(const [width,height]of [[1920,1080],[1080,1920],[1080,1080]]){
    win.setContentSize(width*2,height);
    for(const panel of [null,...geometry.panels]){
     const view=panel?.rect||{x:0,y:0,width:1,height:1};
     const plan=buildProtectedCameraPath({mediaId:asset.mediaId,sourceHash:geometry.original.sha256,technical:geometry.original,durationSeconds:8,viewRegion:view,outputProfiles:[{width,height}],analysis:{sourceHash:geometry.original.sha256,protectedRegionsStatus:'source-bound',protectedRegions:[view]}});
     const crop=plan.keyframes[0].crop;
     const shot={media_id:asset.mediaId,media_title:asset.mediaId,media_contract:{...asset.mediaContract,imageShot:geometry,imageRenditions:[]}};
     await win.webContents.executeJavaScript(`window.imageCase(${JSON.stringify({shot,crop,width,height})})`);
     await waitFor('window.caseReady && document.querySelector("#live img")?.complete && document.querySelector("#live img")?.naturalWidth>0 && !document.querySelector("[role=alert]")');
     await delay(50);
     const live=await win.webContents.capturePage({x:0,y:0,width,height});
     const reference=await win.webContents.capturePage({x:width,y:0,width,height});
     const a=live.toBitmap(),b=reference.toBitmap();
     if(a.length!==b.length)throw new Error('Image frame sizes differ');
     let total=0,bad=0;for(let i=0;i<a.length;i+=4){let delta=0;for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);total+=d;delta=Math.max(delta,d);}if(delta>12)bad++;}
     const meanAbsoluteError=total/(a.length/4*3),pixelFractionOver12=bad/(a.length/4);
     const id=`${asset.mediaId}-${width}x${height}-${panel?.readingOrder??'page'}`;
     const liveState=await win.webContents.executeJavaScript('({naturalWidth:document.querySelector("#live img").naturalWidth,clipPath:getComputedStyle(document.querySelector("#live img")).clipPath,protected:document.querySelector("#live img").dataset.echoProtectedCamera})');
     const pass=meanAbsoluteError<2&&pixelFractionOver12<.02&&liveState.protected==='true';
     results.push({id,sourceHash:geometry.original.sha256,width,height,panelId:panel?.id||null,meanAbsoluteError,pixelFractionOver12,pass,liveState});
     if(!panel||panel.readingOrder===3)await fs.writeFile(path.join(output,id+'.png'),live.toPNG());
    }
   }
   const renditions=[];
   for(const row of asset.mediaContract.imageRenditions||[]){
    if(!row.uri.startsWith('/media/echo-image-preview/'))throw new Error('Proof expects local prepared image media');
    const bytes=await fs.readFile(path.join(ROOT,'data',row.uri.slice(1)));
    renditions.push({...row,uri:'data:image/png;base64,'+bytes.toString('base64')});
   }
   win.setContentSize(960,270);
   const shot={media_id:asset.mediaId,media_contract:{...asset.mediaContract,imageShot:geometry,imageRenditions:renditions}};
   const crop={cameraModel:'protected-v2',fit:'contain',x:0,y:0,width:1,height:1};
   await win.webContents.executeJavaScript(`window.imageCase(${JSON.stringify({shot,crop,width:480,height:270})})`);
   await waitFor('window.caseReady && document.querySelector("#live img")?.complete && document.querySelector("#live img")?.naturalWidth>0 && !document.querySelector("[role=alert]")');
   const decoded=await win.webContents.executeJavaScript('({width:document.querySelector("#live img").naturalWidth,height:document.querySelector("#live img").naturalHeight,dpr:window.devicePixelRatio})');
   const originalBytes=geometry.original.width*geometry.original.height*4,decodedBytes=decoded.width*decoded.height*4;
   results.push({id:asset.mediaId+'-decode-sized-preview',kind:'preview-decode-budget',decoded,originalBytes,decodedBytes,reduction:1-decodedBytes/originalBytes,pass:decodedBytes<originalBytes&&renditions.some(row=>row.width===decoded.width&&row.height===decoded.height)});
  }
  const report={schemaVersion:'hapa.echo.live-image-camera-pixel-proof.v1',scope:'Actual PresentedEchoImage versus shared Canvas framing; source-bound comic pages/panels, no human acceptance claim',results,errors,pass:results.every(row=>row.pass)&&errors.length===0};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({pass:report.pass,cases:results.length,failed:results.filter(row=>!row.pass).map(row=>({id:row.id,mean:row.meanAbsoluteError,bad:row.pixelFractionOver12})),errors}));
  exitStatus=report.pass?0:1;
 }catch(error){console.error(error.stack);exitStatus=1;}
 finally{clearTimeout(timeout);if(win&&!win.isDestroyed())win.destroy();if(server)await server.close();app.exit(exitStatus);}
});
