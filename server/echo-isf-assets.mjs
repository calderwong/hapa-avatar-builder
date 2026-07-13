import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

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

    const [manifestBytes, runtimeBytes, realShaderRoot] = await Promise.all([
      readFile(this.manifestPath),
      readFile(this.runtimePath),
      realpath(this.shaderRoot)
    ]);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const manifestShaders = Array.isArray(manifest?.shaders) ? manifest.shaders : [];
    const runtimeHash = sha256(runtimeBytes);
    const runtime = {
      filePath: this.runtimePath,
      bytes: runtimeBytes,
      hash: runtimeHash,
      sourceHash: `sha256:${runtimeHash}`,
      sourceBytes: runtimeBytes.byteLength,
      source: versionedUrl("/api/echos/isf-runtime.js", runtimeHash)
    };

    const records = await Promise.all(manifestShaders.map(async (shader, index) => {
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
          runtimeBytes: runtime.sourceBytes
        }
      };
    }));

    const byId = new Map();
    for (const record of records) {
      if (byId.has(record.id)) throw new Error(`ISF manifest contains duplicate id ${record.id}.`);
      byId.set(record.id, record);
    }
    const [manifestStat, runtimeStat] = await Promise.all([stat(this.manifestPath), stat(this.runtimePath)]);
    this.cache = {
      checkedAt: Date.now(),
      manifestSignature: `${manifestStat.size}:${manifestStat.mtimeMs}`,
      runtimeSignature: `${runtimeStat.size}:${runtimeStat.mtimeMs}`,
      manifest: {
        version: manifest?.version ?? null,
        renderer: manifest?.renderer || null,
        hash: sha256(manifestBytes)
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
      const [manifestStat, runtimeStat, ...shaderStats] = await Promise.all([
        stat(this.manifestPath),
        stat(this.runtimePath),
        ...cache.records.map((record) => stat(record.filePath))
      ]);
      if (`${manifestStat.size}:${manifestStat.mtimeMs}` !== cache.manifestSignature) return false;
      if (`${runtimeStat.size}:${runtimeStat.mtimeMs}` !== cache.runtimeSignature) return false;
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
