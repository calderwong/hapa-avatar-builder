const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const targetUrl = process.env.CAPTURE_URL || "http://127.0.0.1:8787/";
const width = 1600;
const height = 900;
const fps = 12;
const durationMs = 13600;
const errors = [];
let captureWindow = null;
let keepAliveTimer = null;

app.setName("hapa-avatar-builder-stargate-context-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-stargate-context-capture-${process.pid}`));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(win, expression, timeout = 30000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await win.webContents.executeJavaScript(expression)) return true; await sleep(100); } return false; }
function run(command, args) { return new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); let stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk; }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}\n${stderr}`))); }); }
async function sha256(filePath) { const bytes = await fs.readFile(filePath); return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") }; }
app.on("window-all-closed", (event) => { if (captureWindow) event.preventDefault(); });

app.whenReady().then(async () => {
  keepAliveTimer = setInterval(() => {}, 1000);
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-stargate-context-frames-"));
  const outputDir = path.join(ROOT, "artifacts/demos/NAV-001");
  const output = path.join(outputDir, "gate-becomes-a-card.mp4");
  const poster = path.join(outputDir, "gate-becomes-a-card-poster.png");
  const manifestPath = path.join(outputDir, "gate-becomes-a-card.json");
  const win = captureWindow = new BrowserWindow({ width, height, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_event, level, message) => { if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) errors.push(message); });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`[Load Failure] ${code}: ${description} (${url})`));
  try {
    await fs.mkdir(outputDir, { recursive: true });
    await win.loadURL(targetUrl);
    if (!await waitFor(win, "Boolean(document.querySelector('.view-tabs button'))")) throw new Error("Avatar Builder tabs did not mount");
    const clicked = await win.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.view-tabs button')].find((item) => /tarot draw/i.test(item.textContent || '')); button?.click(); return Boolean(button); })()`);
    if (!clicked || !await waitFor(win, `Boolean(document.querySelector('.tarot-draw-view canvas') && window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`)) throw new Error("Canonical Tarot Draw did not mount");
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 0`)) throw new Error("Tarot deck did not become ready");
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation())`)) throw new Error("Public Stargate demo could not stage");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready'`, 8000)) throw new Error("Stargate did not become ready");
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate())`)) throw new Error("Public Stargate demo could not dial");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 15000)) throw new Error("Stargate did not become active");
    if (!await waitFor(win, `/save gate/i.test(document.querySelector('.tarot-save-scene-toggle')?.textContent || '')`, 4000)) throw new Error("Save Gate UI did not catch up with the active Gate");

    const startedAt = Date.now();
    const interval = 1000 / fps;
    let saveClicked = false;
    let restoreRequested = false;
    let frameIndex = 0;
    let surfaceSize = { width, height };
    while (Date.now() - startedAt < durationMs) {
      const elapsed = Date.now() - startedAt;
      if (!saveClicked && elapsed >= 1500) {
        saveClicked = await win.webContents.executeJavaScript(`(() => { const button = document.querySelector('.tarot-save-scene-toggle'); if (!button || !/save gate/i.test(button.textContent || '')) return false; button.click(); return true; })()`);
        if (!saveClicked) throw new Error("Save Gate action was unavailable during capture");
      }
      if (!restoreRequested && elapsed >= 7700) {
        if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.contextCardProposed === true`, 6000)) throw new Error("Context Card was not ready for restore during capture");
        restoreRequested = await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.restoreStargateContextCard())`);
        if (!restoreRequested) throw new Error("Context Card restore action failed during capture");
      }
      const image = await win.capturePage();
      surfaceSize = image.getSize();
      await fs.writeFile(path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`), image.toPNG());
      frameIndex += 1;
      await sleep(Math.max(0, startedAt + frameIndex * interval - Date.now()));
    }
    const capturedDurationSeconds = (Date.now() - startedAt) / 1000;
    const observedSourceFps = frameIndex / capturedDurationSeconds;
    const truth = await win.webContents.executeJavaScript(`(() => { const state = window.__THREE_GAME_DIAGNOSTICS__?.state || {}; const serialized = JSON.stringify({ state, text: document.querySelector('.tarot-draw-view')?.innerText || '' }); return { state: state.stargate?.state, slotCount: state.stargate?.slotCount, sealedCount: state.stargate?.sealedCount, contextCardId: state.stargate?.contextCardId, contextCardProposed: state.stargate?.contextCardProposed, contextRestoreLocked: state.stargate?.contextRestoreLocked, contextDigest: state.stargate?.contextDigest, derivationObserved: state.stargate?.derivationObserved, privateTopicWithheld: state.stargate?.privateTopicWithheld, cohortSecretWithheld: state.stargate?.cohortSecretWithheld, fullAddressLeaked: /hapa-gate:v1:[a-z2-7]{52}/i.test(serialized), publicSecretLeaked: serialized.includes('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'), freshPassVisible: /fresh gate pass required/i.test(document.querySelector('.tarot-stargate-status')?.innerText || '') }; })()`);
    if (truth.state !== "disconnected" || truth.slotCount !== 4 || truth.sealedCount !== 4 || !truth.contextCardProposed || !truth.contextRestoreLocked || !truth.contextDigest || truth.derivationObserved || !truth.privateTopicWithheld || !truth.cohortSecretWithheld || truth.fullAddressLeaked || truth.publicSecretLeaked || !truth.freshPassVisible) throw new Error(`Capture truth gate failed: ${JSON.stringify(truth)}`);
    if (errors.length) throw new Error(`Renderer console errors:\n${errors.join("\n")}`);
    await fs.writeFile(poster, (await win.capturePage()).toPNG());
    await run("ffmpeg", ["-y", "-framerate", observedSourceFps.toFixed(6), "-i", path.join(framesDir, "frame-%05d.png"), "-vf", `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
    const manifest = {
      schemaVersion: "hapa.demo-capture.v1",
      captureId: "demo-nav-001-2026-07-18-01",
      taskId: "NAV-001",
      title: "Gate Becomes a Card",
      surface: "canonical-hapa-avatar-builder-tarot-draw-isolated-electron-window",
      sourceUrl: targetUrl,
      capture: { windowWidth: width, windowHeight: height, surfaceWidth: surfaceSize.width, surfaceHeight: surfaceSize.height, requestedFps: fps, sourceFrameCount: frameIndex, observedSourceFps: Number(observedSourceFps.toFixed(3)), encodedFps: fps, durationSeconds: Number(capturedDurationSeconds.toFixed(3)), timingPolicy: "Observed scoped-capture cadence normalized to 12 fps; no capability steps are omitted or invented.", audio: false },
      story: ["active four-Card Gate", "reverse-energy seal", "event horizon collapses", "physical Context Card deals from aperture", "Context Card restores exact ordered Formation", "fresh Pass required remains visible"],
      truthBoundary: "Shows a proposed, unminted, safe durable Context Card and disconnected scene/Formation restore. It does not claim Catalog indexing, human mint, live peer discovery, or reconnection.",
      privacy: { namedWindowOnly: true, desktopExcluded: true, fullAddressExcluded: true, cohortSecretExcluded: true, privateTopicExcluded: true },
      observed: truth,
      asset: { path: output, mediaType: "video/mp4", ...await sha256(output) },
      poster: { path: poster, mediaType: "image/png", ...await sha256(poster) },
      attribution: { harness: "Codex Desktop", model: "GPT-5.6 Sol (user-declared; runtime identifier not exposed)", application: "Hapa Avatar Builder", event: "OpenAI Codex Build Week", renderer: "Three.js", encoder: "FFmpeg/libx264" }
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, ...manifest }, null, 2));
    await fs.rm(framesDir, { recursive: true });
    clearInterval(keepAliveTimer); keepAliveTimer = null; captureWindow = null; win.destroy(); await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    if (errors.length) console.error(errors.join("\n"));
    await fs.rm(framesDir, { recursive: true }).catch(() => {});
    clearInterval(keepAliveTimer); keepAliveTimer = null; captureWindow = null; win.destroy(); await app.quit(); process.exit(1);
  }
}).catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exit(1); });
