const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const baseUrl = String(process.env.CAPTURE_URL || "http://127.0.0.1:8787/").replace(/\/?$/, "/");
const width = 1600;
const height = 1000;
const fps = 12;
const captureDurationMs = 16_000;
const errors = [];
let captureWindow = null;

app.setName("hapa-avatar-builder-spatial-truth-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-spatial-truth-capture-${process.pid}`));
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
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-spatial-truth-frames-"));
  const outputDir = path.join(ROOT, "artifacts/demos/UI3D-003");
  const output = path.join(outputDir, "tarot-spatial-truth-constellation.mp4");
  const poster = path.join(outputDir, "tarot-spatial-truth-constellation-poster.png");
  const manifestPath = path.join(outputDir, "tarot-spatial-truth-constellation.json");
  const win = captureWindow = new BrowserWindow({ width, height, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_event, level, message) => { if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer|Failed to load resource.*404/.test(message)) errors.push(message); });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`[Load Failure] ${code}: ${description} (${url})`));
  try {
    await fs.mkdir(outputDir, { recursive: true });
    await win.loadURL(new URL("?view=tarot", baseUrl).href);
    if (!await waitFor(win, `Boolean(window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`)) throw new Error("Canonical Tarot Draw did not mount");
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 0`)) throw new Error("Tarot deck did not become ready");
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation())`)) throw new Error("Public Stargate Formation could not stage");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready'`, 8_000)) throw new Error("Stargate did not become ready");
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate())`)) throw new Error("Stargate could not dial");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 15_000)) throw new Error("Stargate did not become active");

    const startedAt = Date.now();
    const interval = 1000 / fps;
    let frameIndex = 0;
    let showcaseStarted = false;
    let constellationComplete = false;
    let posterWritten = false;
    let surfaceSize = { width, height };
    while (Date.now() - startedAt < captureDurationMs) {
      const elapsed = Date.now() - startedAt;
      if (!showcaseStarted && elapsed >= 1_300) showcaseStarted = await win.webContents.executeJavaScript(`(() => { window.__THREE_GAME_DIAGNOSTICS__.actions.playSpatialTruthShowcase({ intervalMs: 430 }); return true; })()`);
      const truth = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__?.state?.spatialTruth || {}`);
      constellationComplete = truth.accepted === 10 && truth.resultCard?.accepted === 10 && truth.resultCard?.rejected === 1;
      const image = await win.capturePage();
      surfaceSize = image.getSize();
      const png = image.toPNG();
      await fs.writeFile(path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`), png);
      if (!posterWritten && constellationComplete && elapsed >= 9_200) { await fs.writeFile(poster, png); posterWritten = true; }
      frameIndex += 1;
      await sleep(Math.max(0, startedAt + frameIndex * interval - Date.now()));
    }
    const capturedDurationSeconds = (Date.now() - startedAt) / 1000;
    const observedSourceFps = frameIndex / capturedDurationSeconds;
    const truth = await win.webContents.executeJavaScript(`(() => { const state=window.__THREE_GAME_DIAGNOSTICS__?.state||{};const text=document.querySelector('.tarot-spatial-truth-status')?.innerText||'';const serialized=JSON.stringify({state:state.spatialTruth,text});return{gate:state.stargate,spatial:state.spatialTruth,text,fullAddressLeaked:/hapa-gate:v1:[a-z2-7]{52}/i.test(serialized),secretLeaked:/(?:cohortSecret|rendezvousTopic|privateKey|bearerToken)(?=["':=])/i.test(serialized)};})()`);
    const families = new Set((truth.spatial.receipts || []).map((receipt) => receipt.family));
    const checks = {
      showcaseStarted,
      constellationComplete,
      exactFourCardGate: truth.gate.state === "active" && truth.gate.slotCount === 4 && truth.gate.sealedCount === 4,
      tenVerifiedFamilies: truth.spatial.accepted === 10 && families.size === 10,
      oneRejectedStayedDark: truth.spatial.rejected === 1 && truth.spatial.visualCueCount === 10,
      resultCardPressed: truth.spatial.resultCard?.accepted === 10 && truth.spatial.resultCard?.rejected === 1,
      resultCardUnminted: truth.spatial.resultCard?.truthState === "proposed_unminted",
      fixtureDisclosed: truth.spatial.publicFixture === true && /public deterministic showcase/i.test(truth.text),
      projectionBoundaryVisible: /not live provider, network, council, or mint evidence/i.test(truth.text),
      privateFieldsWithheld: !truth.fullAddressLeaked && !truth.secretLeaked,
      rendererErrorsAbsent: errors.length === 0
    };
    if (!Object.values(checks).every(Boolean)) throw new Error(`Spatial Truth capture gate failed: ${JSON.stringify({ checks, truth, errors })}`);
    if (!posterWritten) await fs.writeFile(poster, (await win.capturePage()).toPNG());
    await run("ffmpeg", ["-y", "-framerate", observedSourceFps.toFixed(6), "-i", path.join(framesDir, "frame-%05d.png"), "-vf", `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
    const manifest = {
      schemaVersion: "hapa.demo-capture.v1", captureId: "demo-ui3d-003-spatial-truth-2026-07-18-01", taskId: "UI3D-003", title: "Verified Events Become a Stargate Truth Constellation",
      surface: "canonical-hapa-avatar-builder-tarot-draw-isolated-electron-window", sourceUrl: baseUrl,
      capture: { windowWidth: width, windowHeight: height, surfaceWidth: surfaceSize.width, surfaceHeight: surfaceSize.height, requestedFps: fps, sourceFrameCount: frameIndex, observedSourceFps: Number(observedSourceFps.toFixed(3)), encodedFps: fps, durationSeconds: Number(capturedDurationSeconds.toFixed(3)), audio: false },
      story: ["active four-Card Stargate", "one unverified mint attempt stays dark", "ten verified event receipts ignite distinct spatial sigils", "commitment packets travel into the event horizon", "a proposed Spatial Truth Result Card records accepted and rejected events"],
      truthBoundary: "Observed with public deterministic showcase receipts in an isolated canonical Avatar Builder window. This proves the visual subscriber admits only the tested verified event envelope and withholds the tested unverified event. It does not prove live provider, physical-device, broader-network, council reasoning, human mint, or real build-board ingestion.",
      checks,
      observed: { accepted: truth.spatial.accepted, rejected: truth.spatial.rejected, families: [...families], resultCardId: truth.spatial.resultCard?.id, resultDigest: truth.spatial.resultCard?.recordDigest, eventCommitments: truth.spatial.eventCommitments },
      privacy: { namedWindowOnly: true, desktopExcluded: true, fullAddressExcluded: true, cohortSecretExcluded: true, privateTopicExcluded: true },
      asset: { path: output, mediaType: "video/mp4", ...await fileProof(output) }, poster: { path: poster, mediaType: "image/png", ...await fileProof(poster) },
      attribution: { harness: "Codex Desktop", model: "GPT-5.6 Sol (user-declared; runtime identifier not exposed)", application: "Hapa Avatar Builder", event: "OpenAI Codex Build Week", renderer: "Three.js", encoder: "FFmpeg/libx264" }, userAppTouched: false
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, manifestPath, output, poster, checks }, null, 2));
    await fs.rm(framesDir, { recursive: true, force: true });
    captureWindow = null; win.destroy(); await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
    captureWindow = null; win.destroy(); await app.quit(); process.exit(1);
  }
}).catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exit(1); });
