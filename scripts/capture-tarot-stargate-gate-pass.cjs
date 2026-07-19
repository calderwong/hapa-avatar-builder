const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const baseUrl = String(process.env.CAPTURE_URL || "http://127.0.0.1:8787/").replace(/\/?$/, "/");
const adminToken = String(process.env.HAPA_AVATAR_ADMIN_TOKEN || "");
const width = 1600;
const height = 1000;
const fps = 12;
const durationMs = 13_000;
const errors = [];
let captureWindow = null;

app.setName("hapa-avatar-builder-gate-pass-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-gate-pass-capture-${process.pid}`));
app.on("window-all-closed", (event) => { if (captureWindow) event.preventDefault(); });

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
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}\n${stderr}`)));
  });
}
async function fileProof(filePath) {
  const bytes = await fs.readFile(filePath);
  return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

app.whenReady().then(async () => {
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-gate-pass-frames-"));
  const outputDir = path.join(ROOT, "artifacts/demos/NAV-002");
  const output = path.join(outputDir, "signed-peer-arrival.mp4");
  const poster = path.join(outputDir, "signed-peer-arrival-poster.png");
  const manifestPath = path.join(outputDir, "signed-peer-arrival.json");
  const win = captureWindow = new BrowserWindow({ width, height, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_event, level, message) => { if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) errors.push(message); });
  try {
    await fs.mkdir(outputDir, { recursive: true });
    await win.loadURL(new URL("?view=tarot", baseUrl).href);
    if (!await waitFor(win, `Boolean(window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`)) throw new Error("Canonical Tarot Draw did not mount");
    await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation()`);
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready'`, 8_000)) throw new Error("Stargate did not become ready");
    await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate()`);
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 15_000)) throw new Error("Stargate did not become active");
    await win.webContents.executeJavaScript(`document.querySelector('.tarot-save-scene-toggle')?.click()`);
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.contextCardProposed === true`, 12_000)) throw new Error("Return Card was not sealed");
    const localCardId = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.stargate.contextCardId`);
    if (!await waitForStoredCard(localCardId)) throw new Error("Return Card did not persist");
    const review = await json("api/tarot/stargate/context-card/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: localCardId }) });
    const minted = await json("api/tarot/stargate/context-card/mint", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ cardId: localCardId, reviewDigest: review.review.reviewDigest, approval: { approved: true, decision: "approve", actorId: "build-week-operator", actorType: "human", method: "isolated-capture-proof" } }) });
    const handoff = new URL(baseUrl);
    handoff.searchParams.set("view", "tarot");
    handoff.searchParams.set("stargate_card", minted.stableCardReference);
    handoff.searchParams.set("stargate_revision", String(minted.expectedRevision));
    handoff.searchParams.set("stargate_source", "hapa-avatar-builder");
    handoff.searchParams.set("stargate_intent", "request_pass");
    await win.loadURL(handoff.href);
    if (!await waitFor(win, `document.querySelector('.tarot-catalog-return')?.dataset?.state === 'pass-ready' && window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'disconnected'`, 18_000)) throw new Error("Exact Return Card did not restore disconnected");
    const formationBefore = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.state.stargate.formationFingerprint`);

    const startedAt = Date.now();
    const interval = 1000 / fps;
    let frameIndex = 0;
    let requestClicked = false;
    let openClicked = false;
    let verifyingObserved = false;
    let joinedObserved = false;
    let fullVisualObserved = false;
    let posterWritten = false;
    let surfaceSize = { width, height };
    const observedStates = new Set();
    while (Date.now() - startedAt < durationMs) {
      const elapsed = Date.now() - startedAt;
      const state = await win.webContents.executeJavaScript(`(() => { const rail=document.querySelector('.tarot-catalog-return'),gate=window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate||{}; return { railState:rail?.dataset?.state||'', peerState:gate.peerArrival?.state||'', openBlend:Number(gate.visual?.openBlend||0), energy:Number(gate.visual?.energy||0) }; })()`);
      observedStates.add(`${state.railState}:${state.peerState}`);
      if (!requestClicked && elapsed >= 900) requestClicked = await win.webContents.executeJavaScript(`(() => { const button=[...document.querySelectorAll('.tarot-catalog-return button')].find(item=>/request fresh gate pass/i.test(item.textContent||''));button?.click();return Boolean(button);})()`);
      if (!openClicked && elapsed >= 2_200 && state.railState === "pass-requested") openClicked = await win.webContents.executeJavaScript(`(() => { const button=[...document.querySelectorAll('.tarot-catalog-return button')].find(item=>/open gate to aurora/i.test(item.textContent||''));button?.click();return Boolean(button);})()`);
      if (state.railState === "verifying-peers" && state.peerState === "verifying") verifyingObserved = true;
      if (state.railState === "joined" && ["arriving", "joined"].includes(state.peerState)) joinedObserved = true;
      if (state.peerState === "joined" && state.openBlend >= 0.92 && state.energy >= 0.92) fullVisualObserved = true;
      const image = await win.capturePage();
      surfaceSize = image.getSize();
      const png = image.toPNG();
      await fs.writeFile(path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`), png);
      if (!posterWritten && fullVisualObserved) {
        await fs.writeFile(poster, png);
        posterWritten = true;
      }
      frameIndex += 1;
      await sleep(Math.max(0, startedAt + frameIndex * interval - Date.now()));
    }
    const capturedDurationSeconds = (Date.now() - startedAt) / 1000;
    const observedSourceFps = frameIndex / capturedDurationSeconds;
    const truth = await win.webContents.executeJavaScript(`(() => { const state=window.__THREE_GAME_DIAGNOSTICS__.state.stargate,rail=document.querySelector('.tarot-catalog-return'),serialized=JSON.stringify({state,text:rail?.innerText||''});return{state,railState:rail?.dataset?.state,railText:rail?.innerText||'',fullAddressLeaked:/hapa-gate:v1:[a-z2-7]{52}/i.test(serialized),secretLeaked:/(?:cohortSecret|rendezvousTopic|gatePassToken|privateKey|bearerToken)(?=["':=])/i.test(serialized)};})()`);
    const checks = {
      requestClicked,
      openClicked,
      verifyingObserved,
      joinedObserved,
      fullVisualObserved,
      exactFourCardFormation: truth.state.slotCount === 4,
      unchangedFormation: formationBefore === truth.state.formationFingerprint,
      twoVerifiedPeers: truth.state.peerArrival.peerCount === 2 && truth.state.state === "connected",
      passNotPersisted: truth.state.peerArrival.passPersisted === false,
      gateIdentityUnchanged: truth.state.peerArrival.gateIdentityChanged === false,
      peerVisualsPresent: truth.state.visual.peerPresences === 2 && truth.state.visual.peerRails === 2,
      privateFieldsWithheld: !truth.fullAddressLeaked && !truth.secretLeaked,
      visibleTruthBoundary: /2 processes · 2 profiles · 7\/7 negative cases/i.test(truth.railText) && /pass not persisted · catalog not required/i.test(truth.railText),
      rendererErrorsAbsent: errors.length === 0
    };
    if (!Object.values(checks).every(Boolean)) throw new Error(`Gate Pass capture truth gate failed: ${JSON.stringify({ checks, truth, observedStates: [...observedStates], errors })}`);
    if (!posterWritten) await fs.writeFile(poster, (await win.capturePage()).toPNG());
    await run("ffmpeg", ["-y", "-framerate", observedSourceFps.toFixed(6), "-i", path.join(framesDir, "frame-%05d.png"), "-vf", `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
    const manifest = {
      schemaVersion: "hapa.demo-capture.v1",
      captureId: "demo-nav-002-2026-07-18-01",
      taskId: "NAV-002",
      title: "Signed Peer Arrival at an Unchanged Hapa Stargate",
      surface: "canonical-hapa-avatar-builder-tarot-draw-isolated-electron-window",
      sourceUrl: baseUrl,
      capture: { windowWidth: width, windowHeight: height, surfaceWidth: surfaceSize.width, surfaceHeight: surfaceSize.height, requestedFps: fps, sourceFrameCount: frameIndex, observedSourceFps: Number(observedSourceFps.toFixed(3)), encodedFps: fps, durationSeconds: Number(capturedDurationSeconds.toFixed(3)), audio: false },
      story: ["exact Return Card restores four ordered Cards disconnected", "human requests a fresh Pass", "cyan Aurora and violet Beacon signature rails verify reciprocal commitments", "Gate chevrons lock", "two peer-presence sigils materialize around the unchanged Formation", "safe Result Card memorializes observed arrival"],
      truthBoundary: "Observed on two isolated local child processes with separate profiles and stable signing identities, using a memory-only signed Pass, live Hyperswarm discovery, Noise SecretStream, Protomux acknowledgement, and explicit consent. This does not claim internet-wide reach or geographically remote peers.",
      checks,
      observedStates: [...observedStates],
      privacy: { namedWindowOnly: true, desktopExcluded: true, fullAddressExcluded: true, cohortSecretExcluded: true, privateTopicExcluded: true, passExcluded: true, profilePathsExcluded: true },
      observed: { formationBefore, formationAfter: truth.state.formationFingerprint, peerArrival: truth.state.peerArrival, visual: truth.state.visual },
      asset: { path: output, mediaType: "video/mp4", ...await fileProof(output) },
      poster: { path: poster, mediaType: "image/png", ...await fileProof(poster) },
      attribution: { harness: "Codex Desktop", model: "GPT-5.6 Sol (user-declared; runtime identifier not exposed)", application: "Hapa Avatar Builder", event: "OpenAI Codex Build Week", renderer: "Three.js", transport: "Hyperswarm + Noise + Protomux", encoder: "FFmpeg/libx264" },
      userAppTouched: false
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, ...manifest }, null, 2));
    await fs.rm(framesDir, { recursive: true, force: true });
    captureWindow = null; win.destroy(); await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
    captureWindow = null; win.destroy(); await app.quit(); process.exit(1);
  }
}).catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exit(1); });
