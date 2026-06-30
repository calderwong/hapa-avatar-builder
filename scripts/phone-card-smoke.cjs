const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const targetUrl = process.env.SMOKE_PHONE_URL || "https://127.0.0.1:8798/phone-card?session=phone-smoke";
const errors = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(win, expression, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const ready = await win.webContents.executeJavaScript(expression);
    if (ready) return true;
    await sleep(120);
  }
  return false;
}

async function sampleCanvas(win) {
  const rect = await win.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector(".phone-card-fpv");
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
  if (!rect) return { ok: false, reason: "missing-phone-canvas" };
  const image = await win.capturePage(rect);
  const size = image.getSize();
  const bitmap = image.toBitmap();
  const points = [
    [0.5, 0.5],
    [0.34, 0.44],
    [0.66, 0.44],
    [0.5, 0.28],
    [0.5, 0.72],
    [0.24, 0.64],
    [0.76, 0.64]
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

app.on("certificate-error", (event, _webContents, _url, _error, _certificate, callback) => {
  event.preventDefault();
  callback(true);
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 430,
    height: 860,
    show: false,
    backgroundColor: "#020617",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) errors.push(message);
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    errors.push(`[Load Failure] ${errorCode}: ${errorDescription} (${validatedURL})`);
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    errors.push(`[Process Gone] ${details.reason} (${details.exitCode})`);
  });

  try {
    await win.loadURL(targetUrl);
    const mounted = await waitFor(win, `
      Boolean(document.querySelector(".phone-card-mobile") && window.__HAPA_PHONE_CARD_DIAGNOSTICS__?.kind === "hapa-phone-card")
    `, 30000);
    if (!mounted) throw new Error("Phone Card mobile route did not mount");

    const applied = await win.webContents.executeJavaScript(`
      (() => {
        const actions = window.__HAPA_PHONE_CARD_DIAGNOSTICS__?.actions;
        if (!actions?.applySceneState) return null;
        return actions.applySceneState({
          version: 1,
          generatedAt: Date.now(),
          playing: true,
          activeSong: "Smoke Song",
          audioBands: { low: 0.4, mid: 0.62, high: 0.34, energy: 0.72 },
          cards: [
            {
              id: "smoke-card-1",
              title: "Smoke Card",
              kind: "song",
              zone: "drop",
              selected: true,
              position: [0.4, 0.28, 0.8],
              quaternion: [0, 0.18, 0, 0.984],
              scale: [1, 1, 1],
              playing: true
            }
          ],
          screens: [
            {
              id: "smoke-screen-1",
              family: "drop-preview",
              title: "Smoke Preview",
              width: 2.4,
              height: 1.35,
              opacity: 0.82,
              position: [0, 1.5, -2.4],
              quaternion: [0, 0, 0, 1],
              scale: [1, 1, 1],
              playing: true
            }
          ],
          effects: [
            {
              id: "smoke-effect-1",
              label: "Music Zone",
              type: "ring",
              position: [0.4, 0.08, 0.8],
              radius: 0.62,
              color: "#ff6df2",
              energy: 0.9,
              active: true,
              band: "energy"
            }
          ]
        });
      })()
    `);
    if (!applied || applied.cards < 1 || applied.screens < 1 || applied.effects < 1) {
      throw new Error(`Phone scene-state diagnostic injection failed: ${JSON.stringify(applied)}`);
    }

    await sleep(900);
    const state = await win.webContents.executeJavaScript(`
      (() => {
        const diagnostics = window.__HAPA_PHONE_CARD_DIAGNOSTICS__;
        const canvas = document.querySelector(".phone-card-fpv");
        const rect = canvas?.getBoundingClientRect();
        return {
          diagnosticsKind: diagnostics?.kind || null,
          state: diagnostics?.state || null,
          canvas: canvas ? { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height } : null,
          text: document.querySelector(".phone-card-mobile")?.innerText.slice(0, 400) || ""
        };
      })()
    `);
    const pixels = await sampleCanvas(win);
    if (!state.canvas?.width || !state.canvas?.height) throw new Error(`Phone FPV canvas missing dimensions: ${JSON.stringify(state)}`);
    if ((state.state?.remoteScene?.cards || 0) < 1 || (state.state?.remoteScene?.screens || 0) < 1) {
      throw new Error(`Phone scene replica not present: ${JSON.stringify(state.state?.remoteScene || null)}`);
    }
    if (!pixels.ok) throw new Error(`Phone FPV canvas is blank or unreadable: ${JSON.stringify(pixels)}`);
    if (errors.length) throw new Error(`Renderer console errors:\n${errors.join("\n")}`);

    const image = await win.capturePage();
    const screenshotPath = path.join(ROOT, "artifacts/smoke/phone-card-mobile.png");
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, image.toPNG());

    console.log(JSON.stringify({ ok: true, targetUrl, state, pixels, screenshotPath }, null, 2));
    await app.quit();
  } catch (error) {
    console.error("Renderer errors collected:", errors);
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    await app.quit();
    process.exit(1);
  }
});
