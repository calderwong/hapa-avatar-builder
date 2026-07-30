#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  auditHyperFramesShaderFidelity,
  DEFAULT_ISF_MANIFEST,
  DEFAULT_ISF_RUNTIME,
  loadVerifiedIsfCatalog,
} from "./lib/hyperframes-isf-fidelity.mjs";

const DEFAULT_PROXY_REGISTRY = "/Users/calderwong/Desktop/hapa-music-viz/web/isf/proxies/native-exact-proxies.json";

function value(name, fallback = null) {
  const row = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  return row ? row.slice(name.length + 3) : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const manifestPath = path.resolve(value("manifest", DEFAULT_ISF_MANIFEST));
const runtimePath = path.resolve(value("runtime", DEFAULT_ISF_RUNTIME));
const proxyRegistryPath = path.resolve(value("proxy-registry", DEFAULT_PROXY_REGISTRY));
const showPath = value("show") ? path.resolve(value("show")) : null;
const outputPath = path.resolve(value("output", "artifacts/echo-render-readiness/shader-fidelity-audit.json"));
const catalog = loadVerifiedIsfCatalog({ manifestPath, runtimePath, proxyRegistryPath });

let instances;
let scope;
if (showPath) {
  const show = readJson(showPath);
  instances = Array.isArray(show.instances?.visualizers) ? show.instances.visualizers : [];
  scope = { mode: "compiled-show", showPath };
} else {
  const registry = readJson(proxyRegistryPath);
  const proxyById = new Map((registry.proxies || []).map((proxy) => [
    String(proxy.shaderId || proxy.id || "").replace(/^isf:/, ""),
    proxy,
  ]));
  instances = catalog.entries.map((shader, index) => {
    const proxy = proxyById.get(shader.shaderId) || null;
    return {
      id: `catalog:${index}`,
      cueId: `catalog:${shader.shaderId}`,
      visualizerId: shader.id,
      sourceHash: shader.declaredSourceHash,
      execution: proxy
        ? { route: "hash-bound-exact-proxy", status: "exact", drawable: true, silentDefault: false }
        : { route: "unsupported", status: "unsupported", drawable: false, silentDefault: false },
      proxy,
      rendererTruth: { requested: { title: shader.title } },
    };
  });
  scope = { mode: "full-catalog", proxyRegistryPath };
}

const audit = {
  ...auditHyperFramesShaderFidelity(instances, catalog),
  scope,
  conclusion: {
    sampledAtlasIsPreviewParity: false,
    requiredExportRoute: "deterministic-browser-isf",
    outputQualityRule: "Execute source at final output dimensions and fps; never substitute the audit atlas in a minted render.",
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({
  ok: audit.ok,
  outputPath,
  scope: audit.scope,
  catalog: audit.catalog,
  instances: audit.instances,
  unresolved: audit.unresolved.map((row) => ({
    visualizerId: row.visualizerId,
    title: row.title,
    reason: row.reason,
  })),
}, null, 2));
