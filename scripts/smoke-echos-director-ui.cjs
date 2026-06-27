const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const targetUrl = process.env.ECHOS_UI_URL || "http://127.0.0.1:8797/";
const screenshotPath = path.resolve("artifacts/perf/echos-director-ui-smoke.png");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, expression, timeout = 20000) {
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
    width: 2048,
    height: 1152,
    show: false,
    backgroundColor: "#020617",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3 && !/ResizeObserver loop/.test(message)) {
      consoleErrors.push(message);
    }
  });

  try {
    await win.loadURL(targetUrl);
    await waitFor(win, "Boolean(document.querySelector('.view-tabs button'))");
    await win.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll(".view-tabs button")]
          .find((item) => /echos album/i.test(item.textContent || ""));
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
    await waitFor(win, "Boolean(document.querySelector('.hapa-echos-view'))");
    await waitFor(win, "Boolean([...document.querySelectorAll('button')].find((item) => /shader track/i.test(item.textContent || '')))");
    await win.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll("button")]
          .find((item) => /shader track/i.test(item.textContent || ""));
        button?.click();
        return Boolean(button);
      })()
    `);
    await waitFor(win, "Boolean([...document.querySelectorAll('input')].find((item) => /search shader/i.test(item.placeholder || '')))");
    await sleep(750);

    const shaderResult = await win.webContents.executeJavaScript(`
      (() => {
        const rectPayload = (el) => {
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            visible: rect.width > 80 && rect.height > 14
          };
        };
        const shaderSearch = [...document.querySelectorAll("input")]
          .find((item) => /search shader/i.test(item.placeholder || ""));
        const shaderList = shaderSearch?.nextElementSibling || null;
        const shaderButtons = shaderList ? [...shaderList.querySelectorAll("button")] : [];
        return {
          shaderSearch: rectPayload(shaderSearch),
          shaderList: rectPayload(shaderList),
          shaderButtonCount: shaderButtons.length,
          shaderListOverflowY: shaderList ? getComputedStyle(shaderList).overflowY : ""
        };
      })()
    `);

    await win.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll("button")]
          .find((item) => /video track/i.test(item.textContent || ""));
        button?.click();
        return Boolean(button);
      })()
    `);
    await waitFor(win, "Boolean([...document.querySelectorAll('select')].find((item) => [...item.options].some((option) => /slow push in/i.test(option.textContent || ''))))");
    await sleep(300);

    const controlsResult = await win.webContents.executeJavaScript(`
      (() => {
        const rectPayload = (el) => {
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            visible: rect.width > 40 && rect.height > 14
          };
        };
        const cameraSelect = [...document.querySelectorAll("select")]
          .find((item) => [...item.options].some((option) => /slow push in/i.test(option.textContent || "")));
        const previewFrame = document.querySelector('.media-preview-container[data-export-aspect="1920x1080"]');
        const videoSearch = [...document.querySelectorAll('input[type="search"]')]
          .find((item) => /search title/i.test(item.placeholder || ""));
        const pureVisualizerButton = [...document.querySelectorAll("button")]
          .find((item) => /^pure visualizer$/i.test((item.textContent || "").trim()));
        const videoButtons = [...document.querySelectorAll("button")]
          .filter((item) => /\\|\\s*(loop|progression|untyped)\\s*\\|/i.test(item.textContent || ""));
        const lyricPosition = document.querySelector('select[aria-label="Lyric position"]');
        const lyricStyle = document.querySelector('select[aria-label="Lyric style"]');
        const cameraBadge = [...document.querySelectorAll("span")]
          .find((item) => /^CAM\\s/i.test(item.textContent || ""));
        return {
          cameraSelect: rectPayload(cameraSelect),
          cameraOptions: cameraSelect ? [...cameraSelect.options].map((option) => option.value) : [],
          previewFrame: rectPayload(previewFrame),
          previewAspect: previewFrame ? Number((previewFrame.getBoundingClientRect().width / previewFrame.getBoundingClientRect().height).toFixed(3)) : 0,
          videoSearch: rectPayload(videoSearch),
          pureVisualizerButton: rectPayload(pureVisualizerButton),
          firstVideoButton: rectPayload(videoButtons[0]),
          videoButtonCount: videoButtons.length,
          lyricPosition: rectPayload(lyricPosition),
          lyricStyle: rectPayload(lyricStyle),
          cameraBadge: rectPayload(cameraBadge),
          consoleErrors: ${JSON.stringify(consoleErrors)}
        };
      })()
    `);

    const ok = Boolean(
      shaderResult.shaderSearch?.visible &&
      shaderResult.shaderList?.visible &&
      shaderResult.shaderButtonCount >= 2 &&
      ["auto", "scroll"].includes(shaderResult.shaderListOverflowY) &&
      controlsResult.cameraSelect?.visible &&
      controlsResult.cameraOptions.includes("pan-up") &&
      controlsResult.cameraOptions.includes("pan-down") &&
      controlsResult.cameraOptions.includes("pan-up-left") &&
      controlsResult.cameraOptions.includes("pan-up-right") &&
      controlsResult.cameraOptions.includes("pan-down-left") &&
      controlsResult.cameraOptions.includes("pan-down-right") &&
      controlsResult.previewFrame?.visible &&
      Math.abs(controlsResult.previewAspect - (16 / 9)) < 0.04 &&
      controlsResult.videoSearch?.visible &&
      controlsResult.videoSearch.height >= 32 &&
      controlsResult.pureVisualizerButton?.visible &&
      controlsResult.pureVisualizerButton.height >= 38 &&
      controlsResult.firstVideoButton?.visible &&
      controlsResult.firstVideoButton.height >= 52 &&
      controlsResult.videoButtonCount >= 4 &&
      controlsResult.lyricPosition?.visible &&
      controlsResult.lyricStyle?.visible &&
      controlsResult.cameraBadge?.visible &&
      controlsResult.consoleErrors.length === 0
    );

    const image = await win.capturePage();
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, image.toPNG());
    console.log(JSON.stringify({ ok, targetUrl, screenshotPath, ...shaderResult, ...controlsResult }, null, 2));
    await app.quit();
    process.exit(ok ? 0 : 1);
  } catch (error) {
    console.error(error);
    await app.quit();
    process.exit(1);
  }
});
