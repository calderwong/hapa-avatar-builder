#!/usr/bin/env electron
const { app, BrowserWindow } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const baseUrl = String(process.env.HAPA_SONG_CARD_EVIDENCE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const output = path.resolve(process.env.HAPA_SONG_CARD_EVIDENCE_OUTPUT || "outputs/dear-papa-song-card-mint-demo-verified/ui-evidence");
const token = String(process.env.HAPA_AVATAR_ADMIN_TOKEN || "");
const changedAppearanceByEdition = { 1: "appearance:e4fb54bb15d0ed7be4fb54bb", 2: "appearance:f69ecac791ca2fdbf69ecac7" };

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(win, expression, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`).catch(() => false)) return;
    await pause(150);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function capture(win, name) {
  let image = null;
  let bestVisiblePixels = -1;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await win.webContents.capturePage();
    const bitmap = candidate.toBitmap();
    let visiblePixels = 0;
    for (let index = 0; index < bitmap.length; index += 16) {
      if (bitmap[index] + bitmap[index + 1] + bitmap[index + 2] > 36) visiblePixels += 1;
    }
    if (visiblePixels > bestVisiblePixels) {
      image = candidate;
      bestVisiblePixels = visiblePixels;
    }
    await pause(250);
  }
  const bytes = image.toPNG();
  const filePath = path.join(output, name);
  fs.writeFileSync(filePath, bytes);
  return { file: name, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const win = new BrowserWindow({ width: 1500, height: 1050, show: false, backgroundColor: "#02040a", webPreferences: { backgroundThrottling: false } });
  const evidence = [];

  await win.loadURL(`${baseUrl}/?view=songs`);
  await waitFor(win, `document.querySelector('.hapa-songs-view')`);
  await win.webContents.executeJavaScript(`sessionStorage.setItem('hapa-song-card-mint-token', ${JSON.stringify(token)});`);
  await win.loadURL(`${baseUrl}/?view=songs`);
  await waitFor(win, `document.querySelector('.hapa-songs-view')`);
  await win.webContents.executeJavaScript(`document.body.style.zoom='0.82';`);
  await win.webContents.executeJavaScript(`(() => { const input=[...document.querySelectorAll('input')].find((row)=>row.placeholder==='Search title, lore, status, tags'); if(input){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'Dear Papa'); input.dispatchEvent(new Event('input',{bubbles:true}));} })()`);
  await pause(700);
  await win.webContents.executeJavaScript(`(() => { const row=[...document.querySelectorAll('.song-row')].find((item)=>item.querySelector('strong')?.textContent?.trim()==='Dear Papa'); row?.click(); })()`);
  await waitFor(win, `document.querySelector('[data-testid="song-card-mint-panel"]') && [...document.querySelectorAll('button')].some((row)=>row.textContent.includes('Edition 2'))`);
  await win.webContents.executeJavaScript(`(() => { const panel=document.querySelector('[data-testid="song-card-mint-panel"]'); Object.assign(panel.style,{position:'fixed',inset:'26px 40px',zIndex:'99999',maxHeight:'none',height:'calc(100vh - 52px)',width:'auto',boxShadow:'0 0 70px #02040a'}); document.body.style.overflow='hidden'; })()`);
  await pause(1000);
  for (const edition of [1, 2]) {
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((row)=>row.textContent.includes('Edition ${edition}'))?.click()`);
    await waitFor(win, `[...document.querySelectorAll('[data-testid="song-card-mint-panel"] span')].some((row)=>row.textContent.includes('Edition ${edition} ·'))`);
    await waitFor(win, `Number(document.querySelector('[data-testid="song-card-edition-video"]')?.duration||0) >= 59`, 20000);
    await pause(500);
    await win.webContents.executeJavaScript(`(() => { const video=document.querySelector('[data-testid="song-card-edition-video"]'); if(video){video.currentTime=9.05; video.dispatchEvent(new Event('timeupdate',{bubbles:true}));} })()`);
    await waitFor(win, `document.querySelector('[data-appearance-id="${changedAppearanceByEdition[edition]}"]')`, 10000);
    await pause(350);
    await win.webContents.executeJavaScript(`document.querySelector('[data-appearance-id="${changedAppearanceByEdition[edition]}"]')?.click()`);
    await waitFor(win, `[...document.querySelectorAll('[role="status"]')].some((row)=>row.textContent.includes('Printed')&&row.textContent.includes('Edition ${edition}'))`);
    await win.webContents.executeJavaScript(`document.querySelector('[data-testid="song-card-edition-video"]')?.pause()`);
    await pause(1500);
    const state = await win.webContents.executeJavaScript(`({edition:${edition},changedAppearanceId:${JSON.stringify(changedAppearanceByEdition[edition])},notice:[...document.querySelectorAll('[role="status"]')].map((row)=>row.textContent).find((text)=>text.includes('Printed')&&text.includes('Edition ${edition}'))||'',active:[...document.querySelectorAll('[data-testid="song-card-active-cards"] button')].map((row)=>({text:row.textContent,appearanceId:row.dataset.appearanceId||''}))})`);
    evidence.push({ kind: "song-card-historical-print", ...state, ...(await capture(win, `song-card-edition-${edition}-historical-print.png`)) });
  }

  await win.loadURL(`${baseUrl}/?view=echos`);
  await waitFor(win, `document.querySelector('.hapa-echos-view')`);
  await win.webContents.executeJavaScript(`sessionStorage.setItem('hapa-song-card-mint-token', ${JSON.stringify(token)}); document.body.style.zoom='0.76';`);
  await win.webContents.executeJavaScript(`(() => { const input=[...document.querySelectorAll('input')].find((row)=>row.placeholder==='Search song blueprints...'); if(input){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'Dear Papa'); input.dispatchEvent(new Event('input',{bubbles:true}));} })()`);
  await pause(700);
  await win.webContents.executeJavaScript(`(() => { const label=[...document.querySelectorAll('.media-scroll-container span')].find((row)=>row.textContent.trim()==='Dear Papa'); let target=label; while(target&&target!==document.body&&getComputedStyle(target).cursor!=='pointer') target=target.parentElement; target?.click(); })()`);
  await waitFor(win, `[...document.querySelectorAll('h4')].some((row)=>row.textContent.includes('Dear Papa Blueprint'))`, 30000);
  await pause(900);
  await waitFor(win, `[...document.querySelectorAll('button')].some((row)=>row.textContent.includes('Tracks'))`);
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((row)=>row.textContent.includes('Tracks'))?.click()`);
  await waitFor(win, `document.querySelector('[data-testid="song-card-mint-panel"]')`);
  await waitFor(win, `document.querySelector('[data-testid="song-card-mint-panel"]')?.innerText?.includes('LATEST 2') && document.querySelector('[data-testid="song-card-mint-panel"]')?.innerText?.includes('2 EDITIONS')`, 30000);
  await win.webContents.executeJavaScript(`(() => { const panel=document.querySelector('[data-testid="song-card-mint-panel"]'); document.body.append(panel); document.body.style.zoom='1'; Object.assign(panel.style,{position:'fixed',inset:'26px 40px',zIndex:'99999',maxHeight:'none',height:'calc(100vh - 52px)',width:'auto',boxShadow:'0 0 70px #02040a',overflow:'auto'}); panel.scrollTop=0; document.body.style.overflow='hidden'; })()`);
  await pause(1300);
  const editorState = await win.webContents.executeJavaScript(`({state:document.querySelector('[data-testid="song-card-mint-state"]')?.textContent||'',panelText:document.querySelector('[data-testid="song-card-mint-panel"]')?.innerText?.slice(0,2500)||''})`);
  evidence.push({ kind: "editor-current-next-mint", ...editorState, ...(await capture(win, "echo-editor-current-next-mint.png")) });

  const report = { schemaVersion: "hapa.song-card.ui-evidence.v1", ok: evidence.length === 3 && evidence.every((row) => row.bytes > 1000), capturedAt: new Date().toISOString(), baseUrl, headId: "song-card:ced8a86b-bbdb-4c76-9f50-33f5face933d", evidence };
  fs.writeFileSync(path.join(output, "ui-evidence-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) throw new Error("Song Card UI evidence was incomplete");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  win.destroy();
}

app.whenReady().then(main).then(() => app.quit()).catch((error) => { console.error(error); app.exit(1); });
