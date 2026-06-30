const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const targetUrl = process.env.SMOKE_URL || "http://127.0.0.1:5178/?view=protocol";

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 1100,
    show: false,
    backgroundColor: "#020617",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const errors = [];
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3 && !/ResizeObserver loop/.test(message)) errors.push(message);
  });

  try {
    await win.loadURL(targetUrl);
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          if (document.querySelector(".avatar-showcase-view") || Date.now() - started > 8000) resolve();
          else setTimeout(tick, 120);
        };
        tick();
      })
    `);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const metrics = await win.webContents.executeJavaScript(`
      (() => {
        const canon = document.querySelector(".showcase-canon");
        const spine = document.querySelector(".showcase-story-spine");
        const choices = [...document.querySelectorAll(".showcase-canon-choice")];
        const text = document.body.innerText || "";
        const rect = canon?.getBoundingClientRect();
        return {
          title: document.querySelector("h2")?.textContent || document.querySelector("h1")?.textContent || "",
          canonPanel: Boolean(canon),
          storySpine: Boolean(spine),
          choiceCards: choices.length,
          hasReviewState: /pending_review|soft_canon/i.test(canon?.textContent || ""),
          hasSceneReadout: /SCENES/i.test(canon?.textContent || ""),
          panelVisible: rect ? rect.width > 240 && rect.height > 120 : false,
          bodyHasStorySpine: /Story Spine/i.test(text),
          bodyPreview: text.slice(0, 600)
        };
      })()
    `);

    const screenshot = await win.capturePage();
    const screenshotPath = path.join(ROOT, "artifacts/smoke/avatar-mind-ui.png");
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, screenshot.toPNG());

    const failures = [];
    if (errors.length) failures.push(`console errors: ${errors.join("; ")}`);
    if (!metrics.canonPanel) failures.push("missing showcase canon panel");
    if (!metrics.storySpine) failures.push("missing story spine panel");
    if (metrics.choiceCards < 2) failures.push(`expected at least 2 canon choice cards, got ${metrics.choiceCards}`);
    if (!metrics.hasReviewState) failures.push("missing soft-canon/review state text");
    if (!metrics.hasSceneReadout) failures.push("missing linked scene readout");
    if (!metrics.panelVisible) failures.push("canon panel is not visibly sized");
    if (!metrics.bodyHasStorySpine) failures.push("page text does not include Story Spine");

    const result = {
      ok: failures.length === 0,
      targetUrl,
      failures,
      metrics,
      screenshotPath
    };
    console.log(JSON.stringify(result, null, 2));
    await win.close();
    app.quit();
    if (failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    await win.close();
    app.quit();
    process.exitCode = 1;
  }
});
