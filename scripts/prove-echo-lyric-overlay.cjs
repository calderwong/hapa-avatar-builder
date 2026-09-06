#!/usr/bin/env electron
// Render the production React overlay with labeled fixture timing; no authoring stores are loaded.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || 'artifacts/echo-lyric-overlay-proof');
let win, renderWin, server, temp, exitStatus = 1;
const watchdog = setTimeout(() => app.exit(1), 90000);
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    const { build } = await import('vite');
    const react = (await import('@vitejs/plugin-react')).default;
    await fs.mkdir(path.join(root,'artifacts'),{recursive:true});
    temp = await fs.mkdtemp(path.join(root, 'artifacts', '.echo-lyric-proof-'));
    await fs.mkdir(path.join(temp, 'profile'), {recursive:true});
    app.setPath('userData', path.join(temp, 'profile'));
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(temp,'fixture.jsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import Overlay from '../../src/components/EchoLyricOverlay.jsx';
      const root=createRoot(document.getElementById('root'));const audioRef={current:{currentTime:0}},clockRef={current:0};
      window.showFixture=({time=1.5,template='scanline-phrase-ribbon-v1',profile='landscape',reducedMotion=false,enabled=true,confidence=.9,synthetic=false,hidden=false,motionIntensity=1})=>{
        audioRef.current.currentTime=time;clockRef.current=time;
        const line={text:'Hold every word',start:0,end:3,words:[{word:'Hold',start:0,end:1,confidence},{word:'every',start:1,end:2,confidence},{word:'word',start:2,end:3,confidence}]};
        root.render(<Overlay contract={{enabled,templateId:template,reducedMotion,motionIntensity,timingSource:synthetic?'synthetic-weighted-lyric-heal':'fixture-only'}} lines={[line]} hidden={hidden} outputProfile={profile} initialTime={time} audioRef={audioRef} clockRef={clockRef}/>);
      };window.fixtureReady=true;`);
    await build({root,configFile:false,define:{'process.env.NODE_ENV':'"production"'},plugins:[react()],publicDir:false,logLevel:'silent',build:{outDir:temp,emptyOutDir:false,lib:{entry:path.join(temp,'fixture.jsx'),name:'EchoLyricProof',formats:['iife'],fileName:()=> 'fixture.js'}}});
    await fs.writeFile(path.join(temp, 'index.html'), '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111827}#root{position:relative;width:960px;height:540px;background:#02040a;--hapa-neon-cyan:#22d3ee;--hapa-neon-magenta:#f472b6;--hapa-neon-gold:#facc15}</style><div id="root"></div><script src="fixture.js"></script>');
    win = new BrowserWindow({width:1000,height:1000,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    const errors=[];win.webContents.on('console-message', details=>{if(details.level==='error'){errors.push(details.message);console.error(details.message)}});
    await win.loadFile(path.join(temp, 'index.html'));
    const sample = async config => win.webContents.executeJavaScript(`new Promise(resolve=>{window.showFixture(${JSON.stringify(config)});requestAnimationFrame(()=>requestAnimationFrame(()=>{const el=document.querySelector('[data-testid="echo-lyrics-overlay"]'),box=document.getElementById('root').getBoundingClientRect();resolve({frame:Number(el?.dataset.frame),mode:el?.dataset.timingMode,label:document.querySelector('[data-testid="echo-lyric-timing-label"]')?.textContent,visible:!!el,words:[...document.querySelectorAll('[data-lyric-word-active]')].map(word=>{const b=word.getBoundingClientRect();return{text:word.textContent,active:word.dataset.lyricWordActive==='true',progress:Number(word.dataset.lyricWordProgress),transform:word.style.transform,fill:word.style.backgroundSize,contained:b.left>=box.left&&b.right<=box.right&&b.top>=box.top&&b.bottom<=box.bottom}})})}))})`);
    const {resolveEchoOutputProfile}=await import('../src/domain/echo-output-profile.js');
    const fixtureLine={text:'Hold every word',start:0,end:3,words:[{word:'Hold',start:0,end:1,confidence:.9},{word:'every',start:1,end:2,confidence:.9},{word:'word',start:2,end:3,confidence:.9}]};
    const packages={};
    for(const profile of ['landscape','square','vertical']){
      const dir=path.join(temp,profile);await fs.mkdir(dir,{recursive:true});
      const background=path.join(dir,'background.png'),image=new PNG({width:8,height:8});for(let i=0;i<image.data.length;i+=4){image.data[i]=2;image.data[i+1]=4;image.data[i+2]=10;image.data[i+3]=255}await fs.writeFile(background,PNG.sync.write(image));
      const contract={enabled:true,templateId:'scanline-phrase-ribbon-v1',position:'bottom-center',style:'neon-cyan',timingSource:'fixture-only',lines:[fixtureLine]};
      for(const [name,value]of Object.entries({graph:{schemaVersion:'hapa.music-viz.native-show-graph.v2',outputProfile:resolveEchoOutputProfile(profile),song:{id:'lyric-parity-fixture',title:'Lyric parity fixture',durationSeconds:3,lyricOverlay:contract},tracks:[{id:'fixture-media',role:'media',cards:[{id:'fixture-background',startSeconds:0,endSeconds:3,media:{id:'fixture-background',title:'Fixture background',localPath:background},parameters:{},provenance:{rendererRoute:'offline-image'}}]}],directorV2:{}},project:{output_profile:profile,timeline:[],lyrics:contract,timed_lyrics:[fixtureLine]},telemetry:{fps:30,duration:3,stems:[],masterMix:{id:'master',role:'master',frames:[{t:0,rms:.2,peak:.3,onset:0},{t:3,rms:.2,peak:.3,onset:0}]}},proxies:{proxies:[]},isf:{shaders:[]}}))await fs.writeFile(path.join(dir,name+'.json'),JSON.stringify(value));
      await fs.writeFile(path.join(dir,'isf.js'),'window.interactiveShaderFormat={};');
      const compiled=path.join(dir,'compiled');
      const result=spawnSync('node',['scripts/compile-hyperframes-show-v2.mjs',`--graph=${dir}/graph.json`,`--project=${dir}/project.json`,`--telemetry=${dir}/telemetry.json`,`--proxy-registry=${dir}/proxies.json`,`--isf-manifest=${dir}/isf.json`,`--isf-runtime=${dir}/isf.js`,`--output=${compiled}`],{cwd:root,encoding:'utf8',timeout:45000,killSignal:'SIGKILL',maxBuffer:8*1024*1024,env:{...process.env,NODE_OPTIONS:'',HAPA_LYRIC_PRESENTATION_PROOF:'1'}});
      await fs.writeFile(path.join(output,profile+"-compile.log"),JSON.stringify({status:result.status,error:String(result.error||""),stdout:result.stdout,stderr:result.stderr},null,2));
      assert.equal(result.status,0,String(result.error||result.stderr||result.stdout));packages[profile]=compiled;
      await fs.cp(compiled,path.join(output,'compiled-'+profile),{recursive:true});
    }
    server=http.createServer(async(req,res)=>{try{const decoded=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(temp,'.'+decoded);if(!file.startsWith(temp+path.sep)){res.writeHead(403).end();return}const bytes=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(bytes)}catch{res.writeHead(404).end()}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    renderWin=new BrowserWindow({width:1000,height:1000,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    renderWin.webContents.on('console-message',details=>{if(details.level==='error'){errors.push(details.message);console.error(details.message)}});
    const pixelComparisons=[];
    const observations=[];
    for (const [profile,width,height] of [['landscape',960,540],['square',720,720],['vertical',486,864]]) {
      await win.webContents.executeJavaScript(`Object.assign(document.getElementById('root').style,{width:'${width}px',height:'${height}px'})`);
      await renderWin.loadURL(`http://127.0.0.1:${server.address().port}/${profile}/compiled/index.html`);
      await renderWin.webContents.executeJavaScript('Promise.resolve(window.HAPA_ASSETS_READY).then(()=>true)');
      const outputProfile=resolveEchoOutputProfile(profile);assert.equal(outputProfile.id,profile);
      await renderWin.webContents.insertCSS(`.frame,.hud,.scan,.diagnostics,.viz,.media{visibility:hidden!important}#root{transform:scale(${width/outputProfile.width});transform-origin:0 0}`);
      for (const template of ['kinetic-word-burst-v1','scanline-phrase-ribbon-v1','stacked-hook-echo-v1','orbit-caption-v1']) {
        const states=[];
        for (const time of [0,.1,1.25,1.5,2.7,1.25]) {
          const value=await sample({time,profile,template});
          assert.equal(value.mode,'word');assert.equal(value.words.filter(word=>word.active).length,1);
          if(!value.words.every(word=>word.contained))await fs.writeFile(path.join(output,"containment-failure.png"),(await win.webContents.capturePage()).toPNG());assert.ok(value.words.every(word=>word.contained),JSON.stringify({profile,template,time,...value}));states.push({time,...value});
        }
        assert.deepEqual(states[2],states[5]);
        assert.notEqual(states[2].words[1].fill,states[3].words[1].fill);
        const reduced=await sample({time:1.25,profile,template,reducedMotion:true});
        assert.ok(reduced.words.every(word=>word.transform==='translate(0px, 0px) rotate(0deg) scale(1)'));
        const fallback=await sample({time:1.25,profile,template,synthetic:true});
        assert.equal(fallback.mode,'phrase');assert.ok(fallback.label.includes('unverified'));assert.ok(fallback.words.every(word=>!word.active&&word.progress===0));
        const disabled=await sample({time:1.25,profile,template,enabled:false});assert.equal(disabled.visible,false);
        const hidden=await sample({time:1.25,profile,template,hidden:true});assert.equal(hidden.visible,false);
        await sample({time:1.25,profile,template});
        await fs.writeFile(path.join(output,profile+'-'+template+'.png'),(await win.webContents.capturePage({x:0,y:0,width,height})).toPNG());
        const sampleCases=[{time:1.25},{time:1.5},{time:2.7},{time:1.25},{time:1.25,reducedMotion:true},{time:1.25,synthetic:true},{time:1.25,enabled:false},{time:1.25,motionIntensity:.5}];
        for(const [caseIndex,config] of sampleCases.entries()){
          const {time}=config;
          await sample({profile,template,...config});
          await renderWin.webContents.executeJavaScript(`(()=>{const track=window.HAPA_EXECUTABLE_SHOW.instances.lyrics[0];track.templateId=${JSON.stringify(template)};track.contract.templateId=track.templateId;Object.assign(track.contract,${JSON.stringify({enabled:config.enabled!==false,reducedMotion:config.reducedMotion===true,motionIntensity:config.motionIntensity??1,timingSource:config.synthetic?'synthetic-weighted-lyric-heal':'fixture-only'})});window.__timelines.main.seek(${time},false);window.__timelines.main.flush();})()`);
          await renderWin.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
          const preview=(await win.webContents.capturePage({x:0,y:0,width,height})).toPNG(),rendered=(await renderWin.webContents.capturePage({x:0,y:0,width,height})).toPNG();
          const a=PNG.sync.read(preview),b=PNG.sync.read(rendered);assert.equal(a.width,b.width);assert.equal(a.height,b.height);
          let total=0,changed=0,foreground=0,inkDelta=0,changedInk=0;for(let i=0;i<a.data.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta+=Math.abs(a.data[i+c]-b.data[i+c]);total+=delta;if(delta>6)changed++;if(Math.max(a.data[i],a.data[i+1],a.data[i+2],b.data[i],b.data[i+1],b.data[i+2])>80){foreground++;inkDelta+=delta;if(delta>6)changedInk++}}
          const pixels=a.width*a.height,mean=total/(pixels*3),changedRatio=changed/pixels;
          const result={profile,template,...config,meanAbsoluteDelta:mean,changedPixelRatio:changedRatio,foregroundPixels:foreground,foregroundMeanDelta:inkDelta/(foreground*3),foregroundChangedRatio:changedInk/foreground,pass:mean<.5&&changedRatio<.01&&(config.enabled===false?foreground===0:foreground>50&&inkDelta/(foreground*3)<1&&changedInk/foreground<.03)};pixelComparisons.push(result);
          const filename=profile+'-'+template+'-'+caseIndex+'-'+time;
          await fs.writeFile(path.join(output,filename+'-preview.png'),preview);await fs.writeFile(path.join(output,filename+'-hyperframes.png'),rendered);
          assert.ok(result.pass,JSON.stringify(result));
        }
        observations.push({profile,template,states,reduced,fallback,disabled,hidden});
      }
    }
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify({pass:true,scope:'Production React overlay versus actually compiled HyperFrames caption pixels on an isolated equal background; three canonical profiles and four templates and forward/reverse fixed frames. Not encoded-media, source vocal accuracy, or final full-composite acceptance.',pixelComparisons,observations},null,2)+'\n');
    console.log(JSON.stringify({pass:true,templates:4,aspects:3,cases:observations.length,output}));exitStatus=0;
  } catch(error) {console.error(error.stack);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({pass:false,error:String(error.stack)},null,2));}
  finally {clearTimeout(watchdog);if(win&&!win.isDestroyed())win.destroy();if(renderWin&&!renderWin.isDestroyed())renderWin.destroy();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}if(temp)await fs.rm(temp,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});app.exit(exitStatus)}
});
