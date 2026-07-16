import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { hydrateManifestNativeRoutes } from "../src/domain/native-visualizer-route.js";

const SOURCE_PREFIX = "/static/isf/shaders/";
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const DEFAULT_CACHE_CHECK_MS = 1_000;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizedHash(value = "") {
  const hash = String(value || "").trim().replace(/^sha256:/i, "").toLowerCase();
  return SHA256_PATTERN.test(hash) ? hash : "";
}

function withinRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function versionedUrl(pathname, hash, extra = {}) {
  const params = new URLSearchParams({ ...extra, sha256: hash });
  return `${pathname}?${params.toString()}`;
}

export class EchoIsfAssetCatalog {
  constructor({ musicVizRoot, cacheCheckMs = DEFAULT_CACHE_CHECK_MS } = {}) {
    this.musicVizRoot = path.resolve(String(musicVizRoot || ""));
    this.manifestPath = path.join(this.musicVizRoot, "web/isf/manifest.json");
    this.shaderRoot = path.join(this.musicVizRoot, "web/isf/shaders");
    this.runtimePath = path.join(this.musicVizRoot, "web/vendor/isf-renderer.js");
    this.pixelGatePath = path.join(this.musicVizRoot, "docs/ISF_ALL_SHADER_PIXEL_GATE_REPORT.json");
    this.proxyRegistryPath = path.join(this.musicVizRoot, "web/isf/proxies/native-exact-proxies.json");
    this.cacheCheckMs = Math.max(0, Number(cacheCheckMs) || 0);
    this.cache = null;
    this.loading = null;
  }

  async load() {
    if (this.cache && Date.now() - this.cache.checkedAt < this.cacheCheckMs) return this.cache;
    if (this.loading) return this.loading;
    this.loading = this.#loadFreshIfNeeded().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async #loadFreshIfNeeded() {
    if (this.cache && await this.#cacheFilesUnchanged(this.cache)) {
      this.cache.checkedAt = Date.now();
      return this.cache;
    }

    const [manifestBytes, runtimeBytes, pixelGateBytes, proxyRegistryBytes, realShaderRoot] = await Promise.all([
      readFile(this.manifestPath),
      readFile(this.runtimePath),
      readFile(this.pixelGatePath),
      readFile(this.proxyRegistryPath),
      realpath(this.shaderRoot)
    ]);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const manifestShaders = Array.isArray(manifest?.shaders) ? manifest.shaders : [];
    const pixelGate = pixelGateBytes ? JSON.parse(pixelGateBytes.toString("utf8")) : null;
    const proxyRegistry = JSON.parse(proxyRegistryBytes.toString("utf8"));
    if (!Array.isArray(proxyRegistry?.proxies)) {
      throw new Error(`ISF exact-proxy registry is required and must contain proxy records: ${this.proxyRegistryPath}`);
    }
    if (!Array.isArray(pixelGate?.classifications) || pixelGate.classifications.length === 0) {
      throw new Error(`ISF pixel-gate report is required and must contain shader classifications: ${this.pixelGatePath}`);
    }
    const pixelClassifications = new Map((Array.isArray(pixelGate?.classifications) ? pixelGate.classifications : [])
      .map((entry) => [String(entry?.id || ""), entry]));
    const runtimeHash = sha256(runtimeBytes);
    const runtime = {
      filePath: this.runtimePath,
      bytes: runtimeBytes,
      hash: runtimeHash,
      sourceHash: `sha256:${runtimeHash}`,
      sourceBytes: runtimeBytes.byteLength,
      source: versionedUrl("/api/echos/isf-runtime.js", runtimeHash)
    };

    const sourceRecords = await Promise.all(manifestShaders.map(async (shader, index) => {
      const id = String(shader?.id || "").trim();
      const sourceOriginal = String(shader?.source || "").trim();
      if (!id) throw new Error(`ISF manifest shader ${index} is missing an id.`);
      if (!sourceOriginal.startsWith(SOURCE_PREFIX)) {
        throw new Error(`ISF shader ${id} has an unsupported source path.`);
      }
      let relativeSource;
      try {
        relativeSource = decodeURIComponent(sourceOriginal.slice(SOURCE_PREFIX.length));
      } catch {
        throw new Error(`ISF shader ${id} has a malformed source path.`);
      }
      const candidate = path.resolve(realShaderRoot, relativeSource);
      if (!withinRoot(realShaderRoot, candidate)) {
        throw new Error(`ISF shader ${id} source escapes the canonical shader root.`);
      }
      const realSource = await realpath(candidate);
      if (!withinRoot(realShaderRoot, realSource)) {
        throw new Error(`ISF shader ${id} source symlink escapes the canonical shader root.`);
      }
      const bytes = await readFile(realSource);
      const hash = sha256(bytes);
      const fileStat = await stat(realSource);
      const pixelEntry = pixelClassifications.get(id) || null;
      const pixelEntryHash = normalizedHash(pixelEntry?.sourceHash);
      const pixelGateMatchesSource = Boolean(pixelEntry && pixelEntryHash === hash);
      if (!pixelEntry || !pixelGateMatchesSource) {
        throw new Error(`ISF pixel-gate report is stale or incomplete for ${id}; rerun the pixel gate before browser playback.`);
      }
      const unsupportedByPixelGate = pixelGateMatchesSource && pixelEntry.classification === "unsupported-quarantine";
      const directorEligible = shader.directorEligible !== false && shader.enabled !== false && !unsupportedByPixelGate;
      return {
        id,
        filePath: realSource,
        fileSignature: `${fileStat.size}:${fileStat.mtimeMs}`,
        bytes,
        hash,
        public: {
          ...shader,
          id,
          sourceOriginal,
          source: versionedUrl("/api/echos/shader-source", hash, { id }),
          sourceHash: `sha256:${hash}`,
          sourceBytes: bytes.byteLength,
          runtime: runtime.source,
          runtimeHash: runtime.sourceHash,
          runtimeBytes: runtime.sourceBytes,
          directorEligible,
          enabled: shader.enabled !== false && !unsupportedByPixelGate,
          pixelGate: pixelEntry ? {
            schemaVersion: pixelGate?.schemaVersion || "",
            status: pixelGateMatchesSource ? "source-hash-verified" : "stale-source-hash",
            classification: pixelEntry.classification || "unclassified",
            reason: pixelEntry.reason || "",
            compileAttempted: pixelEntry.compileAttempted === true,
            drawAttempted: pixelEntry.drawAttempted === true,
            playableFrameIndices: Array.isArray(pixelEntry.playableFrameIndices) ? pixelEntry.playableFrameIndices : [],
          } : {
            schemaVersion: pixelGate?.schemaVersion || "",
            status: pixelGate ? "classification-missing" : "report-unavailable",
            classification: "unclassified",
            reason: pixelGate ? "shader-id-not-present-in-pixel-gate" : "pixel-gate-report-unavailable",
            compileAttempted: false,
            drawAttempted: false,
            playableFrameIndices: [],
          },
          runtimeEligibility: unsupportedByPixelGate ? "unsupported-quarantine" : directorEligible ? "eligible" : "manifest-ineligible",
          runtimeEligibilityReason: unsupportedByPixelGate
            ? pixelEntry.reason || "browser-isf-compile-or-draw-failed"
            : directorEligible ? "source-hash-verified-pixel-gate" : "manifest-disabled",
        }
      };
    }));

    const hydratedManifest = hydrateManifestNativeRoutes({ shaders: sourceRecords.map((record) => record.public) }, proxyRegistry);
    const hydratedPublicById = new Map(hydratedManifest.shaders.map((shader) => [shader.id, shader]));
    const records = sourceRecords.map((record) => ({
      ...record,
      public: hydratedPublicById.get(record.id) || record.public,
    }));
    const byId = new Map();
    for (const record of records) {
      if (byId.has(record.id)) throw new Error(`ISF manifest contains duplicate id ${record.id}.`);
      byId.set(record.id, record);
    }
    const [manifestStat, runtimeStat, pixelGateStat, proxyRegistryStat] = await Promise.all([
      stat(this.manifestPath),
      stat(this.runtimePath),
      stat(this.pixelGatePath).catch(() => null),
      stat(this.proxyRegistryPath),
    ]);
    this.cache = {
      checkedAt: Date.now(),
      manifestSignature: `${manifestStat.size}:${manifestStat.mtimeMs}`,
      runtimeSignature: `${runtimeStat.size}:${runtimeStat.mtimeMs}`,
      pixelGateSignature: pixelGateStat ? `${pixelGateStat.size}:${pixelGateStat.mtimeMs}` : "missing",
      proxyRegistrySignature: `${proxyRegistryStat.size}:${proxyRegistryStat.mtimeMs}`,
      manifest: {
        version: manifest?.version ?? null,
        renderer: manifest?.renderer || null,
        hash: sha256(Buffer.concat([manifestBytes, pixelGateBytes || Buffer.alloc(0), proxyRegistryBytes])),
        sourceHash: sha256(manifestBytes),
        pixelGateHash: pixelGateBytes ? sha256(pixelGateBytes) : null,
        proxyRegistryHash: sha256(proxyRegistryBytes),
      },
      runtime,
      records,
      byId,
      shaders: records.map((record) => record.public)
    };
    return this.cache;
  }

  async #cacheFilesUnchanged(cache) {
    try {
      const [manifestStat, runtimeStat, pixelGateStat, proxyRegistryStat, ...shaderStats] = await Promise.all([
        stat(this.manifestPath),
        stat(this.runtimePath),
        stat(this.pixelGatePath).catch(() => null),
        stat(this.proxyRegistryPath),
        ...cache.records.map((record) => stat(record.filePath))
      ]);
      if (`${manifestStat.size}:${manifestStat.mtimeMs}` !== cache.manifestSignature) return false;
      if (`${runtimeStat.size}:${runtimeStat.mtimeMs}` !== cache.runtimeSignature) return false;
      if ((pixelGateStat ? `${pixelGateStat.size}:${pixelGateStat.mtimeMs}` : "missing") !== cache.pixelGateSignature) return false;
      if (`${proxyRegistryStat.size}:${proxyRegistryStat.mtimeMs}` !== cache.proxyRegistrySignature) return false;
      return shaderStats.every((fileStat, index) =>
        `${fileStat.size}:${fileStat.mtimeMs}` === cache.records[index].fileSignature
      );
    } catch {
      return false;
    }
  }

  async shader(id, requestedHash = "") {
    const catalog = await this.load();
    const record = catalog.byId.get(String(id || "")) || null;
    if (!record) return { status: "missing", record: null, requestedHash: normalizedHash(requestedHash) };
    const expectedHash = record.hash;
    const suppliedHash = String(requestedHash || "").trim();
    const requestHash = normalizedHash(suppliedHash);
    if (suppliedHash && (!requestHash || requestHash !== expectedHash)) {
      return { status: "hash-mismatch", record, requestedHash: requestHash || suppliedHash, expectedHash };
    }
    return { status: "ready", record, requestedHash: requestHash, expectedHash };
  }

  async runtime(requestedHash = "") {
    const catalog = await this.load();
    const expectedHash = catalog.runtime.hash;
    const suppliedHash = String(requestedHash || "").trim();
    const requestHash = normalizedHash(suppliedHash);
    if (suppliedHash && (!requestHash || requestHash !== expectedHash)) {
      return { status: "hash-mismatch", record: catalog.runtime, requestedHash: requestHash || suppliedHash, expectedHash };
    }
    return { status: "ready", record: catalog.runtime, requestedHash: requestHash, expectedHash };
  }
}

export function writeEchoIsfAsset(req, res, record, {
  contentType,
  shaderId = "",
  immutable = false
} = {}) {
  const etag = `"sha256-${record.hash}"`;
  const headers = {
    "Content-Type": contentType,
    "Content-Length": record.bytes.byteLength,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "ETag": etag,
    "X-Content-Type-Options": "nosniff",
    "X-Hapa-Source-Sha256": record.hash,
    "Access-Control-Expose-Headers": "ETag, X-Hapa-Source-Sha256, X-Hapa-Shader-Id"
  };
  if (shaderId) headers["X-Hapa-Shader-Id"] = shaderId;
  const requestEtags = String(req.headers["if-none-match"] || "").split(",").map((value) => value.trim());
  if (requestEtags.includes("*") || requestEtags.includes(etag) || requestEtags.includes(`W/${etag}`)) {
    delete headers["Content-Length"];
    res.writeHead(304, headers);
    res.end();
    return;
  }
  res.writeHead(200, headers);
  if (req.method === "HEAD") res.end();
  else res.end(record.bytes);
}

export function normalizedSha256(value = "") {
  return normalizedHash(value);
}
