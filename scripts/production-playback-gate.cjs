const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const baseUrl = process.env.SMOKE_URL || "http://127.0.0.1:8810";
const outputPath = process.env.SMOKE_OUTPUT || path.join(ROOT, "artifacts/smoke/production-playback-gate.json");
const songs = ["dear-papa-song-dear-papa", "dear-papa-song-catch-the-rabbit"];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.setName("hapa-production-playback-gate");
app.setPath("userData", path.join("/tmp", `hapa-production-playback-gate-${process.pid}`));

async function waitFor(win, expression, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return performance.now() - started;
    await wait(8);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function rendererMemory(win) {
  const pid = win.webContents.getOSProcessId();
  const metric = app.getAppMetrics().find((entry) => entry.pid === pid);
  const heap = await win.webContents.executeJavaScript(`performance.memory ? ({
    used: performance.memory.usedJSHeapSize,
    total: performance.memory.totalJSHeapSize
  }) : ({ used: 0, total: 0 })`);
  return {
    pid,
    workingSetBytes: Number(metric?.memory?.workingSetSize || 0) * 1024,
    privateBytes: Number(metric?.memory?.privateBytes || 0) * 1024,
    heapUsedBytes: Number(heap.used || 0),
    heapTotalBytes: Number(heap.total || 0)
  };
}

async function lockSong(win, songId) {
  const started = performance.now();
  const locked = await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.actions.lockSongCardInDropZone(${JSON.stringify(songId)})`);
  if (!locked) throw new Error(`Could not lock ${songId}`);
  await waitFor(win, `(() => {
    const drop = window.__THREE_GAME_DIAGNOSTICS__?.state?.dropZone;
    return drop?.echoDirectorProject?.songId === ${JSON.stringify(songId)}
      && drop?.centerFirstFrameReady !== false
      && drop?.echoPlayerPool?.centerFirstFrameReady === true;
  })()`, 30000);
  const pool = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state.dropZone.echoPlayerPool");
  return {
    activationMs: Number((performance.now() - started).toFixed(2)),
    decoderFirstFrameMs: Number(Number(pool.currentFirstFrameLatencyMs || 0).toFixed(2)),
    wasPrewarmed: Boolean(pool.currentWasPrewarmed),
    prewarmLatencyMs: Number(Number(pool.currentPrewarmLatencyMs || 0).toFixed(2))
  };
}

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await win.loadURL(baseUrl);
    await waitFor(win, "[...document.querySelectorAll('button')].some((item) => item.textContent.includes('Tarot Draw'))", 45000);
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((item) => item.textContent.includes('Tarot Draw')).click()`);
    await waitFor(win, "window.__THREE_GAME_DIAGNOSTICS__?.actions?.lockSongCardInDropZone", 30000);
    await waitFor(win, "window.__THREE_GAME_DIAGNOSTICS__.state.deckCount > 0", 30000);
    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.enableEchoPreviewOverlays() ");

    const coldFirstFrame = await lockSong(win, songs[0]);
    const memoryBeforeSwaps = await rendererMemory(win);
    const seekBefore = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state.dropZone.playbackEngine.shotIndex");
    const seekStarted = performance.now();
    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.seekEchoPreview(60)");
    await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__.state.dropZone.playbackEngine.shotIndex !== ${Number(seekBefore)}`, 5000);
    const seekReadyMs = Number((performance.now() - seekStarted).toFixed(2));

    const warmFirstFrame = await lockSong(win, songs[1]);
    const swaps = [];
    for (let index = 0; index < 10; index += 1) {
      const songId = songs[index % songs.length];
      swaps.push({ index: index + 1, songId, ...(await lockSong(win, songId)) });
    }
    const memoryAfterSwaps = await rendererMemory(win);

    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.setPlaybackMode('active')");
    await wait(1800);
    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.resetPerformanceGate()");
    await wait(5200);
    const activeState = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state");

    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.setPlaybackMode('docked')");
    await wait(1200);
    const dockedState = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state");
    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.setPlaybackMode('hidden')");
    const hiddenOne = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state");
    await wait(800);
    const hiddenTwo = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state");

    const memoryGrowth = {
      workingSetBytes: memoryAfterSwaps.workingSetBytes - memoryBeforeSwaps.workingSetBytes,
      heapUsedBytes: memoryAfterSwaps.heapUsedBytes - memoryBeforeSwaps.heapUsedBytes,
      workingSetRatio: Number(((memoryAfterSwaps.workingSetBytes - memoryBeforeSwaps.workingSetBytes) / Math.max(1, memoryBeforeSwaps.workingSetBytes)).toFixed(5)),
      heapUsedRatio: Number(((memoryAfterSwaps.heapUsedBytes - memoryBeforeSwaps.heapUsedBytes) / Math.max(1, memoryBeforeSwaps.heapUsedBytes)).toFixed(5))
    };
    const performanceGate = activeState.performanceGate;
    const maxFirstFrameMs = Math.max(coldFirstFrame.decoderFirstFrameMs, warmFirstFrame.decoderFirstFrameMs, ...swaps.map((swap) => swap.decoderFirstFrameMs));
    const releaseChecks = {
      frameCadence: performanceGate.sampleCount >= 80 && performanceGate.p95Ms <= 50 && performanceGate.p99Ms <= 83,
      noStalls: performanceGate.stallsOver250Ms === 0,
      dropBudget: performanceGate.droppedFrameRatio <= 0.01,
      firstFrames: coldFirstFrame.decoderFirstFrameMs <= 300 && warmFirstFrame.decoderFirstFrameMs <= 150,
      longTasks: performanceGate.longTasksOver100Ms === 0,
      decoderBudget: activeState.dropZone.echoPlayerPool.elements <= 3 && activeState.cinemaBudget.totalPlaying <= 4,
      lookaheadBudget: activeState.dropZone.echoPlayerPool.maxLookahead <= 2,
      swapMemory: memoryGrowth.workingSetBytes < 100 * 1024 * 1024
        && memoryGrowth.heapUsedBytes < 100 * 1024 * 1024
        && (memoryGrowth.workingSetRatio < 0.15 || memoryGrowth.workingSetBytes < 20 * 1024 * 1024),
      hiddenQuiescent: hiddenOne.renderer.frameSerial === hiddenTwo.renderer.frameSerial,
      noUnsubscribedUploads: hiddenTwo.performanceGate.frameUploads === 0,
      devToolsClosed: !win.webContents.isDevToolsOpened()
    };
    const result = {
      schemaVersion: "hapa.production-playback-gate.v1",
      ok: Object.values(releaseChecks).every(Boolean),
      reference: { app: "Hapa Avatar Builder / Tarot-hosted Echo", songs, productionUrl: baseUrl },
      releaseChecks,
      firstFrame: { cold: coldFirstFrame, warm: warmFirstFrame, maxSwapDecoderMs: maxFirstFrameMs, seekReadyMs },
      active24Fps: performanceGate,
      docked: { targetFps: dockedState.targetFps, playingVideos: dockedState.cinemaBudget.totalPlaying },
      hidden: { frameSerials: [hiddenOne.renderer.frameSerial, hiddenTwo.renderer.frameSerial], playingVideos: hiddenTwo.cinemaBudget.totalPlaying },
      decoderAndLookahead: activeState.dropZone.echoPlayerPool,
      cinemaBudget: activeState.cinemaBudget,
      swaps,
      memory: { before: memoryBeforeSwaps, after: memoryAfterSwaps, growth: memoryGrowth },
      streamUploads: hiddenTwo.performanceGate.frameUploads,
      devToolsOpened: win.webContents.isDevToolsOpened(),
      generatedAt: new Date().toISOString()
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  } finally {
    win?.destroy();
    app.quit();
  }
});
