const { app, BrowserWindow, session } = require("electron");
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
const captureDurationMs = 20_000;
const errors = [];
let captureWindow = null;

app.commandLine.appendSwitch("use-fake-device-for-media-stream");
app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
app.setName("hapa-avatar-builder-comment-card-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-comment-card-capture-${process.pid}`));
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
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === "media");
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === "media"));
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-comment-card-frames-"));
  const outputDir = path.join(ROOT, "artifacts/demos/STG-011");
  const output = path.join(outputDir, "consented-camera-comment-card.mp4");
  const poster = path.join(outputDir, "consented-camera-comment-card-poster.png");
  const manifestPath = path.join(outputDir, "consented-camera-comment-card.json");
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
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.selectFirstStargateCard())`)) throw new Error("A source Card could not be selected");
    if (!await waitFor(win, `Boolean(window.__THREE_GAME_DIAGNOSTICS__?.state?.selected)`)) throw new Error("Selected source Card did not reach the HUD");

    const startedAt = Date.now();
    const interval = 1000 / fps;
    let frameIndex = 0;
    let chamberOpened = false;
    let consentGranted = false;
    let recordStarted = false;
    let completeObserved = false;
    let sourceUnchangedVisible = false;
    let revealClicked = false;
    let posterWritten = false;
    let surfaceSize = { width, height };
    while (Date.now() - startedAt < captureDurationMs) {
      const elapsed = Date.now() - startedAt;
      if (!chamberOpened && elapsed >= 1_400) chamberOpened = await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-scene-invite-toggle');button?.click();return Boolean(button);})()`);
      if (!consentGranted && elapsed >= 3_100) consentGranted = await win.webContents.executeJavaScript(`(() => { const input=document.querySelector('.tarot-comment-consent input');if(!input)return false;input.click();return input.checked;})()`);
      if (!recordStarted && elapsed >= 4_000) recordStarted = await win.webContents.executeJavaScript(`(() => { const button=[...document.querySelectorAll('.tarot-comment-actions button')].find((item)=>/record 8s camera card/i.test(item.textContent||''));if(!button||button.disabled)return false;button.click();return true;})()`);
      const state = await win.webContents.executeJavaScript(`(() => { const chamber=document.querySelector('.tarot-comment-chamber');const text=chamber?.innerText||'';return{status:chamber?.dataset?.status||'',text};})()`);
      if (state.status === "complete" && /source unchanged/i.test(state.text)) { completeObserved = true; sourceUnchangedVisible = true; }
      if (!revealClicked && completeObserved && elapsed >= 14_300) revealClicked = await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-comment-reveal');button?.click();return Boolean(button);})()`);
      const image = await win.capturePage();
      surfaceSize = image.getSize();
      const png = image.toPNG();
      await fs.writeFile(path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`), png);
      if (!posterWritten && revealClicked && elapsed >= 16_200) { await fs.writeFile(poster, png); posterWritten = true; }
      frameIndex += 1;
      await sleep(Math.max(0, startedAt + frameIndex * interval - Date.now()));
    }
    const capturedDurationSeconds = (Date.now() - startedAt) / 1000;
    const observedSourceFps = frameIndex / capturedDurationSeconds;
    const truth = await win.webContents.executeJavaScript(`(() => { const gate=window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate||{};const chamber=document.querySelector('.tarot-comment-chamber');const text=chamber?.innerText||'';const serialized=JSON.stringify({gate,text});return{gateState:gate.state,slotCount:gate.slotCount,sealedCount:gate.sealedCount,formationDigestPresent:Boolean(gate.formationDigest),gateCommitmentPresent:Boolean(gate.gateCommitment),commentStatus:chamber?.dataset?.status||'',commentText:text,fullAddressLeaked:/hapa-gate:v1:[a-z2-7]{52}/i.test(serialized),secretLeaked:/(?:cohortSecret|rendezvousTopic|privateKey|bearerToken)(?=["':=])/i.test(serialized)};})()`);
    const commentsResponse = await fetch(new URL("api/media-comments", baseUrl));
    const comments = await commentsResponse.json();
    const completed = (comments.captures || []).find((capture) => capture.status === "finalized");
    const finalized = completed?.finalized || null;
    const checks = {
      chamberOpened, consentGranted, recordStarted, completeObserved, sourceUnchangedVisible, revealClicked,
      exactFourCardGate: truth.gateState === "active" && truth.slotCount === 4 && truth.sealedCount === 4,
      exactGateContextBound: truth.formationDigestPresent && truth.gateCommitmentPresent,
      separateCommentCardProposed: Boolean(finalized?.cardId) && finalized.cardId !== completed?.sourceCard?.cardId,
      lessonAndResultCardsPressed: Boolean(finalized?.lessonCardId && finalized?.resultCardId),
      noAutomaticMint: finalized?.proposed === true && finalized?.minted === false,
      localFakeCameraDisclosed: true,
      privateFieldsWithheld: !truth.fullAddressLeaked && !truth.secretLeaked,
      rendererErrorsAbsent: errors.length === 0
    };
    if (!Object.values(checks).every(Boolean)) throw new Error(`Comment Card capture truth gate failed: ${JSON.stringify({ checks, truth, completed, errors })}`);
    if (!posterWritten) await fs.writeFile(poster, (await win.capturePage()).toPNG());
    await run("ffmpeg", ["-y", "-framerate", observedSourceFps.toFixed(6), "-i", path.join(framesDir, "frame-%05d.png"), "-vf", `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
    const manifest = {
      schemaVersion: "hapa.demo-capture.v1", captureId: "demo-stg-011-browser-comment-2026-07-18-01", taskId: "STG-011", title: "A Camera Comment Becomes a Separate Hapa Card",
      surface: "canonical-hapa-avatar-builder-tarot-draw-isolated-electron-window", sourceUrl: baseUrl,
      capture: { windowWidth: width, windowHeight: height, surfaceWidth: surfaceSize.width, surfaceHeight: surfaceSize.height, requestedFps: fps, sourceFrameCount: frameIndex, observedSourceFps: Number(observedSourceFps.toFixed(3)), encodedFps: fps, durationSeconds: Number(capturedDurationSeconds.toFixed(3)), audio: false },
      story: ["active four-Card Stargate", "one exact source revision selected", "consent and attribution chamber opens", "existing Camera Card records a bounded clip", "separate amber Comment Card materializes", "animated custody packets tether source to Comment while source stays unchanged"],
      truthBoundary: "Observed in an isolated Electron window through the real browser Camera Card, consent, append-only Comment service, binary upload, and Card materialization paths. Electron supplied a deterministic fake camera device for automation. This does not claim physical-phone, geographically remote, broader-network, or human mint evidence.",
      checks,
      observed: { captureId: completed.captureId, sourceCardId: completed.sourceCard.cardId, sourceRevisionId: completed.sourceCard.cardRevisionId, commentCardId: finalized.cardId, lessonCardId: finalized.lessonCardId, resultCardId: finalized.resultCardId, consentEventId: completed.consent.eventId, mediaSha256: finalized.media.sha256 },
      privacy: { namedWindowOnly: true, desktopExcluded: true, fullAddressExcluded: true, cohortSecretExcluded: true, privateTopicExcluded: true },
      asset: { path: output, mediaType: "video/mp4", ...await fileProof(output) }, poster: { path: poster, mediaType: "image/png", ...await fileProof(poster) },
      attribution: { harness: "Codex Desktop", model: "GPT-5.6 Sol (user-declared; runtime identifier not exposed)", application: "Hapa Avatar Builder", event: "OpenAI Codex Build Week", renderer: "Three.js", captureDevice: "Electron deterministic fake camera", encoder: "FFmpeg/libx264" }, userAppTouched: false
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
