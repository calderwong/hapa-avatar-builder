const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const project = JSON.parse(fs.readFileSync(path.join(ROOT, "data/music-video-projects/dear-papa-song-dear-papa-video-project.json"), "utf8")).music_video_project;
const sources = project.timeline.filter((shot) => shot.media_contract?.type === "video").map((shot) => new URL(shot.media_contract.runtimeUri, "http://127.0.0.1:8787").href);
const outputPath = process.env.SMOKE_OUTPUT || path.join(ROOT, "artifacts/smoke/echo-ab-cut.json");
app.setName("hapa-echo-ab-cut-smoke");
app.setPath("userData", path.join("/tmp", `hapa-echo-ab-cut-${process.pid}`));

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, width: 640, height: 360, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("data:text/html,<html><body style='margin:0;background:black'></body></html>");
    const metrics = await win.webContents.executeJavaScript(`(async () => {
      const sources = ${JSON.stringify(sources)};
      const players = [document.createElement('video'), document.createElement('video')];
      players.forEach((video, index) => { video.muted = true; video.preload = 'auto'; video.playsInline = true; video.dataset.player = String(index); document.body.appendChild(video); });
      const event = (video, name, timeout = 5000) => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(name + ' timeout')), timeout); video.addEventListener(name, () => { clearTimeout(timer); resolve(); }, { once: true }); });
      const prepare = async (video, src) => {
        const started = performance.now();
        if (video.src !== src) { video.src = src; video.load(); }
        if (video.readyState < 2) await event(video, 'loadeddata');
        await video.play();
        await new Promise((resolve) => video.requestVideoFrameCallback ? video.requestVideoFrameCallback(resolve) : requestAnimationFrame(resolve));
        return performance.now() - started;
      };
      let active = 0;
      const cuts = [];
      let measuredFrames = 0;
      let measuredDroppedFrames = 0;
      await prepare(players[active], sources[0]);
      for (let index = 1; index < sources.length; index += 1) {
        const incoming = 1 - active;
        const milliseconds = await prepare(players[incoming], sources[index]);
        const quality = players[incoming].getVideoPlaybackQuality?.() || {};
        measuredFrames += Number(quality.totalVideoFrames || players[incoming].webkitDecodedFrameCount || 0);
        measuredDroppedFrames += Number(quality.droppedVideoFrames || players[incoming].webkitDroppedFrameCount || 0);
        players[active].pause();
        active = incoming;
        cuts.push(milliseconds);
      }
      players.forEach((video) => video.pause());
      return { cuts, elements: players.length, quality: [{ totalVideoFrames: measuredFrames, droppedVideoFrames: measuredDroppedFrames }] };
    })()`);
    const sorted = metrics.cuts.slice().sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const totalFrames = metrics.quality.reduce((sum, item) => sum + item.totalVideoFrames, 0);
    const droppedFrames = metrics.quality.reduce((sum, item) => sum + item.droppedVideoFrames, 0);
    const droppedPercent = totalFrames ? droppedFrames / totalFrames * 100 : 0;
    const result = { schemaVersion: "hapa.echo.ab-cut-smoke.v1", ok: metrics.elements === 2 && p95 <= 150 && droppedPercent < 1, persistentPlayers: metrics.elements, cuts: metrics.cuts.length, p50Milliseconds: Number(sorted[Math.floor(sorted.length * 0.5)].toFixed(2)), p95Milliseconds: Number(p95.toFixed(2)), maxMilliseconds: Number(Math.max(...sorted).toFixed(2)), totalFrames, droppedFrames, droppedPercent: Number(droppedPercent.toFixed(3)), generatedAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) { console.error(error.stack || error.message || String(error)); process.exitCode = 1; }
  finally { win?.destroy(); app.quit(); }
});
