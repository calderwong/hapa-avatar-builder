import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESOLVER_PATH = fileURLToPath(import.meta.url);
const SCHEMA = "hapa.echo.delivery-runtime-build-identity.v1";
const BUILD_RECEIPT_SCHEMA = "hapa.echo.delivery-build-receipt.v1";
const BUILD_RECEIPT_RELATIVE_PATH = "dist/hapa-echo-delivery-build.json";
const CONTRACT_VERSION = "echo-delivery-static-import-graph-v2";
const ENTRY_PATHS = Object.freeze([
  "src/components/HapaEchosView.jsx",
  "src/components/TarotDraw3DView.jsx",
  "src/index.css",
]);
const EXPLICIT_BUILD_INPUT_PATHS = Object.freeze(["index.html", "vite.config.js"]);
const REQUIRED_REACHABLE_PATHS = Object.freeze([
  "src/components/HapaEchosView.jsx",
  "src/components/TarotDraw3DView.jsx",
]);
const SOURCE_EXTENSIONS = Object.freeze([".js", ".jsx", ".mjs", ".ts", ".tsx", ".json", ".css"]);
const cache = new Map();
const dependencySignatureCache = new Map();
const buildInputSnapshotCache = new Map();
const DEPENDENCY_SIGNATURE_TTL_MS = 250;

function hashBytes(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function resolvedRootPath(root) {
  const resolved = path.resolve(root);
  try { return fs.realpathSync(resolved); } catch { return resolved; }
}

function fileStatIdentity(filePath) {
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

function sourceStatSignature(root, files) {
  const rows = [...new Set(files.map((filePath) => path.resolve(filePath)))]
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => ({ path: path.relative(root, filePath).split(path.sep).join("/"), stat: fileStatIdentity(filePath) }));
  return hashBytes(JSON.stringify(rows));
}

function capturedStatSignature(root, rows) {
  const normalized = rows
    .map((row) => ({ path: path.relative(root, row.filePath).split(path.sep).join("/"), stat: row.stat }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return hashBytes(JSON.stringify(normalized));
}

function readStableFile(filePath) {
  const before = fileStatIdentity(filePath);
  if (!before) throw new Error(`Delivery runtime source is not a readable file: ${filePath}.`);
  const bytes = fs.readFileSync(filePath);
  const after = fileStatIdentity(filePath);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`Delivery runtime source changed while it was being read: ${filePath}.`);
  }
  return { bytes, stat: after };
}

export function echoDeliveryRuntimeBuildSourceStatSignature({ root = ROOT, files = [], refresh = false } = {}) {
  const resolvedRoot = resolvedRootPath(root);
  const memo = dependencySignatureCache.get(resolvedRoot);
  if (!refresh && memo && Date.now() - memo.checkedAt < DEPENDENCY_SIGNATURE_TTL_MS) return memo.value;
  const candidates = Array.isArray(files) && files.length
    ? files.map((filePath) => path.resolve(resolvedRoot, filePath))
    : [
      RESOLVER_PATH,
      ...ENTRY_PATHS.map((relativePath) => path.join(resolvedRoot, relativePath)),
      ...EXPLICIT_BUILD_INPUT_PATHS.map((relativePath) => path.join(resolvedRoot, relativePath)),
    ];
  let distRows;
  try {
    distRows = enumerateServedDist(resolvedRoot, { bundleOnly: true })
      .map((entry) => ({ path: entry.relativePath, stat: fileStatIdentity(entry.filePath) }));
  } catch (error) {
    distRows = [{ path: "dist", error: String(error?.message || error) }];
  }
  const sourceRows = [...new Set(candidates.map((filePath) => path.resolve(filePath)))]
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => ({
      path: path.relative(resolvedRoot, filePath).split(path.sep).join("/"),
      stat: fileStatIdentity(filePath),
    }));
  const value = hashBytes(JSON.stringify({ sources: sourceRows, dist: distRows }));
  dependencySignatureCache.set(resolvedRoot, { checkedAt: Date.now(), value });
  return value;
}

function importedSpecifiers(source, extension) {
  const values = new Set();
  if (extension === ".css") {
    for (const match of source.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/gu)) values.add(match[1]);
    for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gu)) values.add(match[1]);
    return [...values];
  }
  for (const pattern of [
    /(?:^|\n)\s*import\s*["']([^"']+)["']/gu,
    /(?:^|\n)\s*import\s+[^;]*?\s+from\s+["']([^"']+)["']/gu,
    /(?:^|\n)\s*export\s+[^;]*?\s+from\s+["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ]) {
    for (const match of source.matchAll(pattern)) values.add(match[1]);
  }
  return [...values];
}

function importCandidates(importerPath, specifier) {
  const clean = specifier.split(/[?#]/u, 1)[0];
  const base = path.resolve(path.dirname(importerPath), clean);
  if (path.extname(base)) return [base];
  return [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ];
}

function resolveLocalImport(root, importerPath, specifier) {
  for (const candidate of importCandidates(importerPath, specifier)) {
    if (!within(root, candidate)) throw new Error(`Delivery runtime import escapes the project root: ${specifier} from ${importerPath}`);
    try {
      const real = fs.realpathSync(candidate);
      if (!within(root, real)) throw new Error(`Delivery runtime import resolves outside the project root: ${specifier} from ${importerPath}`);
      if (fs.statSync(real).isFile()) return real;
    } catch (error) {
      if (error?.message?.includes("outside the project root")) throw error;
    }
  }
  throw new Error(`Unresolved local delivery runtime import ${specifier} from ${path.relative(root, importerPath)}.`);
}

function buildImportGraph(root) {
  const pending = ENTRY_PATHS.map((relativePath) => path.resolve(root, relativePath));
  const visited = new Set();
  const bareSpecifiers = new Set();
  const rows = [];
  while (pending.length) {
    const requestedPath = pending.pop();
    let filePath;
    try {
      filePath = fs.realpathSync(requestedPath);
    } catch {
      throw new Error(`Delivery runtime entry is missing: ${path.relative(root, requestedPath)}.`);
    }
    if (!within(root, filePath)) throw new Error(`Delivery runtime entry escaped the project root: ${filePath}.`);
    if (visited.has(filePath)) continue;
    visited.add(filePath);
    const extension = path.extname(filePath).toLowerCase();
    if (!SOURCE_EXTENSIONS.includes(extension)) throw new Error(`Unsupported delivery runtime source extension: ${filePath}.`);
    const { bytes, stat } = readStableFile(filePath);
    const source = bytes.toString("utf8");
    rows.push({
      path: path.relative(root, filePath).split(path.sep).join("/"),
      sha256: hashBytes(bytes),
      filePath,
      stat,
    });
    if (extension === ".json") continue;
    for (const specifier of importedSpecifiers(source, extension)) {
      if (specifier.startsWith(".")) pending.push(resolveLocalImport(root, filePath, specifier));
      else if (extension === ".css" && specifier.startsWith("/")) pending.push(resolveLocalImport(root, path.join(root, "public/index.css"), `.${specifier}`));
      else if (!/^(?:data:|blob:|https?:|#)/iu.test(specifier)) bareSpecifiers.add(specifier);
    }
  }
  rows.sort((left, right) => left.path.localeCompare(right.path));
  const reachable = new Set(rows.map((entry) => entry.path));
  for (const requiredPath of REQUIRED_REACHABLE_PATHS) {
    if (!reachable.has(requiredPath)) throw new Error(`Required Echo delivery runtime source root is missing: ${requiredPath}.`);
  }
  return { rows, bareSpecifiers: [...bareSpecifiers].sort() };
}

function bareImportIdentities(root, specifiers) {
  const require = createRequire(path.join(root, "package.json"));
  return specifiers.map((specifier) => {
    let filePath;
    try {
      filePath = fs.realpathSync(require.resolve(specifier));
    } catch {
      throw new Error(`Delivery runtime bare import could not be resolved: ${specifier}.`);
    }
    const { bytes, stat } = readStableFile(filePath);
    return {
      specifier,
      path: path.relative(root, filePath).split(path.sep).join("/"),
      sha256: hashBytes(bytes),
      filePath,
      stat,
    };
  }).sort((left, right) => left.specifier.localeCompare(right.specifier));
}

function enumerateServedDist(root, { bundleOnly = false } = {}) {
  const distRoot = path.join(root, "dist");
  const distLstat = fs.lstatSync(distRoot);
  if (distLstat.isSymbolicLink() || !distLstat.isDirectory()) {
    throw new Error("Delivery runtime dist root must be a real, non-symlink directory.");
  }
  const realDistRoot = fs.realpathSync(distRoot);
  if (!within(fs.realpathSync(root), realDistRoot)) {
    throw new Error("Delivery runtime dist root escapes the project.");
  }
  const rows = [];
  const visit = (physicalDirectory, logicalDirectory) => {
    const entries = fs.readdirSync(physicalDirectory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const logicalPath = path.join(logicalDirectory, entry.name);
      const physicalPath = path.join(physicalDirectory, entry.name);
      if (
        bundleOnly
        && logicalDirectory === distRoot
        && entry.name !== "index.html"
        && entry.name !== "assets"
      ) continue;
      if (entry.isDirectory()) {
        visit(physicalPath, logicalPath);
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`Delivery runtime served dist symlinks are unsupported: ${logicalPath}.`);
      }
      if (entry.isFile()) rows.push({ logicalPath, filePath: physicalPath });
    }
  };
  visit(distRoot, distRoot);
  return rows
    .map((row) => ({ ...row, relativePath: path.relative(root, row.logicalPath).split(path.sep).join("/") }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function servedBundleIdentity(root) {
  const before = enumerateServedDist(root, { bundleOnly: true });
  if (!before.some((entry) => entry.relativePath === "dist/index.html")) {
    throw new Error("Delivery runtime served dist is missing dist/index.html.");
  }
  const files = before.map(({ relativePath, filePath }) => {
    const { bytes, stat } = readStableFile(filePath);
    return {
      path: relativePath,
      sha256: hashBytes(bytes),
      filePath,
      stat,
    };
  });
  const after = enumerateServedDist(root, { bundleOnly: true });
  const enumeration = (rows) => JSON.stringify(rows.map(({ relativePath, filePath }) => ({
    relativePath,
    filePath: path.resolve(filePath),
  })));
  if (enumeration(before) !== enumeration(after)) {
    throw new Error("Delivery runtime served dist changed while it was being identified.");
  }
  const digest = hashBytes(JSON.stringify(files.map(({ path: filePath, sha256 }) => ({ path: filePath, sha256 }))));
  return { sha256: digest, files };
}

function manifestIdentity(root, relativePath) {
  const filePath = path.join(root, relativePath);
  try {
    const { bytes, stat } = readStableFile(filePath);
    return { path: relativePath, sha256: hashBytes(bytes), filePath, stat };
  } catch {
    throw new Error(`Delivery runtime package manifest is missing: ${relativePath}.`);
  }
}

function buildToolIdentity(root) {
  const require = createRequire(path.join(root, "package.json"));
  let vitePackagePath;
  try {
    vitePackagePath = fs.realpathSync(require.resolve("vite/package.json"));
  } catch {
    throw new Error("The Vite package used to build Echo delivery is unavailable.");
  }
  const vitePackage = JSON.parse(fs.readFileSync(vitePackagePath, "utf8"));
  const viteBinRelative = typeof vitePackage.bin === "string" ? vitePackage.bin : vitePackage.bin?.vite;
  const viteCliPath = fs.realpathSync(path.resolve(path.dirname(vitePackagePath), viteBinRelative));
  const vitePackageIdentity = readStableFile(vitePackagePath);
  const viteCliIdentity = readStableFile(viteCliPath);
  const nodePath = fs.realpathSync(process.execPath);
  const nodeStat = fileStatIdentity(nodePath);
  const payload = {
    node: {
      version: process.version,
      path: path.relative(root, nodePath).split(path.sep).join("/"),
      stat: nodeStat,
    },
    vite: {
      version: String(vitePackage.version || ""),
      packagePath: path.relative(root, vitePackagePath).split(path.sep).join("/"),
      packageSha256: hashBytes(vitePackageIdentity.bytes),
      cliPath: path.relative(root, viteCliPath).split(path.sep).join("/"),
      cliSha256: hashBytes(viteCliIdentity.bytes),
    },
  };
  return {
    ...payload,
    sha256: hashBytes(JSON.stringify(payload)),
    rows: [
      { filePath: nodePath, stat: nodeStat },
      { filePath: vitePackagePath, stat: vitePackageIdentity.stat },
      { filePath: viteCliPath, stat: viteCliIdentity.stat },
    ],
  };
}

function sourceBuildIdentity(root) {
  const graph = buildImportGraph(root);
  const manifests = [manifestIdentity(root, "package.json"), manifestIdentity(root, "package-lock.json")];
  const explicitBuildInputs = EXPLICIT_BUILD_INPUT_PATHS.map((relativePath) => manifestIdentity(root, relativePath));
  const bareImports = bareImportIdentities(root, graph.bareSpecifiers);
  const payload = {
    contractVersion: CONTRACT_VERSION,
    entries: [...ENTRY_PATHS],
    explicitBuildInputs: explicitBuildInputs.map(({ path: inputPath, sha256 }) => ({ path: inputPath, sha256 })),
    sources: graph.rows.map(({ path: sourcePath, sha256 }) => ({ path: sourcePath, sha256 })),
    requiredReachableSources: [...REQUIRED_REACHABLE_PATHS],
    bareImports: bareImports.map(({ specifier, path: importPath, sha256 }) => ({ specifier, path: importPath, sha256 })),
    packageManifests: manifests.map(({ path: manifestPath, sha256 }) => ({ path: manifestPath, sha256 })),
  };
  return {
    ...payload,
    sha256: hashBytes(JSON.stringify(payload)),
    rows: [
      ...graph.rows.map((entry) => ({ filePath: entry.filePath, stat: entry.stat })),
      ...manifests.map((entry) => ({ filePath: entry.filePath, stat: entry.stat })),
      ...explicitBuildInputs.map((entry) => ({ filePath: entry.filePath, stat: entry.stat })),
      ...bareImports.map((entry) => ({ filePath: entry.filePath, stat: entry.stat })),
    ],
  };
}

function buildReceiptSemantic({ sourceSha256, servedBundleSha256, buildToolSha256 }) {
  const semantic = {
    schemaVersion: BUILD_RECEIPT_SCHEMA,
    contractVersion: CONTRACT_VERSION,
    sourceSha256,
    servedBundleSha256,
    buildToolSha256,
  };
  return {
    ...semantic,
    semanticSha256: hashBytes(JSON.stringify(semantic)),
  };
}

function staleReceipt(message, details = {}) {
  const error = new Error(message);
  error.code = "delivery_build_receipt_stale";
  error.details = details;
  return error;
}

function readAndValidateBuildReceipt(root, expected) {
  const receiptPath = path.join(root, BUILD_RECEIPT_RELATIVE_PATH);
  let receipt;
  let receiptIdentity;
  try {
    receiptIdentity = readStableFile(receiptPath);
    receipt = JSON.parse(receiptIdentity.bytes.toString("utf8"));
  } catch {
    throw staleReceipt("Echo delivery build receipt is missing or unreadable.", { receiptPath });
  }
  for (const field of ["schemaVersion", "contractVersion", "sourceSha256", "servedBundleSha256", "buildToolSha256", "semanticSha256"]) {
    if (receipt?.[field] !== expected[field]) {
      throw staleReceipt(`Echo delivery build receipt does not match current ${field}.`, {
        field,
        expected: expected[field],
        observed: receipt?.[field] || null,
      });
    }
  }
  return { receipt, receiptPath, stat: receiptIdentity.stat };
}

function atomicJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, filePath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function snapshotEchoDeliveryBuildInputs({ root = ROOT } = {}) {
  const resolvedRoot = resolvedRootPath(root);
  const source = sourceBuildIdentity(resolvedRoot);
  const tool = buildToolIdentity(resolvedRoot);
  buildInputSnapshotCache.set(resolvedRoot, {
    source,
    tool,
    sourceStatSignature: capturedStatSignature(resolvedRoot, source.rows),
    toolStatSignature: capturedStatSignature(resolvedRoot, tool.rows),
  });
  return {
    sourceSha256: source.sha256,
    buildToolSha256: tool.sha256,
    nodePath: path.resolve(resolvedRoot, tool.node.path),
    viteCliPath: path.resolve(resolvedRoot, tool.vite.cliPath),
  };
}

export function writeEchoDeliveryBuildReceipt({
  root = ROOT,
  expectedSourceSha256 = null,
  expectedBuildToolSha256 = null,
} = {}) {
  const resolvedRoot = resolvedRootPath(root);
  const sha256Pattern = /^sha256:[a-f0-9]{64}$/iu;
  if (!sha256Pattern.test(String(expectedSourceSha256 || "")) || !sha256Pattern.test(String(expectedBuildToolSha256 || ""))) {
    throw new Error("Echo delivery receipt requires the exact pre-build source and build-tool identities.");
  }
  const cachedInputs = buildInputSnapshotCache.get(resolvedRoot);
  const cachedInputsCurrent = Boolean(
    cachedInputs
    && cachedInputs.source.sha256 === expectedSourceSha256
    && cachedInputs.tool.sha256 === expectedBuildToolSha256
    && sourceStatSignature(resolvedRoot, cachedInputs.source.rows.map((entry) => entry.filePath)) === cachedInputs.sourceStatSignature
    && sourceStatSignature(resolvedRoot, cachedInputs.tool.rows.map((entry) => entry.filePath)) === cachedInputs.toolStatSignature
  );
  const sourceBefore = cachedInputsCurrent ? cachedInputs.source : sourceBuildIdentity(resolvedRoot);
  const toolBefore = cachedInputsCurrent ? cachedInputs.tool : buildToolIdentity(resolvedRoot);
  if (sourceBefore.sha256 !== expectedSourceSha256) {
    throw new Error("Echo delivery source changed while Vite was building; refusing to stamp stale output.");
  }
  if (toolBefore.sha256 !== expectedBuildToolSha256) {
    throw new Error("Echo delivery build tool changed while Vite was building; refusing to stamp stale output.");
  }
  const distBefore = servedBundleIdentity(resolvedRoot);
  const semantic = buildReceiptSemantic({
    sourceSha256: sourceBefore.sha256,
    servedBundleSha256: distBefore.sha256,
    buildToolSha256: toolBefore.sha256,
  });
  const receiptPath = path.join(resolvedRoot, BUILD_RECEIPT_RELATIVE_PATH);
  atomicJson(receiptPath, { ...semantic, generatedAt: new Date().toISOString() });
  const sourceAfterStatSignature = sourceStatSignature(resolvedRoot, sourceBefore.rows.map((entry) => entry.filePath));
  const toolAfterStatSignature = sourceStatSignature(resolvedRoot, toolBefore.rows.map((entry) => entry.filePath));
  const sourceBeforeStatSignature = capturedStatSignature(resolvedRoot, sourceBefore.rows);
  const toolBeforeStatSignature = capturedStatSignature(resolvedRoot, toolBefore.rows);
  const distAfter = enumerateServedDist(resolvedRoot, { bundleOnly: true })
    .map((entry) => ({ path: entry.relativePath, stat: fileStatIdentity(entry.filePath) }));
  const capturedDist = distBefore.files.map((entry) => ({ path: entry.path, stat: entry.stat }));
  if (
    sourceAfterStatSignature !== sourceBeforeStatSignature
    || toolAfterStatSignature !== toolBeforeStatSignature
    || JSON.stringify(distAfter) !== JSON.stringify(capturedDist)
  ) {
    fs.rmSync(receiptPath, { force: true });
    throw new Error("Echo delivery source, build tool, or served dist changed while its receipt was being written.");
  }
  buildInputSnapshotCache.delete(resolvedRoot);
  return { ...semantic, receiptPath };
}

function capturedDependencySignature(root, sourceRows, distRows) {
  const sourceMap = new Map(sourceRows.map((row) => [path.resolve(row.filePath), row.stat]));
  for (const [filePath, capturedStat] of sourceMap.entries()) {
    if (JSON.stringify(fileStatIdentity(filePath)) !== JSON.stringify(capturedStat)) {
      throw new Error(`Delivery runtime dependency changed while it was being identified: ${filePath}.`);
    }
  }
  const currentDist = enumerateServedDist(root, { bundleOnly: true })
    .map((entry) => ({ path: entry.relativePath, stat: fileStatIdentity(entry.filePath) }));
  const capturedDist = distRows.map((row) => ({ path: row.path, stat: row.stat }));
  if (JSON.stringify(currentDist) !== JSON.stringify(capturedDist)) {
    throw new Error("Delivery runtime served dist changed while its dependency signature was captured.");
  }
  return echoDeliveryRuntimeBuildSourceStatSignature({ root, files: [...sourceMap.keys()], refresh: true });
}

function computeIdentity(root) {
  const source = sourceBuildIdentity(root);
  const tool = buildToolIdentity(root);
  const servedBundle = servedBundleIdentity(root);
  const resolver = readStableFile(RESOLVER_PATH);
  const expectedReceipt = buildReceiptSemantic({
    sourceSha256: source.sha256,
    servedBundleSha256: servedBundle.sha256,
    buildToolSha256: tool.sha256,
  });
  const validatedReceipt = readAndValidateBuildReceipt(root, expectedReceipt);
  const receipt = validatedReceipt.receipt;
  const payload = {
    schemaVersion: SCHEMA,
    ...source,
    rows: undefined,
    buildTool: {
      node: tool.node,
      vite: tool.vite,
      sha256: tool.sha256,
    },
    servedBundle: {
      sha256: servedBundle.sha256,
      files: servedBundle.files.map(({ path: bundlePath, sha256 }) => ({ path: bundlePath, sha256 })),
    },
    buildReceipt: {
      schemaVersion: receipt.schemaVersion,
      semanticSha256: receipt.semanticSha256,
      sourceSha256: receipt.sourceSha256,
      servedBundleSha256: receipt.servedBundleSha256,
      buildToolSha256: receipt.buildToolSha256,
    },
    resolver: {
      path: path.relative(root, RESOLVER_PATH).split(path.sep).join("/"),
      sha256: hashBytes(resolver.bytes),
    },
  };
  delete payload.rows;
  const dependencyRows = [
    ...source.rows,
    ...tool.rows,
    { filePath: RESOLVER_PATH, stat: resolver.stat },
    { filePath: validatedReceipt.receiptPath, stat: validatedReceipt.stat },
  ];
  const sourceFiles = dependencyRows.map((entry) => entry.filePath);
  const sourceStatSignature = capturedDependencySignature(root, dependencyRows, servedBundle.files);
  return {
    ...payload,
    sha256: hashBytes(JSON.stringify(payload)),
    sourceFiles: [...new Set(sourceFiles.map((filePath) => path.relative(root, filePath).split(path.sep).join("/")))],
    sourceStatSignature,
  };
}

export async function inspectEchoDeliveryRuntimeBuildIdentity({ root = ROOT, refresh = false, strict = false } = {}) {
  const resolvedRoot = resolvedRootPath(root);
  let lastMismatch = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cached = cache.get(resolvedRoot);
    if (!refresh && cached) {
      const current = echoDeliveryRuntimeBuildSourceStatSignature({ root: resolvedRoot, files: cached.value.sourceFiles, refresh: strict });
      if (current === cached.value.sourceStatSignature) return structuredClone(cached.value);
    }
    const computed = computeIdentity(resolvedRoot);
    const after = echoDeliveryRuntimeBuildSourceStatSignature({ root: resolvedRoot, files: computed.sourceFiles, refresh: true });
    if (computed.sourceStatSignature !== after) {
      lastMismatch = { captured: computed.sourceStatSignature, observed: after, sourceFiles: computed.sourceFiles };
      continue;
    }
    const value = computed;
    cache.set(resolvedRoot, { value });
    return structuredClone(value);
  }
  const error = new Error(`The Echo delivery runtime changed while its import graph was being identified; retry after the edit is stable. ${lastMismatch?.captured || ""} != ${lastMismatch?.observed || ""}`);
  error.details = lastMismatch;
  throw error;
}
