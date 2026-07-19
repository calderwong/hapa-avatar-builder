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
const durationMs = 10800;
const errors = [];
let captureWindow = null;
let keepAliveTimer = null;

app.setName("hapa-avatar-builder-stargate-hero-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-stargate-capture-${process.pid}`));

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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} exited ${code}\n${stderr}`)));
  });
}

async function sha256(filePath) {
  const bytes = await fs.readFile(filePath);
  return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

app.on("window-all-closed", (event) => {
  if (captureWindow) event.preventDefault();
});

app.whenReady().then(async () => {
  keepAliveTimer = setInterval(() => {}, 1000);
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-stargate-hero-frames-"));
  const outputDir = path.join(ROOT, "artifacts/demos/UI3D-001");
  const output = path.join(outputDir, "tarot-stargate-hero-progression.mp4");
  const poster = path.join(outputDir, "tarot-stargate-hero-poster.png");
  const manifestPath = path.join(outputDir, "tarot-stargate-hero-progression.json");
  const win = captureWindow = new BrowserWindow({
    width,
    height,
    show: false,
    backgroundColor: "#020617",
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) errors.push(message);
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`[Load Failure] ${code}: ${description} (${url})`));
  try {
    await fs.mkdir(outputDir, { recursive: true });
    await win.loadURL(targetUrl);
    if (!await waitFor(win, "Boolean(document.querySelector('.view-tabs button'))")) throw new Error("Avatar Builder tabs did not mount");
    const clicked = await win.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll('.view-tabs button')].find((item) => /tarot draw/i.test(item.textContent || ''));
        button?.click();
        return Boolean(button);
      })()
    `);
    if (!clicked || !await waitFor(win, `Boolean(document.querySelector('.tarot-draw-view canvas') && window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`)) {
      throw new Error("Canonical Tarot Draw did not mount");
    }
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 0`)) throw new Error("Tarot deck did not become ready");

    const startedAt = Date.now();
    const frameIntervalMs = 1000 / fps;
    let loaded = false;
    let dialed = false;
    let frameIndex = 0;
    let surfaceSize = { width, height };
    while (Date.now() - startedAt < durationMs) {
      const elapsed = Date.now() - startedAt;
      if (!loaded && elapsed >= 900) {
        loaded = await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation())`);
        if (!loaded) throw new Error("Public Stargate formation could not be staged");
      }
      if (!dialed && elapsed >= 2800) {
        if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready'`, 4000)) throw new Error("Stargate did not reach Ready during capture");
        dialed = await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate())`);
        if (!dialed) throw new Error("Stargate could not begin Dialing during capture");
      }
      const image = await win.capturePage();
      surfaceSize = image.getSize();
      const framePath = path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`);
      await fs.writeFile(framePath, image.toPNG());
      frameIndex += 1;
      const nextFrameAt = startedAt + frameIndex * frameIntervalMs;
      await sleep(Math.max(0, nextFrameAt - Date.now()));
    }
    const capturedDurationSeconds = (Date.now() - startedAt) / 1000;
    const observedSourceFps = frameIndex / capturedDurationSeconds;

    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 3000)) throw new Error("Stargate never reached Active during capture");
    const truth = await win.webContents.executeJavaScript(`
      (() => {
        const state = window.__THREE_GAME_DIAGNOSTICS__?.state || {};
        const serialized = JSON.stringify({ state, text: document.querySelector('.tarot-draw-view')?.innerText || '' });
        return {
          state: state.stargate?.state,
          redactedAddress: state.stargate?.redactedAddress,
          slotCount: state.stargate?.slotCount,
          sealedCount: state.stargate?.sealedCount,
          derivationObserved: state.stargate?.derivationObserved,
          privateTopicWithheld: state.stargate?.privateTopicWithheld,
          cohortSecretWithheld: state.stargate?.cohortSecretWithheld,
          fullAddressLeaked: serialized.includes('hapa-gate:v1:72eeamh2g3mxe2jbnww44f4wbvrgl4o3od242ikj6mpmv3wn2gnq'),
          publicSecretLeaked: serialized.includes('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8')
        };
      })()
    `);
    if (truth.state !== "active" || truth.slotCount !== 4 || truth.sealedCount !== 4 || !truth.derivationObserved || !truth.privateTopicWithheld || !truth.cohortSecretWithheld || truth.fullAddressLeaked || truth.publicSecretLeaked) {
      throw new Error(`Capture truth gate failed: ${JSON.stringify(truth)}`);
    }
    if (errors.length) throw new Error(`Renderer console errors:\n${errors.join("\n")}`);
    const posterImage = await win.capturePage();
    await fs.writeFile(poster, posterImage.toPNG());

    await run("ffmpeg", [
      "-y",
      "-framerate", observedSourceFps.toFixed(6),
      "-i", path.join(framesDir, "frame-%05d.png"),
      "-vf", `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      output
    ]);
    const outputDigest = await sha256(output);
    const posterDigest = await sha256(poster);
    const manifest = {
      schemaVersion: "hapa.demo-capture.v1",
      captureId: "demo-ui3d-001-stargate-hero-2026-07-18-01",
      taskId: "UI3D-001",
      title: "Cards Become Coordinates",
      surface: "canonical-hapa-avatar-builder-tarot-draw-isolated-electron-window",
      sourceUrl: targetUrl,
      capture: {
        windowWidth: width,
        windowHeight: height,
        surfaceWidth: surfaceSize.width,
        surfaceHeight: surfaceSize.height,
        requestedFps: fps,
        sourceFrameCount: frameIndex,
        observedSourceFps: Number(observedSourceFps.toFixed(3)),
        encodedFps: fps,
        durationSeconds: Number(capturedDurationSeconds.toFixed(3)),
        timingPolicy: "Observed scoped-capture cadence normalized to 12 fps by frame duplication; no capability steps are omitted or invented.",
        audio: false
      },
      story: ["ordinary Tarot table", "four public test Cards stage in ordered slots", "mechanical aperture dials", "event horizon opens"],
      truthBoundary: "Shows canonical in-app Card staging, deterministic local derivation, privacy-safe state, and authored Stargate visual response only. It does not claim remote peer discovery, handshake, mint, provider execution, public discovery, or media transfer.",
      fixtureDisclosure: "Public deterministic test vector — not a production invitation.",
      privacy: { namedWindowOnly: true, desktopExcluded: true, fullAddressExcluded: true, cohortSecretExcluded: true, privateTopicExcluded: true },
      observed: truth,
      asset: { path: output, mediaType: "video/mp4", ...outputDigest },
      poster: { path: poster, mediaType: "image/png", ...posterDigest },
      attribution: {
        harness: "Codex Desktop",
        model: "GPT-5.6 Sol (user-declared; runtime identifier not exposed)",
        application: "Hapa Avatar Builder",
        event: "OpenAI Codex Build Week",
        renderer: "Three.js",
        encoder: "FFmpeg/libx264"
      }
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, ...manifest }, null, 2));
    await fs.rm(framesDir, { recursive: true });
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    captureWindow = null;
    win.destroy();
    await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    if (errors.length) console.error(errors.join("\n"));
    await fs.rm(framesDir, { recursive: true }).catch(() => {});
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    captureWindow = null;
    win.destroy();
    await app.quit();
    process.exit(1);
  }
}).catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
