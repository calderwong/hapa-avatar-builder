const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const baseUrl = String(process.env.SMOKE_URL || "http://127.0.0.1:8787/").replace(/\/?$/, "/");
const adminToken = String(process.env.HAPA_AVATAR_ADMIN_TOKEN || "");
const errors = [];
app.setName("hapa-avatar-builder-catalog-return-smoke");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-catalog-return-smoke-${process.pid}`));

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
  const output = path.join(ROOT, "artifacts/smoke/CAT-GATE-002", `${name}.png`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, (await win.capturePage()).toPNG());
  return output;
}
async function json(pathname, options = {}) {
  const response = await fetch(new URL(pathname, baseUrl), options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} failed ${response.status}: ${body.message || body.error || JSON.stringify(body)}`);
  return body;
}
async function waitForStoredCard(cardId, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const store = await json("api/tarot");
    if ((store.cards || []).some((card) => card.id === cardId)) return true;
    await sleep(100);
  }
  return false;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 1000, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_event, level, message) => { if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) errors.push(message); });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`[Load Failure] ${code}: ${description} (${url})`));
  try {
    await win.loadURL(new URL("?view=tarot", baseUrl).href);
    if (!await waitFor(win, `Boolean(document.querySelector('.tarot-draw-view canvas') && window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`)) throw new Error("Canonical Tarot Draw did not mount");
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 0`)) throw new Error("Tarot deck did not become ready");
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation())`)) throw new Error("Public Formation could not stage");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready'`, 8000)) throw new Error("Stargate did not become ready");
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate())`)) throw new Error("Stargate could not dial");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 15000)) throw new Error("Stargate did not become active");
    const saved = await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-save-scene-toggle');if(!button||!/save gate/i.test(button.textContent||''))return false;button.click();return true;})()`);
    if (!saved || !await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.contextCardProposed === true`, 12000)) throw new Error("Return Card was not sealed");
    const localCardId = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.contextCardId || ''`);
    if (!await waitForStoredCard(localCardId)) throw new Error(`Return Card did not reach the isolated Tarot store: ${localCardId}`);
    const review = await json("api/tarot/stargate/context-card/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: localCardId }) });
    const minted = await json("api/tarot/stargate/context-card/mint", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ cardId: localCardId, reviewDigest: review.review.reviewDigest, approval: { approved: true, decision: "approve", actorId: "build-week-operator", actorType: "human", method: "isolated-ui-proof" } })
    });
    if (!minted.stableCardReference || !minted.expectedRevision) throw new Error(`Mint did not produce stable identity: ${JSON.stringify(minted)}`);
    const handoff = new URL(baseUrl);
    handoff.searchParams.set("view", "tarot");
    handoff.searchParams.set("stargate_card", minted.stableCardReference);
    handoff.searchParams.set("stargate_revision", String(minted.expectedRevision));
    handoff.searchParams.set("stargate_source", "hapa-avatar-builder");
    handoff.searchParams.set("stargate_intent", "restore_disconnected");
    await win.loadURL(handoff.href);
    if (!await waitFor(win, `document.querySelector('.tarot-catalog-return')?.dataset?.state === 'restored'`, 30000)) {
      const detail = await win.webContents.executeJavaScript(`({rail:document.querySelector('.tarot-catalog-return')?.innerText||'',state:window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate||null})`);
      throw new Error(`Catalog return did not restore: ${JSON.stringify(detail)}`);
    }
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'disconnected' && window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.slotCount === 4`, 8000)) throw new Error("Exact four-Card Formation was not reconstructed disconnected");
    await sleep(1400);
    const restored = await capture(win, "catalog-return-restored");
    const requested = await win.webContents.executeJavaScript(`(() => { const button=[...document.querySelectorAll('.tarot-catalog-return button')].find(item=>/request fresh gate pass/i.test(item.textContent||''));button?.click();return Boolean(button);})()`);
    if (!requested || !await waitFor(win, `document.querySelector('.tarot-catalog-return')?.dataset?.state === 'pass-requested'`, 12000)) throw new Error("Explicit Gate Pass request did not enter its waiting state");
    await sleep(700);
    const passRequested = await capture(win, "catalog-return-pass-requested");
    const truth = await win.webContents.executeJavaScript(`(() => {const state=window.__THREE_GAME_DIAGNOSTICS__?.state||{},rail=document.querySelector('.tarot-catalog-return'),serialized=JSON.stringify({state,text:rail?.innerText||''});return{stargate:state.stargate,railState:rail?.dataset?.state,railText:rail?.innerText||'',joinDisabled:[...rail.querySelectorAll('button')].find(item=>/join stargate/i.test(item.textContent||''))?.disabled===true,fullAddressLeaked:/hapa-gate:v1:[a-z2-7]{52}/i.test(serialized),secretLeaked:/(?:cohortSecret|rendezvousTopic|invitationToken|privateKey|bearerToken)(?=[\"':=])/i.test(serialized)};})()`);
    if (truth.stargate.state !== "disconnected" || truth.stargate.slotCount !== 4 || !truth.stargate.requiresFreshPass || truth.railState !== "pass-requested" || !truth.joinDisabled || truth.fullAddressLeaked || truth.secretLeaked) throw new Error(`Catalog return truth gate failed: ${JSON.stringify(truth)}`);
    if (!/waiting for a peer-issued pass/i.test(truth.railText)) throw new Error(`Transient Pass truth is not visible: ${truth.railText}`);
    if (errors.length) throw new Error(`Renderer console errors:\n${errors.join("\n")}`);
    console.log(JSON.stringify({ ok: true, isolated: true, userAppTouched: false, sourceCardId: localCardId, stableCardReference: minted.stableCardReference, pinnedRevision: minted.expectedRevision, mintState: minted.state, truth, screenshots: { restored, passRequested } }, null, 2));
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
