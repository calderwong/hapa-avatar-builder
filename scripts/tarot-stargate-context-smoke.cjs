const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const targetUrl = process.env.SMOKE_URL || "http://127.0.0.1:8787/";
const errors = [];
app.setName("hapa-avatar-builder-stargate-context-smoke");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-stargate-context-smoke-${process.pid}`));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(win, expression, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await win.webContents.executeJavaScript(expression)) return true;
    await sleep(100);
  }
  return false;
}

async function capture(win, name) {
  const output = path.join(ROOT, `artifacts/smoke/${name}.png`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, (await win.capturePage()).toPNG());
  return output;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 900, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) errors.push(message);
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`[Load Failure] ${code}: ${description} (${url})`));
  try {
    await win.loadURL(targetUrl);
    if (!await waitFor(win, "Boolean(document.querySelector('.view-tabs button'))")) throw new Error("Avatar Builder tabs did not mount");
    const clicked = await win.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.view-tabs button')].find((item) => /tarot draw/i.test(item.textContent || '')); button?.click(); return Boolean(button); })()`);
    if (!clicked || !await waitFor(win, `Boolean(document.querySelector('.tarot-draw-view canvas') && window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`)) throw new Error("Canonical Tarot Draw did not mount");
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 0`)) throw new Error("Tarot deck did not become ready");
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation())`)) throw new Error("Public Stargate demo could not stage");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready'`, 8000)) throw new Error("Stargate did not become ready");
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate())`)) throw new Error("Public Stargate demo could not dial");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 15000)) throw new Error("Stargate did not become active");
    if (!await waitFor(win, `/save gate/i.test(document.querySelector('.tarot-save-scene-toggle')?.textContent || '')`, 4000)) {
      const label = await win.webContents.executeJavaScript(`document.querySelector('.tarot-save-scene-toggle')?.textContent?.trim() || 'missing'`);
      throw new Error(`Save Gate UI did not catch up with the active Gate (label: ${label})`);
    }
    await sleep(1250);
    const before = await capture(win, "tarot-stargate-context-before");
    if (!await waitFor(win, `/save gate/i.test(document.querySelector('.tarot-save-scene-toggle')?.textContent || '')`, 4000)) throw new Error("Save Gate UI did not remain available after the hero-frame capture");
    const saved = await win.webContents.executeJavaScript(`(() => { const button = document.querySelector('.tarot-save-scene-toggle'); if (!button || !/save gate/i.test(button.textContent || '')) return false; button.click(); return true; })()`);
    if (!saved) throw new Error("Save Gate action was not available on the active Gate");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'sealing'`, 4000)) throw new Error("Gate did not enter the sealing hero state");
    await sleep(650);
    const sealing = await capture(win, "tarot-stargate-context-sealing");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'disconnected' && window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.contextCardProposed === true`, 10000)) throw new Error("Return Card was not physically proposed after sealing");
    await sleep(2300);
    const card = await capture(win, "tarot-stargate-context-card");
    const restored = await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.restoreStargateContextCard())`);
    const restoredStateObserved = restored && await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.contextRestoreLocked === true && window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'disconnected'`, 8000);
    if (!restoredStateObserved) {
      const restoreDiagnostics = await win.webContents.executeJavaScript(`({ restored: ${JSON.stringify(restored)}, stargate: window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate || null, status: document.querySelector('.tarot-stargate-status')?.innerText || '' })`);
      throw new Error(`Context Card did not restore into the disconnected state: ${JSON.stringify(restoreDiagnostics)}`);
    }
    await sleep(1000);
    const after = await capture(win, "tarot-stargate-context-restored");
    const metrics = await win.webContents.executeJavaScript(`(() => { const diagnostics = window.__THREE_GAME_DIAGNOSTICS__; const state = diagnostics?.state || {}; const root = document.querySelector('.tarot-draw-view'); const serialized = JSON.stringify({ state, text: root?.innerText || '' }); return { stargate: state.stargate, placedCount: state.placedCount, selected: state.selected, saveText: document.querySelector('.tarot-save-scene-toggle')?.textContent?.trim() || '', statusText: document.querySelector('.tarot-stargate-status')?.innerText || '', leakedFullAddress: /hapa-gate:v1:[a-z2-7]{52}/i.test(serialized), leakedPublicSecret: serialized.includes('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8') }; })()`);
    if (metrics.stargate.state !== "disconnected" || !metrics.stargate.requiresFreshPass || !metrics.stargate.contextCardProposed || !metrics.stargate.contextDigest) throw new Error(`Context truth state failed: ${JSON.stringify(metrics)}`);
    if (metrics.stargate.derivationObserved || metrics.leakedFullAddress || metrics.leakedPublicSecret) throw new Error(`Disconnected privacy boundary failed: ${JSON.stringify(metrics)}`);
    if (metrics.stargate.slotCount !== 4 || metrics.stargate.sealedCount !== 4) throw new Error(`Ordered Formation did not restore: ${JSON.stringify(metrics.stargate)}`);
    if (!/fresh gate pass required/i.test(metrics.statusText)) throw new Error(`Fresh-Pass truth is not visible: ${metrics.statusText}`);
    if (errors.length) throw new Error(`Renderer console errors:\n${errors.join("\n")}`);
    console.log(JSON.stringify({ ok: true, targetUrl, metrics, screenshots: { before, sealing, card, after } }, null, 2));
    win.destroy();
    await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    if (errors.length) console.error(errors.join("\n"));
    win.destroy();
    await app.quit();
    process.exit(1);
  }
}).catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exit(1); });
