const { app, BrowserWindow } = require("electron");

const targetUrl = process.env.PERF_URL || "http://127.0.0.1:8787";

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

  await win.loadURL(targetUrl);
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const started = performance.now();
      const tick = () => {
        if (document.querySelector(".app-shell") || performance.now() - started > 8000) resolve();
        else setTimeout(tick, 50);
      };
      tick();
    })
  `);

  const metrics = await win.webContents.executeJavaScript(`
    (async () => {
      const byTab = (label) => [...document.querySelectorAll(".view-tabs button")]
        .find((button) => new RegExp(label, "i").test(button.textContent || ""));
      const waitFor = (selector) => new Promise((resolve) => {
        const started = performance.now();
        const tick = () => {
          if (document.querySelector(selector) || performance.now() - started > 8000) resolve(performance.now() - started);
          else setTimeout(tick, 16);
        };
        tick();
      });
      const timed = async (label, action, selector) => {
        const started = performance.now();
        action();
        await waitFor(selector);
        return { label, ms: Math.round(performance.now() - started) };
      };

      const results = [];
      results.push(await timed("open scenes", () => byTab("Scenes")?.click(), ".scenes-workflow-view"));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const sceneRows = [...document.querySelectorAll(".scene-row")];
      if (sceneRows.length > 1) {
        results.push(await timed("select second scene", () => sceneRows[1].click(), ".scene-timeline-band"));
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      results.push(await timed("return builder", () => byTab("Builder")?.click(), ".builder-view"));

      return {
        results,
        scenes: sceneRows.length,
        builderVisible: Boolean(document.querySelector(".builder-view")),
        threeStageText: (document.querySelector(".three-avatar-viewer")?.textContent || "").slice(0, 80),
        attachPackText: (document.querySelector(".attach-panel pre")?.textContent || "").slice(0, 80)
      };
    })()
  `);

  console.log(JSON.stringify(metrics, null, 2));
  await app.quit();
});
