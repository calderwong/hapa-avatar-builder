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
const durationMs = 13_600;
const errors = [];
let captureWindow = null;
let keepAliveTimer = null;

app.setName("hapa-avatar-builder-card-custody-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-card-custody-capture-${process.pid}`));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(win, expression, timeout = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await win.webContents.executeJavaScript(expression)) return true;
    await sleep(100);
  }
  return false;
}
function run(command, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
      const force = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2_000);
      force.unref();
    }, timeoutMs);
    timeout.unref();
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}\n${stderr}`));
    });
  });
}
async function sha256(filePath) {
  const bytes = await fs.readFile(filePath);
  return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

app.on("window-all-closed", (event) => { if (captureWindow) event.preventDefault(); });
app.whenReady().then(async () => {
  keepAliveTimer = setInterval(() => {}, 1_000);
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-card-custody-frames-"));
  const outputDir = path.join(ROOT, "artifacts/demos/SUB-004");
  const output = path.join(outputDir, "ordinary-cards-become-stargate-coordinates.mp4");
  const poster = path.join(outputDir, "ordinary-cards-become-stargate-coordinates-poster.png");
  const manifestPath = path.join(outputDir, "ordinary-cards-become-stargate-coordinates.json");
  const win = captureWindow = new BrowserWindow({
    width,
    height,
    show: false,
    backgroundColor: "#020617",
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  win.webContents.on("console-message", (_event, detail, legacyMessage) => {
    const level = typeof detail === "object" ? detail.level : detail;
    const message = typeof detail === "object" ? detail.message : legacyMessage;
    if ((level === "error" || Number(level) >= 3) && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message || "")) errors.push(message || "renderer console error");
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`[Load Failure] ${code}: ${description} (${url})`));
  try {
    await fs.mkdir(outputDir, { recursive: true });
    await win.loadURL(new URL("?view=tarot&stargateDemo=1", targetUrl).href);
    if (!await waitFor(win, `Boolean(document.querySelector('.tarot-draw-view canvas') && window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`, 40_000)) {
      const diagnostic = await win.webContents.executeJavaScript(`({ href: location.href, body: document.body?.innerText?.slice(0, 3000) || '', tabs: [...document.querySelectorAll('.view-tabs button')].map((item) => item.textContent?.trim()), diagnostics: window.__THREE_GAME_DIAGNOSTICS__?.kind || null, tarotView: Boolean(document.querySelector('.tarot-draw-view')), canvas: Boolean(document.querySelector('.tarot-draw-view canvas')) })`);
      throw new Error(`Canonical Tarot Draw did not mount: ${JSON.stringify({ diagnostic, errors })}`);
    }
    // The local shell may swap its compact bootstrap Avatar for the full record,
    // which intentionally remounts the persistent Three.js stage once. Do not
    // stage evidence against the disposable first mount.
    await sleep(4_000);
    if (!await waitFor(win, `Boolean(document.querySelector('.tarot-draw-view canvas') && window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`, 12_000)) throw new Error("Stable Tarot Draw mount did not settle");
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 1`)) throw new Error("Two ordinary Cards were not available");
    if (!await waitFor(win, `typeof window.__THREE_GAME_DIAGNOSTICS__?.actions?.loadStargateCustodyDemoFormation === 'function'`, 8_000)) throw new Error("Custody demo action did not register");
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__?.actions?.loadStargateCustodyDemoFormation?.())`)) throw new Error("Ordinary Cards could not be ordered into the Gate");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'needs_identity' && window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.missingIdentityCount === 2`, 8_000)) {
      const diagnostic = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate || null`);
      throw new Error(`Formation did not expose its missing custody truth: ${JSON.stringify(diagnostic)}`);
    }

    const startedAt = Date.now();
    const interval = 1_000 / fps;
    let custodyRequested = false;
    let dialed = false;
    let frameIndex = 0;
    let surfaceSize = { width, height };
    while (Date.now() - startedAt < durationMs) {
      const elapsed = Date.now() - startedAt;
      if (!custodyRequested && elapsed >= 2_300) {
        custodyRequested = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.actions.prepareStargateFormationIdentity()`);
        if (!custodyRequested) throw new Error("Card custody action failed");
        if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready'`, 8_000)) {
          const diagnostic = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate || null`);
          throw new Error(`Custody receipts did not resolve the Formation: ${JSON.stringify(diagnostic)}`);
        }
      }
      if (!dialed && elapsed >= 6_300) {
        dialed = await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate())`);
        if (!dialed) throw new Error("Identity-ready Formation could not dial");
      }
      const image = await win.capturePage();
      surfaceSize = image.getSize();
      await fs.writeFile(path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`), image.toPNG());
      frameIndex += 1;
      await sleep(Math.max(0, startedAt + frameIndex * interval - Date.now()));
    }
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 4_000)) throw new Error("Stargate did not become active");
    const capturedDurationSeconds = (Date.now() - startedAt) / 1_000;
    const observedSourceFps = frameIndex / capturedDurationSeconds;
    const truth = await win.webContents.executeJavaScript(`(() => { const state = window.__THREE_GAME_DIAGNOSTICS__?.state || {}; const serialized = JSON.stringify({ state, text: document.querySelector('.tarot-draw-view')?.innerText || '' }); return { state: state.stargate?.state, slotCount: state.stargate?.slotCount, sealedCount: state.stargate?.sealedCount, missingIdentityCount: state.stargate?.missingIdentityCount, custodyCreatedCount: state.stargate?.custodyCreatedCount, formationEntries: state.stargate?.formationEntries, derivationObserved: state.stargate?.derivationObserved, privateTopicWithheld: state.stargate?.privateTopicWithheld, cohortSecretWithheld: state.stargate?.cohortSecretWithheld, fullAddressLeaked: /hapa-gate:v1:[a-z2-7]{52}/i.test(serialized), secretLeaked: /(?:cohort secret|cohort_secret)[^A-Za-z0-9_-]{0,8}[A-Za-z0-9_-]{40,}/i.test(serialized) }; })()`);
    if (truth.state !== "active" || truth.slotCount !== 2 || truth.sealedCount !== 2 || truth.missingIdentityCount !== 0 || truth.custodyCreatedCount !== 2 || !truth.derivationObserved || !truth.privateTopicWithheld || !truth.cohortSecretWithheld || truth.fullAddressLeaked || truth.secretLeaked || !truth.formationEntries?.every((entry) => entry.identityKind === "hypercore_origin")) throw new Error(`Capture truth gate failed: ${JSON.stringify(truth)}`);
    if (errors.length) throw new Error(`Renderer console errors:\n${errors.join("\n")}`);
    await fs.writeFile(poster, (await win.capturePage()).toPNG());
    await run("ffmpeg", ["-y", "-framerate", observedSourceFps.toFixed(6), "-i", path.join(framesDir, "frame-%05d.png"), "-vf", `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
    const manifest = {
      schemaVersion: "hapa.demo-capture.v1",
      captureId: "demo-sub-004-card-custody-2026-07-19-01",
      taskId: "SUB-004",
      title: "Ordinary Cards Become Stargate Coordinates",
      surface: "canonical-hapa-avatar-builder-tarot-draw-isolated-electron-window",
      sourceUrl: targetUrl,
      capture: { windowWidth: width, windowHeight: height, surfaceWidth: surfaceSize.width, surfaceHeight: surfaceSize.height, requestedFps: fps, sourceFrameCount: frameIndex, observedSourceFps: Number(observedSourceFps.toFixed(3)), encodedFps: fps, durationSeconds: Number(capturedDurationSeconds.toFixed(3)), audio: false },
      story: ["two ordinary Cards enter ordered Gate slots", "the UI states that custody is missing", "one explicit action creates one append-only Hypercore per Card", "both receipts seal the Formation", "the deterministic Gate resolves and dials"],
      truthBoundary: "Shows explicit creation of real per-Card Hypercore custody in isolated local stores, deterministic Formation derivation, and the authored Stargate visual response. Custody is not mint, ownership, commerce eligibility, canon, or remote internet proof.",
      fixtureDisclosure: "Isolated public-safe Card fixtures; no operator library or private Gate material is included.",
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
