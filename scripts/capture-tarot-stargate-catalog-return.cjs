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
const durationMs = 9800;
const errors = [];
let captureWindow = null;
let keepAliveTimer = null;

app.setName("hapa-avatar-builder-catalog-return-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-catalog-return-capture-${process.pid}`));
app.on("window-all-closed", (event) => { if (captureWindow) event.preventDefault(); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(win, expression, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await win.webContents.executeJavaScript(expression)) return true;
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
async function sha256(filePath) {
  const bytes = await fs.readFile(filePath);
  return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

app.whenReady().then(async () => {
  keepAliveTimer = setInterval(() => {}, 1000);
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-catalog-return-frames-"));
  const outputDir = path.join(ROOT, "artifacts/demos/CAT-GATE-002");
  const output = path.join(outputDir, "catalog-convergence-return.mp4");
  const poster = path.join(outputDir, "catalog-convergence-return-poster.png");
  const manifestPath = path.join(outputDir, "catalog-convergence-return.json");
  const win = captureWindow = new BrowserWindow({ width, height, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_event, level, message) => { if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) errors.push(message); });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`[Load Failure] ${code}: ${description} (${url})`));
  try {
    await fs.mkdir(outputDir, { recursive: true });
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
    if (!minted.stableCardReference || !minted.expectedRevision) throw new Error("Mint did not produce a stable exact Card identity");

    const handoff = new URL(baseUrl);
    handoff.searchParams.set("view", "tarot");
    handoff.searchParams.set("stargate_card", minted.stableCardReference);
    handoff.searchParams.set("stargate_revision", String(minted.expectedRevision));
    handoff.searchParams.set("stargate_source", "hapa-avatar-builder");
    handoff.searchParams.set("stargate_intent", "restore_disconnected");
    await win.loadURL(handoff.href);

    const startedAt = Date.now();
    const interval = 1000 / fps;
    let frameIndex = 0;
    let restoredObserved = false;
    let restoredFrames = 0;
    let requestClicked = false;
    let passRequestedObserved = false;
    let posterWritten = false;
    let surfaceSize = { width, height };
    while (Date.now() - startedAt < durationMs) {
      const elapsed = Date.now() - startedAt;
      const observed = await win.webContents.executeJavaScript(`(() => { const rail=document.querySelector('.tarot-catalog-return'); return { railState:rail?.dataset?.state||'', stargateState:window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state||'', slotCount:Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.slotCount||0), requestAvailable:[...document.querySelectorAll('.tarot-catalog-return button')].some(item=>/request fresh gate pass/i.test(item.textContent||'')) }; })()`);
      if (observed.railState === "restored" && observed.stargateState === "disconnected" && observed.slotCount === 4) {
        restoredObserved = true;
        restoredFrames += 1;
      }
      if (!requestClicked && restoredObserved && restoredFrames >= 28 && elapsed >= 4700) {
        requestClicked = await win.webContents.executeJavaScript(`(() => { const button=[...document.querySelectorAll('.tarot-catalog-return button')].find(item=>/request fresh gate pass/i.test(item.textContent||''));button?.click();return Boolean(button);})()`);
      }
      if (observed.railState === "pass-requested") passRequestedObserved = true;
      const image = await win.capturePage();
      surfaceSize = image.getSize();
      const png = image.toPNG();
      await fs.writeFile(path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`), png);
      if (!posterWritten && restoredObserved && restoredFrames >= 18) {
        await fs.writeFile(poster, png);
        posterWritten = true;
      }
      frameIndex += 1;
      await sleep(Math.max(0, startedAt + frameIndex * interval - Date.now()));
    }
    const capturedDurationSeconds = (Date.now() - startedAt) / 1000;
    const observedSourceFps = frameIndex / capturedDurationSeconds;
    const truth = await win.webContents.executeJavaScript(`(() => { const state=window.__THREE_GAME_DIAGNOSTICS__?.state||{},rail=document.querySelector('.tarot-catalog-return'),serialized=JSON.stringify({state,text:rail?.innerText||''});return{stargate:state.stargate,railState:rail?.dataset?.state,railText:rail?.innerText||'',joinDisabled:[...rail.querySelectorAll('button')].find(item=>/join stargate/i.test(item.textContent||''))?.disabled===true,fullAddressLeaked:/hapa-gate:v1:[a-z2-7]{52}/i.test(serialized),secretLeaked:/(?:cohortSecret|rendezvousTopic|invitationToken|privateKey|bearerToken)(?=[\"':=])/i.test(serialized)};})()`);
    if (!restoredObserved || !requestClicked || !passRequestedObserved || truth.stargate.state !== "disconnected" || truth.stargate.slotCount !== 4 || !truth.stargate.requiresFreshPass || truth.railState !== "pass-requested" || !truth.joinDisabled || truth.fullAddressLeaked || truth.secretLeaked) throw new Error(`Catalog return capture truth gate failed: ${JSON.stringify({ restoredObserved, requestClicked, passRequestedObserved, truth })}`);
    if (!/waiting for a peer-issued pass/i.test(truth.railText)) throw new Error("Transient Pass boundary is not visible in the capture");
    if (errors.length) throw new Error(`Renderer console errors:\n${errors.join("\n")}`);
    if (!posterWritten) await fs.writeFile(poster, (await win.capturePage()).toPNG());
    await run("ffmpeg", ["-y", "-framerate", observedSourceFps.toFixed(6), "-i", path.join(framesDir, "frame-%05d.png"), "-vf", `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
    const manifest = {
      schemaVersion: "hapa.demo-capture.v1",
      captureId: "demo-cat-gate-002-2026-07-18-01",
      taskId: "CAT-GATE-002",
      title: "Catalog Convergence Return",
      surface: "canonical-hapa-avatar-builder-tarot-draw-isolated-electron-window",
      sourceUrl: baseUrl,
      capture: { windowWidth: width, windowHeight: height, surfaceWidth: surfaceSize.width, surfaceHeight: surfaceSize.height, requestedFps: fps, sourceFrameCount: frameIndex, observedSourceFps: Number(observedSourceFps.toFixed(3)), encodedFps: fps, durationSeconds: Number(capturedDurationSeconds.toFixed(3)), audio: false },
      story: ["Catalog handoff resolves", "exact pinned Return Card arrives through the 3D Gate", "four-Card Formation rebuilds disconnected", "custody and pin become legible", "human requests a fresh Gate Pass", "Join remains locked while the node waits"],
      truthBoundary: "The visual uses isolated deterministic Overwind/Catalog acknowledgement fixtures. It proves exact disconnected reconstruction and transient Pass-request staging; it does not claim a peer-issued Pass, live rendezvous, or second-node arrival.",
      privacy: { namedWindowOnly: true, desktopExcluded: true, fullAddressExcluded: true, cohortSecretExcluded: true, privateTopicExcluded: true, passExcluded: true },
      observed: truth,
      asset: { path: output, mediaType: "video/mp4", ...await sha256(output) },
      poster: { path: poster, mediaType: "image/png", ...await sha256(poster) },
      attribution: { harness: "Codex Desktop", model: "GPT-5.6 Sol (user-declared; runtime identifier not exposed)", application: "Hapa Avatar Builder", event: "OpenAI Codex Build Week", renderer: "Three.js", encoder: "FFmpeg/libx264" },
      userAppTouched: false
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, ...manifest }, null, 2));
    await fs.rm(framesDir, { recursive: true, force: true });
    clearInterval(keepAliveTimer); keepAliveTimer = null; captureWindow = null; win.destroy(); await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    if (errors.length) console.error(errors.join("\n"));
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
    clearInterval(keepAliveTimer); keepAliveTimer = null; captureWindow = null; win.destroy(); await app.quit(); process.exit(1);
  }
}).catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exit(1); });
