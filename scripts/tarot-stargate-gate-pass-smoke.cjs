const { app, BrowserWindow } = require("electron");
const os = require("node:os");
const path = require("node:path");

const baseUrl = String(process.env.SMOKE_URL || "http://127.0.0.1:8787/").replace(/\/?$/, "/");
const adminToken = String(process.env.HAPA_AVATAR_ADMIN_TOKEN || "");
const errors = [];
let activeWindow = null;

app.setName("hapa-avatar-builder-gate-pass-smoke");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-gate-pass-smoke-${process.pid}`));
app.on("window-all-closed", (event) => { if (activeWindow) event.preventDefault(); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(win, expression, timeout = 35_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await win.webContents.executeJavaScript(expression)) return true;
    await sleep(100);
  }
  return false;
}
async function json(pathname, options = {}) {
  const response = await fetch(new URL(pathname, baseUrl), options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} failed ${response.status}: ${body.message || body.error || JSON.stringify(body)}`);
  return body;
}
async function waitForStoredCard(cardId, timeout = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const store = await json("api/tarot");
    if ((store.cards || []).some((card) => card.id === cardId)) return true;
    await sleep(100);
  }
  return false;
}

app.whenReady().then(async () => {
  const win = activeWindow = new BrowserWindow({ width: 1600, height: 1000, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_event, level, message) => { if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) errors.push(message); });
  try {
    await win.loadURL(new URL("?view=tarot", baseUrl).href);
    if (!await waitFor(win, `Boolean(window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`)) throw new Error("Canonical Tarot Draw did not mount");
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation())`)) throw new Error("Public Formation could not stage");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready'`, 8_000)) throw new Error("Stargate did not become ready");
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate())`)) throw new Error("Stargate could not dial");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 15_000)) throw new Error("Stargate did not become active");
    await win.webContents.executeJavaScript(`document.querySelector('.tarot-save-scene-toggle')?.click()`);
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.contextCardProposed === true`, 12_000)) throw new Error("Return Card was not sealed");
    const localCardId = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.stargate.contextCardId`);
    if (!await waitForStoredCard(localCardId)) throw new Error("Return Card did not persist");
    const review = await json("api/tarot/stargate/context-card/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: localCardId }) });
    const minted = await json("api/tarot/stargate/context-card/mint", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ cardId: localCardId, reviewDigest: review.review.reviewDigest, approval: { approved: true, decision: "approve", actorId: "build-week-operator", actorType: "human", method: "isolated-ui-proof" } }) });
    const handoff = new URL(baseUrl);
    handoff.searchParams.set("view", "tarot");
    handoff.searchParams.set("stargate_card", minted.stableCardReference);
    handoff.searchParams.set("stargate_revision", String(minted.expectedRevision));
    handoff.searchParams.set("stargate_source", "hapa-avatar-builder");
    handoff.searchParams.set("stargate_intent", "request_pass");
    await win.loadURL(handoff.href);
    if (!await waitFor(win, `document.querySelector('.tarot-catalog-return')?.dataset?.state === 'pass-ready' && window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'disconnected'`, 18_000)) throw new Error("Exact Catalog return did not restore disconnected");
    const before = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.stargate.formationFingerprint`);
    await win.webContents.executeJavaScript(`([...document.querySelectorAll('.tarot-catalog-return button')].find(button=>/request fresh gate pass/i.test(button.textContent||'')))?.click()`);
    if (!await waitFor(win, `document.querySelector('.tarot-catalog-return')?.dataset?.state === 'pass-requested'`, 8_000)) throw new Error("Fresh Pass request did not stage");
    await win.webContents.executeJavaScript(`([...document.querySelectorAll('.tarot-catalog-return button')].find(button=>/open gate to aurora/i.test(button.textContent||'')))?.click()`);
    if (!await waitFor(win, `document.querySelector('.tarot-catalog-return')?.dataset?.state === 'joined' && window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.peerArrival?.joined === true`, 40_000)) throw new Error("Two verified peers did not arrive");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.peerArrival?.state === 'joined'`, 8_000)) throw new Error("Arrival materialization did not settle");
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.visual?.openBlend || 0) >= 0.92 && Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.visual?.energy || 0) >= 0.92`, 8_000)) throw new Error("Connected Gate did not reach its full visual state");
    const truth = await win.webContents.executeJavaScript(`(() => { const state=window.__THREE_GAME_DIAGNOSTICS__.state.stargate,rail=document.querySelector('.tarot-catalog-return'),serialized=JSON.stringify({state,text:rail?.innerText||''});return{state,railState:rail?.dataset?.state,railText:rail?.innerText||'',fullAddressLeaked:/hapa-gate:v1:[a-z2-7]{52}/i.test(serialized),secretLeaked:/(?:cohortSecret|rendezvousTopic|gatePassToken|privateKey|bearerToken)(?=["':=])/i.test(serialized)};})()`);
    const after = truth.state.formationFingerprint;
    const store = await json("api/tarot");
    const resultCards = (store.cards || []).filter((card) => card.id === truth.state.peerArrival.resultCardId);
    const checks = {
      canonicalTarotScene: truth.state.slotCount === 4,
      joined: truth.state.state === "connected" && truth.state.peerArrival.joined === true,
      twoPeers: truth.state.peerArrival.peerCount === 2,
      unchangedFormation: before === after,
      gateIdentityChanged: truth.state.peerArrival.gateIdentityChanged === false,
      passNotPersisted: truth.state.peerArrival.passPersisted === false,
      threeVisuals: truth.state.visual.peerPresences === 2 && truth.state.visual.peerRails === 2,
      resultCardPersisted: resultCards.length === 1,
      safeSurface: !truth.fullAddressLeaked && !truth.secretLeaked,
      visibleProof: /2 processes · 2 profiles · 7\/7 negative cases/i.test(truth.railText) && /pass not persisted · catalog not required/i.test(truth.railText),
      rendererErrors: errors.length === 0
    };
    if (!Object.values(checks).every(Boolean)) throw new Error(`Gate Pass smoke truth gate failed: ${JSON.stringify({ checks, truth, before, after, errors })}`);
    console.log(JSON.stringify({ ok: true, checks, truth: { state: truth.state.state, peerArrival: truth.state.peerArrival, formationFingerprint: after, visual: truth.state.visual }, resultCardId: resultCards[0].id, userAppTouched: false }, null, 2));
    activeWindow = null; win.destroy(); await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    activeWindow = null; win.destroy(); await app.quit(); process.exit(1);
  }
}).catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exit(1); });
