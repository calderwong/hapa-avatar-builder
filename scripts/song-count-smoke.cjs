const { app, BrowserWindow } = require("electron");

const targetUrl = process.env.SMOKE_URL || "http://127.0.0.1:8797";

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: false,
    backgroundColor: "#020617",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await win.loadURL(targetUrl);
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        if (document.readyState === "complete") resolve();
        else window.addEventListener("load", resolve, { once: true });
      })
    `);
    await win.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
          const buttons = [...document.querySelectorAll("button")];
          const songsButton = buttons.find((button) => /songs/i.test((button.textContent || "").trim()));
          if (songsButton) {
            songsButton.click();
            resolve();
            return;
          }
          if (Date.now() - started > 6000) {
            const labels = buttons.slice(0, 80).map((button) => (button.textContent || "").trim()).filter(Boolean);
            reject(new Error("Songs button not found. Buttons: " + JSON.stringify(labels)));
          }
          else setTimeout(tick, 120);
        };
        tick();
      })
    `);
    await win.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
          const rows = document.querySelectorAll(".song-row").length;
          const telemetry = document.querySelector(".song-library-telemetry")?.innerText || "";
          const apiLabel = document.querySelector(".songs-library-panel .hapa-panel-head em")?.textContent || "";
          const apiReady = /API/i.test(apiLabel) && /79/.test(apiLabel);
          const registryReady = /79\\s+REGISTRY/i.test(telemetry.replace(/\\n/g, " "));
          if (rows >= 70 && /79/.test(telemetry) && apiReady && registryReady) resolve();
          else if (Date.now() - started > 12000) reject(new Error("Songs did not reach full count: rows=" + rows + ", apiLabel=" + apiLabel + ", telemetry=" + telemetry));
          else setTimeout(tick, 160);
        };
        tick();
      })
    `);
    const metrics = await win.webContents.executeJavaScript(`
      ({
        title: document.querySelector("h1")?.textContent || document.title,
        songRows: document.querySelectorAll(".song-row").length,
        telemetry: document.querySelector(".song-library-telemetry")?.innerText || "",
        readouts: [...document.querySelectorAll(".hapa-songs-readouts .status-chip")].map((node) => node.innerText),
        apiLabel: document.querySelector(".songs-library-panel .hapa-panel-head em")?.textContent || "",
        firstSongs: [...document.querySelectorAll(".song-row strong")].slice(0, 5).map((node) => node.textContent)
      })
    `);
    console.log(JSON.stringify({ ok: metrics.songRows >= 70, targetUrl, metrics }, null, 2));
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
