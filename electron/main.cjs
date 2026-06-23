const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
let apiProcess = null;

function startApi() {
  if (process.env.HAPA_AVATAR_EXTERNAL_API) return;
  const args = [path.join(ROOT, "server/api.mjs"), "--port", "8787"];
  if (!process.env.VITE_DEV_SERVER_URL) args.push("--static", "dist");
  apiProcess = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env
  });
}

async function createWindow() {
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

  const url = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:8787";
  await window.loadURL(url);
}

app.whenReady().then(() => {
  startApi();
  setTimeout(createWindow, 450);
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (apiProcess) {
    apiProcess.kill();
    apiProcess = null;
  }
});
