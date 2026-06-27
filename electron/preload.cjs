const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("hapaAvatarBuilder", {
  apiBase: process.env.HAPA_AVATAR_API_BASE || "",
  songRegistryApiBase: process.env.HAPA_SONG_REGISTRY_API_BASE || "http://127.0.0.1:8798",
  runtime: "electron"
});
