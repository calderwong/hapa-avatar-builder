import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import {
  ECHO_REFERENCE_LOCAL_MODEL,
  ECHO_REFERENCE_LOCAL_PROVIDER,
} from "../src/domain/echo-reference-local-art.js";

export const HAPA_MEDIA_REFERENCE_ART_ADAPTER_SCHEMA = "hapa.echo-reference-hapa-media-adapter.v1";
export const HAPA_MEDIA_REFERENCE_ART_MAX_IMAGE_BYTES = 32 * 1024 * 1024;

export class HapaMediaReferenceArtError extends Error {
  constructor(code, message, statusCode = 502, details = null) {
    super(message);
    this.name = "HapaMediaReferenceArtError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function safeLoopbackBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new HapaMediaReferenceArtError("hapa_media_url_invalid", "Hapa Media Node URL is invalid.", 400);
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new HapaMediaReferenceArtError("hapa_media_not_loopback", "Reference art requires a literal loopback Hapa Media Node.", 400);
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new HapaMediaReferenceArtError("hapa_media_url_invalid", "Hapa Media Node URL must be an origin without credentials or path data.", 400);
  }
  return url.origin;
}

async function loadToken({ staticToken = "", tokenFile = "" } = {}) {
  const direct = String(staticToken || "").trim();
  if (direct) return direct;
  const filePath = String(tokenFile || "").trim();
  if (!filePath) return "";
  let info;
  try {
    info = await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new HapaMediaReferenceArtError("hapa_media_token_file_invalid", "Hapa Media Node token path must be a regular file.", 503);
  }
  return String(await readFile(filePath, "utf8")).trim();
}

async function responsePayload(response) {
  const type = response.headers.get("content-type") || "";
  return type.includes("json")
    ? response.json().catch(() => null)
    : response.text().catch(() => "");
}

export function createHapaMediaReferenceArtAdapter(options = {}) {
  const baseUrl = safeLoopbackBaseUrl(options.baseUrl || process.env.HAPA_MEDIA_NODE_URL || "http://127.0.0.1:8723");
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Math.max(500, Number(options.timeoutMs || 15_000));
  const staticToken = String(options.token ?? process.env.HAPA_MEDIA_NODE_TOKEN ?? "").trim();
  const tokenFile = String(
    options.tokenFile
    || process.env.HAPA_MEDIA_NODE_TOKEN_FILE
    || path.join(homedir(), "hapa-mlx-station", ".node_token"),
  );
  const readToken = options.readToken || (() => loadToken({ staticToken, tokenFile }));

  async function request(route, { method = "GET", body = null, auth = true, responseType = "json", timeout = timeoutMs } = {}) {
    const token = auth ? await readToken() : "";
    if (auth && !token) {
      throw new HapaMediaReferenceArtError(
        "hapa_media_auth_unavailable",
        "Hapa Media Node token is unavailable. Start the node normally or configure HAPA_MEDIA_NODE_TOKEN_FILE.",
        503,
      );
    }
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${route}`, {
        method,
        headers: {
          accept: responseType === "bytes" ? "image/*" : "application/json",
          ...(auth ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : null,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      throw new HapaMediaReferenceArtError(
        "hapa_media_unreachable",
        `Hapa Media Node is not reachable at ${baseUrl}.`,
        503,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
    if (responseType === "response") return response;
    const payload = await responsePayload(response);
    if (!response.ok) {
      throw new HapaMediaReferenceArtError(
        String(payload?.code || payload?.error?.code || "hapa_media_error"),
        String(payload?.detail || payload?.message || payload?.error?.message || `Hapa Media Node returned HTTP ${response.status}.`),
        response.status,
        payload,
      );
    }
    return payload;
  }

  return {
    schemaVersion: HAPA_MEDIA_REFERENCE_ART_ADAPTER_SCHEMA,
    baseUrl,

    async inspect() {
      const health = await request("/health", { auth: false, timeout: Math.min(timeoutMs, 2_500) });
      if (health?.service !== ECHO_REFERENCE_LOCAL_PROVIDER) {
        throw new HapaMediaReferenceArtError("hapa_media_identity_mismatch", "Loopback service is not the expected Hapa Media Node.", 409, health);
      }
      const capabilities = await request("/capabilities", { timeout: Math.min(timeoutMs, 5_000) });
      const image = capabilities?.modalities?.image || {};
      if (!image.models?.includes(ECHO_REFERENCE_LOCAL_MODEL) || !image.modes?.includes("txt2img")) {
        throw new HapaMediaReferenceArtError(
          "hapa_media_flux2_unavailable",
          `Hapa Media Node does not advertise ${ECHO_REFERENCE_LOCAL_MODEL} text-to-image.`,
          409,
          { models: image.models || [], modes: image.modes || [] },
        );
      }
      return {
        schemaVersion: HAPA_MEDIA_REFERENCE_ART_ADAPTER_SCHEMA,
        connected: true,
        baseUrl,
        health,
        provider: ECHO_REFERENCE_LOCAL_PROVIDER,
        model: ECHO_REFERENCE_LOCAL_MODEL,
        capability: {
          engines: image.engines || [],
          model: ECHO_REFERENCE_LOCAL_MODEL,
          mode: "txt2img",
          defaultSteps: image.default_steps?.[ECHO_REFERENCE_LOCAL_MODEL] ?? null,
          defaultGuidance: image.default_guidance?.[ECHO_REFERENCE_LOCAL_MODEL] ?? null,
        },
        boundary: "Bearer credentials remain process-local; raw generated assets stay local and require downstream human review.",
      };
    },

    async submit(job = {}, candidate = {}) {
      const prompt = String(job.scene?.generationPrompt || "").trim();
      if (!prompt || !candidate.id) {
        throw new HapaMediaReferenceArtError("hapa_media_job_invalid", "Local Reference art requires a scene prompt and candidate ID.", 400);
      }
      const payload = await request("/v1/images/generations", {
        method: "POST",
        body: {
          mode: "txt2img",
          prompt,
          model: job.generation?.model || ECHO_REFERENCE_LOCAL_MODEL,
          width: Number(job.generation?.width || 1152),
          height: Number(job.generation?.height || 1536),
          steps: Number(job.generation?.steps || 4),
          guidance: Number(job.generation?.guidance || 1),
          seed: Number(candidate.seed || 0),
        },
        timeout: Math.max(timeoutMs, 30_000),
      });
      if (!payload?.task_id) {
        throw new HapaMediaReferenceArtError("hapa_media_submit_contract_invalid", "Hapa Media Node did not return a task_id.", 502);
      }
      return { taskId: String(payload.task_id), submittedAt: new Date().toISOString() };
    },

    async task(taskId = "") {
      const id = String(taskId || "").trim();
      if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) {
        throw new HapaMediaReferenceArtError("hapa_media_task_id_invalid", "Hapa Media task ID is invalid.", 400);
      }
      return request(`/v1/tasks/${encodeURIComponent(id)}`, { timeout: Math.min(timeoutMs, 8_000) });
    },

    async download(assetId = "") {
      const id = String(assetId || "").trim();
      if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) {
        throw new HapaMediaReferenceArtError("hapa_media_asset_id_invalid", "Hapa Media asset ID is invalid.", 400);
      }
      const response = await request(`/v1/assets/${encodeURIComponent(id)}/download`, {
        responseType: "response",
        timeout: Math.max(timeoutMs, 60_000),
      });
      if (!response.ok) {
        const payload = await responsePayload(response);
        throw new HapaMediaReferenceArtError("hapa_media_asset_error", `Hapa Media asset returned HTTP ${response.status}.`, response.status, payload);
      }
      const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!contentType.startsWith("image/")) {
        throw new HapaMediaReferenceArtError("hapa_media_asset_type_invalid", "Hapa Media asset is not an image.", 502);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > HAPA_MEDIA_REFERENCE_ART_MAX_IMAGE_BYTES) {
        throw new HapaMediaReferenceArtError("hapa_media_asset_size_invalid", "Hapa Media image size is outside the accepted range.", 502);
      }
      return { buffer, contentType };
    },
  };
}

export function hapaMediaReferenceArtErrorPayload(error) {
  return {
    code: String(error?.code || "hapa_media_reference_art_error"),
    message: String(error?.message || "Local Hapa Reference art failed."),
    statusCode: Number(error?.statusCode || 502),
    details: error?.details || null,
  };
}
