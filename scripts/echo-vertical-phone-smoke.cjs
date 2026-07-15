const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const UI_URL = process.env.SMOKE_URL || "http://127.0.0.1:5178/?view=echos";
const OUTPUT_DIR = path.resolve(process.env.SMOKE_OUTPUT_DIR || path.join(ROOT, "artifacts/smoke"));
const SCREENSHOT_PATH = path.join(OUTPUT_DIR, "echo-vertical-phone-390x844.png");
const RECEIPT_PATH = path.join(OUTPUT_DIR, "echo-vertical-phone-390x844.json");
const USER_DATA = path.join("/tmp", `hapa-echo-vertical-phone-smoke-${process.pid}`);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(win, expression, timeoutMs = 45_000) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      last = await win.webContents.executeJavaScript(expression, true);
      if (last) return last;
    } catch (error) {
      last = { error: error?.message || String(error) };
    }
    await sleep(150);
  }
  throw new Error(`Phone smoke timed out: ${JSON.stringify(last)}`);
}

app.setName("hapa-echo-vertical-phone-smoke");
require("node:fs").mkdirSync(USER_DATA, { recursive: true });
app.setPath("userData", USER_DATA);

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({
    width: 390,
    height: 844,
    useContentSize: true,
    show: false,
    backgroundColor: "#020617",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3 && !/ResizeObserver loop/iu.test(message)) errors.push(message);
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    errors.push(`load ${code}: ${description} (${url})`);
  });

  try {
    await win.loadURL(UI_URL);
    await waitFor(win, `Boolean(document.querySelector('[data-testid="echo-direction-version"] option:not([value="legacy"])') && !document.querySelector('[data-testid="echo-direction-version"]')?.disabled && document.querySelector('[data-testid="echo-output-orientation"]') && document.querySelector('[data-testid="echo-director-preview-frame"]'))`);
    const selectedVariantId = await win.webContents.executeJavaScript(`
      (() => {
        const selector = document.querySelector('[data-testid="echo-direction-version"]');
        const option = Array.from(selector.options).find((candidate) => candidate.value !== 'legacy');
        selector.value = option.value;
        selector.dispatchEvent(new Event('change', { bubbles: true }));
        return option.value;
      })()
    `, true);
    await waitFor(win, `Boolean(document.querySelector('[data-testid="echo-cancel-direction-cut"]') && !document.querySelector('[data-testid="echo-output-orientation"]')?.disabled)`);
    await win.webContents.executeJavaScript(`
      (() => {
        const orientation = document.querySelector('[data-testid="echo-output-orientation"]');
        orientation.value = 'vertical';
        orientation.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `, true);
    await waitFor(win, `document.querySelector('[data-testid="echo-director-preview-frame"]')?.dataset.outputProfile === 'vertical'`);
    const metrics = await win.webContents.executeJavaScript(`
      (() => {
        const selector = document.querySelector('[data-testid="echo-output-orientation"]');
        const directionSelector = document.querySelector('[data-testid="echo-direction-version"]');
        const cancelWorkingCut = document.querySelector('[data-testid="echo-cancel-direction-cut"]');
        const saveCut = document.querySelector('[data-testid="echo-save-direction-cut"]');
        const frame = document.querySelector('[data-testid="echo-director-preview-frame"]');
        const controls = document.querySelector('[data-testid="echo-director-preview-controls"]');
        const canvas = frame?.querySelector('#director-preview-canvas');
        frame?.scrollIntoView({ block: 'center', inline: 'nearest' });
        const rect = frame?.getBoundingClientRect();
        const controlsRect = controls?.getBoundingClientRect();
        return {
          viewport: { width: innerWidth, height: innerHeight },
          documentWidth: document.documentElement.scrollWidth,
          direction: {
            value: directionSelector?.value || null,
            optionLabel: directionSelector?.selectedOptions?.[0]?.textContent?.trim() || null,
            editableWorkingCopy: Boolean(cancelWorkingCut),
            saveLabel: saveCut?.textContent?.trim() || null,
          },
          selector: { value: selector?.value || null, disabled: Boolean(selector?.disabled) },
          frame: rect ? {
            x: rect.x,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            ratio: rect.width / rect.height,
            outputProfile: frame.dataset.outputProfile,
            exportAspect: frame.dataset.exportAspect,
          } : null,
          controls: controlsRect ? { x: controlsRect.x, width: controlsRect.width, right: controlsRect.right } : null,
          canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
        };
      })()
    `, true);
    await sleep(250);
    const screenshot = await win.capturePage();
    const checks = {
      viewport390x844: metrics.viewport.width === 390 && metrics.viewport.height === 844,
      newerCutSelected: metrics.direction.value === selectedVariantId && selectedVariantId !== "legacy",
      newerCutEditable: metrics.direction.editableWorkingCopy === true
        && /editable copy/i.test(metrics.direction.optionLabel || "")
        && metrics.direction.saveLabel === "Save as new cut",
      selectorVertical: metrics.selector.value === "vertical" && metrics.selector.disabled === false,
      canonicalProfile: metrics.frame?.outputProfile === "vertical" && metrics.frame?.exportAspect === "1080x1920",
      portraitCanvas: Number(metrics.canvas?.height) > Number(metrics.canvas?.width)
        && Math.abs((Number(metrics.canvas?.width) / Number(metrics.canvas?.height)) - (9 / 16)) < 0.01,
      previewAspect: Math.abs(Number(metrics.frame?.ratio) - (9 / 16)) < 0.01,
      previewInsideViewport: Number(metrics.frame?.x) >= -0.5 && Number(metrics.frame?.right) <= metrics.viewport.width + 0.5,
      controlsInsideViewport: Number(metrics.controls?.x) >= -0.5 && Number(metrics.controls?.right) <= metrics.viewport.width + 0.5,
    };
    const receipt = {
      schemaVersion: "hapa.echo.vertical-phone-smoke.v2",
      ok: Object.values(checks).every(Boolean) && errors.length === 0,
      url: UI_URL,
      checks,
      metrics,
      errors,
      screenshotPath: SCREENSHOT_PATH,
      testedAt: new Date().toISOString(),
    };
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await Promise.all([
      fs.writeFile(SCREENSHOT_PATH, screenshot.toPNG()),
      fs.writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`),
    ]);
    if (!receipt.ok) throw new Error(`Vertical phone smoke failed: ${JSON.stringify(receipt)}`);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  } finally {
    win.destroy();
    app.exit(process.exitCode || 0);
  }
});
