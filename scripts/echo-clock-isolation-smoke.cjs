const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const baseUrl = process.env.SMOKE_URL || "http://127.0.0.1:8810";
const outputPath = process.env.SMOKE_OUTPUT || path.join(ROOT, "artifacts/smoke/echo-clock-isolation.json");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.setName("hapa-echo-clock-isolation-smoke");
app.setPath("userData", path.join("/tmp", `hapa-echo-clock-isolation-smoke-${process.pid}`));

async function waitFor(win, expression, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await win.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await win.loadURL(baseUrl);
    await waitFor(win, "[...document.querySelectorAll('button')].some((item) => item.textContent.includes('Echos Album'))");
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((item) => item.textContent.includes('Echos Album')).click()`);
    await waitFor(win, "[...document.querySelectorAll('button')].some((item) => item.textContent.includes('Play Show') && !item.disabled)");
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((item) => item.textContent.includes('Play Show') && !item.disabled).click()`);
    await waitFor(win, "[...document.querySelectorAll('button')].some((item) => item.textContent.includes('Pause'))");
    await wait(900);
    const before = await win.webContents.executeJavaScript(`({
      diagnostics: { ...window.__HAPA_ECHO_CLOCK_DIAGNOSTICS__ },
      mediaTime: Number(document.querySelector('audio')?.currentTime || 0)
    })`);
    await wait(1800);
    const after = await win.webContents.executeJavaScript(`({
      diagnostics: { ...window.__HAPA_ECHO_CLOCK_DIAGNOSTICS__ },
      mediaTime: Number(document.querySelector('audio')?.currentTime || 0)
    })`);
    const deltas = {
      topLevelRenders: after.diagnostics.topLevelRenders - before.diagnostics.topLevelRenders,
      boundaryRenders: after.diagnostics.boundaryRenders - before.diagnostics.boundaryRenders,
      mediaSeconds: Number((after.mediaTime - before.mediaTime).toFixed(3))
    };
    const result = {
      schemaVersion: "hapa.echo-clock-isolation-smoke.v1",
      ok: deltas.mediaSeconds > 1
        && deltas.boundaryRenders >= 3
        && deltas.topLevelRenders <= 1,
      before,
      after,
      deltas,
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
