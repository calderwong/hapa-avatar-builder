#!/usr/bin/env electron
const { app, BrowserWindow, powerSaveBlocker } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { analyzeElectronKioskPass } = require("./song-card-electron-kiosk-analyzer.cjs");

const RECEIPT_SCHEMA = "hapa.song-card.electron-application-kiosk-soak.v1";

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    const next = argv[index + 1];
    parsed[key.slice(2)] = next && !next.startsWith("--") ? (index += 1, next) : true;
  }
  return parsed;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, expression, timeoutMs = 30_000, label = expression) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`).catch(() => false)) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function bufferedRangesExpression() {
  return `(() => {
    const video = document.querySelector('[data-testid="song-card-edition-video"]');
    if (!video) return [];
    return Array.from({length: video.buffered.length}, (_, index) => ({start: video.buffered.start(index), end: video.buffered.end(index)}));
  })()`;
}

async function selectDearPapa(win, title) {
  await waitFor(win, `document.querySelector('.hapa-songs-view')`, 30_000, "Hapa Songs application view");
  await win.webContents.executeJavaScript(`(() => {
    const input = [...document.querySelectorAll('input')].find((row) => row.placeholder === 'Search title, lore, status, tags');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(title)});
    input.dispatchEvent(new Event('input', {bubbles: true}));
    return true;
  })()`);
  await wait(500);
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.song-row')].find((item) => item.querySelector('strong')?.textContent?.trim() === ${JSON.stringify(title)});
    row?.click();
    return Boolean(row);
  })()`);
  if (!clicked) throw new Error(`The ${title} song row is not available in the application UI`);
  await waitFor(win, `document.querySelector('[data-testid="song-card-mint-panel"]') && [...document.querySelectorAll('[data-testid="song-card-mint-panel"] button')].some((row) => row.textContent.includes('Edition 1')) && [...document.querySelectorAll('[data-testid="song-card-mint-panel"] button')].some((row) => row.textContent.includes('Edition 2'))`, 30_000, "Dear Papa Song Card editions");
  await win.webContents.executeJavaScript(`(() => {
    const panel = document.querySelector('[data-testid="song-card-mint-panel"]');
    Object.assign(panel.style, {
      position: 'fixed', inset: '24px 36px', zIndex: '99999', maxHeight: 'none',
      height: 'calc(100vh - 48px)', width: 'auto', overflow: 'auto', boxShadow: '0 0 70px #02040a'
    });
    document.body.style.overflow = 'hidden';
  })()`);
  return win.webContents.executeJavaScript(`(() => {
    const detail = document.querySelector('.song-detail-title');
    const panel = document.querySelector('[data-testid="song-card-mint-panel"]');
    return {
      selectedTitle: detail?.querySelector('h2')?.textContent?.trim() || '',
      songId: detail?.querySelector('.song-scope-badge em')?.textContent?.trim() || '',
      panelTitle: panel?.querySelector('header strong')?.textContent?.trim() || '',
      editionButtons: [...panel.querySelectorAll('button')].map((row) => row.textContent.trim()).filter((text) => text.startsWith('Edition ')),
    };
  })()`);
}

async function chooseEditionAndPrebuffer(win, edition) {
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const panel = document.querySelector('[data-testid="song-card-mint-panel"]');
    const button = [...panel.querySelectorAll('button')].find((row) => row.textContent.trim().startsWith('Edition ${edition} ·'));
    button?.click();
    return Boolean(button);
  })()`);
  if (!clicked) throw new Error(`Edition ${edition} is not selectable in the Song Card application UI`);
  await waitFor(win, `[...document.querySelectorAll('[data-testid="song-card-mint-panel"] span')].some((row) => row.textContent.includes('Edition ${edition} ·'))`, 15_000, `selected Edition ${edition}`);
  await waitFor(win, `(() => { const video=document.querySelector('[data-testid="song-card-edition-video"]'); return Boolean(video?.currentSrc) && Number(video.duration||0) >= 59; })()`, 30_000, `Edition ${edition} immutable video metadata`);
  const fullBuffer = await win.webContents.executeJavaScript(`(async () => {
    const video = document.querySelector('[data-testid="song-card-edition-video"]');
    video.muted = true;
    video.volume = 0;
    video.preload = 'auto';
    const immutableArtifactUrl = video.currentSrc;
    const startedAt = performance.now();
    const response = await fetch(immutableArtifactUrl, {cache: 'force-cache', credentials: 'same-origin'});
    if (!response.ok) throw new Error('Full immutable artifact buffer failed (' + response.status + ')');
    const declaredArtifactBytes = Number(response.headers.get('content-length') || 0);
    const artifactSha256 = String(response.headers.get('x-hapa-artifact-sha256') || '').replace(/^sha256:/, '');
    const blob = await response.blob();
    if (!blob.size || (declaredArtifactBytes && blob.size !== declaredArtifactBytes)) throw new Error('Full immutable artifact buffer was truncated');
    const objectUrl = URL.createObjectURL(blob);
    video.dataset.hapaImmutableArtifactUrl = immutableArtifactUrl;
    video.dataset.hapaFullBufferObjectUrl = objectUrl;
    video.src = objectUrl;
    video.load();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Fully buffered video metadata timed out')), 30000);
      const ready = () => { clearTimeout(timeout); cleanup(); resolve(); };
      const failed = () => { clearTimeout(timeout); cleanup(); reject(new Error('Fully buffered video failed to load')); };
      const cleanup = () => { video.removeEventListener('loadedmetadata', ready); video.removeEventListener('error', failed); };
      video.addEventListener('loadedmetadata', ready, {once: true});
      video.addEventListener('error', failed, {once: true});
    });
    return {
      fullyBuffered: true,
      bufferingMethod: 'authenticated-full-artifact-fetch-to-memory-blob-before-playback',
      artifactBytes: blob.size,
      declaredArtifactBytes,
      artifactSha256,
      contentType: blob.type || response.headers.get('content-type') || '',
      bufferWallMs: performance.now() - startedAt,
    };
  })()`);
  await waitFor(win, `(() => {
    const video = document.querySelector('[data-testid="song-card-edition-video"]');
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
    return video.buffered.length > 0 && video.buffered.end(video.buffered.length - 1) >= 0.25;
  })()`, 30_000, `Edition ${edition} prebuffer`);
  await win.webContents.executeJavaScript(`(() => {
    const video = document.querySelector('[data-testid="song-card-edition-video"]');
    video.pause();
    video.currentTime = 0;
    return true;
  })()`);
  await waitFor(win, `Number(document.querySelector('[data-testid="song-card-edition-video"]')?.currentTime || 0) < 0.05`, 10_000, `Edition ${edition} rewind`);
  const mediaState = await win.webContents.executeJavaScript(`(() => {
    const video = document.querySelector('[data-testid="song-card-edition-video"]');
    return {
      readyState: video.readyState,
      networkState: video.networkState,
      durationMs: video.duration * 1000,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      bufferedRanges: ${bufferedRangesExpression()},
    };
  })()`);
  return { ...mediaState, ...fullBuffer };
}

async function startInstrumentedPlayback(win, edition, cycle, prebuffer) {
  return win.webContents.executeJavaScript(`(() => {
    const video = document.querySelector('[data-testid="song-card-edition-video"]');
    if (!(video instanceof HTMLVideoElement)) throw new Error('Song Card HTMLVideoElement is missing');
    if (typeof video.requestVideoFrameCallback !== 'function') throw new Error('requestVideoFrameCallback is unavailable');
    const quality = () => {
      const row = typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : {};
      return {
        creationTime: Number(row.creationTime || 0),
        totalVideoFrames: Number(row.totalVideoFrames || 0),
        droppedVideoFrames: Number(row.droppedVideoFrames || 0),
        corruptedVideoFrames: Number(row.corruptedVideoFrames || 0),
      };
    };
    const panel = document.querySelector('[data-testid="song-card-mint-panel"]');
    const selectedEditionLabel = [...panel.querySelectorAll('span')].map((row) => row.textContent || '').find((text) => text.includes('Edition ${edition} ·')) || '';
    const selectedEditionMatch = selectedEditionLabel.match(/Edition\\s+(\\d+)\\s+·/);
    const raw = {
      edition: ${edition},
      cycle: ${cycle},
      selectedEdition: Number(selectedEditionMatch?.[1] || 0),
      panelPresent: Boolean(panel),
      elementKind: video.constructor.name,
      windowVisible: !document.hidden,
      documentVisibility: document.visibilityState,
      requestVideoFrameCallbackSupported: true,
      durationMs: Number(video.duration * 1000),
      finalMediaTimeMs: 0,
      playStartedWallMs: 0,
      finishedWallMs: 0,
      ended: false,
      timedOut: false,
      playRejected: false,
      mediaError: null,
      events: [],
      frameCallbacks: [],
      progressSamples: [],
      blackSamples: [],
      playbackQualityBefore: quality(),
      playbackQualityAfter: null,
      prebuffer: ${JSON.stringify(prebuffer)},
      renderer: {
        pageUrl: location.href,
        userAgent: navigator.userAgent,
        devicePixelRatio: window.devicePixelRatio,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      },
      complete: false,
    };
    const started = performance.now();
    const wall = () => performance.now() - started;
    const eventTypes = ['play', 'playing', 'waiting', 'stalled', 'suspend', 'pause', 'ended', 'error'];
    const listeners = [];
    let active = false;
    let stopped = false;
    let intervalId = 0;
    let callbackId = 0;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 18;
    const context = canvas.getContext('2d', {alpha: false, willReadFrequently: true});
    const snapshot = () => ({
      wallMs: wall(),
      mediaTimeMs: Number(video.currentTime * 1000),
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      ended: video.ended,
      active,
    });
    const finish = (reason) => {
      if (stopped) return;
      stopped = true;
      active = false;
      if (intervalId) clearInterval(intervalId);
      if (callbackId && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(callbackId);
      for (const [type, listener] of listeners) video.removeEventListener(type, listener);
      raw.finalMediaTimeMs = Number(video.currentTime * 1000);
      raw.finishedWallMs = wall();
      raw.ended = video.ended || reason === 'ended';
      raw.timedOut = reason === 'timeout';
      raw.mediaError = video.error ? {code: video.error.code, message: video.error.message || ''} : null;
      raw.playbackQualityAfter = quality();
      raw.completeReason = reason;
      raw.complete = true;
    };
    for (const type of eventTypes) {
      const listener = () => {
        raw.events.push({type, ...snapshot()});
        if (type === 'ended') finish('ended');
        if (type === 'error') finish('error');
      };
      listeners.push([type, listener]);
      video.addEventListener(type, listener);
    }
    const sample = () => {
      const row = snapshot();
      raw.progressSamples.push(row);
      if (!active || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !context || !video.videoWidth || !video.videoHeight) return;
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let blackPixels = 0;
        let lumaTotal = 0;
        const pixelCount = pixels.length / 4;
        for (let index = 0; index < pixels.length; index += 4) {
          const luma = (0.2126 * pixels[index]) + (0.7152 * pixels[index + 1]) + (0.0722 * pixels[index + 2]);
          lumaTotal += luma;
          if (luma <= 12.75) blackPixels += 1;
        }
        const blackPixelRatio = blackPixels / pixelCount;
        raw.blackSamples.push({...row, meanLuma: lumaTotal / pixelCount, blackPixelRatio, isBlack: blackPixelRatio >= 0.98});
      } catch (error) {
        raw.events.push({type: 'pixel-sample-error', message: error.message, ...row});
      }
    };
    const frame = (now, metadata) => {
      if (stopped) return;
      if (active) raw.frameCallbacks.push({
        wallMs: wall(),
        callbackNowMs: Number(now),
        mediaTimeMs: Number(metadata.mediaTime * 1000),
        expectedDisplayTimeMs: Number(metadata.expectedDisplayTime || 0),
        presentedFrames: Number(metadata.presentedFrames || 0),
        processingDurationMs: Number((metadata.processingDuration || 0) * 1000),
      });
      callbackId = video.requestVideoFrameCallback(frame);
    };
    window.__hapaSongCardKiosk = {raw, finish, video};
    callbackId = video.requestVideoFrameCallback(frame);
    intervalId = setInterval(sample, 100);
    video.muted = true;
    video.volume = 0;
    raw.playStartedWallMs = wall();
    active = true;
    sample();
    video.play().catch((error) => {
      raw.playRejected = true;
      raw.events.push({type: 'play-rejected', message: error.message, ...snapshot()});
      finish('play-rejected');
    });
    return {started: true, edition: raw.edition, cycle: raw.cycle};
  })()`);
}

async function warmPlaybackPipeline(win, edition, warmupSeconds = 10) {
  const startedAt = Date.now();
  const target = await win.webContents.executeJavaScript(`(() => {
    const video = document.querySelector('[data-testid="song-card-edition-video"]');
    video.pause();
    video.currentTime = 0;
    video.muted = true;
    video.volume = 0;
    const targetSeconds = Math.min(${Number(warmupSeconds)}, Math.max(1, Number(video.duration || 0) / 4));
    video.play();
    return targetSeconds;
  })()`);
  await waitFor(win, `Number(document.querySelector('[data-testid="song-card-edition-video"]')?.currentTime || 0) >= ${Number(target)}`, 30_000, `Edition ${edition} decoder and UI warmup`);
  const reachedSeconds = await win.webContents.executeJavaScript(`(() => {
    const video = document.querySelector('[data-testid="song-card-edition-video"]');
    const reached = Number(video.currentTime || 0);
    video.pause();
    video.currentTime = 0;
    return reached;
  })()`);
  await waitFor(win, `Number(document.querySelector('[data-testid="song-card-edition-video"]')?.currentTime || 0) < 0.05`, 10_000, `Edition ${edition} rewind after warmup`);
  return {
    method: "muted-decoder-ui-preroll-before-measurement",
    targetSeconds: Number(target),
    reachedSeconds: Number(reachedSeconds),
    wallMs: Date.now() - startedAt,
    excludedFromMeasuredPass: true,
  };
}

async function runPass(win, outputRoot, { edition, cycle, expectedDurationMs, timeoutMs }) {
  const prebuffer = await chooseEditionAndPrebuffer(win, edition);
  await win.webContents.executeJavaScript(`(() => {
    const video = document.querySelector('[data-testid="song-card-edition-video"]');
    video.currentTime = Math.min(1, Math.max(0, Number(video.duration || 0) - 0.1));
  })()`);
  await waitFor(win, `Number(document.querySelector('[data-testid="song-card-edition-video"]')?.currentTime || 0) >= 0.9`, 10_000, `Edition ${edition} compositor evidence frame`);
  const screenshot = await win.webContents.capturePage();
  const screenshotBytes = screenshot.toPNG();
  const screenshotName = path.join("electron-kiosk-evidence", `cycle-${cycle}-edition-${edition}-prebuffered.png`);
  const screenshotPath = path.join(outputRoot, screenshotName);
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  fs.writeFileSync(screenshotPath, screenshotBytes);
  prebuffer.warmup = await warmPlaybackPipeline(win, edition);
  const startedAt = new Date().toISOString();
  await startInstrumentedPlayback(win, edition, cycle, prebuffer);
  await waitFor(win, `Number(window.__hapaSongCardKiosk?.raw?.finalMediaTimeMs || window.__hapaSongCardKiosk?.video?.currentTime * 1000 || 0) >= 1000 || window.__hapaSongCardKiosk?.raw?.complete === true`, 20_000, `Edition ${edition} first composited second`);
  try {
    await waitFor(win, `window.__hapaSongCardKiosk?.raw?.complete === true`, timeoutMs, `Edition ${edition} natural HTMLVideoElement completion`);
  } catch (error) {
    await win.webContents.executeJavaScript(`window.__hapaSongCardKiosk?.finish?.('timeout')`).catch(() => {});
    throw error;
  }
  const raw = await win.webContents.executeJavaScript(`window.__hapaSongCardKiosk.raw`);
  const analysis = analyzeElectronKioskPass(raw, { expectedDurationMs });
  await win.webContents.executeJavaScript(`(() => {
    const video = document.querySelector('[data-testid="song-card-edition-video"]');
    const objectUrl = video?.dataset?.hapaFullBufferObjectUrl || '';
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  })()`).catch(() => {});
  return {
    ...analysis,
    edition,
    cycle,
    order: `cycle-${cycle}:edition-${edition}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    actualMediaDurationMs: Number(Number(raw.durationMs || 0).toFixed(3)),
    traceEvidence: {
      frameCallbacksSha256: sha256(JSON.stringify(raw.frameCallbacks || [])),
      progressSamplesSha256: sha256(JSON.stringify(raw.progressSamples || [])),
      blackSamplesSha256: sha256(JSON.stringify(raw.blackSamples || [])),
      firstFrame: raw.frameCallbacks?.[0] || null,
      middleFrame: raw.frameCallbacks?.[Math.floor((raw.frameCallbacks?.length || 1) / 2)] || null,
      finalFrame: raw.frameCallbacks?.at?.(-1) || null,
    },
    screenshot: { path: screenshotName, bytes: screenshotBytes.length, sha256: sha256(screenshotBytes) },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputRoot = path.resolve(String(options.output || process.env.HAPA_SONG_CARD_ELECTRON_SOAK_OUTPUT || "outputs/dear-papa-song-card-mint-demo-verified"));
  const baseUrl = String(options.url || process.env.HAPA_SONG_CARD_ELECTRON_SOAK_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");
  const token = String(process.env.HAPA_AVATAR_ADMIN_TOKEN || "").trim();
  const title = String(options.title || "Dear Papa");
  const expectedDurationMs = positiveNumber(options["expected-seconds"], 60) * 1000;
  const timeoutMs = positiveNumber(options["pass-timeout-seconds"], 95) * 1000;
  if (!token) throw new Error("HAPA_AVATAR_ADMIN_TOKEN is required to authorize immutable Song Card media playback");
  fs.mkdirSync(outputRoot, { recursive: true });

  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    show: true,
    backgroundColor: "#020617",
    title: "Hapa Song Card Kiosk Soak",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  await win.loadURL(`${baseUrl}/?view=songs`);
  await waitFor(win, `document.querySelector('.hapa-songs-view')`, 30_000, "packaged Hapa application UI");
  await win.webContents.executeJavaScript(`sessionStorage.setItem('hapa-song-card-mint-token', ${JSON.stringify(token)});`);
  await win.loadURL(`${baseUrl}/?view=songs`);
  const applicationSelection = await selectDearPapa(win, title);
  if (applicationSelection.selectedTitle !== title) throw new Error(`Application selected ${applicationSelection.selectedTitle || "no song"}, expected ${title}`);

  const sequence = [
    { cycle: 1, edition: 1 },
    { cycle: 1, edition: 2 },
    { cycle: 2, edition: 1 },
    { cycle: 2, edition: 2 },
  ];
  const runs = [];
  for (const entry of sequence) runs.push(await runPass(win, outputRoot, { ...entry, expectedDurationMs, timeoutMs }));
  const checks = {
    actualApplicationUiSelectedDearPapa: applicationSelection.selectedTitle === title && applicationSelection.editionButtons.length === 2,
    exactEditionOrderRepeatedTwice: runs.map((row) => row.edition).join(",") === "1,2,1,2",
    fourNaturalHtmlVideoElementPasses: runs.length === 4 && runs.every((row) => row.checks.endedNaturally && row.checks.htmlVideoElementPlayed),
    visibleElectronCompositorForEveryPass: runs.every((row) => row.checks.browserWindowVisible && row.screenshot.bytes > 1000),
    requestVideoFrameCallbackForEveryPass: runs.every((row) => row.checks.requestVideoFrameCallbackObserved),
    fullImmutableArtifactBufferedBeforeEveryPass: runs.every((row) => row.checks.fullImmutableArtifactBuffered),
    everyPassReachedFullDurationInRealtime: runs.every((row) => row.checks.durationReached && row.checks.realtimeWallDuration),
    noMediaErrors: runs.every((row) => row.checks.noMediaErrors),
    noPresentationTimestampGaps: runs.every((row) => row.checks.noPresentationTimestampGaps),
    noFrameCallbackWallGaps: runs.every((row) => row.checks.noFrameCallbackWallGaps),
    noProgressStalls: runs.every((row) => row.checks.noProgressStalls),
    blackFrameSamplingObserved: runs.every((row) => row.checks.blackFrameSamplingObserved && row.checks.noFrameSampleErrors),
    noReportedDroppedFrames: runs.every((row) => row.checks.noReportedDroppedFrames),
    noReportedCorruptedFrames: runs.every((row) => row.checks.noReportedCorruptedFrames),
    noUnintendedBlackIntervals: runs.every((row) => row.checks.noUnintendedBlackIntervals),
  };
  const base = {
    schemaVersion: RECEIPT_SCHEMA,
    generatedAt: new Date().toISOString(),
    ok: Object.values(checks).every(Boolean),
    status: Object.values(checks).every(Boolean) ? "verified-twice-through-electron-application-kiosk-playback" : "failed-twice-through-electron-application-kiosk-playback",
    truthPolicy: {
      applicationSurface: "visible Electron BrowserWindow loaded the packaged Hapa Songs UI and its real SongCardMintPanel",
      smoothnessEvidence: "the complete authenticated immutable artifact is bound as an in-memory Blob and receives a muted 10 second decoder/UI preroll before the measured pass; HTMLVideoElement requestVideoFrameCallback timestamps, 100 ms currentTime progress samples, and Chromium getVideoPlaybackQuality counters then measure playback",
      blackPolicy: "a 32x18 same-origin frame sample every 100 ms fails when >=98% of pixels remain <=5% luma for >=200 ms",
      stallPolicy: "fails on >=750 ms media-progress stalls, large presented-media-time gaps, or >=750 ms frame-callback wall gaps",
      audioPolicy: "playback is muted for unattended acceptance while the immutable multiplexed artifact is played to natural end",
    },
    application: {
      title,
      songId: applicationSelection.songId,
      selectedTitle: applicationSelection.selectedTitle,
      panelTitle: applicationSelection.panelTitle,
      editionButtons: applicationSelection.editionButtons,
      baseUrl,
      browserWindow: { visible: win.isVisible(), bounds: win.getBounds(), backgroundThrottling: false, webSecurity: true },
    },
    configuration: { cycles: 2, editionOrderPerCycle: [1, 2], expectedDurationMs, timeoutMs, prebufferPolicy: "complete-authenticated-artifact-plus-muted-decoder-ui-preroll-before-measured-playback", progressSampleIntervalMs: 100, blackMinimumDurationMs: 200 },
    runs,
    checks,
  };
  const receipt = { ...base, receiptSha256: sha256(JSON.stringify(stable(base))) };
  const receiptPath = path.join(outputRoot, "electron-kiosk-soak-receipt.json");
  atomicWriteJson(receiptPath, receipt);
  process.stdout.write(`${JSON.stringify({ ok: receipt.ok, status: receipt.status, receipt: path.basename(receiptPath), checks }, null, 2)}\n`);
  win.destroy();
  if (!receipt.ok) process.exitCode = 1;
}

const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-song-card-electron-kiosk-"));
app.setPath("userData", profileRoot);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let blockerId = null;
app.whenReady().then(async () => {
  blockerId = powerSaveBlocker.start("prevent-display-sleep");
  await main();
}).then(() => app.quit()).catch((error) => {
  console.error(error?.stack || error);
  app.exit(1);
}).finally(() => {
  if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
});

app.on("window-all-closed", () => app.quit());
app.on("quit", () => {
  try { fs.rmSync(profileRoot, { recursive: true, force: true }); } catch { /* Best-effort ephemeral kiosk profile cleanup. */ }
});
