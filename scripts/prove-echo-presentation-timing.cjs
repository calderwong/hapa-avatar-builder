#!/usr/bin/env electron
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || 'artifacts/echo-presentation-timing-proof');
const target = process.env.SMOKE_URL || 'http://127.0.0.1:19088/?view=echos';
const title = process.env.SMOKE_SONG_TITLE || 'Dear Papa';
const expectedCutId = process.env.SMOKE_CUT_ID || '';
const inspectLyrics = process.argv.includes('--lyric-cadence');
const fullSong = process.argv.includes('--full-song');
const forwardOnly = fullSong || process.argv.includes('--forward-only');
const requirePrepared = process.argv.includes('--require-prepared');
let win, userData, exitStatus = 1;
const rendererMessages = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const watchdog = setTimeout(() => app.exit(1), fullSong ? 900000 : 120000);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.on('window-all-closed', () => {});
async function waitFor(expression, milliseconds = 45000) {
  const start = Date.now();
  while (Date.now() - start < milliseconds) { if (await win.webContents.executeJavaScript(expression)) return; await delay(150); }
  throw new Error('UI did not reach: ' + expression);
}
async function selectSong() {
  let stable = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await win.webContents.executeJavaScript(`(()=>{const heading=[...document.querySelectorAll('.hapa-echos-view h4')].map(x=>x.textContent).find(x=>/Blueprint$/.test(x));if(heading===${JSON.stringify(title + ' Blueprint')})return {ready:true,heading};const item=[...document.querySelectorAll('.hapa-echos-view .media-scroll-container span')].find(x=>x.textContent.trim()===${JSON.stringify(title)});item?.parentElement?.parentElement?.click();return {ready:false,heading,listed:!!item};})()`, true);
    stable = state.ready ? stable + 1 : 0;
    if (stable >= 5) return;
    if (attempt === 99) throw new Error('Song selection failed: ' + JSON.stringify(state));
    await delay(300);
  }
}
async function click(pattern) {
  const ok = await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('.hapa-echos-view button')].find(x=>new RegExp(${JSON.stringify(pattern)}).test(x.textContent)&&!x.disabled);if(!b)return false;b.click();return true;})()`, true);
  if (!ok) throw new Error('Button unavailable: ' + pattern);
}
async function snapshot(label) {
  const value = await win.webContents.executeJavaScript(`({timing:window.__HAPA_ECHO_PRESENTATION_TIMING__,audio:(()=>{const a=document.querySelector('.hapa-echos-view audio');return a?{currentTime:a.currentTime,paused:a.paused,src:a.currentSrc}:null})(),engine:window.__HAPA_ECHO_PLAYBACK_ENGINE__?.projectKey,cutId:document.querySelector('[aria-label="Direction script version"]')?.value,videoElements:document.querySelectorAll('video[data-echo-player]').length,previewPreparation:document.querySelector('[data-testid="echo-preview-preparation"]')?.textContent,players:[...document.querySelectorAll('video[data-echo-player]')].map(v=>({state:v.dataset.echoPlayer,uri:v.currentSrc,readyState:v.readyState,totalFrames:v.getVideoPlaybackQuality?.().totalVideoFrames,droppedFrames:v.getVideoPlaybackQuality?.().droppedVideoFrames})),mediaBinding:window.__HAPA_ECHO_ISF_BINDING_DIAGNOSTICS__?.last?.media,frameReceipt:window.__HAPA_ECHO_ISF_BINDING_DIAGNOSTICS__?.last?.frameReceipt})`);
  console.log(JSON.stringify({ label, total: value.timing?.total, decoded: value.timing?.decodedSamples, audible: value.timing?.audibleEstimatedSamples, residual: value.timing?.audibleEstimateAbsoluteResidualP95Ms, time: value.audio?.currentTime }));
  return { label, ...value };
}
app.whenReady().then(async () => {
  try {
    await fs.mkdir(output, { recursive: true });
    userData = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-presentation-'));
    app.setPath('userData', userData);
    win = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    win.webContents.on('console-message', details => {
      rendererMessages.push({ level: details.level, message: details.message, source: details.sourceId, line: details.lineNumber });
      if (rendererMessages.length > 30) rendererMessages.shift();
      if (details.level === 'error') console.error(JSON.stringify(rendererMessages.at(-1)));
    });
    await win.loadURL(target);
    await waitFor(`document.querySelector('.hapa-echos-view')&&[...document.querySelectorAll('.hapa-echos-view h4')].some(x=>/Blueprint$/.test(x.textContent))`);
    await selectSong();
    if(expectedCutId){
      await waitFor(`(()=>{const s=document.querySelector('[aria-label="Direction script version"]');return s&&!s.disabled&&[...s.options].some(o=>o.value===${JSON.stringify(expectedCutId)});})()`);
      await win.webContents.executeJavaScript(`(()=>{const s=document.querySelector('[aria-label="Direction script version"]');if(s.value!==${JSON.stringify(expectedCutId)}){Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(expectedCutId)});s.dispatchEvent(new Event('change',{bubbles:true}));}})()`,true);
      await waitFor(`document.querySelector('[aria-label="Direction script version"]')?.value===${JSON.stringify(expectedCutId)}`);
      await delay(1500);
    }
    console.log(JSON.stringify({stage:'song-selected',title}));
    if(requirePrepared)await waitFor(`(()=>{const control=document.querySelector('[data-testid="echo-preview-preparation"]');return ['ready','partial'].includes(control?.dataset.jobStatus)&&Number(control?.dataset.readyCues)>0&&control?.dataset.pendingCues==='0';})()`,30000);
    await waitFor(`document.querySelector('.hapa-echos-view audio')?.readyState>=2&&[...document.querySelectorAll('.hapa-echos-view button')].some(x=>/Play Show/.test(x.textContent)&&!x.disabled)`);
    if(fullSong)await win.webContents.executeJavaScript(`(()=>{window.__ECHO_TIMING_FULL_SONG__={startedAt:performance.now(),duration:document.querySelector('.hapa-echos-view audio').duration,ended:false};document.querySelector('.hapa-echos-view audio').addEventListener('ended',()=>{window.__ECHO_TIMING_FULL_SONG__.ended=true;window.__ECHO_TIMING_FULL_SONG__.endedAt=performance.now()},{once:true});})()`);
    await click('Play Show');
    await waitFor(`window.__HAPA_ECHO_PRESENTATION_TIMING__?.decodedSamples>=30`, 30000);
    let lyricCadence = null;
    if (inspectLyrics) {
      const samples = await win.webContents.executeJavaScript(`new Promise(resolve => { const rows=[];const started=performance.now();const sample=()=>{const el=document.querySelector('[data-testid="echo-lyrics-overlay"]');rows.push({wallMs:performance.now()-started,audioTime:document.querySelector('.hapa-echos-view audio')?.currentTime,frame:Number(el?.dataset.frame),fps:Number(el?.dataset.fps),renders:Number(el?.dataset.renderCount),mode:el?.dataset.timingMode,reason:el?.dataset.timingReason,label:document.querySelector('[data-testid="echo-lyric-timing-label"]')?.textContent,wordActive:!!el?.querySelector('[data-lyric-word-active="true"]'),boundaryRenders:window.__HAPA_ECHO_CLOCK_DIAGNOSTICS__?.boundaryRenders});if(performance.now()-started<5000)setTimeout(sample,25);else resolve(rows)};sample()})`);
      const visible=samples.filter(row=>Number.isFinite(row.frame)&&row.fps>0), first=visible[0], last=visible.at(-1);
      const uniqueFrames=new Set(visible.map(row=>row.frame)).size;
      const boundaryRenders=last?.boundaryRenders-first?.boundaryRenders;
      const audioSpan=last?.audioTime-first?.audioTime;
      lyricCadence={samples,uniqueFrames,boundaryRenders,audioSpan,observedFramesPerSecond:uniqueFrames/audioSpan,
        pass:visible.length>30&&uniqueFrames>boundaryRenders&&uniqueFrames/audioSpan>=20&&visible.every(row=>row.mode==='phrase'&&row.reason==='synthetic-word-timing'&&!row.wordActive&&row.label?.includes('unverified'))};
      console.log(JSON.stringify({stage:'lyric-cadence',...lyricCadence,samples:undefined}));
    }
    const mediaSamples=[];
    for(let i=0;i<16;i++){await delay(500);mediaSamples.push(await win.webContents.executeJavaScript(`({time:document.querySelector('.hapa-echos-view audio')?.currentTime,media:window.__HAPA_ECHO_ISF_BINDING_DIAGNOSTICS__?.last?.media,frameReceipt:window.__HAPA_ECHO_ISF_BINDING_DIAGNOSTICS__?.last?.frameReceipt})`));}
    let fullSongEvidence = null;
    if(fullSong){
      const duration=await win.webContents.executeJavaScript(`window.__ECHO_TIMING_FULL_SONG__.duration`);
      if(!(duration>0&&duration<840))throw new Error('Full-song duration outside the bounded proof budget');
      const deadline=Date.now()+Math.ceil((duration+30)*1000);
      let lastProgress=Date.now(), ended=false;
      while(Date.now()<deadline){
        ended=await win.webContents.executeJavaScript(`window.__ECHO_TIMING_FULL_SONG__.ended`);
        if(ended)break;
        if(Date.now()-lastProgress>=30000){lastProgress=Date.now();await snapshot('full-song-progress');}
        await delay(1000);
      }
      if(!ended)throw new Error('Full song did not reach its natural end within the bounded deadline');
      await delay(1200);
      fullSongEvidence=await win.webContents.executeJavaScript(`window.__ECHO_TIMING_FULL_SONG__`);
    }
    const observations = [await snapshot(fullSong?'full-song':'forward')];
    if(!fullSong)await click('Pause'); await delay(800); observations.push(await snapshot('paused'));
    const seek = async seconds => {
      const ok = await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('[aria-label="Song playhead seconds"]');if(!input)return false;input.focus();return document.activeElement===input;})()`, true);
      if (!ok) throw new Error('Playhead control unavailable');
      const key = keyCode => { win.webContents.sendInputEvent({type:'keyDown',keyCode}); win.webContents.sendInputEvent({type:'keyUp',keyCode}); };
      let focusRestores=0, keys=0;
      for (let i=0;i<600;i++) {
        const state=await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('[aria-label="Song playhead seconds"]');const focused=document.activeElement===input;input.focus();return {value:Number(input.value),focused};})()`,true);
        if(Math.abs(state.value-seconds)<.05)break;
        if(!state.focused)focusRestores++;
        key(state.value<seconds?'Right':'Left'); keys++;
        await delay(50);
      }
      console.log(JSON.stringify({stage:'keyboard-seek',target:seconds,keys,focusRestores}));
      await waitFor(`(()=>{const a=document.querySelector('.hapa-echos-view audio');return a?.paused&&Math.abs(a.currentTime-${seconds})<.15;})()`, 10000);
    };
    if(!forwardOnly){
    await seek(12); await click('Play Show'); await delay(8000); observations.push(await snapshot('forward-seek'));
    await click('Pause'); await seek(2); await click('Play Show'); await delay(8000); observations.push(await snapshot('reverse-seek'));
    await click('Pause');
    }
    const preparedApplied = !requirePrepared || observations.every(row=>row.players.filter(player=>player.state==='current').every(player=>player.uri.includes('/media/echo-proxies-v2/')));
    const pass = (!fullSong || (fullSongEvidence?.ended && observations[0].timing?.session?.audibleEstimatedSamples >= 30)) && (!inspectLyrics || lyricCadence?.pass) && preparedApplied && (!expectedCutId||observations.every(row=>row.cutId===expectedCutId)) && observations.every(row => row.timing?.retained <= row.timing?.capacity) && observations.filter(row => row.label !== 'paused').every(row => row.timing?.decodedSamples >= 30);
    const report = { pass, fullSong, fullSongEvidence, fullSongWithinResidualTarget: fullSong ? Number.isFinite(observations[0].timing?.session?.absoluteResidualP95UpperBoundMs) && observations[0].timing?.session?.absoluteResidualP95UpperBoundMs <= 1000/30 : null, scope: 'Actual Echo Director preview instrumentation and transport observations; output timestamp estimates are not physical calibration or export parity', target, title, expectedCutId, inspectLyrics, lyricCadence, forwardOnly, requirePrepared, preparedApplied, mediaSamples, cameraFramedSamples:mediaSamples.filter(row=>row.media?.status==='camera-framed').length,
      residualTargetMs: 1000 / 30, withinResidualTarget: observations.filter(row => row.label !== 'paused').every(row => row.timing?.audibleEstimatedSamples >= 30 && row.timing.audibleEstimateAbsoluteResidualP95Ms <= 1000 / 30), observations };
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await fs.writeFile(path.join(output, 'preview.png'), (await win.webContents.capturePage()).toPNG());
    if (!pass) throw new Error('Missing bounded decoded-frame observations');
    exitStatus = 0;
  } catch (error) { console.error(error.stack); const state = win && !win.isDestroyed() ? await win.webContents.executeJavaScript(`({body:document.body?.innerText?.slice(0,1200),headings:[...document.querySelectorAll('h4')].map(x=>x.textContent).slice(0,30),buttons:[...document.querySelectorAll('.hapa-echos-view button')].map(x=>x.textContent).slice(0,80),timing:window.__HAPA_ECHO_PRESENTATION_TIMING__,audio:(()=>{const a=document.querySelector('.hapa-echos-view audio');return {time:a?.currentTime,paused:a?.paused}})(),playhead:document.querySelector('[aria-label="Song playhead seconds"]')?.value})`).catch(()=>null) : null; await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ pass: false, error: String(error.stack),state,rendererMessages }, null, 2)).catch(() => {}); }
  finally { clearTimeout(watchdog); if (win && !win.isDestroyed()) win.destroy(); if (userData) await fs.rm(userData, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(error=>console.warn('Temporary profile retained for cleanup after process exit: '+error.code)); app.exit(exitStatus); }
});
