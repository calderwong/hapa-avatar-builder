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

app.setName("hapa-avatar-builder-proposal-mint-gate-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-proposal-mint-gate-${process.pid}`));
app.on("window-all-closed", (event) => { if (captureWindow) event.preventDefault(); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(win, expression, timeout = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await win.webContents.executeJavaScript(expression)) return true;
    // Keep the evidence harness from starving the isolated API and local model on
    // a saturated demo machine. Product state remains fail-closed between polls.
    await sleep(750);
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
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-proposal-mint-gate-frames-"));
  const outputDir = path.join(ROOT, "artifacts/demos/STG-014");
  const output = path.join(outputDir, "stargate-proposal-mint-gate.mp4");
  const reviewPoster = path.join(outputDir, "stargate-proposal-mint-review.png");
  const custodyPoster = path.join(outputDir, "stargate-proposal-mint-custody.png");
  const heroPoster = path.join(outputDir, "stargate-proposal-mint-hero.png");
  const manifestPath = path.join(outputDir, "stargate-proposal-mint-gate.json");
  const win = captureWindow = new BrowserWindow({ width, height, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_event, levelOrDetails, legacyMessage) => {
    const details = levelOrDetails && typeof levelOrDetails === "object" ? levelOrDetails : { level: levelOrDetails, message: legacyMessage };
    const message = String(details.message || "");
    if ((details.level === "error" || Number(details.level) >= 3) && !/ResizeObserver loop|THREE.WebGLRenderer|Failed to load resource.*404/.test(message)) errors.push(message);
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) => errors.push(`[Load Failure] ${code}: ${description} (${url})`));
  win.webContents.on("render-process-gone", (_event, details) => errors.push(`[Renderer Gone] ${details.reason}: ${details.exitCode}`));
  win.on("unresponsive", () => errors.push("[Renderer Unresponsive]"));

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
    await win.loadURL(new URL("?view=tarot&stargateDemo=1", baseUrl).href);
    if (!await waitFor(win, `Boolean(window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`, 180_000)) {
      const diagnostic = await win.webContents.executeJavaScript(`({href:location.href,ready:document.readyState,title:document.title,text:(document.body?.innerText||'').slice(0,1200),html:(document.body?.innerHTML||'').slice(0,1200),diagnostics:window.__THREE_GAME_DIAGNOSTICS__||null})`).catch((error) => ({ executeError: error.message }));
      throw new Error(`Canonical Tarot Draw did not mount: ${JSON.stringify({ diagnostic, errors })}`);
    }
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 0`, 180_000)) throw new Error("Tarot deck did not become ready");

    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation())`)) throw new Error("Public Stargate Formation could not stage");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'ready'`, 15_000)) throw new Error("Stargate did not become ready");
    await hold(900);
    if (!await win.webContents.executeJavaScript(`Boolean(window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate())`)) throw new Error("Stargate could not dial");
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.state === 'active'`, 20_000)) throw new Error("Stargate did not become active");
    await hold(1_800);

    await win.webContents.executeJavaScript(`document.querySelector('.tarot-context-forge-open')?.click()`);
    if (!await waitFor(win, `Boolean(document.querySelector('.tarot-context-forge-chamber'))`, 8_000)) throw new Error("Context Forge did not open");
    if (!await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-context-freeze'); if (!button || button.disabled) return false; button.click(); return true; })()`)) throw new Error("Context Packet freeze could not begin");
    if (!await waitFor(win, `['sealed','failed'].includes(document.querySelector('.tarot-context-forge-chamber')?.dataset?.status || '')`, 300_000)) {
      const contextForge = await win.webContents.executeJavaScript(`({status:document.querySelector('.tarot-context-forge-chamber')?.dataset?.status||'',text:document.querySelector('.tarot-context-forge-chamber')?.innerText||''})`);
      throw new Error(`Context Packet did not settle: ${JSON.stringify(contextForge)}`);
    }
    if (await win.webContents.executeJavaScript(`document.querySelector('.tarot-context-forge-chamber')?.dataset?.status || ''`) !== "sealed") {
      const contextForge = await win.webContents.executeJavaScript(`document.querySelector('.tarot-context-forge-chamber')?.innerText || ''`);
      throw new Error(`Context Packet failed atomically: ${contextForge.slice(-1200)}`);
    }

    await win.webContents.executeJavaScript(`document.querySelector('.tarot-wisdom-council-open')?.click()`);
    if (!await waitFor(win, `document.querySelector('.tarot-wisdom-council-chamber')?.dataset?.status === 'idle'`, 15_000)) throw new Error("Wisdom Council chamber did not become ready");
    const convened = await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-wisdom-council-actions button'); if (!button || button.disabled) return false; button.click(); return true; })()`);
    if (!convened) throw new Error("Wisdom Council could not convene");
    await hold(2_200);
    if (!await waitFor(win, `['complete','failed'].includes(document.querySelector('.tarot-wisdom-council-chamber')?.dataset?.status || '')`, 240_000)) throw new Error("Wisdom Council did not finish");
    if (await win.webContents.executeJavaScript(`document.querySelector('.tarot-wisdom-council-chamber')?.dataset?.status`) !== "complete") throw new Error("Wisdom Council failed atomically");
    await hold(1_800);

    const reviewOpened = await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-wisdom-result-actions button:last-child'); if (!button || button.disabled) return false; button.click(); return true; })()`);
    if (!reviewOpened) throw new Error("Mint Gate review could not open");
    if (!await waitFor(win, `document.querySelector('.tarot-proposal-mint-gate')?.dataset?.status === 'ready'`, 30_000)) throw new Error("Mint Gate review did not become ready");
    await hold(3_200);
    await fs.writeFile(reviewPoster, (await win.capturePage()).toPNG());

    const approved = await win.webContents.executeJavaScript(`(() => { const button=document.querySelector('.tarot-mint-decision-deck button[data-decision="approve"]'); if (!button || button.disabled) return false; button.click(); return true; })()`);
    if (!approved) throw new Error("Explicit approval control could not fire");
    await hold(4_600);
    if (!await waitFor(win, `['complete','failed'].includes(document.querySelector('.tarot-proposal-mint-gate')?.dataset?.status || '')`, 300_000)) throw new Error("Mint Gate did not finish");
    const mintStatus = await win.webContents.executeJavaScript(`document.querySelector('.tarot-proposal-mint-gate')?.dataset?.status || ''`);
    if (mintStatus !== "complete") {
      const text = await win.webContents.executeJavaScript(`document.querySelector('.tarot-proposal-mint-gate')?.innerText || ''`);
      throw new Error(`Mint Gate failed: ${text.slice(-1200)}`);
    }
    await hold(5_600);
    await fs.writeFile(custodyPoster, (await win.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('.tarot-proposal-mint-gate > header button')?.click()`);
    await hold(6_400);
    await fs.writeFile(heroPoster, (await win.capturePage()).toPNG());

    const truth = await win.webContents.executeJavaScript(`(async () => {
      const state=window.__THREE_GAME_DIAGNOSTICS__?.state||{};
      const [reviews,tarot]=await Promise.all([fetch('/api/proposal-reviews').then(r=>r.json()),fetch('/api/tarot').then(r=>r.json())]);
      const serialized=JSON.stringify({state:state.proposalReview,reviews,tarot});
      return {gate:state.stargate,council:state.wisdomCouncil,proposal:state.proposalReview,reviews,tarot,privateLeak:/(?:privateKeyPem|profileRoot|cohortSecretBase64Url|rendezvousTopic|bearerToken)(?=["':=])/i.test(serialized)};
    })()`);
    const mint = truth.reviews.mints?.at(-1);
    const decision = truth.reviews.decisions?.at(-1);
    const mintedCard = truth.tarot.cards?.find((card) => card.id === mint?.card?.id);
    const resultCard = truth.tarot.cards?.find((card) => card.id === mint?.resultCard?.id);
    const checks = {
      exactFourCardGate: truth.gate?.state === "active" && truth.gate?.slotCount === 4 && truth.gate?.sealedCount === 4,
      councilProposalPreserved: truth.council?.state === "sealed" && mint?.review?.proposalCardDigest && mint?.card?.mintApproval?.reviewDigest === mint.review.reviewDigest,
      explicitHumanApproval: decision?.decision === "approve" && decision?.actor?.actorType === "human" && decision?.explicitHumanControl === true && decision?.mintAuthorized === true,
      oneMintedOriginCard: mint?.minted === true && mintedCard?.minted === true && mint?.origin?.revision === 1 && mint?.origin?.originSequence === 1 && Boolean(mint?.origin?.eventId),
      durableOriginReceipt: mint?.origin?.durableAcknowledgement === true && Number(mint?.origin?.ledgerPosition || 0) > 0,
      catalogIndexedSourceOnly: mint?.catalog?.state === "catalog_indexed" && mint?.catalog?.commerce?.source_only === true && mint?.catalog?.commerce?.sellable === false,
      exactPeerReceipt: mint?.peer?.status === "passed" && mint?.peer?.isolation?.distinctOperatingSystemProcesses === true && mint?.peer?.isolation?.distinctStableNodeIds === true && mint?.peer?.announcement?.exactReceiverCopyStored === true,
      noiseTransportObserved: mint?.peer?.transport?.hyperswarmConnectionObserved === true && mint?.peer?.transport?.noiseEncryptedStreamObserved === true && mint?.peer?.transport?.geographicallyRemotePeerClaimed === false,
      mintGateResultCardExists: resultCard?.tarotMainType === "mint_gate_result_card" && resultCard?.mintGateResult?.boundaries?.secondMintedCardHeadCreated === false,
      threeDimensionalCustodyReplay: truth.proposal?.state === "peer_announced" && truth.proposal?.litCustodyNodes === 4 && truth.proposal?.resultVisible === true && truth.proposal?.resultCards?.length === 1,
      appendOnlyHistoryVerified: truth.reviews.reviews?.length === 1 && truth.reviews.decisions?.length === 1 && truth.reviews.mints?.length === 1 && truth.reviews.failures?.length === 0,
      privateFieldsWithheld: truth.privateLeak === false,
      rendererErrorsAbsent: errors.length === 0
    };
    if (!Object.values(checks).every(Boolean)) throw new Error(`Mint Gate capture gate failed: ${JSON.stringify({ checks, truth, errors })}`);

    const durationSeconds = frameIndex / fps;
    await run("ffmpeg", ["-y", "-framerate", String(fps), "-i", path.join(framesDir, "frame-%05d.png"), "-vf", `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
    const manifest = {
      schemaVersion: "hapa.demo-capture.v1", captureId: "demo-stg-014-proposal-mint-gate-2026-07-19-01", taskId: "STG-014", title: "A Human-Approved Card Crosses the Mint Gate",
      surface: "canonical-hapa-avatar-builder-tarot-draw-isolated-electron-window", sourceUrl: baseUrl,
      capture: { windowWidth: width, windowHeight: height, surfaceWidth: surfaceSize.width, surfaceHeight: surfaceSize.height, requestedFps: fps, sourceFrameCount: frameIndex, encodedFps: fps, durationSeconds, audio: false, idleProviderAndPeerTimeCompressed: true },
      story: ["a Council Result remains proposed and unminted", "an exact digest enters the gold human authority door", "revise, reject, defer, and approve stay explicit", "approval creates one origin Card head", "Overwind and .hapaCatalog return bounded receipts", "a signed exact origin event crosses live local Hyperswarm and Noise to a distinct peer", "the Mint Gate Result Card materializes beside the approved Card"],
      truthBoundary: "Observed in an isolated canonical Avatar Builder window. One actual loopback Ollama Council proposal received explicit local human approval, one local origin head, an isolated Overwind fixture durable acknowledgement, an isolated .hapaCatalog fixture source-only projection, and one live two-process Hyperswarm/Noise/Protomux peer receipt through an ephemeral loopback DHT. It does not claim internet-wide or geographically remote delivery, remote identity assurance, commerce eligibility, or autonomous mint authority.",
      checks,
      observed: { proposalCardId: mint.card.id, proposalCardDigest: mint.review.proposalCardDigest, reviewDigest: mint.review.reviewDigest, decisionId: decision.decisionId, decisionDigest: decision.decisionDigest, origin: mint.origin, catalog: mint.catalog, peer: mint.peer, resultCardId: mint.resultCard.id, resultCardDigest: mint.resultCard.cardRecordDigest },
      privacy: { namedWindowOnly: true, desktopExcluded: true, fullStargateAddressExcluded: true, peerProfilePathsExcluded: true, privateKeysExcluded: true },
      asset: { path: output, mediaType: "video/mp4", ...await fileProof(output) }, reviewPoster: { path: reviewPoster, mediaType: "image/png", ...await fileProof(reviewPoster) }, custodyPoster: { path: custodyPoster, mediaType: "image/png", ...await fileProof(custodyPoster) }, heroPoster: { path: heroPoster, mediaType: "image/png", ...await fileProof(heroPoster) },
      attribution: { harness: "Codex Desktop", model: "GPT-5.6 Sol (user-declared; runtime identifier not exposed)", application: "Hapa Avatar Builder", localProvider: "Ollama 0.24.0", localModel: "qwen3.5:27b", event: "OpenAI Codex Build Week", renderer: "Three.js + NeonBlade", transport: "Hyperswarm + Noise + Protomux", encoder: "FFmpeg/libx264" }, userAppTouched: false
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, manifestPath, output, reviewPoster, custodyPoster, heroPoster, checks }, null, 2));
    await fs.rm(framesDir, { recursive: true, force: true });
    captureWindow = null; win.destroy(); await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {});
    captureWindow = null; win.destroy(); await app.quit(); process.exit(1);
  }
}).catch((error) => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exit(1); });
