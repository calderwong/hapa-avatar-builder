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
  await waitFor(win, "Boolean(document.querySelector('.view-tabs button'))", 120000);
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

async function exerciseFreeCamera(win) {
  if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.cameraMode === 'free'`, 5000)) {
    throw new Error("Stargate hero camera never released to the operator");
  }
  const before = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.camera`);
  const point = await win.webContents.executeJavaScript(`(() => {
    const rect = document.querySelector('.tarot-draw-view canvas').getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width * 0.52), y: Math.round(rect.top + rect.height * 0.24) };
  })()`);
  win.webContents.focus();
  win.webContents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
  win.webContents.sendInputEvent({ type: "mouseMove", x: point.x + 150, y: point.y + 62, movementX: 150, movementY: 62, buttons: 1 });
  win.webContents.sendInputEvent({ type: "mouseUp", x: point.x + 150, y: point.y + 62, button: "left", clickCount: 1 });
  await sleep(500);
  const afterOrbit = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.camera`);
  win.webContents.sendInputEvent({ type: "mouseWheel", x: point.x, y: point.y, deltaY: -180, deltaX: 0, canScroll: true });
  await sleep(500);
  const afterZoom = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.camera`);
  const orbitDelta = Math.hypot(
    afterOrbit.position.x - before.position.x,
    afterOrbit.position.y - before.position.y,
    afterOrbit.position.z - before.position.z
  );
  const zoomDelta = Math.abs(afterZoom.distance - afterOrbit.distance);
  if (orbitDelta < 0.08) throw new Error(`Free camera did not orbit from real mouse input: ${JSON.stringify({ before, afterOrbit })}`);
  if (zoomDelta < 0.04) throw new Error(`Free camera did not zoom from real wheel input: ${JSON.stringify({ afterOrbit, afterZoom })}`);
  return { before, afterOrbit, afterZoom, orbitDelta, zoomDelta };
}

async function clickPoint(win, point) {
  win.webContents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y, movementX: 0, movementY: 0 });
  await sleep(120);
  win.webContents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
  win.webContents.sendInputEvent({ type: "mouseUp", x: point.x, y: point.y, button: "left", clickCount: 1 });
}

async function exerciseCardSlotPlacement(win) {
  const filled = await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.autoFillStargateFormation())`);
  if (!filled || !await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.formationMode === 'manual'`)) {
    throw new Error("Stargate Auto-fill did not create an explicit ordered formation");
  }
  await sleep(700);
  const before = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.stargate.formationMemberIds`);
  const targets = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.actions.getStargateInteractionTargets()`);
  if (!targets.cards?.[0]?.client?.inView || !targets.slots?.[1]?.client?.inView) throw new Error(`Stargate interaction targets are not visible: ${JSON.stringify(targets)}`);
  await clickPoint(win, targets.cards[0].client);
  if (!await waitFor(win, `Boolean(window.__THREE_GAME_DIAGNOSTICS__?.state?.held)`, 3000)) throw new Error("A real Card click did not lift the first Formation Card");
  await clickPoint(win, targets.slots[1].client);
  if (!await waitFor(win, `!window.__THREE_GAME_DIAGNOSTICS__?.state?.held && window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.slotCount === 4`, 3000)) {
    throw new Error("A real numbered-slot click did not place the held Card");
  }
  const after = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.stargate.formationMemberIds`);
  if (after[0] !== before[1] || after[1] !== before[0]) throw new Error(`Numbered-slot placement did not change deterministic Card order: ${JSON.stringify({ before, after })}`);
  return { before, after, targetCard: targets.cards[0], targetSlot: targets.slots[1] };
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    show: false,
    backgroundColor: "#020617",
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.webContents.on("console-message", (_event, details, legacyMessage) => {
    const level = typeof details === "object" ? Number(details.level || 0) : Number(details || 0);
    const message = typeof details === "object" ? String(details.message || "") : String(legacyMessage || "");
    if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) errors.push(message);
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`[Load Failure] ${code}: ${description} (${url})`));
  try {
    const directUrl = new URL(targetUrl);
    directUrl.searchParams.set("view", "tarot-draw");
    directUrl.searchParams.set("stargateDemo", "1");
    await win.loadURL(directUrl.toString());
    if (!await waitFor(win, `Boolean(document.querySelector('.tarot-draw-view canvas') && window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`, 120000)) {
      const mountDiagnostics = await win.webContents.executeJavaScript(`(() => ({
        url: location.href,
        title: document.title,
        activeTab: [...document.querySelectorAll('.view-tabs button')].find((item) => item.getAttribute('aria-selected') === 'true' || item.classList.contains('active'))?.textContent || '',
        tarotView: Boolean(document.querySelector('.tarot-draw-view')),
        canvas: Boolean(document.querySelector('.tarot-draw-view canvas')),
        initError: document.querySelector('.tarot-draw-error')?.innerText || '',
        text: (document.body?.innerText || '').slice(0, 2400)
      }))()`);
      const failureScreenshot = await capture(win, "tarot-stargate-mount-failure");
      throw new Error(`Tarot Draw canvas and diagnostics did not mount: ${JSON.stringify({ mountDiagnostics, errors, failureScreenshot })}`);
    }
    if (windowWidth < 900) {
      await win.webContents.executeJavaScript(`document.querySelector('.tarot-draw-view')?.scrollIntoView({ block: 'start', inline: 'nearest' })`);
      await sleep(250);
    }
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 0`, 120000)) throw new Error("Tarot deck did not become ready");
    const loaded = await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation())`);
    if (!loaded) throw new Error("Public demo formation did not load");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready' && document.querySelector('.tarot-draw-view')?.dataset?.stargate === 'ready'`, 120000)) throw new Error("Stargate did not reach Ready");
    await sleep(700);
    const cardSlotExercise = await exerciseCardSlotPlacement(win);
    const cameraExercise = await exerciseFreeCamera(win);
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
          accessControls: document.querySelectorAll('.tarot-stargate-access button').length,
          visibleSlotGuides: document.querySelectorAll('.tarot-stargate-slot-guide span').length,
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
    if (metrics.accessControls < 3 || metrics.visibleSlotGuides < 2) throw new Error(`Stargate construction controls are incomplete: ${JSON.stringify(metrics)}`);
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
    console.log(JSON.stringify({ ok: true, targetUrl, window: { width: windowWidth, height: windowHeight }, reducedMotionExpected, metrics, cardSlotExercise, cameraExercise, stateTransitions, screenshots: { readyScreenshot, dialingScreenshot, activeScreenshot } }, null, 2));
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
