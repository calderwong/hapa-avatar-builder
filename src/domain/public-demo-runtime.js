export function publicBuildWeekDemoRequested({ search, forced = false } = {}) {
  if (forced) return true;
  const query = search ?? globalThis.location?.search ?? "";
  try {
    return new URLSearchParams(query).get("stargateDemo") === "1";
  } catch {
    return false;
  }
}

export function resolvePublicDemoAssetUri(uri, baseUrl = "/") {
  if (typeof uri !== "string" || !uri.startsWith("/demo/")) return uri;
  const normalizedBase = `/${String(baseUrl || "/").replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
  return `${normalizedBase}${uri.slice(1)}`;
}
