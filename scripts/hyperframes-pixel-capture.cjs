#!/usr/bin/env electron
"use strict";

const { app, BrowserWindow } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const pixelAcceptancePromise = import("./hyperframes-pixel-acceptance.mjs");
const outputProfilePromise = import("../src/domain/echo-output-profile.js");

const ROOT = path.resolve(__dirname, "..");
const value = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const row = process.argv.find((arg) => arg.startsWith(prefix));
  return row ? row.slice(prefix.length) : fallback;
};
const project = path.resolve(value("project", path.join(ROOT, "outputs/hyperframes-dear-papa-v2")));
const output = path.resolve(value("output", path.join(project, "qa/pixel-capture")));
const explicitExpectations = value("expect", "");
const expectationsPath = explicitExpectations ? path.resolve(explicitExpectations) : null;
const suppliedExpectations = expectationsPath && fs.existsSync(expectationsPath)
  ? JSON.parse(fs.readFileSync(expectationsPath, "utf8"))
  : null;
const explicitTimes = value("at", "");
const entry = path.join(project, "index.html");
const manifestPath = path.join(project, "executable-show.json");

function manifestVisualizerInstances(manifest) {
  if (Array.isArray(manifest?.instances?.visualizers)) return manifest.instances.visualizers;
  if (Array.isArray(manifest?.visualizers)) return manifest.visualizers;
  if (Array.isArray(manifest?.instances)) {
    return manifest.instances.filter((row) => row?.visualizerId || row?.type === "visualizer");
  }
  return [];
}

function expectedLayer(instance) {
  return {
    cueId: instance.cueId || instance.id || null,
    visualizerId: instance.visualizerId || null,
    stemFocus: instance.stemFocus || null,
    start: finite(instance.start, 0),
    end: finite(instance.end, finite(instance.start, 0) + finite(instance.duration, 0)),
  };
}

function derivedSamples(manifest, timestamps) {
  const visualizers = manifestVisualizerInstances(manifest);
  return timestamps.map((timestamp) => {
    const active = visualizers.filter((instance) => {
      const start = finite(instance.start, 0);
      const end = finite(instance.end, start + finite(instance.duration, 0));
      return timestamp >= start && (timestamp < end || (timestamp === finite(manifest.duration, -1) && timestamp === end));
    });
    return {
      timestamp,
      layers: active.map(expectedLayer),
      derivedFrom: "executable-show.json",
    };
  });
}

function defaultTimestamps(manifest) {
  return manifestVisualizerInstances(manifest)
    .map((instance) => {
      const start = finite(instance.start, 0);
      const end = finite(instance.end, start + finite(instance.duration, 0));
      return Number(((start + end) / 2).toFixed(6));
    })
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= 0);
}

function sha256(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function metrics(image) {
  const size = image.getSize();
  const bitmap = image.toBitmap();
  let min = 255;
  let max = 0;
  let sum = 0;
  let count = 0;
  const buckets = new Set();
  const pixelStride = Math.max(1, Math.floor((size.width * size.height) / 120000));
  for (let pixel = 0; pixel < size.width * size.height; pixel += pixelStride) {
    const offset = pixel * 4;
    const b = bitmap[offset] || 0;
    const g = bitmap[offset + 1] || 0;
    const r = bitmap[offset + 2] || 0;
    const luma = Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722);
    min = Math.min(min, luma);
    max = Math.max(max, luma);
    sum += luma;
    count += 1;
    buckets.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
  }
  return {
    width: size.width,
    height: size.height,
    sampledPixels: count,
    lumaMin: min,
    lumaMax: max,
    lumaRange: max - min,
    lumaMean: count ? Number((sum / count).toFixed(3)) : 0,
    colorBuckets: buckets.size,
    nonBlank: max > 8,
    nonFlat: max - min >= 8 && buckets.size >= 8,
  };
}

function safeTime(timestamp) {
  return timestamp.toFixed(3).replace(".", "_");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contentType(file) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
  })[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function createStaticServer(root) {
  const requests = [];
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const file = path.resolve(root, relative);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end("forbidden");
        return;
      }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      const size = fs.statSync(file).size;
      const range = String(request.headers.range || "").match(/^bytes=(\d+)-(\d*)$/);
      let start = 0;
      let end = Math.max(0, size - 1);
      let status = 200;
      if (range) {
        start = Math.min(end, Number(range[1]));
        end = range[2] ? Math.min(end, Number(range[2])) : end;
        status = 206;
      }
      requests.push({ method: request.method, path: relative, range: range ? request.headers.range : null, status });
      response.writeHead(status, {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Type": contentType(file),
        "Content-Length": Math.max(0, end - start + 1),
        ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      });
      if (request.method === "HEAD") response.end();
      else fs.createReadStream(file, { start, end }).pipe(response);
    } catch (error) {
      response.writeHead(500).end(String(error.message || error));
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, requests, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function waitFor(win, expression, timeoutMs = 20000) {
  const attempts = Math.ceil(timeoutMs / 100);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await win.webContents.executeJavaScript(expression, true)) return true;
    await sleep(100);
  }
  return false;
}

app.setName("hapa-hyperframes-pixel-capture");
app.setPath("userData", path.join("/tmp", `hapa-hyperframes-pixel-capture-${process.pid}`));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

app.whenReady().then(async () => {
  const [{ evaluateHyperFramesPixelAcceptance }, { resolveEchoOutputProfile }] = await Promise.all([
    pixelAcceptancePromise,
    outputProfilePromise,
  ]);
  let win;
  let localServer;
  const networkAttempts = [];
  const consoleWarnings = [];
  const consoleErrors = [];
  try {
    if (!fs.existsSync(entry)) throw new Error(`HyperFrames entry is missing: ${entry}`);
    if (!fs.existsSync(manifestPath)) throw new Error(`Executable show is missing: ${manifestPath}`);
    if (explicitExpectations && !suppliedExpectations) {
      throw new Error(`Explicit expectations file is missing: ${expectationsPath}`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const outputProfile = resolveEchoOutputProfile(manifest?.outputProfile ?? manifest?.output_profile);
    const timestampSource = explicitTimes
      || (suppliedExpectations?.samples || []).map((row) => row.timestamp).join(",")
      || defaultTimestamps(manifest).join(",");
    const duration = finite(manifest.duration, 60);
    const timestamps = timestampSource
      .split(",")
      .map(Number)
      .filter((row) => Number.isFinite(row) && row >= 0)
      .map((row) => Math.min(duration, row));
    if (timestamps.length === 0) {
      throw new Error("No visualizer cue timestamps were found; pass --at=<seconds> to select capture times");
    }
    const expectations = suppliedExpectations || {
      schemaVersion: "hapa.hyperframes.derived-pixel-expectations.v1",
      source: manifestPath,
      samples: derivedSamples(manifest, timestamps),
    };
    const expectationByTime = new Map((expectations.samples || []).map((row) => [Number(row.timestamp).toFixed(6), row]));
    fs.mkdirSync(output, { recursive: true });
    localServer = await createStaticServer(project);
    win = new BrowserWindow({
      show: false,
      frame: false,
      width: outputProfile.width,
      height: outputProfile.height,
      useContentSize: true,
      backgroundColor: "#02040a",
      webPreferences: { contextIsolation: true, nodeIntegration: false, autoplayPolicy: "no-user-gesture-required" },
    });
    win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      if (/^(https?|wss?):/i.test(details.url) && !details.url.startsWith(`${localServer.origin}/`)) {
        networkAttempts.push({ url: details.url, resourceType: details.resourceType });
        callback({ cancel: true });
      } else callback({});
    });
    win.webContents.on("console-message", (details) => {
      const row = {
        level: details.level,
        message: details.message,
        line: details.lineNumber,
        sourceId: details.sourceId,
      };
      if (details.level === "error") consoleErrors.push(row);
      else if (details.level === "warning") consoleWarnings.push(row);
    });
    await win.loadURL(`${localServer.origin}/index.html`);
    const ready = await waitFor(
      win,
      "Boolean(window.__timelines && window.__timelines.main && typeof window.__timelines.main.seek === 'function' && window.HAPA_EXECUTABLE_SHOW)",
    );
    if (!ready) throw new Error("HyperFrames timeline did not expose synchronous seek readiness");
    const assetReadiness = await win.webContents.executeJavaScript(`Promise.race([
      Promise.resolve(window.HAPA_ASSETS_READY).then(() => ({ ok: true })).catch((error) => ({ ok: false, code: "shader-atlas-decode-failed", message: String(error && error.message || error) })),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, code: "shader-atlas-decode-timeout", message: "Shader atlases did not finish decoding within 120 seconds." }), 120000)),
    ])`, true);
    if (!assetReadiness?.ok) {
      const error = new Error(assetReadiness?.message || "Shader atlas assets did not become ready");
      error.code = assetReadiness?.code || "shader-atlas-readiness-failed";
      throw error;
    }

    const frames = [];
    for (let index = 0; index < timestamps.length; index += 1) {
      const timestamp = timestamps[index];
      const captureState = await win.webContents.executeJavaScript(`(async () => {
        const timeline = window.__timelines.main;
        if (typeof timeline.pause === "function") timeline.pause();
        timeline.seek(${JSON.stringify(timestamp)}, false);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const canvas = document.getElementById("viz");
        const context = canvas && canvas.getContext("2d", { willReadFrequently: true });
        let canvasCapture = null;
        if (canvas && context) {
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const stride = Math.max(1, Math.floor((canvas.width * canvas.height) / 120000));
          let alphaMax = 0, lumaMin = 255, lumaMax = 0, visibleSamples = 0;
          const colors = new Set();
          for (let pixel = 0; pixel < canvas.width * canvas.height; pixel += stride) {
            const offset = pixel * 4;
            const r = pixels[offset] || 0, g = pixels[offset + 1] || 0, b = pixels[offset + 2] || 0, a = pixels[offset + 3] || 0;
            alphaMax = Math.max(alphaMax, a);
            if (a > 2) {
              const luma = Math.round(r * .2126 + g * .7152 + b * .0722);
              lumaMin = Math.min(lumaMin, luma);
              lumaMax = Math.max(lumaMax, luma);
              colors.add((r >> 4) + ":" + (g >> 4) + ":" + (b >> 4) + ":" + (a >> 4));
              visibleSamples += 1;
            }
          }
          canvasCapture = {
            dataUrl: canvas.toDataURL("image/png"),
            metrics: {
              width: canvas.width,
              height: canvas.height,
              alphaMax,
              visibleSamples,
              lumaMin: visibleSamples ? lumaMin : 0,
              lumaMax: visibleSamples ? lumaMax : 0,
              lumaRange: visibleSamples ? lumaMax - lumaMin : 0,
              colorBuckets: colors.size,
              nonBlank: alphaMax > 8 && lumaMax > 8,
              nonFlat: alphaMax > 8 && lumaMax - lumaMin >= 8 && colors.size >= 8,
            },
          };
        }
        return {
          renderState: JSON.parse(JSON.stringify(window.HAPA_LAST_RENDER_STATE || null)),
          canvasCapture,
        };
      })()`, true);
      const renderState = captureState?.renderState || null;
      const image = await win.capturePage();
      const png = image.toPNG();
      const pngName = `frame-${String(index).padStart(2, "0")}-${safeTime(timestamp)}s.png`;
      const pngPath = path.join(output, pngName);
      fs.writeFileSync(pngPath, png);
      const canvasPng = captureState?.canvasCapture?.dataUrl
        ? Buffer.from(captureState.canvasCapture.dataUrl.split(",")[1] || "", "base64")
        : null;
      const canvasPngName = `shader-canvas-${String(index).padStart(2, "0")}-${safeTime(timestamp)}s.png`;
      const canvasPngPath = path.join(output, canvasPngName);
      if (canvasPng?.length) fs.writeFileSync(canvasPngPath, canvasPng);
      frames.push({
        index,
        timestamp,
        pngPath,
        pngSha256: sha256(png),
        metrics: metrics(image),
        canvasPngPath: canvasPng?.length ? canvasPngPath : null,
        canvasPngSha256: canvasPng?.length ? sha256(canvasPng) : null,
        canvasMetrics: captureState?.canvasCapture?.metrics || null,
        expected: expectationByTime.get(timestamp.toFixed(6)) || null,
        renderState,
      });
      process.stdout.write(`${JSON.stringify({
        type: "pixel-qa-progress",
        completed: index + 1,
        total: timestamps.length,
        timestamp,
        cueIds: (renderState?.layers || renderState?.instances || []).map((layer) => layer.cueId || layer.id).filter(Boolean),
      })}\n`);
    }

    const renderLayers = (frame) => frame.renderState?.layers || frame.renderState?.instances || [];
    const visualizerIds = frames.map((frame) => renderLayers(frame).map((layer) => layer.visualizerId).join("+") || "");
    const pixelHashes = frames.map((frame) => frame.pngSha256);
    const canvasPixelHashes = frames.map((frame) => frame.canvasPngSha256 || "");
    const evaluated = evaluateHyperFramesPixelAcceptance({
      frames,
      timelineReady: ready,
      networkAttemptCount: networkAttempts.length,
      consoleErrorCount: consoleErrors.length,
    });
    const report = {
      schemaVersion: "hapa.hyperframes.pixel-capture.v2",
      project,
      entry,
      executableShow: manifestPath,
      showHash: manifest.showHash || null,
      outputProfile,
      timestamps: frames.map((frame) => frame.timestamp),
      offline: { networkAttemptCount: networkAttempts.length, networkAttempts },
      loopback: {
        requestCount: localServer.requests.length,
        requestedPaths: [...new Set(localServer.requests.map((row) => row.path))].sort(),
      },
      consoleErrors,
      consoleWarnings,
      consoleSummary: { errorCount: consoleErrors.length, warningCount: consoleWarnings.length },
      expectations: {
        mode: suppliedExpectations ? "explicit-fixture" : "derived-from-executable-show",
        path: expectationsPath,
        schemaVersion: expectations.schemaVersion || null,
      },
      acceptance: evaluated.acceptance,
      acceptanceDiagnostics: evaluated.diagnostics,
      frames,
    };
    report.functionalOk = evaluated.functionalOk;
    report.ok = evaluated.ok;
    const reportPath = path.join(output, "pixel-capture-report.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      ok: report.ok,
      reportPath,
      firstVisibleFrame: frames[0]?.pngPath || null,
      frames: frames.length,
      visualizerIds,
      uniquePixelHashes: new Set(pixelHashes).size,
      uniqueCanvasPixelHashes: new Set(canvasPixelHashes.filter(Boolean)).size,
      blankShaderCanvasFrames: report.acceptance.blankShaderCanvasFrames,
      networkAttemptCount: networkAttempts.length,
      consoleErrorCount: consoleErrors.length,
      consoleWarningCount: consoleWarnings.length,
    }, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  } finally {
    win?.destroy();
    localServer?.server.close();
    app.quit();
  }
});
