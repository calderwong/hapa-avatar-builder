const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const baseUrl = process.env.SMOKE_URL || "http://127.0.0.1:5178";
const outputPath = process.env.SMOKE_OUTPUT || path.join(ROOT, "artifacts/smoke/playback-power-modes.json");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.setName("hapa-playback-power-mode-smoke");
app.setPath("userData", path.join("/tmp", `hapa-playback-power-mode-smoke-${process.pid}`));

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await win.loadURL(baseUrl);
    await win.webContents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('Tarot Draw'));
      if (!button) throw new Error('Tarot Draw route button missing');
      button.click();
    })()`);
    const started = Date.now();
    while (Date.now() - started < 30000) {
      const ready = await win.webContents.executeJavaScript("Boolean(window.__THREE_GAME_DIAGNOSTICS__?.actions?.setPlaybackMode)");
      if (ready) break;
      await wait(100);
    }
    const before = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state");
    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.setPlaybackMode('hidden')");
    await wait(220);
    const hiddenOne = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state");
    await wait(220);
    const hiddenTwo = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state");
    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.setPlaybackMode('docked')");
    await wait(240);
    const docked = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state");
    const resumeStarted = performance.now();
    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.setPlaybackMode('active')");
    let active = null;
    while (performance.now() - resumeStarted < 500) {
      active = await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.state");
      if (active.renderer.frameSerial > docked.renderer.frameSerial) break;
      await wait(5);
    }
    const resumeMilliseconds = performance.now() - resumeStarted;
    const result = {
      schemaVersion: "hapa.playback-power-mode-smoke.v1",
      ok: hiddenOne.playbackPowerMode === "hidden"
        && hiddenOne.cinemaBudget.totalPlaying === 0
        && hiddenTwo.renderer.frameSerial === hiddenOne.renderer.frameSerial
        && docked.playbackPowerMode === "docked"
        && docked.targetFps <= 12
        && docked.cinemaBudget.totalPlaying <= 1
        && active.playbackPowerMode === "active"
        && active.renderer.frameSerial > docked.renderer.frameSerial
        && resumeMilliseconds < 150
        && active.sceneStats.objects === before.sceneStats.objects,
      hidden: { playingVideos: hiddenOne.cinemaBudget.totalPlaying, rendererCallsStable: hiddenTwo.renderer.frameSerial === hiddenOne.renderer.frameSerial, frameSerials: [hiddenOne.renderer.frameSerial, hiddenTwo.renderer.frameSerial] },
      docked: { targetFps: docked.targetFps, playingVideos: docked.cinemaBudget.totalPlaying, frameSerial: docked.renderer.frameSerial },
      resume: { milliseconds: Number(resumeMilliseconds.toFixed(2)), rendererAdvanced: active.renderer.frameSerial > docked.renderer.frameSerial, frameSerial: active.renderer.frameSerial, sceneObjectsPreserved: active.sceneStats.objects === before.sceneStats.objects },
      generatedAt: new Date().toISOString(),
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
