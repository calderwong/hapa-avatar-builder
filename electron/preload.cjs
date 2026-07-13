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
