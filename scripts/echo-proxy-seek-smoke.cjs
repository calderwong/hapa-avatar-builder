const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const project = JSON.parse(fs.readFileSync(path.join(ROOT, "data/music-video-projects/dear-papa-song-dear-papa-video-project.json"), "utf8")).music_video_project;
const sources = [...new Set(project.timeline.filter((shot) => shot.media_contract?.type === "video").map((shot) => shot.media_contract.runtimeUri))].map((uri) => new URL(uri, "http://127.0.0.1:8787").href);
const outputPath = process.env.SMOKE_OUTPUT || path.join(ROOT, "artifacts/smoke/echo-proxy-seek.json");
app.setName("hapa-echo-proxy-seek-smoke");
app.setPath("userData", path.join("/tmp", `hapa-echo-proxy-seek-${process.pid}`));

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, width: 640, height: 360, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("data:text/html,<html><body></body></html>");
    const measurements = await win.webContents.executeJavaScript(`(async () => {
      const sources = ${JSON.stringify(sources)};
      const waitEvent = (target, name, timeout = 5000) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(name + ' timeout')), timeout);
        target.addEventListener(name, () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      const results = [];
      for (let index = 0; index < sources.length; index += 1) {
        const video = document.createElement('video');
        video.muted = true; video.preload = 'auto'; video.playsInline = true; video.src = sources[index];
        document.body.replaceChildren(video);
        video.load();
        if (video.readyState < 2) await waitEvent(video, 'loadeddata');
        const target = Math.max(0, Math.min(video.duration - 0.04, video.duration * ((index % 7) + 1) / 8));
        const started = performance.now();
        const frame = new Promise((resolve) => {
          if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => resolve());
          else waitEvent(video, 'seeked').then(resolve);
        });
        video.currentTime = target;
        await frame;
        results.push({ uri: sources[index], milliseconds: performance.now() - started, target, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
        video.pause(); video.removeAttribute('src'); video.load();
      }
      return results;
    })()`);
    const sorted = measurements.map((item) => item.milliseconds).sort((a, b) => a - b);
    const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
    const payloadByUri = project.timeline.filter((shot) => shot.media_contract?.type === "video").reduce((map, shot) => map.set(shot.media_contract.runtimeUri, shot.media_contract.proxy.byteSize), new Map());
    const payloadBytes = [...payloadByUri.values()].reduce((sum, value) => sum + value, 0);
    const result = {
      schemaVersion: "hapa.echo.proxy-seek-smoke.v1",
      ok: measurements.length === 60 && measurements.every((item) => item.width > 0 && item.height > 0) && p95 <= 150,
      samples: measurements.length,
      p50Milliseconds: Number(sorted[Math.floor(sorted.length * 0.5)].toFixed(2)),
      p95Milliseconds: Number(p95.toFixed(2)),
      maxMilliseconds: Number(Math.max(...sorted).toFixed(2)),
      payloadMiB: Number((payloadBytes / 1048576).toFixed(3)),
      measurements,
      generatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ ...result, measurements: undefined }, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  } finally {
    win?.destroy();
    app.quit();
  }
});
