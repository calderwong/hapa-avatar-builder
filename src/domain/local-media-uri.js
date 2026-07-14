const LOCAL_FILE_ROOT = /^\/{1,}(Users|Volumes|private|var|tmp)\//;

function decodeLocalPath(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function localMediaPath(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^file:/i.test(text)) {
    try {
      const parsed = new URL(text);
      if (parsed.hostname && parsed.hostname !== "localhost") return "";
      const pathname = decodeLocalPath(parsed.pathname || "");
      return LOCAL_FILE_ROOT.test(pathname) ? pathname.replace(/^\/{2,}/, "/") : "";
    } catch {
      const pathname = decodeLocalPath(text.replace(/^file:\/{2,}/i, "/"));
      return LOCAL_FILE_ROOT.test(pathname) ? pathname.replace(/^\/{2,}/, "/") : "";
    }
  }
  const pathname = decodeLocalPath(text);
  return LOCAL_FILE_ROOT.test(pathname) ? pathname.replace(/^\/{2,}/, "/") : "";
}

export function localFileApiUri(value = "", apiBase = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const base = String(apiBase || "").replace(/\/+$/, "");
  if (text.startsWith("/api/local-file")) return base ? `${base}${text}` : text;
  const filePath = localMediaPath(text);
  return filePath ? `${base}/api/local-file?path=${encodeURIComponent(filePath)}` : "";
}
