const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const targetUrl = process.env.CAPTURE_URL || "http://127.0.0.1:8787/";
const width = 1600, height = 900, fps = 12, durationMs = 16200;
const errors = [];
let captureWindow = null, keepAliveTimer = null;
app.setName("hapa-avatar-builder-stargate-mint-capture");
app.setPath("userData", path.join(os.tmpdir(), `hapa-avatar-builder-stargate-mint-capture-${process.pid}`));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(win, expression, timeout = 30000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await win.webContents.executeJavaScript(expression)) return true; await sleep(100); } return false; }
function run(command, args) { return new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; }); child.on("error", reject); child.on("close", code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}\n${stderr}`))); }); }
async function sha256(file) { const bytes = await fs.readFile(file); return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") }; }
app.on("window-all-closed", event => { if (captureWindow) event.preventDefault(); });

app.whenReady().then(async () => {
  keepAliveTimer = setInterval(() => {}, 1000);
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-stargate-mint-frames-"));
  const outputDir = path.join(ROOT, "artifacts/demos/CAT-GATE-001");
  const output = path.join(outputDir, "return-card-custody-relay.mp4");
  const poster = path.join(outputDir, "return-card-custody-relay-poster.png");
  const manifestPath = path.join(outputDir, "return-card-custody-relay.json");
  const win = captureWindow = new BrowserWindow({ width, height, show: false, backgroundColor: "#020617", webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (_event, level, message) => { if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) errors.push(message); });
  try {
    await fs.mkdir(outputDir, { recursive: true });
    await win.loadURL(targetUrl);
    if (!await waitFor(win, "Boolean(document.querySelector('.view-tabs button'))")) throw new Error("Avatar Builder did not mount");
    const tabClicked = await win.webContents.executeJavaScript(`(() => { const b=[...document.querySelectorAll('.view-tabs button')].find(x=>/tarot draw/i.test(x.textContent||'')); b?.click(); return Boolean(b); })()`);
    if (!tabClicked || !await waitFor(win, `Boolean(document.querySelector('.tarot-draw-view canvas') && window.__THREE_GAME_DIAGNOSTICS__?.kind === 'hapa-tarot-draw')`)) {
      const detail = await win.webContents.executeJavaScript(`({tabs:[...document.querySelectorAll('.view-tabs button')].map(x=>x.textContent.trim()), body:document.body.innerText.slice(0,1000), diagnostics:window.__THREE_GAME_DIAGNOSTICS__?.kind || null})`);
      throw new Error(`Tarot Draw did not mount: ${JSON.stringify(detail)}${errors.length ? `\n${errors.join("\n")}` : ""}`);
    }
    if (!await waitFor(win, `Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 0`)) throw new Error("Tarot deck did not become ready");
    await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.actions.loadStargateDemoFormation()`);
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__.state.stargate.state === 'ready'`, 8000)) throw new Error("Formation not ready");
    await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.actions.dialStargate()`);
    if (!await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__.state.stargate.state === 'active'`, 15000)) throw new Error("Gate not active");

    const startedAt = Date.now(); let frameIndex = 0, saveClicked = false, reviewClicked = false, mintClicked = false, surfaceSize = { width, height };
    while (Date.now() - startedAt < durationMs) {
      const elapsed = Date.now() - startedAt;
      if (!saveClicked && elapsed > 1100) saveClicked = await win.webContents.executeJavaScript(`(() => { const b=document.querySelector('.tarot-save-scene-toggle'); if(!b||!/save gate/i.test(b.textContent||''))return false;b.click();return true;})()`);
      if (!reviewClicked && elapsed > 6700) reviewClicked = await win.webContents.executeJavaScript(`(() => { const b=document.querySelector('.tarot-stargate-mint-open'); if(!b)return false;b.click();return true;})()`);
      if (!mintClicked && elapsed > 9600) mintClicked = await win.webContents.executeJavaScript(`(() => { const b=document.querySelector('.tarot-stargate-mint-approve'); if(!b)return false;b.click();return true;})()`);
      const image = await win.capturePage(); surfaceSize = image.getSize();
      await fs.writeFile(path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`), image.toPNG());
      frameIndex += 1; await sleep(Math.max(0, startedAt + frameIndex * (1000 / fps) - Date.now()));
    }
    const truth = await win.webContents.executeJavaScript(`(() => ({
      state: window.__THREE_GAME_DIAGNOSTICS__?.state?.stargate?.mintStage,
      chamber: document.querySelector('.tarot-stargate-mint-chamber')?.getAttribute('data-state'),
      stages: [...document.querySelectorAll('.tarot-stargate-custody-track > div')].map(x=>({label:x.textContent.trim(),complete:x.dataset.complete})),
      text: document.querySelector('.tarot-stargate-mint-chamber')?.innerText || '',
      fullAddressLeaked: /hapa-gate:v1:[a-z2-7]{52}/i.test(document.body.innerText),
      publicSecretLeaked: document.body.innerText.includes('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8')
    }))()`);
    if (!saveClicked || !reviewClicked || !mintClicked || truth.state !== "catalog_indexed" || truth.chamber !== "catalog_indexed" || truth.stages.filter(x => x.complete === "true").length !== 4 || truth.fullAddressLeaked || truth.publicSecretLeaked || !/join authority excluded/i.test(truth.text) || !/result card pressed/i.test(truth.text)) throw new Error(`Visual truth gate failed: ${JSON.stringify(truth)}`);
    if (errors.length) throw new Error(`Renderer console errors:\n${errors.join("\n")}`);
    await fs.writeFile(poster, (await win.capturePage()).toPNG());
    await run("ffmpeg", ["-y", "-framerate", String(fps), "-i", path.join(framesDir, "frame-%05d.png"), "-vf", `fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
    const manifest = {
      schemaVersion: "hapa.demo-capture.v1", captureId: "cat-gate-001-custody-relay-2026-07-18-01", taskId: "CAT-GATE-001", title: "Return Card Custody Relay",
      surface: "canonical-hapa-avatar-builder-tarot-draw-isolated-electron-window", sourceUrl: targetUrl,
      capture: { windowWidth: width, windowHeight: height, surfaceWidth: surfaceSize.width, surfaceHeight: surfaceSize.height, fps, frameCount: frameIndex, durationSeconds: durationMs / 1000, audio: false },
      story: ["active four-Card Gate", "Gate collapses into physical Return Card", "human review chamber", "Origin/Overwind/Catalog custody relay", "cyan-gold exact projection proof"],
      truthBoundary: "Visual capture uses isolated deterministic Overwind/Catalog acknowledgement fixtures. Real origin durability and Catalog subscriber semantics are verified separately by automated tests; no live production network claim is made.",
      observed: truth, privacy: { namedWindowOnly: true, desktopExcluded: true, fullAddressExcluded: true, cohortSecretExcluded: true, privateTopicExcluded: true },
      asset: { path: output, mediaType: "video/mp4", ...await sha256(output) }, poster: { path: poster, mediaType: "image/png", ...await sha256(poster) },
      attribution: { harness: "Codex Desktop", model: "GPT-5.6 Sol (user-declared; runtime identifier not exposed)", application: "Hapa Avatar Builder", event: "OpenAI Codex Build Week", renderer: "Three.js", encoder: "FFmpeg/libx264" }
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ ok: true, ...manifest }, null, 2));
    await fs.rm(framesDir, { recursive: true }); clearInterval(keepAliveTimer); captureWindow = null; win.destroy(); await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    if (errors.length) console.error(errors.join("\n"));
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {}); clearInterval(keepAliveTimer); captureWindow = null; win.destroy(); await app.quit(); process.exit(1);
  }
}).catch(error => { console.error(error instanceof Error ? error.stack || error.message : String(error)); process.exit(1); });
