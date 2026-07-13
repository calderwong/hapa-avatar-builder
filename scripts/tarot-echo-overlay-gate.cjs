const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const baseUrl = process.env.SMOKE_URL || "http://127.0.0.1:8810";
const outputPath = process.env.SMOKE_OUTPUT || path.join(ROOT, "artifacts/smoke/tarot-echo-overlay-gate.json");
const screenshotPath = process.env.SMOKE_SCREENSHOT || outputPath.replace(/\.json$/i, ".png");
const projectPayload = JSON.parse(fs.readFileSync(path.join(ROOT, "data/music-video-projects/dear-papa-song-dear-papa-video-project.json"), "utf8"));
const project = projectPayload.music_video_project || projectPayload;
const pureIvfIndex = project.timeline.findIndex((shot) => shot.media_id === "none" || shot.media_contract?.type === "generated-visualizer");
const pureIvfTime = Number(project.timeline[pureIvfIndex]?.start_sec || 0) + 0.12;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.setName("hapa-tarot-echo-overlay-gate");
app.setPath("userData", path.join("/tmp", `hapa-tarot-echo-overlay-gate-${process.pid}`));

async function waitFor(win, expression, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await wait(20);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

app.whenReady().then(async () => {
  let win;
  try {
    if (pureIvfIndex < 0) throw new Error("Dear Papa has no pure-IVF fixture");
    win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await win.loadURL(baseUrl);
    await waitFor(win, "[...document.querySelectorAll('button')].some((item) => item.textContent.includes('Tarot Draw'))", 45000);
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((item) => item.textContent.includes('Tarot Draw')).click()`);
    await waitFor(win, "window.__THREE_GAME_DIAGNOSTICS__?.actions?.lockSongCardInDropZone", 30000);
    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.lockSongCardInDropZone('dear-papa-song-dear-papa')");
    await waitFor(win, "window.__THREE_GAME_DIAGNOSTICS__.state.dropZone.echoPlayerPool.centerFirstFrameReady", 30000);
    await win.webContents.executeJavaScript(`window.__THREE_GAME_DIAGNOSTICS__.actions.seekEchoPreview(${pureIvfTime})`);
    await waitFor(win, `window.__THREE_GAME_DIAGNOSTICS__.state.dropZone.playbackEngine.targetShotIndex === ${pureIvfIndex}`, 5000);
    await waitFor(win, "window.__THREE_GAME_DIAGNOSTICS__.state.dropZone.centerPreviewFrame.pureIvf === true", 5000);
    await waitFor(win, "window.__THREE_GAME_DIAGNOSTICS__.state.dropZone.centerPreviewFrame.exactIsfStatus === 'ready'", 15000);

    const pureIvf = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state.dropZone");
    const activeBefore = pureIvf.centerPreviewFrame.overlayUploads;
    await wait(2600);
    const activeAfter = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state.dropZone.centerPreviewFrame");
    const activeRate = (activeAfter.overlayUploads - activeBefore) / 2.6;
    const screenshot = await win.capturePage();
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, screenshot.toPNG());

    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.setPlaybackMode('docked')");
    const dockedBefore = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state.dropZone.centerPreviewFrame.overlayUploads");
    await wait(2600);
    const dockedAfter = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state.dropZone.centerPreviewFrame");
    const dockedRate = (dockedAfter.overlayUploads - dockedBefore) / 2.6;
    const result = {
      schemaVersion: "hapa.tarot-echo-overlay-gate.v1",
      ok: pureIvf.playbackEngine.targetShotIndex === pureIvfIndex
        && pureIvf.echoDirectorProject.currentTimelineSource === `ivf:${pureIvfIndex}`
        && pureIvf.centerPreviewFrame.pureIvf
        && !pureIvf.centerPreviewFrame.videoLayerVisible
        && activeRate <= 12.5
        && dockedRate <= 4.5
        && activeAfter.overlayCpuP95Ms <= 4
        && activeAfter.overlaySkippedUploads > 0
        && activeAfter.exactIsfStatus === "ready"
        && activeAfter.currentShaderId === activeAfter.exactIsfSourceId
        && activeAfter.rendererTruth?.status === "exact"
        && activeAfter.rendererTruth?.readiness === "ready"
        && activeAfter.rendererSilentDefault === false
        && activeAfter.blackIntervalCount === 0,
      fixture: { songId: project.song_id, time: pureIvfTime, expectedShotIndex: pureIvfIndex },
      goldenTimestamp: {
        engineShotIndex: pureIvf.playbackEngine.targetShotIndex,
        rendererSource: pureIvf.echoDirectorProject.currentTimelineSource,
        pureIvf: pureIvf.centerPreviewFrame.pureIvf,
        videoLayerVisible: pureIvf.centerPreviewFrame.videoLayerVisible
      },
      active: { uploadsPerSecond: Number(activeRate.toFixed(3)), ...activeAfter },
      docked: { uploadsPerSecond: Number(dockedRate.toFixed(3)), ...dockedAfter },
      screenshotPath,
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
