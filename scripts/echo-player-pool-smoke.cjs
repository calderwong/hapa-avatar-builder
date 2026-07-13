const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const projectPath = process.env.ECHO_PROJECT || path.join(ROOT, "data/music-video-projects/dear-papa-song-dear-papa-video-project.json");
const baseUrl = process.env.SMOKE_URL || "http://127.0.0.1:8787";
const outputPath = process.env.SMOKE_OUTPUT || path.join(ROOT, "artifacts/smoke/echo-player-pool.json");
app.setName("hapa-echo-player-pool-smoke");
app.setPath("userData", path.join("/tmp", `hapa-echo-player-pool-smoke-${process.pid}`));

function canonical(value = "") { return String(value).split("#")[0]; }
function absoluteUri(value = "") {
  const clean = canonical(value);
  return /^https?:/i.test(clean) ? clean : new URL(clean, baseUrl).href;
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

app.whenReady().then(async () => {
  let win;
  try {
    const payload = JSON.parse(fs.readFileSync(projectPath, "utf8"));
    const project = payload.music_video_project || payload;
    const shots = (project.timeline || []).filter((shot) => shot.media_uri && shot.media_id !== "none").slice(0, 3);
    const sources = shots.map((shot, lookahead) => ({
      lookahead,
      key: canonical(shot.media_uri),
      uri: absoluteUri(shot.media_uri),
    }));
    if (!sources.length || sources.length > 3) throw new Error(`invalid lease count ${sources.length}`);
    win = new BrowserWindow({ show: false, width: 640, height: 360, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await win.loadURL("data:text/html,<html><body style='margin:0;background:black'></body></html>");
    await win.webContents.executeJavaScript(`
      (() => {
        const sources = ${JSON.stringify(sources)};
        window.pool = sources.map((source) => {
          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.preload = "auto";
          video.dataset.sourceKey = source.key;
          video.dataset.lookahead = String(source.lookahead);
          video.src = source.uri;
          document.body.appendChild(video);
          video.load();
          return video;
        });
      })()
    `);
    const started = Date.now();
    let metrics = null;
    while (Date.now() - started < 20000) {
      metrics = await win.webContents.executeJavaScript(`
        (() => ({
          elements: window.pool.length,
          maxLookahead: Math.max(...window.pool.map((video) => Number(video.dataset.lookahead))),
          fragmentFreeKeys: window.pool.every((video) => !video.dataset.sourceKey.includes("#")),
          readyStates: window.pool.map((video) => video.readyState),
          dimensions: window.pool.map((video) => [video.videoWidth, video.videoHeight]),
          activeResourceRequests: performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/media/") || entry.name.includes("/api/local-file")).length
        }))()
      `);
      if (metrics.readyStates.every((state) => state >= 2)) break;
      await wait(150);
    }
    const handoff = await win.webContents.executeJavaScript(`
      (() => {
        const first = window.pool[0];
        const second = window.pool[1] || first;
        const oldFrameReady = first.readyState >= 2;
        const replacementFrameReady = second.readyState >= 2;
        window.visiblePlayer = replacementFrameReady ? second : first;
        return {
          oldFrameReady,
          replacementFrameReady,
          handedOff: window.visiblePlayer === second,
          visibleKey: window.visiblePlayer.dataset.sourceKey,
          playerIdentityPreserved: window.pool.includes(window.visiblePlayer)
        };
      })()
    `);
    const result = {
      schemaVersion: "hapa.echo.player-pool-smoke.v1",
      ok: metrics.elements <= 3
        && metrics.activeResourceRequests <= 6
        && metrics.maxLookahead <= 2
        && metrics.fragmentFreeKeys
        && metrics.readyStates.every((state) => state >= 2)
        && metrics.dimensions.every(([width, height]) => width > 0 && height > 0)
        && handoff.oldFrameReady
        && handoff.replacementFrameReady
        && handoff.handedOff
        && handoff.playerIdentityPreserved,
      project: project.song_title,
      sources,
      metrics,
      handoff,
      generatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  } finally {
    win?.destroy();
    app.quit();
  }
});
