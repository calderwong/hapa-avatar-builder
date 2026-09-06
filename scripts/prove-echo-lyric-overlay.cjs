#!/usr/bin/env electron
// Render the production React overlay with labeled fixture timing; no authoring stores are loaded.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || 'artifacts/echo-lyric-overlay-proof');
let win, temp, exitStatus = 1;
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
      window.showFixture=({time=1.5,template='scanline-phrase-ribbon-v1',profile='landscape',reducedMotion=false,enabled=true,confidence=.9,synthetic=false,hidden=false})=>{
        audioRef.current.currentTime=time;clockRef.current=time;
        const line={text:'Hold every word',start:0,end:3,words:[{word:'Hold',start:0,end:1,confidence},{word:'every',start:1,end:2,confidence},{word:'word',start:2,end:3,confidence}]};
        root.render(<Overlay contract={{enabled,templateId:template,reducedMotion,timingSource:synthetic?'synthetic-weighted-lyric-heal':'fixture-only'}} lines={[line]} hidden={hidden} outputProfile={profile} initialTime={time} audioRef={audioRef} clockRef={clockRef}/>);
      };window.fixtureReady=true;`);
    await build({root,configFile:false,define:{'process.env.NODE_ENV':'"production"'},plugins:[react()],publicDir:false,logLevel:'silent',build:{outDir:temp,emptyOutDir:false,lib:{entry:path.join(temp,'fixture.jsx'),name:'EchoLyricProof',formats:['iife'],fileName:()=> 'fixture.js'}}});
    await fs.writeFile(path.join(temp, 'index.html'), '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111827}#root{position:relative;width:960px;height:540px;background:#030712;--hapa-neon-cyan:#22d3ee;--hapa-neon-magenta:#f472b6;--hapa-neon-gold:#facc15}</style><div id="root"></div><script src="fixture.js"></script>');
    win = new BrowserWindow({width:1000,height:1000,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    const errors=[];win.webContents.on('console-message', details=>{if(details.level==='error'){errors.push(details.message);console.error(details.message)}});
    await win.loadFile(path.join(temp, 'index.html'));
    const sample = async config => win.webContents.executeJavaScript(`new Promise(resolve=>{window.showFixture(${JSON.stringify(config)});requestAnimationFrame(()=>requestAnimationFrame(()=>{const el=document.querySelector('[data-testid="echo-lyrics-overlay"]'),box=document.getElementById('root').getBoundingClientRect();resolve({frame:Number(el?.dataset.frame),mode:el?.dataset.timingMode,label:document.querySelector('[data-testid="echo-lyric-timing-label"]')?.textContent,visible:!!el,words:[...document.querySelectorAll('[data-lyric-word-active]')].map(word=>{const b=word.getBoundingClientRect();return{text:word.textContent,active:word.dataset.lyricWordActive==='true',progress:Number(word.dataset.lyricWordProgress),transform:word.style.transform,fill:word.style.backgroundSize,contained:b.left>=box.left&&b.right<=box.right&&b.top>=box.top&&b.bottom<=box.bottom}})})}))})`);
    const observations=[];
    for (const [profile,width,height] of [['landscape',960,540],['square',720,720],['vertical',486,864]]) {
      await win.webContents.executeJavaScript(`Object.assign(document.getElementById('root').style,{width:'${width}px',height:'${height}px'})`);
      for (const template of ['kinetic-word-burst-v1','scanline-phrase-ribbon-v1','stacked-hook-echo-v1','orbit-caption-v1']) {
        const states=[];
        for (const time of [0,.1,1.25,1.5,2.7,1.25]) {
          const value=await sample({time,profile,template});
          assert.equal(value.mode,'word');assert.equal(value.words.filter(word=>word.active).length,1);
          assert.ok(value.words.every(word=>word.contained));states.push({time,...value});
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
        observations.push({profile,template,states,reduced,fallback,disabled,hidden});
      }
    }
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify({pass:true,scope:'Production React overlay with explicit fixture confidence; four templates, three aspects, direct/reverse seeks, fill, reduced motion, phrase fallback and disabled state. Not source vocal accuracy or HyperFrames pixel parity.',observations},null,2)+'\n');
    console.log(JSON.stringify({pass:true,templates:4,aspects:3,cases:observations.length,output}));exitStatus=0;
  } catch(error) {console.error(error.stack);await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({pass:false,error:String(error.stack)},null,2));}
  finally {clearTimeout(watchdog);if(win&&!win.isDestroyed())win.destroy();if(temp)await fs.rm(temp,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});app.exit(exitStatus)}
});
