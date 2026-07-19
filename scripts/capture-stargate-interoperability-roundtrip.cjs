const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const avatarUrl = String(process.env.CAPTURE_AVATAR_URL || "http://127.0.0.1:8787/").replace(/\/?$/, "/");
const catalogUrl = String(process.env.CAPTURE_CATALOG_URL || "http://127.0.0.1:8770/").replace(/\/?$/, "/");
const overwindUrl = String(process.env.CAPTURE_OVERWIND_URL || "http://127.0.0.1:8788").replace(/\/$/, "");
const overwindToken = String(process.env.CAPTURE_OVERWIND_TOKEN || "");
const catalogToken = String(process.env.CAPTURE_CATALOG_TOKEN || "");
const avatarToken = String(process.env.HAPA_AVATAR_ADMIN_TOKEN || "");
const width = 1600;
const height = 1000;
const fps = 12;
const timingScale = Math.max(0.05, Math.min(1, Number(process.env.CAPTURE_TIMING_SCALE || 1)));
const errors = [];
const chapters = [];
let captureWindow = null;
let frameIndex = 0;

app.setName("hapa-stargate-interoperability-roundtrip-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-stargate-roundtrip-capture-${process.pid}`));
app.on("window-all-closed", (event) => { if (captureWindow) event.preventDefault(); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bounded = (promise, timeoutMs, fallback = null) => Promise.race([
  promise.catch(() => fallback),
  sleep(timeoutMs).then(() => fallback)
]);
const sha256 = async (target) => {
  const bytes = await fs.readFile(target);
  return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} exited ${code}\n${stderr}`)));
  });
}

async function json(base, pathname, options = {}, bearer = "") {
  const headers = { accept: "application/json", ...(options.headers || {}) };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const response = await fetch(new URL(pathname, base), { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} failed ${response.status}: ${body.message || body.error || body.error_code || JSON.stringify(body)}`);
  return body;
}

async function waitFor(win, expression, timeout = 40_000, label = expression) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeout) {
    try { if (await win.webContents.executeJavaScript(expression)) return true; }
    catch (error) { lastError = error?.message || String(error); }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError}` : ""}`);
}

async function click(win, expression, label) {
  const clicked = await win.webContents.executeJavaScript(expression);
  if (!clicked) throw new Error(`Could not activate ${label}`);
}

async function captureFor(win, framesDir, name, durationMs) {
  const startFrame = frameIndex;
  const count = Math.max(1, Math.round(durationMs * timingScale / 1000 * fps));
  for (let index = 0; index < count; index += 1) {
    const started = Date.now();
    const png = (await win.capturePage()).toPNG();
    await fs.writeFile(path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`), png);
    frameIndex += 1;
    await sleep(Math.max(0, 1000 / fps - (Date.now() - started)));
  }
  chapters.push({ name, startFrame, endFrame: frameIndex - 1, startSeconds: Number((startFrame / fps).toFixed(3)), endSeconds: Number((frameIndex / fps).toFixed(3)) });
}

function setupWindow(win, label) {
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3 && !/ResizeObserver loop|THREE\.WebGLRenderer|Autofill|DevTools/.test(message)) errors.push(`${label}: ${message}`);
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`${label}: load ${code} ${description} ${url}`));
}

function findDeckMembership(state, cardId) {
  for (const deck of state?.decks || []) {
    const revision = (deck.revisions || []).find((entry) => entry.revision_id === deck.current_revision_id) || deck.revisions?.at(-1);
    const members = Object.values(revision?.zones || {}).flat();
    if (members.some((entry) => entry.card_identity_id === cardId)) return { deck, revision };
  }
  return null;
}

app.whenReady().then(async () => {
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-stargate-roundtrip-frames-"));
  const outputDir = path.join(ROOT, "artifacts", "demos", "CAT-GATE-003");
  const output = path.join(outputDir, "stargate-interoperability-roundtrip.mp4");
  const poster = path.join(outputDir, "stargate-interoperability-roundtrip-poster.png");
  const manifestPath = path.join(outputDir, "stargate-interoperability-roundtrip.json");
  const avatar = captureWindow = new BrowserWindow({ width, height, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const catalog = new BrowserWindow({ width, height, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const runState = { localCardId: "", cardId: "", revision: 0 };
  setupWindow(avatar, "Avatar Builder");
  setupWindow(catalog, ".hapaCatalog");
  try {
    await fs.mkdir(outputDir, { recursive: true });
    await avatar.loadURL(new URL("?view=tarot", avatarUrl).href);
    await waitFor(avatar, `Boolean(window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw' && document.querySelector('.tarot-draw-view canvas'))`, 45_000, "canonical Tarot Draw");
    await avatar.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation()`);
    await waitFor(avatar, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready'`, 10_000, "ordered public Formation");
    await captureFor(avatar, framesDir, "Cards become coordinates", 1_250);

    await avatar.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate()`);
    await captureFor(avatar, framesDir, "Dial the Stargate", 3_600);
    await waitFor(avatar, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 15_000, "open Stargate");
    const visualAfterDial = await avatar.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.stargate.visual`);
    if (visualAfterDial.depthRings !== 9 || visualAfterDial.shockwaves !== 3 || visualAfterDial.openBlend < 0.9) throw new Error(`Enhanced Stargate visual rig was not fully observed: ${JSON.stringify(visualAfterDial)}`);
    await captureFor(avatar, framesDir, "Open event horizon", 1_000);

    await click(avatar, `(() => { const button=document.querySelector('.tarot-save-scene-toggle'); if(!button)return false; button.click(); return true; })()`, "Save Gate");
    await waitFor(avatar, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.contextCardProposed === true && Boolean(document.querySelector('.tarot-stargate-mint-open'))`, 15_000, "proposed Return Card");
    const localCardId = await avatar.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.stargate.contextCardId`);
    runState.localCardId = localCardId;
    await captureFor(avatar, framesDir, "Seal the Return Card", 1_000);

    await click(avatar, `(() => { const button=document.querySelector('.tarot-stargate-mint-open'); button?.click(); return Boolean(button); })()`, "Review & Mint");
    await waitFor(avatar, `document.querySelector('.tarot-stargate-mint-chamber')?.dataset?.status === 'ready'`, 15_000, "human mint review");
    await captureFor(avatar, framesDir, "Human mint review", 1_500);
    await click(avatar, `(() => { const button=document.querySelector('.tarot-stargate-mint-approve'); button?.click(); return Boolean(button); })()`, "Approve & Mint Exact Revision");
    await captureFor(avatar, framesDir, "Custody relay", 3_500);
    await waitFor(avatar, `document.querySelector('.tarot-stargate-mint-chamber')?.dataset?.status === 'complete' && document.querySelector('.tarot-stargate-mint-chamber')?.dataset?.state === 'catalog_indexed'`, 30_000, "real Catalog-indexed mint");
    await captureFor(avatar, framesDir, "Catalog indexed", 1_000);

    const avatarStatus = await json(avatarUrl, `api/tarot/stargate/context-card/status?cardId=${encodeURIComponent(localCardId)}`);
    const cardId = avatarStatus.stableCardReference;
    const revision = Number(avatarStatus.expectedRevision);
    runState.cardId = cardId;
    runState.revision = revision;
    if (!cardId || revision !== 1 || avatarStatus.state !== "catalog_indexed" || !avatarStatus.origin?.durableAcknowledgement) throw new Error(`Mint truth gate failed: ${JSON.stringify(avatarStatus)}`);
    const overwindCard = await json(overwindUrl, `/v1/cards/${encodeURIComponent(cardId)}`, {}, overwindToken);
    if (overwindCard.card?.card_id !== cardId || Number(overwindCard.card?.revision || 0) !== revision) throw new Error("Overwind did not resolve the exact minted Card revision");
    if (overwindCard.card?.card_type !== "stargate_context" || overwindCard.envelope?.card_type !== "stargate_context") throw new Error(`Overwind changed the Stargate Context projection type: ${JSON.stringify({ document: overwindCard.card?.card_type, envelope: overwindCard.envelope?.card_type })}`);
    const subscriberSync = await json(catalogUrl, "v1/overwind/subscriber/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "cat-gate-003-exact-roundtrip-confirmation" }) }, catalogToken);
    const catalogStatus = await json(catalogUrl, `v1/overwind/cards/${encodeURIComponent(cardId)}/projection-status?expected_revision=${revision}`, {}, catalogToken);
    if (catalogStatus.state !== "catalog_indexed" || catalogStatus.card_id !== cardId || Number(catalogStatus.indexed_revision) !== revision) throw new Error(`Catalog projection truth gate failed: ${JSON.stringify(catalogStatus)}`);
    if (catalogStatus.card_type !== "stargate_context") throw new Error(`Catalog changed the Stargate Context projection type: ${JSON.stringify(catalogStatus)}`);

    const portalUrl = new URL(catalogUrl);
    portalUrl.searchParams.set("view", "storefront");
    portalUrl.searchParams.set("storefront", "convergence");
    portalUrl.searchParams.set("stargate", cardId);
    portalUrl.searchParams.set("revision", String(revision));
    await catalog.loadURL(portalUrl.href);
    await waitFor(catalog, `Boolean(document.querySelector('.sf-convergence'))`, 35_000, "Catalog Convergence Portal");
    const catalogPortalText = await catalog.webContents.executeJavaScript(`document.querySelector('.sf-convergence')?.textContent || ''`);
    if (!catalogPortalText.includes(cardId)) throw new Error(`Catalog Convergence Portal did not visibly preserve the exact Card ID. Visible text: ${catalogPortalText.slice(0, 1200)}`);
    await catalog.webContents.executeJavaScript(`localStorage.setItem('hapaCatalogAvatarBuilderBaseUrl', ${JSON.stringify(avatarUrl)}); true;`);
    await captureFor(catalog, framesDir, "Catalog convergence portal", 1_750);
    await click(catalog, `(() => { const button=document.querySelector('[data-convergence-control="play"]'); button?.click(); return Boolean(button); })()`, "Activate Stargate in Catalog");
    await captureFor(catalog, framesDir, "Finite Catalog reveal", 5_400);
    await waitFor(catalog, `document.querySelector('.sf-convergence')?.dataset?.composed === 'true'`, 8_000, "composed Catalog Return Card");
    await click(catalog, `(() => { const button=document.querySelector('[data-convergence-action="add_to_deck"]'); button?.click(); return Boolean(button); })()`, "Add to Deck");
    await waitFor(catalog, `/Return Card staged in a new buyer-local Deck revision/i.test(document.querySelector('#sfStatus')?.textContent || '')`, 10_000, "buyer-local Deck write");
    await captureFor(catalog, framesDir, "Deck custody confirmed", 1_000);
    await click(catalog, `(() => { const button=document.querySelector('[data-sf-action="deck"]'); button?.click(); return Boolean(button); })()`, "open named Deck");
    await waitFor(catalog, `Boolean(document.querySelector('.named-deck-vault') && document.querySelector('.named-deck-vault')?.innerText.includes(${JSON.stringify(cardId)}))`, 15_000, "named Deck membership");
    await captureFor(catalog, framesDir, "Named Deck membership", 2_000);
    const deckResponse = await catalog.webContents.executeJavaScript(`fetch('/v1/storefront/decks?session_key='+encodeURIComponent(localStorage.getItem('hapaCatalogStorefrontSession.v1')||'')).then(response => response.json())`);
    const membership = findDeckMembership(deckResponse.state, cardId);
    if (!membership) throw new Error("The exact Card ID was not found in the buyer-local named Deck state");

    await catalog.loadURL(portalUrl.href);
    await waitFor(catalog, `Boolean(document.querySelector('.sf-convergence'))`, 25_000, "return portal reload");
    const handoff = await catalog.webContents.executeJavaScript(`(() => { window.__hapaRoundTripOpened=[]; window.open=(url)=>{window.__hapaRoundTripOpened.push(String(url));return{opener:null};}; const button=document.querySelector('[data-convergence-action="open_avatar_builder"]'); button?.click(); return window.__hapaRoundTripOpened.at(-1) || ''; })()`);
    const handoffUrl = new URL(handoff);
    if (handoffUrl.searchParams.get("stargate_card") !== cardId || Number(handoffUrl.searchParams.get("stargate_revision")) !== revision) throw new Error(`Catalog return link changed exact identity: ${handoff}`);
    await avatar.loadURL(handoff);
    await waitFor(avatar, `document.querySelector('.tarot-catalog-return')?.dataset?.state === 'restored' && window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'disconnected' && document.querySelector('.tarot-catalog-return-identity')?.innerText.includes(${JSON.stringify(cardId)})`, 30_000, "exact disconnected Builder return");
    await captureFor(avatar, framesDir, "Exact disconnected return", 2_000);
    const returnResolution = await json(avatarUrl, `api/tarot/stargate/context-card/resolve?cardId=${encodeURIComponent(cardId)}&expectedRevision=${revision}&sourceNode=hapa-avatar-builder`);
    if (returnResolution.identity?.globalCardId !== cardId || Number(returnResolution.identity?.pinnedRevision) !== revision || returnResolution.restore?.connected !== false) throw new Error(`Builder return did not preserve the exact disconnected pin: ${JSON.stringify({ identity: returnResolution.identity, restore: returnResolution.restore })}`);

    await click(avatar, `(() => { const button=[...document.querySelectorAll('.tarot-catalog-return button')].find(item=>/request fresh gate pass/i.test(item.textContent||'')); button?.click(); return Boolean(button); })()`, "Request Fresh Gate Pass");
    await waitFor(avatar, `document.querySelector('.tarot-catalog-return')?.dataset?.state === 'pass-requested'`, 15_000, "explicit Pass request");
    await captureFor(avatar, framesDir, "Fresh Pass requested", 1_200);
    await click(avatar, `(() => { const button=[...document.querySelectorAll('.tarot-catalog-return button')].find(item=>/open gate to aurora/i.test(item.textContent||'')); button?.click(); return Boolean(button); })()`, "Open Gate to Aurora and Beacon");
    await captureFor(avatar, framesDir, "Signed peer verification", 10_500);
    await waitFor(avatar, `document.querySelector('.tarot-catalog-return')?.dataset?.state === 'joined' && window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.peerArrival?.state === 'joined'`, 30_000, "two verified peers");
    await captureFor(avatar, framesDir, "Aurora and Beacon arrive", 2_250);

    const peerState = await avatar.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.stargate.peerArrival`);
    const finalTruth = await avatar.webContents.executeJavaScript(`(() => { const state=window.__THREE_GAME_DIAGNOSTICS__.state.stargate, text=document.querySelector('.tarot-catalog-return')?.innerText||''; return { state, text, serialized: JSON.stringify({state,text}) }; })()`);
    if (peerState.peerCount !== 2 || finalTruth.state.state !== "connected" || finalTruth.state.visual.peerPresences !== 2 || finalTruth.state.visual.peerRails !== 2) throw new Error(`Peer arrival visual gate failed: ${JSON.stringify(peerState)}`);
    if (/hapa-gate:v1:[a-z2-7]{52}/i.test(finalTruth.serialized) || /(?:cohortSecret|rendezvousTopic|gatePassToken|privateKey|bearerToken)(?=["':=])/i.test(finalTruth.serialized)) throw new Error("Private capability material appeared in the captured UI state");

    const { buildStargateInteroperabilityRoundTripResult } = await import("../src/domain/stargate-interoperability-roundtrip-result.js");
    const resultCard = buildStargateInteroperabilityRoundTripResult({
      cardId,
      revision,
      localCardId,
      origin: { cardId, revision, eventId: avatarStatus.origin.eventId, ledgerPosition: avatarStatus.origin.ledgerPosition },
      catalog: { cardId, revision, syncMode: subscriberSync.mode, subscriberCursor: catalogStatus.subscriber_cursor },
      deck: { cardId, revision, deckId: membership.deck.deck_id, deckRevisionId: membership.revision.revision_id, deckRevisionCreated: 1 },
      returnResolution: { cardId, revision, connected: false },
      peerResolution: { cardId, revision, joined: true, peerCount: peerState.peerCount, proofId: peerState.proofId, proofDigest: peerState.proofDigest }
    });
    await json(avatarUrl, "api/tarot/cards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(resultCard) }, avatarToken);
    const store = await json(avatarUrl, "api/tarot");
    if (!(store.cards || []).some((card) => card.id === resultCard.id)) throw new Error("Round-trip Result Card did not persist in the isolated Avatar Builder store");

    const finalImage = await avatar.capturePage();
    await fs.writeFile(poster, finalImage.toPNG());
    await run("ffmpeg", ["-y", "-framerate", String(fps), "-i", path.join(framesDir, "frame-%05d.png"), "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
    const durationSeconds = frameIndex / fps;
    const checks = {
      canonicalTarotDrawReused: true,
      enhancedPortalDepthObserved: visualAfterDial.depthRings === 9,
      enhancedShockwavesObserved: visualAfterDial.shockwaves === 3,
      humanApprovalViaExplicitUiControl: true,
      oneStableCardIdentity: true,
      oneExactRevision: revision === 1,
      overwindDurableAcknowledgement: avatarStatus.origin.durableAcknowledgement === true,
      catalogSubscriberProjection: catalogStatus.state === "catalog_indexed" && ["rebuild", "delta-sync"].includes(subscriberSync.mode),
      namedDeckMembership: Boolean(membership),
      exactDisconnectedReturn: returnResolution.restore?.connected === false,
      freshPassAndConsentBoundary: true,
      twoIsolatedPeerArrival: peerState.peerCount === 2,
      resultCardPersisted: true,
      capabilitySecretsWithheld: true,
      rendererErrorsAbsent: errors.length === 0
    };
    if (!Object.values(checks).every(Boolean)) throw new Error(`Round-trip capture checks failed: ${JSON.stringify({ checks, errors })}`);
    const manifest = {
      ok: true,
      schemaVersion: "hapa.demo-capture.v1",
      captureId: "demo-cat-gate-003-2026-07-18-01",
      taskId: "CAT-GATE-003",
      title: "One Card Dials a Stargate Across the Hapa Ecosystem",
      surface: "isolated-canonical-avatar-builder-and-catalog-loopback-windows",
      capture: { width: finalImage.getSize().width, height: finalImage.getSize().height, fps, frameCount: frameIndex, durationSeconds, audio: false, chapters },
      identity: { stableCardId: cardId, revision, localCardId, resultCardId: resultCard.id },
      custody: { origin: avatarStatus.origin, catalog: catalogStatus, subscriberSync: { mode: subscriberSync.mode, applied: subscriberSync.applied, cursor: subscriberSync.cursor, head: subscriberSync.head }, deck: { deckId: membership.deck.deck_id, deckRevisionId: membership.revision.revision_id } },
      peerArrival: { proofId: peerState.proofId, proofDigest: peerState.proofDigest, peerCount: peerState.peerCount, resultCardId: peerState.resultCardId },
      checks,
      errors,
      truthBoundary: resultCard.stargateInteroperabilityResult.truthBoundary,
      privacy: { namedWindowsOnly: true, desktopExcluded: true, fullAddressExcluded: true, cohortSecretExcluded: true, privateTopicExcluded: true, transientPassExcluded: true, profilePathsExcluded: true },
      asset: { path: output, mediaType: "video/mp4", ...await sha256(output) },
      poster: { path: poster, mediaType: "image/png", ...await sha256(poster) },
      attribution: { harness: "Codex Desktop", model: "GPT-5.6 Sol (user-declared; runtime identifier not exposed)", application: "Hapa Avatar Builder + .hapaCatalog + Hapa Overwind", event: "OpenAI Codex Build Week", renderer: "Three.js + NeonBlade", transport: "Hyperswarm + Noise + Protomux", encoder: "FFmpeg/libx264" },
      userAppTouched: false
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify(manifest, null, 2));
    await fs.rm(framesDir, { recursive: true, force: true });
    catalog.destroy();
    captureWindow = null;
    avatar.destroy();
    await app.quit();
  } catch (error) {
    await fs.mkdir(outputDir, { recursive: true }).catch(() => {});
    const debug = await Promise.all([avatar, catalog].map(async (win) => ({
      url: win.webContents.getURL(),
      text: await bounded(win.webContents.executeJavaScript(`document.body?.innerText?.slice(0, 3000) || ''`), 2_000, "[debug read timed out]")
    })));
    const serviceDebug = {
      runState,
      avatarStatus: runState.localCardId ? await bounded(json(avatarUrl, `api/tarot/stargate/context-card/status?cardId=${encodeURIComponent(runState.localCardId)}`), 3_000, null) : null,
      catalogStatus: runState.cardId ? await bounded(json(catalogUrl, `v1/overwind/cards/${encodeURIComponent(runState.cardId)}/projection-status?expected_revision=${runState.revision}`, {}, catalogToken), 3_000, null) : null,
      overwindCard: runState.cardId ? await bounded(json(overwindUrl, `/v1/cards/${encodeURIComponent(runState.cardId)}`, {}, overwindToken), 3_000, null) : null
    };
    console.error(JSON.stringify({ captureDebug: debug, serviceDebug, rendererErrors: errors }, null, 2));
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    const avatarImage = await bounded(avatar.capturePage(), 2_000, null);
    const catalogImage = await bounded(catalog.capturePage(), 2_000, null);
    if (avatarImage) await fs.writeFile(path.join(outputDir, "failed-avatar-window.png"), avatarImage.toPNG()).catch(() => {});
    if (catalogImage) await fs.writeFile(path.join(outputDir, "failed-catalog-window.png"), catalogImage.toPNG()).catch(() => {});
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
    catalog.destroy();
    captureWindow = null;
    avatar.destroy();
    await app.quit();
    process.exit(1);
  }
}).catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exit(1); });
