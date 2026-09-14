const { contextBridge, ipcRenderer } = require("electron");

async function invokeOvercardLifecycle(channel) {
  const result = await ipcRenderer.invoke(channel);
  if (result?.ok === false) {
    const error = new Error(result.message || result.reason || "Shared Overcard host is unavailable.");
    error.name = "OvercardHostLifecycleError";
    error.code = `overcard_${String(result.status || "unavailable").replaceAll("-", "_")}`;
    error.baseUrl = result.baseUrl || "";
    error.status = result.status || "unavailable";
    error.missingOrigins = Array.isArray(result.missingOrigins) ? result.missingOrigins : [];
    throw error;
  }
  return result;
}

contextBridge.exposeInMainWorld("hapaAvatarBuilder", {
  apiBase: process.env.HAPA_AVATAR_API_BASE || "",
  songRegistryApiBase: process.env.HAPA_SONG_REGISTRY_API_BASE || "http://127.0.0.1:8798",
  runtime: "electron"
});

contextBridge.exposeInMainWorld("hapaOvercard", {
  baseUrl: process.env.HAPA_OVERCARD_HOST_URL || "http://127.0.0.1:8794",
  status: () => ipcRenderer.invoke("hapa-overcard:status"),
  ensure: () => invokeOvercardLifecycle("hapa-overcard:ensure"),
  reconnect: () => invokeOvercardLifecycle("hapa-overcard:reconnect")
});

contextBridge.exposeInMainWorld("hapaCredentials", Object.freeze({
  status: () => ipcRenderer.invoke("hapa-credentials:status"),
  save: (providerId, apiKey) => ipcRenderer.invoke("hapa-credentials:save", providerId, apiKey),
  remove: (providerId) => ipcRenderer.invoke("hapa-credentials:remove", providerId)
}));

contextBridge.exposeInMainWorld("hapaEchoReferenceIntelligence", Object.freeze({
  status: (payload) => ipcRenderer.invoke("hapa-echo-reference-intelligence:status", payload),
  startPilot: () => ipcRenderer.invoke("hapa-echo-reference-intelligence:start-pilot"),
  continueFull: () => ipcRenderer.invoke("hapa-echo-reference-intelligence:continue-full"),
  refreshAll: () => ipcRenderer.invoke("hapa-echo-reference-intelligence:refresh-all"),
  audit: () => ipcRenderer.invoke("hapa-echo-reference-intelligence:audit"),
  pause: () => ipcRenderer.invoke("hapa-echo-reference-intelligence:pause"),
  resume: () => ipcRenderer.invoke("hapa-echo-reference-intelligence:resume")
}));

contextBridge.exposeInMainWorld("hapaEchoTarotImages", Object.freeze({
  status: () => ipcRenderer.invoke("hapa-echo-tarot-images:status"),
  startPilot: () => ipcRenderer.invoke("hapa-echo-tarot-images:start-pilot"),
  continueFull: () => ipcRenderer.invoke("hapa-echo-tarot-images:continue-full"),
  pause: () => ipcRenderer.invoke("hapa-echo-tarot-images:pause"),
  resume: () => ipcRenderer.invoke("hapa-echo-tarot-images:resume"),
  review: (payload) => ipcRenderer.invoke("hapa-echo-tarot-images:review", payload),
  asset: (payload) => ipcRenderer.invoke("hapa-echo-tarot-images:asset", payload)
}));
