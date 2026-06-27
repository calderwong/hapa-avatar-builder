const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const targetUrl = "http://127.0.0.1:5178/";
const screenshotPath = "/Users/calderwong/.gemini/antigravity/brain/9c6c39d9-0e8d-454e-8196-73b9546f686a/echos_album_view.png";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, expression, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = await win.webContents.executeJavaScript(expression);
    if (ready) return true;
    await sleep(150);
  }
  return false;
}

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

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[BROWSER CONSOLE] Level ${level}: ${message} (at ${sourceId}:${line})`);
  });

  try {
    await win.loadURL(targetUrl);
    console.log("Page loaded. Waiting for view-tabs...");
    
    await waitFor(win, "Boolean(document.querySelector('.view-tabs button'))", 20000);
    
    console.log("Clicking Echos Album tab...");
    const clicked = await win.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll(".view-tabs button")]
          .find((item) => /echos album/i.test(item.textContent || ""));
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
    
    if (!clicked) {
      throw new Error("Echos Album tab button not found");
    }

    console.log("Waiting for Echos view content...");
    await waitFor(win, "Boolean(document.querySelector('.hapa-echos-view'))", 15000);
    
    console.log("Expanding first song card to show checklist...");
    await win.webContents.executeJavaScript(`
      (() => {
        const clickable = document.querySelector(".songs-gaps-grid > div > div");
        if (clickable) clickable.click();
      })()
    `);

    console.log("Giving UI time to render/hydrate...");
    await sleep(4000); // 4 seconds of sleep for layout and cards to fully render
    
    console.log("Capturing page screenshot...");
    const image = await win.capturePage();
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, image.toPNG());
    console.log("Screenshot saved successfully to " + screenshotPath);
    
    await app.quit();
  } catch (error) {
    console.error("Capture failed:", error);
    await app.quit();
    process.exit(1);
  }
});
