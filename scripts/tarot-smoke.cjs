const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const targetUrl = process.env.SMOKE_URL || "http://127.0.0.1:8787/";
const errors = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, expression, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = await win.webContents.executeJavaScript(expression);
    if (ready) return true;
    await sleep(120);
  }
  return false;
}

async function clickTarotDraw(win) {
  await waitFor(win, "Boolean(document.querySelector('.view-tabs button'))", 10000);
  return win.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll(".view-tabs button")]
        .find((item) => /tarot draw/i.test(item.textContent || ""));
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
}

async function canvasRect(win) {
  return win.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector(".tarot-draw-view canvas");
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(rect.left)),
        y: Math.max(0, Math.floor(rect.top)),
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height))
      };
    })()
  `);
}

async function sampleCanvas(win) {
  const rect = await canvasRect(win);
  if (!rect) return { ok: false, reason: "missing-canvas" };
  const image = await win.capturePage(rect);
  const size = image.getSize();
  const bitmap = image.toBitmap();
  const points = [
    [0.50, 0.50],
    [0.42, 0.48],
    [0.58, 0.48],
    [0.50, 0.38],
    [0.50, 0.62],
    [0.30, 0.50],
    [0.70, 0.50]
  ];
  const samples = points.map(([px, py]) => {
    const x = Math.max(0, Math.min(size.width - 1, Math.floor(size.width * px)));
    const y = Math.max(0, Math.min(size.height - 1, Math.floor(size.height * py)));
    const offset = (y * size.width + x) * 4;
    return [bitmap[offset], bitmap[offset + 1], bitmap[offset + 2], bitmap[offset + 3]];
  });
  const nonBlack = samples.filter(([b, g, r, a]) => a > 0 && r + g + b > 24).length;
  const unique = new Set(samples.map((item) => item.join(","))).size;
  return { ok: nonBlack >= 3 && unique >= 2, rect, width: size.width, height: size.height, nonBlack, unique, samples };
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

  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) {
      errors.push(message);
    }
  });

  try {
    await win.loadURL(targetUrl);
    const clicked = await clickTarotDraw(win);
    if (!clicked) throw new Error("Tarot Draw tab was not found");

    const mounted = await waitFor(win, `
      Boolean(document.querySelector(".tarot-draw-view canvas") && window.__THREE_GAME_DIAGNOSTICS__?.kind === "hapa-tarot-draw")
    `, 12000);
    if (!mounted) throw new Error("Tarot Draw canvas/diagnostics did not mount");

    await waitFor(win, "Number(window.__THREE_GAME_DIAGNOSTICS__?.state?.deckCount || 0) > 0", 12000);
    await sleep(1000);
    const metrics = await win.webContents.executeJavaScript(`
      (() => {
        const diagnostics = window.__THREE_GAME_DIAGNOSTICS__;
        const canvas = document.querySelector(".tarot-draw-view canvas");
        const rect = canvas?.getBoundingClientRect();
        return {
          title: document.querySelector(".tarot-draw-title h2")?.textContent || "",
          diagnosticsKind: diagnostics?.kind || null,
          placedCount: diagnostics?.state?.placedCount || 0,
          held: Boolean(diagnostics?.state?.held),
          deckCount: diagnostics?.state?.deckCount || 0,
          canvas: canvas ? { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height } : null,
          hud: Boolean(document.querySelector(".tarot-draw-hud")),
          controls: Boolean(document.querySelector(".tarot-draw-controls")),
          text: document.querySelector(".tarot-draw-view")?.innerText.slice(0, 500) || ""
        };
      })()
    `);
    const pixels = await sampleCanvas(win);
    if (!metrics.deckCount) throw new Error(`Tarot Draw mounted but has no drawable cards: ${JSON.stringify(metrics)}`);
    if (!pixels.ok) throw new Error(`Tarot Draw canvas is blank or unreadable: ${JSON.stringify(pixels)}`);
    if (errors.length) throw new Error(`Renderer console errors:\n${errors.join("\n")}`);

    const image = await win.capturePage();
    const screenshotPath = path.join(ROOT, "artifacts/smoke/avatar-builder-tarot-draw-3d.png");
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, image.toPNG());

    console.log(JSON.stringify({ ok: true, targetUrl, metrics, pixels, screenshotPath }, null, 2));
    await app.quit();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    await app.quit();
    process.exit(1);
  }
});
