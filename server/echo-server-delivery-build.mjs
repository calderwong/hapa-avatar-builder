import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = "hapa.echo.server-delivery-build-identity.v1";
const CODE_ROOTS = Object.freeze([
  { directory: "server", extensions: new Set([".mjs"]) },
  { directory: "src/domain", extensions: new Set([".js", ".mjs"]) },
]);
const AUTHORITATIVE_FILES = Object.freeze([
  "scripts/preflight-echo-render-readiness.mjs",
]);
const sourceSignatureCache = new Map();
const SOURCE_SIGNATURE_TTL_MS = 250;

function hash(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function statIdentity(filePath) {
  try {
    const stat = fs.statSync(filePath, { bigint: true });
    if (!stat.isFile()) return null;
    return {
      dev: String(stat.dev),
      ino: String(stat.ino),
      size: String(stat.size),
      mtimeNs: String(stat.mtimeNs),
      ctimeNs: String(stat.ctimeNs),
    };
  } catch {
    return null;
  }
}

function deliveryCodeFiles(root) {
  const rows = [];
  const visit = (directory, extensions) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Echo server delivery code may not be symlinked: ${candidate}.`);
      if (entry.isDirectory()) visit(candidate, extensions);
      else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) rows.push(candidate);
    }
  };
  for (const codeRoot of CODE_ROOTS) visit(path.join(root, codeRoot.directory), codeRoot.extensions);
  for (const relativePath of AUTHORITATIVE_FILES) {
    const candidate = path.join(root, relativePath);
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Echo server delivery code may not be symlinked: ${candidate}.`);
    rows.push(candidate);
  }
  return rows.sort((left, right) => left.localeCompare(right));
}

export function echoServerDeliverySourceStatSignature({ root = ROOT, refresh = false } = {}) {
  const resolvedRoot = path.resolve(root);
  const memo = sourceSignatureCache.get(resolvedRoot);
  if (!refresh && memo && Date.now() - memo.checkedAt < SOURCE_SIGNATURE_TTL_MS) return memo.value;
  const rows = deliveryCodeFiles(resolvedRoot).map((filePath) => ({
    path: path.relative(resolvedRoot, filePath).split(path.sep).join("/"),
    stat: statIdentity(filePath),
  }));
  const value = hash(JSON.stringify(rows));
  sourceSignatureCache.set(resolvedRoot, { checkedAt: Date.now(), value });
  return value;
}

export function inspectEchoServerDeliveryBuildIdentity({ root = ROOT } = {}) {
  const resolvedRoot = path.resolve(root);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = echoServerDeliverySourceStatSignature({ root: resolvedRoot, refresh: true });
    const files = deliveryCodeFiles(resolvedRoot).map((filePath) => {
      const bytes = fs.readFileSync(filePath);
      return { path: path.relative(resolvedRoot, filePath).split(path.sep).join("/"), sha256: hash(bytes) };
    });
    const after = echoServerDeliverySourceStatSignature({ root: resolvedRoot, refresh: true });
    if (before !== after) continue;
    const payload = { schemaVersion: SCHEMA, files };
    return { ...payload, sha256: hash(JSON.stringify(payload)), sourceStatSignature: after };
  }
  throw new Error("Echo server delivery source changed while its boot identity was being captured.");
}

export function inspectEchoServerBootFreshness(bootIdentity, { root = ROOT, refresh = false } = {}) {
  const currentSourceStatSignature = echoServerDeliverySourceStatSignature({ root, refresh });
  const ok = Boolean(
    bootIdentity?.schemaVersion === SCHEMA
    && /^sha256:[a-f0-9]{64}$/iu.test(String(bootIdentity?.sha256 || ""))
    && bootIdentity?.sourceStatSignature === currentSourceStatSignature,
  );
  return {
    ok,
    reason: ok ? null : "server_restart_required",
    bootSha256: bootIdentity?.sha256 || null,
    bootSourceStatSignature: bootIdentity?.sourceStatSignature || null,
    currentSourceStatSignature,
  };
}
