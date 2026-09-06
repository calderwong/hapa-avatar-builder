#!/usr/bin/env electron
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || 'artifacts/echo-presentation-timing-proof');
const target = process.env.SMOKE_URL || 'http://127.0.0.1:19088/?view=echos';
const title = process.env.SMOKE_SONG_TITLE || 'Dear Papa';
let win, userData, exitStatus = 1;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const watchdog = setTimeout(() => app.exit(1), 120000);
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
  const value = await win.webContents.executeJavaScript(`({timing:window.__HAPA_ECHO_PRESENTATION_TIMING__,audio:(()=>{const a=document.querySelector('.hapa-echos-view audio');return a?{currentTime:a.currentTime,paused:a.paused,src:a.currentSrc}:null})(),engine:window.__HAPA_ECHO_PLAYBACK_ENGINE__?.projectKey,cutId:document.querySelector('[aria-label="Direction script version"]')?.value})`);
  console.log(JSON.stringify({ label, total: value.timing?.total, decoded: value.timing?.decodedSamples, audible: value.timing?.audibleEstimatedSamples, residual: value.timing?.audibleEstimateAbsoluteResidualP95Ms, time: value.audio?.currentTime }));
  return { label, ...value };
}
app.whenReady().then(async () => {
  try {
    await fs.mkdir(output, { recursive: true });
    userData = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-presentation-'));
    app.setPath('userData', userData);
    win = new BrowserWindow({ width: 1600, height: 1000, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    await win.loadURL(target);
    await waitFor(`document.querySelector('.hapa-echos-view')&&[...document.querySelectorAll('.hapa-echos-view h4')].some(x=>/Blueprint$/.test(x.textContent))`);
    await selectSong(); console.log(JSON.stringify({stage:'song-selected',title}));
    await waitFor(`document.querySelector('.hapa-echos-view audio')?.readyState>=2&&[...document.querySelectorAll('.hapa-echos-view button')].some(x=>/Play Show/.test(x.textContent)&&!x.disabled)`);
    await click('Play Show');
    await waitFor(`window.__HAPA_ECHO_PRESENTATION_TIMING__?.decodedSamples>=30`, 30000);
    await delay(8000);
    const observations = [await snapshot('forward')];
    await click('Pause'); await delay(800); observations.push(await snapshot('paused'));
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
    await seek(12); await click('Play Show'); await delay(8000); observations.push(await snapshot('forward-seek'));
    await click('Pause'); await seek(2); await click('Play Show'); await delay(8000); observations.push(await snapshot('reverse-seek'));
    await click('Pause');
    const pass = observations.every(row => row.timing?.retained <= row.timing?.capacity) && observations.filter(row => row.label !== 'paused').every(row => row.timing?.decodedSamples >= 30);
    const report = { pass, scope: 'Actual Echo Director preview instrumentation and transport observations; output timestamp estimates are not physical calibration or export parity', target, title,
      residualTargetMs: 1000 / 30, withinResidualTarget: observations.filter(row => row.label !== 'paused').every(row => row.timing?.audibleEstimatedSamples >= 30 && row.timing.audibleEstimateAbsoluteResidualP95Ms <= 1000 / 30), observations };
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await fs.writeFile(path.join(output, 'preview.png'), (await win.webContents.capturePage()).toPNG());
    if (!pass) throw new Error('Missing bounded decoded-frame observations');
    exitStatus = 0;
  } catch (error) { console.error(error.stack); const state = win && !win.isDestroyed() ? await win.webContents.executeJavaScript(`({headings:[...document.querySelectorAll('h4')].map(x=>x.textContent).slice(0,30),buttons:[...document.querySelectorAll('.hapa-echos-view button')].map(x=>x.textContent).slice(0,80),timing:window.__HAPA_ECHO_PRESENTATION_TIMING__,audio:(()=>{const a=document.querySelector('.hapa-echos-view audio');return {time:a?.currentTime,paused:a?.paused}})(),playhead:document.querySelector('[aria-label="Song playhead seconds"]')?.value})`).catch(()=>null) : null; await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ pass: false, error: String(error.stack),state }, null, 2)).catch(() => {}); }
  finally { clearTimeout(watchdog); if (win && !win.isDestroyed()) win.destroy(); if (userData) await fs.rm(userData, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(error=>console.warn('Temporary profile retained for cleanup after process exit: '+error.code)); app.exit(exitStatus); }
});
