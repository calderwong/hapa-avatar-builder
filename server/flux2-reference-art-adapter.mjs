import {
  ECHO_REFERENCE_ART_MODELS,
  ECHO_REFERENCE_ART_PROVIDER,
} from "../src/domain/echo-reference-card-art.js";

export const FLUX2_REFERENCE_ART_ADAPTER_SCHEMA = "hapa.echo-reference-art-flux2-adapter.v1";
export const FLUX2_REFERENCE_ART_MAX_IMAGE_BYTES = 32 * 1024 * 1024;

const API_HOSTS = new Set(["api.bfl.ai", "api.us.bfl.ai", "api.eu.bfl.ai"]);

export class Flux2ReferenceArtError extends Error {
  constructor(code, message, statusCode = 502, details = null) {
    super(message);
    this.name = "Flux2ReferenceArtError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function safeUrl(value, kind) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new Flux2ReferenceArtError(`invalid_flux2_${kind}_url`, `FLUX.2 ${kind} URL is invalid.`, 502);
  }
  if (parsed.protocol !== "https:") {
    throw new Flux2ReferenceArtError(`invalid_flux2_${kind}_url`, `FLUX.2 ${kind} URL must use HTTPS.`, 502);
  }
  if (kind === "delivery") {
    if (!/^delivery(?:\.[a-z0-9-]+)*\.bfl\.ai$/i.test(parsed.hostname)) {
      throw new Flux2ReferenceArtError("untrusted_flux2_delivery_host", "FLUX.2 delivery URL used an unexpected host.", 502);
    }
  } else if (!API_HOSTS.has(parsed.hostname)) {
    throw new Flux2ReferenceArtError(`untrusted_flux2_${kind}_host`, `FLUX.2 ${kind} URL used an unexpected host.`, 502);
  }
  if (parsed.username || parsed.password) {
    throw new Flux2ReferenceArtError(`invalid_flux2_${kind}_url`, `FLUX.2 ${kind} URL must not contain credentials.`, 502);
  }
  return parsed;
}

async function responsePayload(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("json")
    ? response.json().catch(() => null)
    : response.text().catch(() => "");
}

function providerError(response, payload, stage) {
  const code = response.status === 402
    ? "flux2_credits_required"
    : response.status === 429
      ? "flux2_rate_limited"
      : `flux2_${stage}_failed`;
  const message = payload?.detail
    || payload?.message
    || payload?.error
    || `FLUX.2 ${stage} returned HTTP ${response.status}.`;
  return new Flux2ReferenceArtError(code, String(message), response.status, {
    provider: ECHO_REFERENCE_ART_PROVIDER,
    stage,
    status: response.status,
  });
}

export function createFlux2ReferenceArtAdapter(options = {}) {
  const baseUrl = safeUrl(options.baseUrl || process.env.BFL_API_URL || "https://api.bfl.ai", "api");
  const apiKey = String(options.apiKey ?? process.env.BFL_API_KEY ?? "").trim();
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Math.max(1_000, Number(options.timeoutMs || 30_000));

  function headers(json = false) {
    if (!apiKey) throw new Flux2ReferenceArtError("flux2_api_key_missing", "BFL_API_KEY is required for FLUX.2 generation.", 503);
    return {
      accept: "application/json",
      "x-key": apiKey,
      ...(json ? { "content-type": "application/json" } : {}),
    };
  }

  return {
    schemaVersion: FLUX2_REFERENCE_ART_ADAPTER_SCHEMA,
    inspect() {
      return {
        schemaVersion: FLUX2_REFERENCE_ART_ADAPTER_SCHEMA,
        provider: ECHO_REFERENCE_ART_PROVIDER,
        configured: Boolean(apiKey),
        baseOrigin: baseUrl.origin,
        allowedModels: [...ECHO_REFERENCE_ART_MODELS],
        boundary: "The API key remains process-local. Signed delivery URLs are downloaded immediately and are never used as durable card media.",
      };
    },

    async submit(job = {}) {
      const model = String(job.generation?.model || "");
      if (!ECHO_REFERENCE_ART_MODELS.includes(model)) {
        throw new Flux2ReferenceArtError("flux2_model_not_allowed", `FLUX.2 model ${model || "missing"} is not allowed.`, 400);
      }
      const prompt = String(job.prompt?.prompt || "").trim();
      if (!prompt || !job.jobHash) {
        throw new Flux2ReferenceArtError("flux2_job_invalid", "FLUX.2 Reference art requires a prompt and stable job hash.", 400);
      }
      const endpoint = new URL(`/v1/${model}`, baseUrl);
      const body = {
        prompt,
        width: Number(job.generation?.width || 1536),
        height: Number(job.generation?.height || 2048),
        seed: Number(job.generation?.seed || 0),
        output_format: String(job.generation?.outputFormat || "png"),
      };
      for (const [index, imageUrl] of (job.generation?.inputImages || []).slice(0, 8).entries()) {
        const parsed = new URL(String(imageUrl || ""));
        if (parsed.protocol !== "https:") {
          throw new Flux2ReferenceArtError("flux2_input_image_invalid", "FLUX.2 input images must use HTTPS URLs.", 400);
        }
        body[index === 0 ? "input_image" : `input_image_${index + 1}`] = parsed.toString();
      }
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const payload = await responsePayload(response);
      if (!response.ok) throw providerError(response, payload, "submit");
      if (!payload?.id || !payload?.polling_url) {
        throw new Flux2ReferenceArtError("flux2_submit_contract_invalid", "FLUX.2 did not return an id and polling_url.", 502);
      }
      const pollingUrl = safeUrl(payload.polling_url, "polling");
      return {
        requestId: String(payload.id),
        pollingUrl: pollingUrl.toString(),
        submittedAt: new Date().toISOString(),
        model,
      };
    },

    async poll(pollingUrl) {
      const url = safeUrl(pollingUrl, "polling");
      const response = await fetchImpl(url, {
        headers: headers(false),
        signal: AbortSignal.timeout(Math.min(timeoutMs, 15_000)),
      });
      const payload = await responsePayload(response);
      if (!response.ok) throw providerError(response, payload, "poll");
      const status = String(payload?.status || "");
      if (!status) throw new Flux2ReferenceArtError("flux2_poll_contract_invalid", "FLUX.2 polling response omitted status.", 502);
      if (["Error", "Failed"].includes(status)) {
        throw new Flux2ReferenceArtError("flux2_generation_failed", String(payload?.error || "FLUX.2 generation failed."), 502);
      }
      if (status !== "Ready") return { ready: false, status, raw: payload };
      const deliveryUrl = safeUrl(payload?.result?.sample, "delivery");
      return {
        ready: true,
        status,
        deliveryUrl: deliveryUrl.toString(),
        providerResult: {
          seed: payload?.result?.seed ?? null,
          finishReason: payload?.result?.finish_reason || "",
        },
      };
    },

    async download(deliveryUrl) {
      const url = safeUrl(deliveryUrl, "delivery");
      const response = await fetchImpl(url, {
        headers: { accept: "image/*" },
        signal: AbortSignal.timeout(Math.max(timeoutMs, 60_000)),
      });
      if (!response.ok) {
        throw new Flux2ReferenceArtError("flux2_delivery_failed", `FLUX.2 delivery returned HTTP ${response.status}.`, response.status);
      }
      const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      if (!contentType.startsWith("image/")) {
        throw new Flux2ReferenceArtError("flux2_delivery_type_invalid", "FLUX.2 delivery was not an image.", 502);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > FLUX2_REFERENCE_ART_MAX_IMAGE_BYTES) {
        throw new Flux2ReferenceArtError("flux2_delivery_size_invalid", "FLUX.2 image size was outside the accepted range.", 502);
      }
      return {
        buffer,
        contentType,
        deliveryHost: url.hostname,
      };
    },
  };
}

export function flux2ReferenceArtErrorPayload(error) {
  return {
    code: String(error?.code || "flux2_reference_art_error"),
    message: String(error?.message || "FLUX.2 Reference art failed."),
    statusCode: Number(error?.statusCode || 502),
    details: error?.details || null,
  };
}
