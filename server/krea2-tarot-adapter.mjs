import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const TAROT_KREA2_ADAPTER_SCHEMA = "hapa.avatar-builder.tarot-krea2-adapter.v1";
export const TAROT_KREA2_MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export class TarotKrea2AdapterError extends Error {
  constructor(code, message, statusCode = 502, details = null) {
    super(message);
    this.name = "TarotKrea2AdapterError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function createTarotKrea2Adapter(options = {}) {
  const baseUrl = String(options.baseUrl || process.env.HAPA_KREA2_URL || "http://127.0.0.1:8774").replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Math.max(500, Number(options.timeoutMs || 15_000));
  const staticToken = String(options.token ?? process.env.HAPA_KREA2_BEARER_TOKEN ?? "").trim();
  const runtimeRoot = String(options.runtimeRoot || process.env.HAPA_KREA2_RUNTIME_ROOT || path.join(homedir(), "Library", "Application Support", "Hapa", "Krea2IdentityNode"));
  const tokenFile = String(options.tokenFile || process.env.HAPA_KREA2_BEARER_TOKEN_FILE || path.join(runtimeRoot, "node.token"));
  const readToken = options.readToken || (() => loadKrea2BearerToken({ staticToken, tokenFile }));

  async function request(route, { method = "GET", headers = {}, body = null, auth = true, responseType = "json", timeout = timeoutMs } = {}) {
    const authorization = auth ? await readToken() : "";
    if (auth && !authorization) {
      throw new TarotKrea2AdapterError(
        "krea2_auth_unavailable",
        "Krea 2 is installed but the Builder cannot read its owner-only node token. Start the node with its normal runtime root or configure HAPA_KREA2_BEARER_TOKEN_FILE.",
        503
      );
    }
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${route}`, {
        method,
        headers: {
          ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
          ...headers
        },
        body,
        signal: AbortSignal.timeout(timeout)
      });
    } catch (error) {
      throw new TarotKrea2AdapterError(
        "krea2_node_unreachable",
        `Krea 2 is not reachable at ${baseUrl}. Start the local Hapa Krea 2 Identity Node for the demo.`,
        503,
        { cause: error instanceof Error ? error.message : String(error), baseUrl }
      );
    }
    if (responseType === "response") return response;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const nodeError = payload?.error || {};
      throw new TarotKrea2AdapterError(
        String(nodeError.code || payload?.code || "krea2_node_error"),
        String(nodeError.message || payload?.message || `Krea 2 returned HTTP ${response.status}.`),
        response.status,
        payload
      );
    }
    return payload;
  }

  return {
    baseUrl,

    async inspect() {
      try {
        const health = await request("/health", { auth: false, timeout: Math.min(timeoutMs, 2_500) });
        try {
          const presets = await request("/v1/presets", { timeout: Math.min(timeoutMs, 5_000) });
          return {
            schema: TAROT_KREA2_ADAPTER_SCHEMA,
            connected: true,
            baseUrl,
            health,
            presets,
            boundary: "Builder server holds node credentials; Tarot Draw receives only safe preset, task, and asset routes."
          };
        } catch (error) {
          return {
            schema: TAROT_KREA2_ADAPTER_SCHEMA,
            connected: false,
            baseUrl,
            health,
            presets: null,
            error: adapterErrorPayload(error),
            boundary: "The node process responded, but protected preset discovery is unavailable."
          };
        }
      } catch (error) {
        return {
          schema: TAROT_KREA2_ADAPTER_SCHEMA,
          connected: false,
          baseUrl,
          health: null,
          presets: null,
          error: adapterErrorPayload(error),
          boundary: "No request was dispatched; the Krea 2 node remains an explicit local dependency."
        };
      }
    },

    async uploadImage(bytes, { mimeType = "image/png", fileName = "tarot-card.png" } = {}) {
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
      const cleanMime = String(mimeType || "").split(";")[0].trim().toLowerCase();
      if (!cleanMime.startsWith("image/")) {
        throw new TarotKrea2AdapterError("invalid_image_type", "Krea 2 accepts image uploads only.", 415);
      }
      if (!buffer.length || buffer.length > TAROT_KREA2_MAX_IMAGE_BYTES) {
        throw new TarotKrea2AdapterError(
          "invalid_image_size",
          `Krea 2 image uploads must be between 1 byte and ${TAROT_KREA2_MAX_IMAGE_BYTES} bytes.`,
          413
        );
      }
      const form = new FormData();
      form.append("image", new Blob([buffer], { type: cleanMime }), safeKrea2FileName(fileName));
      return request("/v1/assets", { method: "POST", body: form, timeout: Math.max(timeoutMs, 60_000) });
    },

    async submitEdit(payload = {}) {
      return request("/v1/edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        timeout: Math.max(timeoutMs, 30_000)
      });
    },

    async task(taskId = "") {
      const id = safeKrea2Id(taskId, "task");
      const task = await request(`/v1/tasks/${encodeURIComponent(id)}`, { timeout: Math.min(timeoutMs, 8_000) });
      return {
        ...task,
        artifacts: (task?.artifacts || []).map((artifact) => ({
          ...artifact,
          node_uri: artifact.uri || "",
          uri: `/api/tarot/krea2/assets/${encodeURIComponent(artifact.asset_id)}/content`
        }))
      };
    },

    async cancel(taskId = "") {
      const id = safeKrea2Id(taskId, "task");
      return request(`/v1/tasks/${encodeURIComponent(id)}/cancel`, { method: "POST" });
    },

    async assetContent(assetId = "") {
      const id = safeKrea2Id(assetId, "asset");
      const response = await request(`/v1/assets/${encodeURIComponent(id)}/content`, {
        responseType: "response",
        timeout: Math.max(timeoutMs, 60_000)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new TarotKrea2AdapterError(
          String(payload?.error?.code || "krea2_asset_error"),
          String(payload?.error?.message || `Krea 2 asset returned HTTP ${response.status}.`),
          response.status,
          payload
        );
      }
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") || "image/png",
        etag: response.headers.get("etag") || "",
        cacheControl: response.headers.get("cache-control") || "private, max-age=31536000, immutable"
      };
    }
  };
}

export async function loadKrea2BearerToken({ staticToken = "", tokenFile = "" } = {}) {
  const direct = String(staticToken || "").trim();
  if (direct) {
    if (direct.length < 32) throw new TarotKrea2AdapterError("invalid_krea2_bearer", "Configured Krea 2 bearer token is too short.", 503);
    return direct;
  }
  const filePath = String(tokenFile || "").trim();
  if (!filePath) return "";
  try {
    const info = await lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
      throw new TarotKrea2AdapterError("invalid_krea2_bearer_file", "Krea 2 bearer token file must be a regular owner-only file.", 503);
    }
    const token = String(await readFile(filePath, "utf8")).trim();
    if (token.length < 32) throw new TarotKrea2AdapterError("invalid_krea2_bearer_file", "Krea 2 bearer token file is invalid.", 503);
    return token;
  } catch (error) {
    if (error instanceof TarotKrea2AdapterError) throw error;
    if (error?.code === "ENOENT") return "";
    throw new TarotKrea2AdapterError("krea2_bearer_read_failed", "Krea 2 bearer token could not be read safely.", 503);
  }
}

export function adapterErrorPayload(error) {
  return {
    code: String(error?.code || "krea2_adapter_error"),
    message: String(error?.message || "Krea 2 adapter failed."),
    statusCode: Number(error?.statusCode || 502),
    details: error?.details || null
  };
}

function safeKrea2Id(value, label) {
  const id = String(value || "").trim();
  if (!id || id.length > 240 || !/^[a-zA-Z0-9:_-]+$/.test(id)) {
    throw new TarotKrea2AdapterError(`invalid_krea2_${label}_id`, `Krea 2 ${label} ID is invalid.`, 400);
  }
  return id;
}

function safeKrea2FileName(value = "tarot-card.png") {
  return path.basename(String(value || "tarot-card.png")).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "tarot-card.png";
}
