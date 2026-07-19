const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const targetUrl = process.env.SMOKE_URL || "http://127.0.0.1:8787/";
const windowWidth = Math.max(640, Number(process.env.SMOKE_WIDTH) || 1600);
const windowHeight = Math.max(720, Number(process.env.SMOKE_HEIGHT) || 1000);
const artifactSuffix = String(process.env.SMOKE_ARTIFACT_SUFFIX || "").replace(/[^a-z0-9-]/gi, "");
const reducedMotionExpected = process.env.SMOKE_REDUCED_MOTION === "1";
const errors = [];
if (reducedMotionExpected) app.commandLine.appendSwitch("force-prefers-reduced-motion", "reduce");
app.setName("hapa-avatar-builder-stargate-smoke");
app.setPath("userData", path.join("/tmp", `hapa-avatar-builder-stargate-smoke-${process.pid}`));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, expression, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await win.webContents.executeJavaScript(expression)) return true;
    await sleep(100);
  }
  return false;
}

async function clickTarotDraw(win) {
  await waitFor(win, "Boolean(document.querySelector('.view-tabs button'))");
  return win.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('.view-tabs button')].find((item) => /tarot draw/i.test(item.textContent || ''));
      button?.click();
      return Boolean(button);
    })()
  `);
}

async function capture(win, name) {
  const image = await win.capturePage();
  const output = path.join(ROOT, `artifacts/smoke/${name}${artifactSuffix ? `-${artifactSuffix}` : ""}.png`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, image.toPNG());
  return output;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    show: false,
    backgroundColor: "#020617",
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) errors.push(message);
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`[Load Failure] ${code}: ${description} (${url})`));
  try {
    await win.loadURL(targetUrl);
    if (!await clickTarotDraw(win)) throw new Error("Tarot Draw tab was not found");
    if (!await waitFor(win, `Boolean(document.querySelector('.tarot-draw-view canvas') && window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`)) {
      throw new Error("Tarot Draw canvas and diagnostics did not mount");
    }
    if (windowWidth < 900) {
      await win.webContents.executeJavaScript(`document.querySelector('.tarot-draw-view')?.scrollIntoView({ block: 'start', inline: 'nearest' })`);
      await sleep(250);
    }
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 0`)) throw new Error("Tarot deck did not become ready");
    const loaded = await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation())`);
    if (!loaded) throw new Error("Public demo formation did not load");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready' && document.querySelector('.tarot-draw-view')?.dataset?.stargate === 'ready'`)) throw new Error("Stargate did not reach Ready");
    await sleep(700);
    const readyScreenshot = await capture(win, "tarot-stargate-ready");
    const dialed = await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate())`);
    if (!dialed) throw new Error("Stargate did not begin dialing");
    await sleep(1500);
    const dialingScreenshot = await capture(win, "tarot-stargate-dialing");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 12000)) throw new Error("Stargate did not become Active");
    await sleep(800);
    const activeScreenshot = await capture(win, "tarot-stargate-active");
    const metrics = await win.webContents.executeJavaScript(`
      (() => {
        const diagnostics = window.__THREE_GAME_DIAGNOSTICS__;
        const state = diagnostics?.state || {};
        const gate = state.stargate || {};
        const root = document.querySelector('.tarot-draw-view');
        const status = document.querySelector('.tarot-stargate-status');
        const canvas = root?.querySelector('canvas');
        const rect = canvas?.getBoundingClientRect();
        const serialized = JSON.stringify({ state, text: root?.innerText || '' });
        return {
          diagnosticsKind: diagnostics?.kind || null,
          stargate: gate,
          rootState: root?.dataset?.stargate || null,
          statusVisible: Boolean(status),
          statusText: status?.innerText || '',
          renderer: state.renderer || null,
          canvas: canvas ? { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height } : null,
          leakedFullPublicAddress: serialized.includes('hapa-gate:v1:72eeamh2g3mxe2jbnww44f4wbvrgl4o3od242ikj6mpmv3wn2gnq'),
          leakedPublicSecret: serialized.includes('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8')
        };
      })()
    `);
    if (metrics.stargate.state !== "active") throw new Error(`Unexpected gate state: ${JSON.stringify(metrics.stargate)}`);
    if (metrics.stargate.slotCount !== 4 || metrics.stargate.sealedCount !== 4 || metrics.stargate.missingIdentityCount !== 0) throw new Error(`Unexpected formation custody: ${JSON.stringify(metrics.stargate)}`);
    if (!metrics.stargate.derivationObserved || !metrics.stargate.privateTopicWithheld || !metrics.stargate.cohortSecretWithheld) throw new Error(`Derivation truth gate failed: ${JSON.stringify(metrics.stargate)}`);
    if (Boolean(metrics.stargate.reducedMotion) !== reducedMotionExpected) throw new Error(`Reduced-motion contract mismatch: ${JSON.stringify(metrics.stargate)}`);
    if (metrics.stargate.visual.openBlend < 0.9 || metrics.stargate.visual.energy < 0.9 || metrics.stargate.visual.chevrons !== 8 || metrics.stargate.visual.beams !== 8) throw new Error(`Stargate visual rig did not fully open: ${JSON.stringify(metrics.stargate.visual)}`);
    if (!metrics.statusVisible || metrics.rootState !== "active") throw new Error(`Accessible Stargate status is missing: ${JSON.stringify(metrics)}`);
    if (metrics.leakedFullPublicAddress || metrics.leakedPublicSecret) throw new Error(`Stargate UI or diagnostics exposed private derivation material: ${JSON.stringify(metrics)}`);
    const stateTransitions = {};
    for (const nextState of ["stale", "expired", "disconnected"]) {
      const action = nextState === "stale" ? "markStargateStale" : nextState === "expired" ? "markStargateExpired" : "markStargateDisconnected";
      stateTransitions[nextState] = await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.${action}())`);
      if (!stateTransitions[nextState] || !await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === '${nextState}' && document.querySelector('.tarot-draw-view')?.dataset?.stargate === '${nextState}'`)) {
        throw new Error(`Stargate did not expose accessible ${nextState} state`);
      }
    }
    if (errors.length) throw new Error(`Renderer console errors:\n${errors.join("\n")}`);
    console.log(JSON.stringify({ ok: true, targetUrl, window: { width: windowWidth, height: windowHeight }, reducedMotionExpected, metrics, stateTransitions, screenshots: { readyScreenshot, dialingScreenshot, activeScreenshot } }, null, 2));
    await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    if (errors.length) console.error(errors.join("\n"));
    await app.quit();
    process.exit(1);
  }
}).catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
