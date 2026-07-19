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
const errors = [];
let captureWindow = null;

app.setName("hapa-avatar-builder-wisdom-council-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-wisdom-council-capture-${process.pid}`));
app.on("window-all-closed", (event) => { if (captureWindow) event.preventDefault(); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(win, expression, timeout = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await win.webContents.executeJavaScript(expression)) return true;
    await sleep(125);
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
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-wisdom-council-frames-"));
  const outputDir = path.join(ROOT, "artifacts/demos/STG-013");
  const output = path.join(outputDir, "stargate-wisdom-council.mp4");
  const poster = path.join(outputDir, "stargate-wisdom-council-poster.png");
  const chamberPoster = path.join(outputDir, "stargate-wisdom-council-chamber.png");
  const manifestPath = path.join(outputDir, "stargate-wisdom-council.json");
  const win = captureWindow = new BrowserWindow({ width, height, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_event, level, message) => { if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer|Failed to load resource.*404/.test(message)) errors.push(message); });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`[Load Failure] ${code}: ${description} (${url})`));

  let frameIndex = 0;
  let surfaceSize = { width, height };
  async function frame() {
    const image = await win.capturePage();
    surfaceSize = image.getSize();
    await fs.writeFile(path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`), image.toPNG());
    frameIndex += 1;
    return image;
  }
  async function hold(milliseconds) {
    const count = Math.max(1, Math.round(milliseconds / (1000 / fps)));
    const started = Date.now();
    for (let index = 0; index < count; index += 1) {
      await frame();
      await sleep(Math.max(0, started + (index + 1) * (1000 / fps) - Date.now()));
    }
  }

  try {
    await fs.mkdir(outputDir, { recursive: true });
    await win.loadURL(new URL("?view=tarot", baseUrl).href);
    if (!await waitFor(win, `Boolean(window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`, 40_000)) throw new Error("Canonical Tarot Draw did not mount");
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 0`, 40_000)) throw new Error("Tarot deck did not become ready");

    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation())`)) throw new Error("Public Stargate Formation could not stage");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready'`, 8_000)) throw new Error("Stargate did not become ready");
    await hold(1_300);
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate())`)) throw new Error("Stargate could not dial");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 15_000)) throw new Error("Stargate did not become active");
    await hold(2_100);

    await win.webContents.executeJavaScript(`document.querySelector('.tarot-context-forge-open')?.click()`);
    if (!await waitFor(win, `Boolean(document.querySelector('.tarot-context-forge-chamber'))`, 4_000)) throw new Error("Context Forge did not open");
    await hold(1_600);
    if (!await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-context-freeze'); if (!button || button.disabled) return false; button.click(); return true; })()`)) throw new Error("Context Packet freeze could not begin");
    if (!await waitFor(win, `document.querySelector('.tarot-context-forge-chamber')?.dataset?.status === 'sealed'`, 12_000)) throw new Error("Context Packet did not seal");
    await hold(1_800);

    await win.webContents.executeJavaScript(`document.querySelector('.tarot-wisdom-council-open')?.click()`);
    if (!await waitFor(win, `document.querySelector('.tarot-wisdom-council-chamber')?.dataset?.status === 'idle'`, 8_000)) throw new Error("Wisdom Council chamber did not become ready");
    const selectedSeats = await win.webContents.executeJavaScript(`document.querySelectorAll('.tarot-wisdom-card-selector button[data-selected="true"]').length`);
    if (selectedSeats !== 3) throw new Error(`Expected three default Wisdom Cards, observed ${selectedSeats}`);
    await hold(2_600);

    const convened = await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-wisdom-council-actions button'); if (!button || button.disabled) return false; button.click(); return true; })()`);
    if (!convened) throw new Error("Wisdom Council could not convene");
    await hold(3_500);
    if (!await waitFor(win, `['complete','failed'].includes(document.querySelector('.tarot-wisdom-council-chamber')?.dataset?.status || '')`, 150_000)) throw new Error("Wisdom Council did not finish");
    const finalStatus = await win.webContents.executeJavaScript(`document.querySelector('.tarot-wisdom-council-chamber')?.dataset?.status || ''`);
    if (finalStatus !== "complete") {
      const text = await win.webContents.executeJavaScript(`document.querySelector('.tarot-wisdom-council-chamber')?.innerText || ''`);
      throw new Error(`Wisdom Council failed: ${text.slice(-1200)}`);
    }
    await hold(4_600);
    await fs.writeFile(chamberPoster, (await win.capturePage()).toPNG());

    const enteredField = await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-wisdom-council-chamber > footer[data-state="complete"] button'); if (!button) return false; button.click(); return true; })()`);
    if (!enteredField) throw new Error("Council Field reveal could not begin");
    await hold(8_200);
    await fs.writeFile(poster, (await win.capturePage()).toPNG());

    const truth = await win.webContents.executeJavaScript(`(async () => {
      const state=window.__THREE_GAME_DIAGNOSTICS__?.state||{};
      const list=await fetch('/api/wisdom-councils').then(r=>r.json());
      const serialized=JSON.stringify({state:state.wisdomCouncil,list});
      return {gate:state.stargate,council:state.wisdomCouncil,list,fullAddressLeaked:/hapa-gate:v1:[a-z2-7]{52}/i.test(serialized),secretLeaked:/(?:cohortSecret|rendezvousTopic|privateKey|bearerToken)(?=["':=])/i.test(serialized)};
    })()`);
    const runRecord = truth.list.runs?.at(-1);
    const cards = truth.list.cards?.slice(-2) || [];
    const counts = runRecord?.dissent?.summary?.countsByCategory || {};
    const checks = {
      exactFourCardGate: truth.gate?.state === "active" && truth.gate?.slotCount === 4 && truth.gate?.sealedCount === 4,
      exactContextPacket: runRecord?.packetId && /^[a-f0-9]{64}$/.test(runRecord?.packetDigest || ""),
      threePeerBlindSeats: runRecord?.seatCount === 3 && runRecord?.seats?.length === 3 && runRecord.seats.every((seat) => seat.peerBlindness?.visibleCardIds?.length === 1 && seat.peerBlindness.visibleCardIds[0] === seat.cardId && seat.peerBlindness.peerOutputDigestsVisible?.length === 0),
      noAvatarParticipationClaimed: runRecord?.seats?.every((seat) => seat.participant?.avatarParticipation === "not-invoked"),
      parallelReleaseRecorded: runRecord?.concurrency?.observedMaximumConcurrentSeats === 3 && runRecord?.concurrency?.peerOutputsSharedPreSeal === false,
      atomicSealRecorded: runRecord?.seal?.sealed === true && runRecord?.seal?.allSeatsCompleted === true && runRecord?.seal?.partialResultsAccepted === false,
      fiveDissentClassesVisible: ["scope","goal","evidence","mechanism","true-tradeoff"].every((kind) => Number(counts[kind] || 0) > 0) && truth.council?.activeFaultLines === 5,
      noFalseConsensus: runRecord?.dissent?.summary?.averagedVerdictProduced === false && runRecord?.dissent?.summary?.preferredActionSelected === false,
      humanAuthorityVisible: runRecord?.dissent?.creativeDirectorQueue?.length > 0 && truth.council?.humanDaisVisible === true,
      exactProviderRecorded: runRecord?.provider?.providerId === "ollama-local" && runRecord?.provider?.providerVersion === "0.24.0" && runRecord?.provider?.modelId === "qwen3.5:27b" && /^sha256:[a-f0-9]{64}$/.test(runRecord?.provider?.modelVersion || ""),
      twoUnmintedCards: cards.length === 2 && cards.every((card) => card.lifecycleStatus === "proposed_unminted" && card.minted === false && card.authority?.autoMint === false),
      spatialCardsVisible: truth.council?.resultCards?.length === 2 && new Set(truth.council.resultCards.map((card) => card.kind)).size === 2,
      visualCouncilVisible: truth.council?.visible === true && truth.council?.visibleSeats === 3 && truth.council?.visualState === "sealed",
      privateFieldsWithheld: !truth.fullAddressLeaked && !truth.secretLeaked,
      rendererErrorsAbsent: errors.length === 0
    };
    if (!Object.values(checks).every(Boolean)) throw new Error(`Wisdom Council capture gate failed: ${JSON.stringify({ checks, truth, errors })}`);

    const durationSeconds = frameIndex / fps;
    await run("ffmpeg", ["-y", "-framerate", String(fps), "-i", path.join(framesDir, "frame-%05d.png"), "-vf", `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
    const manifest = {
      schemaVersion: "hapa.demo-capture.v1", captureId: "demo-stg-013-wisdom-council-2026-07-19-01", taskId: "STG-013", title: "Three Peer-Blind Wisdom Cards Fracture False Consensus",
      surface: "canonical-hapa-avatar-builder-tarot-draw-isolated-electron-window", sourceUrl: baseUrl,
      capture: { windowWidth: width, windowHeight: height, surfaceWidth: surfaceSize.width, surfaceHeight: surfaceSize.height, requestedFps: fps, sourceFrameCount: frameIndex, encodedFps: fps, durationSeconds, audio: false, idleModelTimeCompressed: true },
      story: ["four ordered Cards activate the Stargate", "a human seals their exact Context Packet", "three peer-blind Wisdom Cards enter isolated chambers", "local qwen3.5:27b seats seal all-or-nothing", "five colored dissent fault lines reject false consensus", "true tradeoffs rise to a gold human-authority dais", "Council Lesson and Result Cards emerge proposed and unminted"],
      truthBoundary: "Observed in an isolated canonical Avatar Builder window using three actual loopback Ollama 0.24.0 qwen3.5:27b seat calls at one recorded model digest. It proves this tested packet, peer-blind input boundary, atomic application seal, deterministic structural comparison, and spatial projection on this Mac at capture time. Seat semantics remain provider hypotheses; visual separation does not independently prove model non-interference outside recorded prompts; no result was accepted, minted, network-replicated, or promoted to canon.",
      checks,
      observed: { councilId: runRecord.councilId, runId: runRecord.runId, runDigest: runRecord.runDigest, packetId: runRecord.packetId, packetDigest: runRecord.packetDigest, provider: runRecord.provider, sealDigest: runRecord.seal.sealDigest, seatDigests: runRecord.seats.map((seat) => seat.recordDigest), dissentDigest: runRecord.dissent.recordDigest, countsByCategory: counts, unresolvedCount: runRecord.dissent.summary.unresolvedCount, humanRouteCount: runRecord.dissent.creativeDirectorQueue.length, cardIds: cards.map((card) => card.id), cardDigests: cards.map((card) => card.cardRecordDigest) },
      privacy: { namedWindowOnly: true, desktopExcluded: true, fullAddressExcluded: true, cohortSecretExcluded: true, privateTopicExcluded: true },
      asset: { path: output, mediaType: "video/mp4", ...await fileProof(output) }, poster: { path: poster, mediaType: "image/png", ...await fileProof(poster) }, chamberPoster: { path: chamberPoster, mediaType: "image/png", ...await fileProof(chamberPoster) },
      attribution: { harness: "Codex Desktop", model: "GPT-5.6 Sol (user-declared; runtime identifier not exposed)", application: "Hapa Avatar Builder", localProvider: "Ollama 0.24.0", localModel: "qwen3.5:27b", event: "OpenAI Codex Build Week", renderer: "Three.js", encoder: "FFmpeg/libx264" }, userAppTouched: false
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, manifestPath, output, poster, chamberPoster, checks }, null, 2));
    await fs.rm(framesDir, { recursive: true, force: true });
    captureWindow = null; win.destroy(); await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
    captureWindow = null; win.destroy(); await app.quit(); process.exit(1);
  }
}).catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exit(1); });
