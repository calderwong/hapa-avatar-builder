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
const fps = 10;
const maxCaptureMs = 48_000;
const errors = [];
let captureWindow = null;

app.setName("hapa-avatar-builder-context-forge-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-context-forge-capture-${process.pid}`));
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
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-context-forge-frames-"));
  const outputDir = path.join(ROOT, "artifacts/demos/STG-012");
  const output = path.join(outputDir, "stargate-context-forge-local-ai.mp4");
  const poster = path.join(outputDir, "stargate-context-forge-local-ai-poster.png");
  const manifestPath = path.join(outputDir, "stargate-context-forge-local-ai.json");
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
    await win.webContents.executeJavaScript(`document.querySelector('.tarot-context-forge-open')?.click()`);
    if (!await waitFor(win, `Boolean(document.querySelector('.tarot-context-forge-chamber'))`, 4_000)) throw new Error("Context Forge chamber did not open");
    await win.webContents.executeJavaScript(`(() => { const modeButtons=[...document.querySelectorAll('.tarot-context-forge-modes > button')]; modeButtons[1]?.click(); return Boolean(modeButtons[1]); })()`);
    if (!await waitFor(win, `Boolean(document.querySelector('.tarot-context-forge-modes input[placeholder="qwen3.5:2b"]'))`, 4_000)) throw new Error("Local model field did not render");
    await win.webContents.executeJavaScript(`(() => {
      const input=document.querySelector('.tarot-context-forge-modes input[placeholder="qwen3.5:2b"]');
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      setter.call(input,'qwen3.5:27b');
      input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'qwen3.5:27b'}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
      return input.value;
    })()`);
    if (!await waitFor(win, `document.querySelector('.tarot-context-forge-modes input[placeholder="qwen3.5:2b"]')?.value === 'qwen3.5:27b'`, 2_000)) throw new Error("Local model field did not accept qwen3.5:27b");

    const startedAt = Date.now();
    const interval = 1000 / fps;
    let frameIndex = 0;
    let freezeClicked = false;
    let materializeClicked = false;
    let sealedAt = 0;
    let completeAt = 0;
    let revealClicked = false;
    let truthTextBeforeReveal = "";
    let posterWritten = false;
    let surfaceSize = { width, height };
    while (Date.now() - startedAt < maxCaptureMs) {
      const elapsed = Date.now() - startedAt;
      if (!freezeClicked && elapsed >= 900) {
        freezeClicked = await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-context-freeze'); if (!button || button.disabled) return false; button.click(); return true; })()`);
      }
      const chamberStatus = await win.webContents.executeJavaScript(`document.querySelector('.tarot-context-forge-chamber')?.dataset?.status || ''`);
      if (chamberStatus === "sealed" && !sealedAt) sealedAt = Date.now();
      if (sealedAt && !materializeClicked && Date.now() - sealedAt >= 1_600) {
        materializeClicked = await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-context-materialize'); if (!button || button.disabled) return false; button.click(); return true; })()`);
      }
      if (chamberStatus === "complete" && !completeAt) completeAt = Date.now();
      if (completeAt && !revealClicked && Date.now() - completeAt >= 3_800) {
        truthTextBeforeReveal = await win.webContents.executeJavaScript(`document.querySelector('.tarot-context-forge-chamber')?.innerText || ''`);
        revealClicked = await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-context-forge-chamber > footer[data-state="complete"] button'); if (!button) return false; button.click(); return true; })()`);
      }
      const image = await win.capturePage();
      surfaceSize = image.getSize();
      const png = image.toPNG();
      await fs.writeFile(path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`), png);
      if (!posterWritten && completeAt && Date.now() - completeAt >= 2_200) { await fs.writeFile(poster, png); posterWritten = true; }
      frameIndex += 1;
      if (completeAt && Date.now() - completeAt >= 9_000) break;
      await sleep(Math.max(0, startedAt + frameIndex * interval - Date.now()));
    }
    const capturedDurationSeconds = (Date.now() - startedAt) / 1000;
    const observedSourceFps = frameIndex / capturedDurationSeconds;
    const truth = await win.webContents.executeJavaScript(`(async () => {
      const state=window.__THREE_GAME_DIAGNOSTICS__?.state||{};
      const chamber=document.querySelector('.tarot-context-forge-chamber');
      const text=chamber?.innerText||'';
      const list=await fetch('/api/context-generation').then(r=>r.json());
      const serialized=JSON.stringify({state:state.contextForge,text,list});
      return {gate:state.stargate,forge:state.contextForge,text,list,fullAddressLeaked:/hapa-gate:v1:[a-z2-7]{52}/i.test(serialized),secretLeaked:/(?:cohortSecret|rendezvousTopic|privateKey|bearerToken)(?=["':=])/i.test(serialized)};
    })()`);
    if (!truth.text) truth.text = truthTextBeforeReveal;
    const runRecord = truth.list.runs?.at(-1);
    const resultCard = truth.list.cards?.at(-1);
    const checks = {
      freezeClicked,
      packetSealed: Boolean(sealedAt && truth.list.packets?.length === 1),
      materializeClicked,
      localProviderActuallyInvoked: runRecord?.generationPerformed === true && runRecord?.providerInvocationVerified === true,
      exactProviderRecorded: runRecord?.provider?.providerId === "ollama-local" && runRecord?.provider?.providerVersion === "0.24.0",
      exactModelRecorded: runRecord?.provider?.modelId === "qwen3.5:27b" && /^sha256:[a-f0-9]{64}$/.test(runRecord?.provider?.modelVersion || ""),
      promptProvenanceRecorded: /^[a-f0-9]{64}$/.test(runRecord?.prompt?.digest || "") && runRecord?.prompt?.template?.version === "1.0.0",
      exactFourCardGate: truth.gate?.state === "active" && truth.gate?.slotCount === 4 && truth.gate?.sealedCount === 4,
      sourceGlyphsAndRailsVisible: truth.forge?.sourceGlyphs === 4 && truth.forge?.rails === 4 && truth.forge?.visible === true,
      proposalRevealed: truth.forge?.state === "proposal" && truth.forge?.proposalVisible === true && truth.forge?.resultCardId === resultCard?.id,
      threeDimensionalRevealClicked: revealClicked,
      proposalUnminted: resultCard?.lifecycleStatus === "proposed_unminted" && resultCard?.minted === false,
      truthBoundaryVisible: /Provider invoked/i.test(truth.text) && /No auto-mint/i.test(truth.text) && /proposed only/i.test(truth.text),
      sourceUnchanged: resultCard?.authority?.sourceMutation === false,
      privateFieldsWithheld: !truth.fullAddressLeaked && !truth.secretLeaked,
      rendererErrorsAbsent: errors.length === 0
    };
    if (!Object.values(checks).every(Boolean)) throw new Error(`Context Forge capture gate failed: ${JSON.stringify({ checks, truth, errors })}`);
    if (!posterWritten) await fs.writeFile(poster, (await win.capturePage()).toPNG());
    await run("ffmpeg", ["-y", "-framerate", observedSourceFps.toFixed(6), "-i", path.join(framesDir, "frame-%05d.png"), "-vf", `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
    const manifest = {
      schemaVersion: "hapa.demo-capture.v1", captureId: "demo-stg-012-context-forge-2026-07-19-01", taskId: "STG-012", title: "Four Stargate Cards Converge into a Real Local-AI Proposal",
      surface: "canonical-hapa-avatar-builder-tarot-draw-isolated-electron-window", sourceUrl: baseUrl,
      capture: { windowWidth: width, windowHeight: height, surfaceWidth: surfaceSize.width, surfaceHeight: surfaceSize.height, requestedFps: fps, sourceFrameCount: frameIndex, observedSourceFps: Number(observedSourceFps.toFixed(3)), encodedFps: fps, durationSeconds: Number(capturedDurationSeconds.toFixed(3)), audio: false },
      story: ["active four-Card Stargate", "human selects and freezes exact ordered evidence", "Card glyphs converge on luminous rails into a sealed Context Packet", "a real local Ollama qwen3.5:27b invocation records concrete runtime/model/prompt provenance", "an unminted proposal Card rises from the Gate"],
      truthBoundary: "Observed in an isolated canonical Avatar Builder window with one actual loopback Ollama 0.24.0 invocation of qwen3.5:27b at the recorded model digest. This proves the tested packet, invocation, proposal, and visualization path on this Mac at capture time. It does not prove semantic quality, broader provider compatibility, human acceptance, mint, network replication, or production readiness.",
      checks,
      observed: { packetId: truth.list.packets[0]?.packetId, packetDigest: truth.list.packets[0]?.packetDigest, runId: runRecord?.runId, runDigest: runRecord?.runDigest, resultCardId: resultCard?.id, resultCardDigest: resultCard?.cardRecordDigest, provider: runRecord?.provider, promptTemplate: runRecord?.prompt?.template, outputDigest: runRecord?.outputDigest },
      privacy: { namedWindowOnly: true, desktopExcluded: true, fullAddressExcluded: true, cohortSecretExcluded: true, privateTopicExcluded: true },
      asset: { path: output, mediaType: "video/mp4", ...await fileProof(output) }, poster: { path: poster, mediaType: "image/png", ...await fileProof(poster) },
      attribution: { harness: "Codex Desktop", model: "GPT-5.6 Sol (user-declared; runtime identifier not exposed)", application: "Hapa Avatar Builder", localProvider: "Ollama 0.24.0", localModel: "qwen3.5:27b", event: "OpenAI Codex Build Week", renderer: "Three.js", encoder: "FFmpeg/libx264" }, userAppTouched: false
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
