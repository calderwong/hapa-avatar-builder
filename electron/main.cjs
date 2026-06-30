const { app, BrowserWindow, session } = require("electron");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const HOST = "127.0.0.1";
const BIND_HOST = process.env.HAPA_AVATAR_BIND_HOST || HOST;
const DEFAULT_PORT = readPort(process.env.HAPA_AVATAR_PORT, 8787);
const PORTS = uniquePorts([
  ...(process.env.HAPA_AVATAR_DESKTOP_PORTS || "").split(","),
  8797,
  DEFAULT_PORT,
  8789,
  8790,
  8791,
  8792
]);
let apiProcess = null;
let desktopUrl = null;
let isQuitting = false;
let mainWindow = null;

function isTrustedLocalUrl(value = "") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function installMediaPermissionHandlers() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    const requestingUrl = details.requestingUrl || webContents.getURL() || "";
    if (permission === "media" && isTrustedLocalUrl(requestingUrl)) {
      const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
      const wantsTrustedMedia = !mediaTypes.length || mediaTypes.includes("video") || mediaTypes.includes("audio");
      callback(wantsTrustedMedia);
      return;
    }
    callback(false);
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details = {}) => {
    const origin = requestingOrigin || details.requestingUrl || webContents.getURL() || "";
    if ((permission === "media" || permission === "camera" || permission === "microphone") && isTrustedLocalUrl(origin)) return true;
    return false;
  });
}

function readPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

function uniquePorts(values) {
  return [...new Set(values.map((value) => readPort(value, 0)).filter(Boolean))];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(port, pathname, timeoutMs = 900) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: HOST,
        port,
        path: pathname,
        method: "GET",
        timeout: timeoutMs
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (body.length < 4096) body += chunk;
        });
        res.on("end", () => {
          resolve({
            ok: true,
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", (error) => resolve({ ok: false, statusCode: 0, headers: {}, body: "", error }));
    req.end();
  });
}

function isAvatarBuilderHtml(probe) {
  const contentType = String(probe.headers?.["content-type"] || "");
  return (
    probe.ok &&
    probe.statusCode >= 200 &&
    probe.statusCode < 300 &&
    contentType.includes("text/html") &&
    /Hapa Avatar Builder|id=["']root["']/.test(probe.body || "")
  );
}

async function probePort(port) {
  const [root, health] = await Promise.all([
    httpGet(port, "/"),
    httpGet(port, "/api/health")
  ]);
  return {
    port,
    hasUi: isAvatarBuilderHtml(root),
    apiOk: health.ok && health.statusCode >= 200 && health.statusCode < 300,
    listening: root.ok || health.ok,
    rootStatus: root.statusCode,
    healthStatus: health.statusCode
  };
}

function startStaticApi(port) {
  const httpsPort = process.env.HAPA_AVATAR_HTTPS_PORT === "0" ? 0 : readPort(process.env.HAPA_AVATAR_HTTPS_PORT, port + 1);
  const args = [path.join(ROOT, "server/api.mjs"), "--host", BIND_HOST, "--port", String(port), "--static", "dist"];
  if (httpsPort) args.push("--https-port", String(httpsPort));
  apiProcess = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      HAPA_AVATAR_PUBLIC_PORT: process.env.HAPA_AVATAR_PUBLIC_PORT || String(port),
      HAPA_AVATAR_PUBLIC_HTTPS_PORT: process.env.HAPA_AVATAR_PUBLIC_HTTPS_PORT || (httpsPort ? String(httpsPort) : "")
    }
  });
  apiProcess.on("exit", (code, signal) => {
    if (!isQuitting && code !== 0) {
      console.error(`[desktop] Hapa Avatar Builder server exited early (code=${code}, signal=${signal || "none"})`);
    }
  });
  console.log(`[desktop] Starting Hapa Avatar Builder UI server on http://${HOST}:${port} (bind ${BIND_HOST}, phone https ${httpsPort || "off"})`);
}

async function waitForUi(port) {
  const started = Date.now();
  let lastProbe = null;
  while (Date.now() - started < 12000) {
    lastProbe = await probePort(port);
    if (lastProbe.hasUi) return `http://${HOST}:${port}`;
    if (apiProcess?.exitCode !== null) break;
    await delay(250);
  }
  const status = lastProbe ? `root=${lastProbe.rootStatus}, health=${lastProbe.healthStatus}` : "no probe";
  throw new Error(`Timed out waiting for Hapa Avatar Builder UI on port ${port} (${status})`);
}

async function resolveDesktopUrl() {
  if (desktopUrl) return desktopUrl;

  if (process.env.VITE_DEV_SERVER_URL) {
    desktopUrl = process.env.VITE_DEV_SERVER_URL;
    process.env.HAPA_AVATAR_API_BASE ||= `http://${HOST}:${DEFAULT_PORT}`;
    console.log(`[desktop] Loading Vite desktop URL ${desktopUrl}`);
    return desktopUrl;
  }

  if (process.env.HAPA_AVATAR_DESKTOP_URL) {
    desktopUrl = process.env.HAPA_AVATAR_DESKTOP_URL;
    process.env.HAPA_AVATAR_API_BASE ||= desktopUrl;
    console.log(`[desktop] Loading configured desktop URL ${desktopUrl}`);
    return desktopUrl;
  }

  if (process.env.HAPA_AVATAR_EXTERNAL_API) {
    desktopUrl = `http://${HOST}:${DEFAULT_PORT}`;
    process.env.HAPA_AVATAR_API_BASE ||= desktopUrl;
    console.log(`[desktop] Loading external API desktop URL ${desktopUrl}`);
    return desktopUrl;
  }

  const probes = [];
  for (const port of PORTS) {
    const probe = await probePort(port);
    probes.push(probe);
    if (probe.hasUi) {
      desktopUrl = `http://${HOST}:${port}`;
      process.env.HAPA_AVATAR_API_BASE = desktopUrl;
      console.log(`[desktop] Reusing Hapa Avatar Builder UI server on ${desktopUrl}`);
      return desktopUrl;
    }
  }

  const freePort = probes.find((probe) => !probe.listening)?.port;
  if (freePort) {
    startStaticApi(freePort);
    desktopUrl = await waitForUi(freePort);
    process.env.HAPA_AVATAR_API_BASE = desktopUrl;
    return desktopUrl;
  }

  const occupied = probes
    .map((probe) => `${probe.port}:root=${probe.rootStatus || "closed"},health=${probe.healthStatus || "closed"}`)
    .join("; ");
  throw new Error(`No desktop UI port was available. Checked ${occupied}`);
}

async function createWindow() {
  const url = await resolveDesktopUrl();
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    title: "Hapa Avatar Builder",
    backgroundColor: "#020617",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  await window.loadURL(url);
}

app.whenReady().then(() => {
  installMediaPermissionHandlers();
  return createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  if (apiProcess) {
    apiProcess.kill();
    apiProcess = null;
  }
});
