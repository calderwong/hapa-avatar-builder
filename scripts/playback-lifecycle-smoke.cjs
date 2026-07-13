const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const devUrl = process.env.SMOKE_DEV_URL || "http://127.0.0.1:5178";
const prodUrl = process.env.SMOKE_PROD_URL || "http://127.0.0.1:8787";
const singleUrl = process.env.SMOKE_SINGLE_URL || "";
const outputPath = process.env.SMOKE_OUTPUT || path.join(ROOT, "artifacts/smoke/playback-lifecycle-v2.json");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.setName("hapa-playback-lifecycle-smoke");
app.setPath("userData", path.join("/tmp", `hapa-playback-lifecycle-smoke-${process.pid}`));

async function waitFor(win, expression, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function sampleTarot(win, url) {
    await win.loadURL(url);
    await waitFor(win, "[...document.querySelectorAll('button')].some((item) => item.textContent.includes('Tarot Draw'))");
    await win.webContents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('Tarot Draw'));
      if (!button) throw new Error('Tarot Draw route button missing');
      button.click();
    })()`);
    await waitFor(win, "window.__THREE_GAME_DIAGNOSTICS__?.actions?.reconcileCurrentCards");
    const before = await win.webContents.executeJavaScript(`({
      state: window.__THREE_GAME_DIAGNOSTICS__.state,
      lifecycle: { ...window.__HAPA_TAROT_LIFECYCLE__ }
    })`);
    const refreshes = [];
    for (let index = 0; index < 10; index += 1) {
      refreshes.push(await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__.actions.reconcileCurrentCards()"));
      await wait(20);
    }
    const after = await win.webContents.executeJavaScript(`({
      state: window.__THREE_GAME_DIAGNOSTICS__.state,
      lifecycle: { ...window.__HAPA_TAROT_LIFECYCLE__ }
    })`);
    const sample = {
      url,
      before,
      after,
      refreshes,
      stable: before.lifecycle.liveGames === after.lifecycle.liveGames
        && before.lifecycle.liveRenderers === after.lifecycle.liveRenderers
        && before.lifecycle.liveChannels === after.lifecycle.liveChannels
        && before.lifecycle.createdGames === after.lifecycle.createdGames
        && before.state.sceneStats.objects === after.state.sceneStats.objects
        && before.state.placedCount === after.state.placedCount
        && before.state.audioEnabled === after.state.audioEnabled
        && refreshes.length === 10
    };
    await win.webContents.executeJavaScript("window.__THREE_GAME_DIAGNOSTICS__?.actions?.setPlaybackMode?.('hidden')");
    return sample;
}

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    win.webContents.on("console-message", (_event, details, legacyMessage) => {
      const level = typeof details === "object" ? details.level : details;
      const message = typeof details === "object" ? details.message : legacyMessage;
      if (level === "error" || level >= 2) console.error(`[renderer] ${message}`);
    });
    if (singleUrl) {
      const runtime = await sampleTarot(win, singleUrl);
      const singleResult = {
        schemaVersion: "hapa.playback-lifecycle-smoke.v2",
        ok: runtime.stable,
        runtime,
        generatedAt: new Date().toISOString()
      };
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(singleResult, null, 2)}\n`);
      console.log(JSON.stringify(singleResult, null, 2));
      if (!singleResult.ok) process.exitCode = 1;
      win.destroy();
      return;
    }
    const development = await sampleTarot(win, devUrl);
    const production = await sampleTarot(win, prodUrl);
    const result = {
      schemaVersion: "hapa.playback-lifecycle-smoke.v2",
      ok: development.stable
        && production.stable
        && development.after.lifecycle.liveGames === production.after.lifecycle.liveGames
        && development.after.lifecycle.liveRenderers === production.after.lifecycle.liveRenderers
        && development.after.lifecycle.liveChannels === production.after.lifecycle.liveChannels,
      development,
      production,
      finalLiveResourceParity: {
        games: [development.after.lifecycle.liveGames, production.after.lifecycle.liveGames],
        renderers: [development.after.lifecycle.liveRenderers, production.after.lifecycle.liveRenderers],
        channels: [development.after.lifecycle.liveChannels, production.after.lifecycle.liveChannels]
      },
      generatedAt: new Date().toISOString()
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    win.destroy();
  } catch (error) {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
