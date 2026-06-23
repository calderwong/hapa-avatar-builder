const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("hapaAvatarBuilder", {
  apiBase: "http://127.0.0.1:8787",
  runtime: "electron"
});
