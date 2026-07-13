const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SONG_ID = process.env.SMOKE_SONG_ID || "dear-papa-song-cooler-than-you-leo-thor-s-card-hunt";
const SONG_TITLE = process.env.SMOKE_SONG_TITLE || "Cooler Than You (Leo & Thor’s Card Hunt)";
const SWITCH_SONG_ID = process.env.SMOKE_SWITCH_SONG_ID || "dear-papa-song-dear-papa";
const SWITCH_SONG_TITLE = process.env.SMOKE_SWITCH_SONG_TITLE || "Dear Papa";
const UI_URL = process.env.SMOKE_URL || "http://127.0.0.1:15188/?view=echos";
const API_BASE = process.env.SMOKE_API_BASE || "http://127.0.0.1:18887";
const OUTPUT = process.env.SMOKE_OUTPUT || path.join(ROOT, "artifacts/smoke/echos-album-playback-acceptance.json");
const SCREENSHOT_DIR = process.env.SMOKE_SCREENSHOT_DIR ? path.resolve(process.env.SMOKE_SCREENSHOT_DIR) : null;
const SAMPLE_COUNT = Math.max(9, Number(process.env.SMOKE_SAMPLE_COUNT || 18));
const SAMPLE_INTERVAL_MS = Math.max(350, Number(process.env.SMOKE_SAMPLE_INTERVAL_MS || 500));
const PAUSE_HOLD_MS = Math.max(1000, Number(process.env.SMOKE_PAUSE_HOLD_MS || 1250));
const RESUME_SAMPLE_COUNT = Math.max(5, Number(process.env.SMOKE_RESUME_SAMPLE_COUNT || 6));

process.env.HAPA_AVATAR_API_BASE = API_BASE;
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setName("hapa-echos-album-playback-acceptance");
const USER_DATA = path.join("/tmp", `hapa-echos-album-playback-acceptance-${process.pid}`);
fs.mkdirSync(USER_DATA, { recursive: true });
app.setPath("userData", USER_DATA);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, options = {}) {
  const started = performance.now();
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { statusCode: response.status, elapsedMs: Math.round(performance.now() - started), body };
}

async function waitForJob(url, timeoutMs = 60000) {
  const started = Date.now();
  let last = null;
  let polls = 0;
  while (Date.now() - started < timeoutMs) {
    last = await requestJson(url);
    polls += 1;
    if (["ready", "failed"].includes(last.body?.status)) {
      return { ...last, polls, totalElapsedMs: Date.now() - started };
    }
    await sleep(250);
  }
  throw new Error(`preview preparation timed out after ${timeoutMs} ms; last=${JSON.stringify(last?.body || null)}`);
}

async function waitFor(win, label, expression, timeoutMs = 60000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await win.webContents.executeJavaScript(expression, true);
      if (last) return { value: last, elapsedMs: Date.now() - started };
    } catch (error) {
      last = { evaluationError: String(error.message || error) };
    }
    await sleep(150);
  }
  throw new Error(`${label} timed out after ${timeoutMs} ms; last=${JSON.stringify(last)}`);
}

async function waitForState(win, label, expression, accept, timeoutMs = 60000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await win.webContents.executeJavaScript(expression, true);
      if (accept(last)) return { value: last, elapsedMs: Date.now() - started };
    } catch (error) {
      last = { evaluationError: String(error.message || error) };
    }
    await sleep(150);
  }
  throw new Error(`${label} timed out after ${timeoutMs} ms; last=${JSON.stringify(last)}`);
}

async function selectDirectorSong(win, { songId = SONG_ID, songTitle = SONG_TITLE } = {}, timeoutMs = 60000) {
  const started = Date.now();
  let stableReads = 0;
  let clicks = 0;
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await win.webContents.executeJavaScript(`
      (() => {
        const heading = [...document.querySelectorAll(".hapa-echos-view h4")].map((item) => item.textContent || "").find((text) => /Blueprint$/.test(text)) || "";
        const projectKey = globalThis.__HAPA_ECHO_PLAYBACK_ENGINE__?.projectKey || "";
        return { heading, projectKey };
      })()
    `, true);
    if (last.heading === `${songTitle} Blueprint` && last.projectKey === songId) {
      stableReads += 1;
      if (stableReads >= 5) return { value: last, elapsedMs: Date.now() - started, clicks, stableReads };
    } else {
      stableReads = 0;
      const clicked = await win.webContents.executeJavaScript(`
        (() => {
          const item = [...document.querySelectorAll(".hapa-echos-view .media-scroll-container span")].find((node) => (node.textContent || "").trim() === ${JSON.stringify(songTitle)});
          const row = item?.parentElement?.parentElement;
          if (!row) return false;
          row.click();
          return true;
        })()
      `, true);
      if (clicked) clicks += 1;
    }
    await sleep(300);
  }
  throw new Error(`stable ${songTitle} selection timed out after ${timeoutMs} ms; last=${JSON.stringify(last)}, clicks=${clicks}`);
}

function pixelMetrics(image) {
  const size = image.getSize();
  const pixels = image.toBitmap();
  const stride = Math.max(1, Math.floor((size.width * size.height) / 30000));
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  let nearBlack = 0;
  let dark = 0;
  for (let pixel = 0; pixel < size.width * size.height; pixel += stride) {
    const offset = pixel * 4;
    const luminance = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
    count += 1;
    sum += luminance;
    sumSquares += luminance * luminance;
    if (luminance < 5) nearBlack += 1;
    if (luminance < 12) dark += 1;
  }
  const meanLuma = count ? sum / count : 0;
  const variance = count ? Math.max(0, sumSquares / count - meanLuma * meanLuma) : 0;
  return {
    width: size.width,
    height: size.height,
    meanLuma: Number(meanLuma.toFixed(2)),
    lumaStdDev: Number(Math.sqrt(variance).toFixed(2)),
    nearBlackFraction: Number((nearBlack / Math.max(1, count)).toFixed(4)),
    darkFraction: Number((dark / Math.max(1, count)).toFixed(4)),
  };
}

async function readUiState(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const preview = document.querySelector(".media-preview-container");
      const fallback = preview?.querySelector("[data-echo-fallback]");
      const videos = [...(preview?.querySelectorAll("video[data-echo-player]") || [])];
      const active = videos.find((video) => video.dataset.echoPlayer === "current");
      const audio = document.querySelector(".hapa-echos-view audio");
      const engine = globalThis.__HAPA_ECHO_PLAYBACK_ENGINE__ || null;
      const playButton = [...document.querySelectorAll(".hapa-echos-view button")].find((button) => /Play Show|Pause|Buffering video/i.test(button.textContent || ""));
      const playhead = [...document.querySelectorAll('.hapa-echos-view input[type="range"]')].find((input) => Number(input.max || 0) > 10) || null;
      const statusText = [...document.querySelectorAll(".hapa-echos-view span")].map((item) => (item.textContent || "").trim()).find((text) => /^(READY|FALLBACK|BUFFERING|IDLE)\\s+·\\s+\\d+\\/\\d+\\s+AHEAD$/i.test(text)) || "";
      const heading = [...document.querySelectorAll(".hapa-echos-view h4")].map((item) => item.textContent || "").find((text) => /Blueprint$/.test(text)) || "";
      const compileButton = [...document.querySelectorAll(".hapa-echos-view button")].find((button) => /COMPILE SMOOTH PREVIEW/i.test(button.textContent || ""));
      return {
        heading,
        statusText,
        stageStatus: fallback?.dataset.echoFallback || "missing",
        fallbackHasPoster: Boolean(fallback?.querySelector("img")),
        playerCount: videos.length,
        activePlayerCount: videos.filter((video) => video.dataset.echoPlayer === "current").length,
        framePresentedCount: videos.filter((video) => video.dataset.framePresented === "true").length,
        players: videos.map((video) => ({
          role: video.dataset.echoPlayer,
          framePresented: video.dataset.framePresented,
          sourceKey: video.dataset.echoSourceKey || video.dataset.echoPreparingKey || "",
          currentSrc: video.currentSrc || video.src || "",
          currentTime: Number((video.currentTime || 0).toFixed(3)),
          duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(3)) : null,
          readyState: video.readyState,
          paused: video.paused,
          seeking: video.seeking,
          width: video.videoWidth,
          height: video.videoHeight,
          error: video.error ? { code: video.error.code, message: video.error.message } : null,
        })),
        active: active ? {
          sourceKey: active.dataset.echoSourceKey || active.dataset.echoPreparingKey || "",
          currentSrc: active.currentSrc || active.src || "",
          currentTime: Number((active.currentTime || 0).toFixed(3)),
          readyState: active.readyState,
          paused: active.paused,
          width: active.videoWidth,
          height: active.videoHeight,
          error: active.error ? { code: active.error.code, message: active.error.message } : null,
        } : null,
        audio: audio ? {
          currentTime: Number((audio.currentTime || 0).toFixed(3)),
          duration: Number.isFinite(audio.duration) ? Number(audio.duration.toFixed(3)) : null,
          readyState: audio.readyState,
          paused: audio.paused,
          ended: audio.ended,
          error: audio.error ? { code: audio.error.code, message: audio.error.message } : null,
        } : null,
        playButton: playButton ? { text: (playButton.textContent || "").trim(), disabled: playButton.disabled } : null,
        playhead: playhead ? { value: Number(playhead.value), min: Number(playhead.min), max: Number(playhead.max) } : null,
        pendingProxyButtonVisible: Boolean(compileButton),
        engine: engine ? {
          generation: engine.generation,
          projectKey: engine.projectKey,
          clockTime: engine.clockTime,
          duration: engine.duration,
          playing: engine.playing,
          powerMode: engine.powerMode,
          shotIndex: engine.shotIndex,
          targetShotIndex: engine.targetShotIndex,
          mediaType: engine.mediaType,
          mediaUri: engine.mediaUri,
          missingMedia: engine.missingMedia,
          reason: engine.reason,
          destroyed: engine.destroyed,
        } : null,
        clockDiagnostics: globalThis.__HAPA_ECHO_CLOCK_DIAGNOSTICS__ || null,
      };
    })()
  `, true);
}

async function capturePreviewSample(win, index, playbackStartedAt) {
  const rect = await win.webContents.executeJavaScript(`
    (() => {
      const preview = document.querySelector(".media-preview-container");
      if (!preview) return null;
      preview.scrollIntoView({ block: "center", inline: "nearest" });
      const bounds = preview.getBoundingClientRect();
      const x = Math.max(0, Math.floor(bounds.x));
      const y = Math.max(0, Math.floor(bounds.y));
      return {
        x,
        y,
        width: Math.max(1, Math.floor(Math.min(bounds.right, innerWidth) - x)),
        height: Math.max(1, Math.floor(Math.min(bounds.bottom, innerHeight) - y)),
      };
    })()
  `, true);
  if (!rect || rect.width < 16 || rect.height < 16) throw new Error(`invalid preview capture bounds ${JSON.stringify(rect)}`);
  const [state, image] = await Promise.all([readUiState(win), win.webContents.capturePage(rect)]);
  const pngPath = SCREENSHOT_DIR
    ? path.join(SCREENSHOT_DIR, `echo-sample-${String(index).padStart(2, "0")}-${String(state.audio?.currentTime || 0).replace(".", "_")}s.png`)
    : null;
  if (pngPath) {
    fs.mkdirSync(path.dirname(pngPath), { recursive: true });
    fs.writeFileSync(pngPath, image.toPNG());
  }
  return {
    index,
    wallSeconds: Number(((Date.now() - playbackStartedAt) / 1000).toFixed(3)),
    ...state,
    pixels: pixelMetrics(image),
    pngPath,
  };
}

function parsePrepareReport(job) {
  const text = String(job?.outputTail || "").trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { parseError: true, outputTail: text.slice(-2000) }; }
}

function analyzeDurationSafety(projectPayload) {
  const project = projectPayload?.music_video_project || projectPayload || {};
  const contracts = (project.timeline || [])
    .filter((shot) => shot.media_contract?.type === "video")
    .map((shot) => {
      const contract = shot.media_contract;
      const coverage = contract.durationCoverage || {};
      const cueSeconds = Number(coverage.cueSeconds ?? Math.max(0.1, Number(shot.end_sec || 0) - Number(shot.start_sec || 0)));
      const sourceSeconds = Number(coverage.sourceSeconds ?? contract.proxy?.durationSeconds ?? contract.actualDurationSeconds ?? 0);
      const toleranceSeconds = Number(coverage.toleranceSeconds ?? 0.08);
      const fingerprint = String(contract.proxy?.fingerprint || "");
      const safe = contract.proxy?.status === "ready"
        && coverage.status === "verified"
        && sourceSeconds >= cueSeconds - toleranceSeconds
        && Number(contract.actualDurationSeconds || 0) >= cueSeconds - toleranceSeconds
        && Boolean(fingerprint)
        && contract.contentHash === fingerprint;
      return {
        shotIndex: shot.shot_index,
        mediaId: shot.media_id,
        cueSeconds,
        sourceSeconds,
        toleranceSeconds,
        coverageStatus: coverage.status || "missing",
        fingerprint,
        contentHash: contract.contentHash || "",
        safe,
      };
    });
  return {
    videoContracts: contracts.length,
    safeContracts: contracts.filter((contract) => contract.safe).length,
    uniqueFingerprints: new Set(contracts.map((contract) => contract.fingerprint).filter(Boolean)).size,
    unsafeContracts: contracts.filter((contract) => !contract.safe),
  };
}

app.whenReady().then(async () => {
  let win;
  const consoleMessages = [];
  const failedLoads = [];
  const httpFailures = [];
  const processFailures = [];
  try {
    const endpointUrl = `${API_BASE}/api/echos/director-preview/prepare?songId=${encodeURIComponent(SONG_ID)}`;
    const endpointGet = await requestJson(endpointUrl);
    const endpointPost = await requestJson(endpointUrl, { method: "POST" });
    const endpointReady = await waitForJob(endpointUrl);
    const prepareReport = parsePrepareReport(endpointReady.body);
    const preparedProject = await requestJson(`${API_BASE}/api/echos/director-project?songId=${encodeURIComponent(SONG_ID)}`);
    const durationSafety = analyzeDurationSafety(preparedProject.body);
    const switchPreparedProject = await requestJson(`${API_BASE}/api/echos/director-project?songId=${encodeURIComponent(SWITCH_SONG_ID)}`);
    const switchDurationSafety = analyzeDurationSafety(switchPreparedProject.body);
    const primaryProject = preparedProject.body?.music_video_project || preparedProject.body || {};
    const seekShot = (primaryProject.timeline || []).find((shot) => (
      shot.media_contract?.type === "video"
      && shot.media_contract?.proxy?.status === "ready"
      && Number(shot.start_sec || 0) >= 30
      && Number(shot.end_sec || 0) - Number(shot.start_sec || 0) >= 4
    ));
    if (!seekShot) throw new Error("no duration-safe later video cue was available for the seek acceptance");
    const seekTargetSeconds = Number((Number(seekShot.start_sec) + 0.4).toFixed(3));

    win = new BrowserWindow({
      show: false,
      width: 1800,
      height: 1200,
      backgroundColor: "#020617",
      paintWhenInitiallyHidden: true,
      webPreferences: {
        preload: path.join(ROOT, "electron/preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        partition: `echos-album-playback-acceptance-${process.pid}`,
      },
    });

    win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      consoleMessages.push({ level, message, line, sourceId });
    });
    win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      failedLoads.push({ errorCode, errorDescription, validatedURL, isMainFrame });
    });
    win.webContents.on("render-process-gone", (_event, details) => processFailures.push({ kind: "render-process-gone", details }));
    win.on("unresponsive", () => processFailures.push({ kind: "unresponsive" }));
    win.webContents.session.webRequest.onCompleted({ urls: ["<all_urls>"] }, (details) => {
      if (details.statusCode >= 400 && /\/api\/|\/media\//.test(details.url)) {
        httpFailures.push({ statusCode: details.statusCode, method: details.method, url: details.url, error: details.error || "" });
      }
    });

    await win.loadURL(UI_URL);
    const viewReady = await waitFor(win, "Echos Album view", `Boolean(document.querySelector(".hapa-echos-view") && [...document.querySelectorAll("h2")].some((item) => /Album Consolidation App/i.test(item.textContent || "")))`);
    const songListed = await waitFor(win, "Cooler Than You song list entry", `Boolean([...document.querySelectorAll(".hapa-echos-view .media-scroll-container span")].find((item) => (item.textContent || "").trim() === ${JSON.stringify(SONG_TITLE)}))`);
    await waitFor(win, "initial blueprint hydration", `[...document.querySelectorAll(".hapa-echos-view h4")].some((item) => /Blueprint$/.test(item.textContent || ""))`);
    const selected = await selectDirectorSong(win);
    const poolReady = await waitFor(win, "three persistent players and READY/fallback", `
      (() => {
        const preview = document.querySelector(".media-preview-container");
        const fallback = preview?.querySelector("[data-echo-fallback]");
        const videos = preview?.querySelectorAll("video[data-echo-player]") || [];
        return videos.length === 3 && ["ready", "fallback"].includes(fallback?.dataset.echoFallback || "");
      })()
    `);
    const playReady = await waitFor(win, "loaded audio and enabled Play Show", `
      (() => {
        const audio = document.querySelector(".hapa-echos-view audio");
        const button = [...document.querySelectorAll(".hapa-echos-view button")].find((item) => /Play Show/i.test(item.textContent || ""));
        return Boolean(audio && audio.readyState >= 2 && button && !button.disabled);
      })()
    `);

    const beforePlay = await readUiState(win);
    const playClicked = await win.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll(".hapa-echos-view button")].find((item) => /Play Show/i.test(item.textContent || ""));
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()
    `, true);
    if (!playClicked) throw new Error("Play Show button was not clickable");
    const playing = await waitFor(win, "audio playback start", `
      (() => {
        const audio = document.querySelector(".hapa-echos-view audio");
        return Boolean(audio && !audio.paused && audio.currentTime > 0.05);
      })()
    `, 15000);

    const playbackStartedAt = Date.now();
    const samples = [];
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      if (index > 0) await sleep(SAMPLE_INTERVAL_MS);
      samples.push(await capturePreviewSample(win, index, playbackStartedAt));
    }
    const afterPlay = await readUiState(win);
    const playbackAdvanceSeconds = Number(((afterPlay.audio?.currentTime || 0) - (beforePlay.audio?.currentTime || 0)).toFixed(3));

    const pauseClicked = await win.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll(".hapa-echos-view button")].find((item) => /Pause/i.test(item.textContent || ""));
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()
    `, true);
    if (!pauseClicked) throw new Error("Pause button was not clickable after the initial playback run");
    const paused = await waitFor(win, "paused audio and active video", `
      (() => {
        const audio = document.querySelector(".hapa-echos-view audio");
        const active = document.querySelector('.media-preview-container video[data-echo-player="current"]');
        const button = [...document.querySelectorAll(".hapa-echos-view button")].find((item) => /Play Show/i.test(item.textContent || ""));
        return Boolean(audio?.paused && active?.paused && button && !button.disabled);
      })()
    `, 15000);
    const pauseStartedAt = Date.now();
    const pauseStart = await capturePreviewSample(win, "pause-start", pauseStartedAt);
    await sleep(PAUSE_HOLD_MS);
    const pauseEnd = await capturePreviewSample(win, "pause-end", pauseStartedAt);
    const pauseAudioDeltaSeconds = Number(Math.abs((pauseEnd.audio?.currentTime || 0) - (pauseStart.audio?.currentTime || 0)).toFixed(3));
    const pauseClockDeltaSeconds = Number(Math.abs((pauseEnd.engine?.clockTime || 0) - (pauseStart.engine?.clockTime || 0)).toFixed(3));

    const seekDispatch = await win.webContents.executeJavaScript(`
      (() => {
        const input = [...document.querySelectorAll('.hapa-echos-view input[type="range"]')]
          .find((item) => item.getClientRects().length > 0 && Number(item.max || 0) > 10 && Math.abs(Number(item.max) - ${Number(primaryProject.duration || 0)}) < 0.5);
        if (!input) return { found: false };
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setValue.call(input, String(${seekTargetSeconds}));
        const requestedValue = Number(input.value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return { found: true, requestedValue, valueAfterInput: Number(input.value), max: Number(input.max) };
      })()
    `, true);
    if (!seekDispatch?.found) throw new Error("visible director playhead range input was not found");
    const seekReady = await waitForState(win, "later seek cue READY frame", `
      (() => {
        const preview = document.querySelector(".media-preview-container");
        const fallback = preview?.querySelector("[data-echo-fallback]");
        const videos = [...(preview?.querySelectorAll("video[data-echo-player]") || [])];
        const active = videos.find((video) => video.dataset.echoPlayer === "current");
        const audio = document.querySelector(".hapa-echos-view audio");
        const engine = globalThis.__HAPA_ECHO_PLAYBACK_ENGINE__ || null;
        const ready = Boolean(
          audio?.paused
          && Math.abs(audio.currentTime - ${seekTargetSeconds}) < 0.25
          && videos.length === 3
          && fallback?.dataset.echoFallback === "ready"
          && active?.dataset.framePresented === "true"
          && (active.dataset.echoSourceKey || "").startsWith(${JSON.stringify(`${seekShot.media_id}:`)})
          && active.readyState >= 2
          && active.videoWidth > 0
          && active.videoHeight > 0
          && !active.error
        );
        return {
          ready,
          audio: audio ? { currentTime: audio.currentTime, paused: audio.paused, readyState: audio.readyState, error: audio.error ? { code: audio.error.code, message: audio.error.message } : null } : null,
          engine: engine ? { projectKey: engine.projectKey, clockTime: engine.clockTime, shotIndex: engine.shotIndex, targetShotIndex: engine.targetShotIndex, pendingShotIndex: engine.pendingShotIndex, mediaUri: engine.mediaUri, reason: engine.reason } : null,
          stageStatus: fallback?.dataset.echoFallback || "missing",
          players: videos.map((video) => ({ role: video.dataset.echoPlayer, sourceKey: video.dataset.echoSourceKey || video.dataset.echoPreparingKey || "", currentSrc: video.currentSrc || video.src || "", framePresented: video.dataset.framePresented, readyState: video.readyState, paused: video.paused, seeking: video.seeking, currentTime: video.currentTime, width: video.videoWidth, height: video.videoHeight, error: video.error ? { code: video.error.code, message: video.error.message } : null })),
        };
      })()
    `, (state) => state?.ready === true, 20000);
    const seekSample = await capturePreviewSample(win, "seek-ready", Date.now());

    const resumeBefore = await readUiState(win);
    const resumeClicked = await win.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll(".hapa-echos-view button")].find((item) => /Play Show/i.test(item.textContent || ""));
        if (!button || button.disabled) return false;
        button.click();
        return true;
      })()
    `, true);
    if (!resumeClicked) throw new Error("Play Show button was not clickable after seek");
    const resumed = await waitFor(win, "post-seek playback resume", `
      (() => {
        const audio = document.querySelector(".hapa-echos-view audio");
        return Boolean(audio && !audio.paused && audio.currentTime > ${seekTargetSeconds + 0.05});
      })()
    `, 15000);
    const resumeStartedAt = Date.now();
    const resumeSamples = [];
    for (let index = 0; index < RESUME_SAMPLE_COUNT; index += 1) {
      if (index > 0) await sleep(SAMPLE_INTERVAL_MS);
      resumeSamples.push(await capturePreviewSample(win, `resume-${index}`, resumeStartedAt));
    }
    const resumeAfter = await readUiState(win);
    const resumeAdvanceSeconds = Number(((resumeAfter.audio?.currentTime || 0) - (resumeBefore.audio?.currentTime || 0)).toFixed(3));

    const switched = await selectDirectorSong(win, { songId: SWITCH_SONG_ID, songTitle: SWITCH_SONG_TITLE });
    const switchReady = await waitFor(win, `${SWITCH_SONG_TITLE} first READY frame`, `
      (() => {
        const preview = document.querySelector(".media-preview-container");
        const fallback = preview?.querySelector("[data-echo-fallback]");
        const videos = [...(preview?.querySelectorAll("video[data-echo-player]") || [])];
        const active = videos.find((video) => video.dataset.echoPlayer === "current");
        const audio = document.querySelector(".hapa-echos-view audio");
        const heading = [...document.querySelectorAll(".hapa-echos-view h4")].map((item) => item.textContent || "").find((text) => /Blueprint$/.test(text)) || "";
        return Boolean(
          heading === ${JSON.stringify(`${SWITCH_SONG_TITLE} Blueprint`)}
          && globalThis.__HAPA_ECHO_PLAYBACK_ENGINE__?.projectKey === ${JSON.stringify(SWITCH_SONG_ID)}
          && audio?.readyState >= 2
          && audio.paused
          && audio.currentTime < 0.25
          && videos.length === 3
          && fallback?.dataset.echoFallback === "ready"
          && active?.dataset.framePresented === "true"
          && (active.currentSrc || "").includes("/media/echo-proxies-v2/")
          && active.readyState >= 2
          && active.videoWidth > 0
          && active.videoHeight > 0
          && !active.error
        );
      })()
    `, 30000);
    const switchSample = await capturePreviewSample(win, "song-change-first-frame", Date.now());

    const errorConsole = consoleMessages.filter((entry) => entry.level >= 3);
    const fatalConsole = errorConsole.filter((entry) => /Uncaught|TypeError|ReferenceError|SyntaxError|Unhandled|ERR_(?:FAILED|FILE_NOT_FOUND|ABORTED)|MEDIA_ERR|Audio playback failed|Failed to fetch audio blob/i.test(entry.message));
    const materialHttpFailures = httpFailures.filter((entry) => ![404].includes(entry.statusCode) || /echo-proxies-v2|song-registry\/audio|director-preview/.test(entry.url));
    const observedSourceKeys = [...new Set(samples.map((sample) => sample.active?.sourceKey).filter(Boolean))];
    const controlSamples = [pauseStart, pauseEnd, seekSample, ...resumeSamples, switchSample];
    const prepareStats = prepareReport?.stats || null;
    const assertions = {
      endpointGetSucceeded: endpointGet.statusCode === 200,
      endpointPostAccepted: endpointPost.statusCode === 202,
      endpointReachedReady: endpointReady.statusCode === 200 && endpointReady.body?.status === "ready" && endpointReady.body?.exitCode === 0,
      preparationWasSingleSongBounded: Boolean(prepareStats && prepareStats.selectedProxySources > 0 && prepareStats.selectedProxySources <= 30 && prepareStats.transcoded <= prepareStats.selectedProxySources),
      warmPrepareWroteNoProjects: prepareStats?.projectsWritten === 0,
      durationSafeCacheHits: Boolean(prepareStats
        && prepareStats.cacheHits === prepareStats.selectedProxySources
        && prepareStats.transcoded === 0
        && prepareStats.failed === 0
        && durationSafety.videoContracts === prepareStats.selectedProxySources
        && durationSafety.safeContracts === durationSafety.videoContracts
        && durationSafety.uniqueFingerprints === prepareStats.selectedProxySources
        && durationSafety.unsafeContracts.length === 0),
      selectedCoolerThanYou: Boolean(selected.value && beforePlay.heading === `${SONG_TITLE} Blueprint` && beforePlay.engine?.projectKey === SONG_ID && samples.every((sample) => sample.heading === `${SONG_TITLE} Blueprint`)),
      fullyProxiedInUi: beforePlay.pendingProxyButtonVisible === false,
      threePersistentPlayers: beforePlay.playerCount === 3 && samples.every((sample) => sample.playerCount === 3),
      readyOrFallbackReached: ["ready", "fallback"].includes(beforePlay.stageStatus),
      playbackAdvancedEightSeconds: playbackAdvanceSeconds >= 8,
      noBlankCompositeInterval: samples.every((sample) => sample.pixels.meanLuma > 3 && sample.pixels.nearBlackFraction < 0.995),
      frameOrFallbackAlwaysPresent: samples.every((sample) => sample.stageStatus === "fallback" || sample.stageStatus === "buffering" || (sample.framePresentedCount === 1 && sample.active?.readyState >= 2 && sample.active?.width > 0 && sample.active?.height > 0 && !sample.active?.error)),
      noFatalConsoleError: fatalConsole.length === 0,
      noFatalMediaHttpFailure: materialHttpFailures.length === 0,
      zeroHttpFailuresIncludingPosters: httpFailures.length === 0,
      rendererStayedResponsive: processFailures.length === 0,
      pauseHeldAudioAndDirectorClock: Boolean(paused.value
        && pauseStart.audio?.currentTime >= 8
        && pauseAudioDeltaSeconds <= 0.05
        && pauseClockDeltaSeconds <= 0.05
        && pauseStart.audio?.paused
        && pauseEnd.audio?.paused
        && pauseStart.active?.paused
        && pauseEnd.active?.paused
        && [pauseStart, pauseEnd].every((sample) => sample.stageStatus === "ready" && sample.framePresentedCount === 1 && sample.pixels.meanLuma > 3 && sample.pixels.nearBlackFraction < 0.995)),
      seekReachedLaterReadyNonblankCue: Boolean(seekDispatch.found
        && Math.abs(seekDispatch.requestedValue - seekTargetSeconds) < 0.01
        && seekReady.value
        && seekSample.audio?.paused
        && Math.abs((seekSample.audio?.currentTime || 0) - seekTargetSeconds) < 0.25
        && Math.abs((seekSample.playhead?.value || 0) - seekTargetSeconds) < 0.25
        && seekSample.stageStatus === "ready"
        && seekSample.statusText.startsWith("READY")
        && seekSample.framePresentedCount === 1
        && seekSample.active?.sourceKey.startsWith(`${seekShot.media_id}:`)
        && seekSample.pixels.meanLuma > 3
        && seekSample.pixels.nearBlackFraction < 0.995),
      resumedForTwoSecondsWithReadyFrames: Boolean(resumed.value
        && resumeAdvanceSeconds >= 2
        && resumeSamples.length >= 5
        && resumeSamples.every((sample) => sample.stageStatus === "ready"
          && sample.playerCount === 3
          && sample.framePresentedCount === 1
          && sample.active?.readyState >= 2
          && sample.active?.width > 0
          && sample.active?.height > 0
          && !sample.active?.error
          && sample.pixels.meanLuma > 3
          && sample.pixels.nearBlackFraction < 0.995)),
      songChangeReachedDearPapaFirstFrame: Boolean(switchPreparedProject.statusCode === 200
        && switchDurationSafety.videoContracts > 0
        && switchDurationSafety.safeContracts === switchDurationSafety.videoContracts
        && switchDurationSafety.unsafeContracts.length === 0
        && switched.value
        && switchReady.value
        && switchSample.heading === `${SWITCH_SONG_TITLE} Blueprint`
        && switchSample.engine?.projectKey === SWITCH_SONG_ID
        && switchSample.audio?.paused
        && switchSample.audio?.currentTime < 0.25
        && switchSample.stageStatus === "ready"
        && switchSample.statusText.startsWith("READY")
        && switchSample.pendingProxyButtonVisible === false
        && switchSample.playerCount === 3
        && switchSample.framePresentedCount === 1
        && switchSample.active?.currentSrc.includes("/media/echo-proxies-v2/")
        && switchSample.pixels.meanLuma > 3
        && switchSample.pixels.nearBlackFraction < 0.995),
      threePlayerBoundAcrossTransportAndSongChange: controlSamples.every((sample) => sample.playerCount === 3 && sample.activePlayerCount === 1),
    };
    const result = {
      schemaVersion: "hapa.echos.album-playback-acceptance.v2",
      ok: Object.values(assertions).every(Boolean),
      song: { id: SONG_ID, title: SONG_TITLE },
      services: { uiUrl: UI_URL, apiBase: API_BASE },
      endpoint: { initialGet: endpointGet, post: endpointPost, completedGet: endpointReady, report: prepareReport, preparedProjectStatusCode: preparedProject.statusCode, durationSafety, switchPreparedProjectStatusCode: switchPreparedProject.statusCode, switchDurationSafety },
      waitsMs: { view: viewReady.elapsedMs, songListed: songListed.elapsedMs, selected: selected.elapsedMs, pool: poolReady.elapsedMs, playReady: playReady.elapsedMs, playing: playing.elapsedMs, paused: paused.elapsedMs, seekReady: seekReady.elapsedMs, resumed: resumed.elapsedMs, switched: switched.elapsedMs, switchReady: switchReady.elapsedMs },
      playback: {
        requestedSampleSeconds: Number((((SAMPLE_COUNT - 1) * SAMPLE_INTERVAL_MS) / 1000).toFixed(3)),
        playbackAdvanceSeconds,
        before: beforePlay,
        after: afterPlay,
        observedSourceKeys,
        samples,
      },
      transportAndSongChange: {
        pause: { holdRequestedMs: PAUSE_HOLD_MS, audioDeltaSeconds: pauseAudioDeltaSeconds, clockDeltaSeconds: pauseClockDeltaSeconds, start: pauseStart, end: pauseEnd },
        seek: { shot: { mediaId: seekShot.media_id, startSeconds: seekShot.start_sec, endSeconds: seekShot.end_sec }, targetSeconds: seekTargetSeconds, dispatch: seekDispatch, sample: seekSample },
        resume: { requestedSampleSeconds: Number((((RESUME_SAMPLE_COUNT - 1) * SAMPLE_INTERVAL_MS) / 1000).toFixed(3)), advanceSeconds: resumeAdvanceSeconds, before: resumeBefore, after: resumeAfter, samples: resumeSamples },
        songChange: { songId: SWITCH_SONG_ID, songTitle: SWITCH_SONG_TITLE, durationSafety: switchDurationSafety, sample: switchSample },
      },
      diagnostics: { errorConsole, fatalConsole, failedLoads, httpFailures, materialHttpFailures, processFailures },
      assertions,
      generatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({
      ok: result.ok,
      output: OUTPUT,
      endpoint: { initial: endpointGet.body?.status, final: endpointReady.body?.status, elapsedMs: endpointReady.totalElapsedMs, stats: prepareStats, durationSafety },
      waitsMs: result.waitsMs,
      playback: { advanceSeconds: playbackAdvanceSeconds, samples: samples.length, observedSourceKeys, minMeanLuma: Math.min(...samples.map((sample) => sample.pixels.meanLuma)), maxNearBlackFraction: Math.max(...samples.map((sample) => sample.pixels.nearBlackFraction)) },
      transportAndSongChange: {
        pause: { audioDeltaSeconds: pauseAudioDeltaSeconds, clockDeltaSeconds: pauseClockDeltaSeconds },
        seek: { targetSeconds: seekTargetSeconds, mediaId: seekShot.media_id, status: seekSample.statusText, meanLuma: seekSample.pixels.meanLuma },
        resume: { advanceSeconds: resumeAdvanceSeconds, samples: resumeSamples.length, minMeanLuma: Math.min(...resumeSamples.map((sample) => sample.pixels.meanLuma)) },
        songChange: { songId: SWITCH_SONG_ID, status: switchSample.statusText, players: switchSample.playerCount, meanLuma: switchSample.pixels.meanLuma, durationSafety: switchDurationSafety },
      },
      diagnostics: { fatalConsole: fatalConsole.length, httpFailures: httpFailures.length, materialHttpFailures: materialHttpFailures.length, processFailures: processFailures.length },
      assertions,
    }, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  } finally {
    win?.destroy();
    app.exit(process.exitCode || 0);
  }
});
