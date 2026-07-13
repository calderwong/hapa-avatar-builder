import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import {
  SONG_CARD_APPEARANCE_INDEX_SCHEMA as DOMAIN_APPEARANCE_INDEX_SCHEMA,
  SONG_CARD_PUBLIC_MANIFEST_SCHEMA as DOMAIN_PUBLIC_MANIFEST_SCHEMA,
  SONG_CARD_PRIVATE_MANIFEST_SCHEMA as DOMAIN_PRIVATE_MANIFEST_SCHEMA,
  buildSongCardHead,
  buildSongCardEdition,
  buildSongCardPublicManifest,
  buildSongCardPrivateManifest,
  canonicalMintValue,
  isPrivateLocalReference,
  querySongCardAppearances,
  validateSongCardEdition,
} from "../src/domain/song-card-mint.js";
import {
  buildSongCardEditionLineage,
  createSongCardLifecycleEvent,
  validateSongCardEditionLineage,
} from "../src/domain/song-card-lineage.js";

const execFile = promisify(execFileCallback);

export const SONG_CARD_MINT_LEDGER_SCHEMA = "hapa.song-card-mint-ledger.v1";
export const SONG_CARD_MINT_PUBLIC_MANIFEST_SCHEMA = DOMAIN_PUBLIC_MANIFEST_SCHEMA;
export const SONG_CARD_MINT_PRIVATE_CUSTODY_SCHEMA = DOMAIN_PRIVATE_MANIFEST_SCHEMA;
export const SONG_CARD_TIMESTAMP_INDEX_SCHEMA = DOMAIN_APPEARANCE_INDEX_SCHEMA;
export const SONG_CARD_LINEAGE_SCHEMA = "hapa.song-card.edition-lineage.v1";
export const SONG_CARD_MIGRATION_RECEIPT_SCHEMA = "hapa.song-card.migration-receipt.v1";

const DEFAULT_TELEMETRY_LIMIT = 256;
const DEFAULT_TELEMETRY_EVENT_BYTES = 8 * 1024;
const PUBLIC_LICENSE_STATUSES = new Set(["cleared", "licensed", "operator-authored", "public-domain"]);
const PUBLIC_CONSENT_STATUSES = new Set(["approved", "cleared", "granted", "licensed", "operator-approved"]);

export class MintLedgerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MintLedgerError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new MintLedgerError(code, message, details);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : stableJson(value));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function songCardIdempotencyStorageKey(value) {
  return `idempotency:sha256:${digest(String(value || ""))}`;
}

function assertIdentifier(value, field) {
  if (typeof value !== "string" || !value.trim() || value.length > 240 || /[\u0000-\u001f]/u.test(value)) {
    fail("INVALID_ARGUMENT", `${field} must be a non-empty, bounded identifier`, { field });
  }
  return value.trim();
}

function editionName(edition) {
  return `edition-${String(edition).padStart(6, "0")}`;
}

function headStorageKey(headId) {
  return digest(headId).slice(0, 32);
}

function relativePosix(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

function isInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function canonicalProspectivePath(targetPath) {
  let cursor = path.resolve(targetPath);
  const suffix = [];
  while (!(await pathExists(cursor))) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  const canonicalParent = await fsp.realpath(cursor);
  return path.resolve(canonicalParent, ...suffix);
}

function processIsAlive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function assertRelativePublicPath(value, field) {
  if (typeof value !== "string" || !value || isPrivateLocalReference(value) || value.split(/[\\/]/u).includes("..")) {
    fail("PUBLIC_PATH_ESCAPE", `${field} must be a contained relative path`, { field, value });
  }
}

function assertNoAbsolutePaths(value, field = "manifest") {
  if (typeof value === "string") {
    if (isPrivateLocalReference(value)) fail("PUBLIC_PATH_ESCAPE", `${field} exposes an absolute path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoAbsolutePaths(item, `${field}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (isPrivateLocalReference(key)) fail("PUBLIC_PATH_ESCAPE", `${field} exposes an absolute path as an object key`);
    assertNoAbsolutePaths(item, `${field}.${key}`);
  }
}

function collectPrivateAbsolutePaths(value, field = "input", rows = []) {
  if (typeof value === "string") {
    if (isPrivateLocalReference(value)) rows.push({ field, value });
    return rows;
  }
  if (Array.isArray(value)) value.forEach((item, index) => collectPrivateAbsolutePaths(item, `${field}[${index}]`, rows));
  else if (isObject(value)) Object.entries(value).forEach(([key, item]) => {
    if (isPrivateLocalReference(key)) rows.push({ field: `${field}.[private-key]`, value: key });
    collectPrivateAbsolutePaths(item, `${field}.${isPrivateLocalReference(key) ? "[private-key]" : key}`, rows);
  });
  return rows;
}

function portablePublicValue(value) {
  if (typeof value === "string") {
    return isPrivateLocalReference(value) ? undefined : value;
  }
  if (Array.isArray(value)) return value.map(portablePublicValue).filter((item) => item !== undefined);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (isPrivateLocalReference(key)) return [];
    const portable = portablePublicValue(item);
    return portable === undefined ? [] : [[key, portable]];
  }));
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(filePath, fallback = undefined) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && fallback !== undefined) return structuredClone(fallback);
    throw error;
  }
}

async function fsyncDirectory(directoryPath) {
  let handle;
  try {
    handle = await fsp.open(directoryPath, fs.constants.O_RDONLY);
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

async function atomicWriteJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const handle = await fsp.open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsp.rename(temporaryPath, filePath);
  await fsyncDirectory(path.dirname(filePath));
}

async function appendDurableNdjson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fsp.open(filePath, "a", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readNdjson(filePath) {
  if (!(await pathExists(filePath))) return [];
  const text = await fsp.readFile(filePath, "utf8");
  return text.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      fail("GOVERNANCE_LOG_CORRUPT", `Governance event ${index + 1} is not valid JSON`);
    }
  });
}

export async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function probeRenderedMedia(filePath, { ffprobePath = "ffprobe", exec = execFile } = {}) {
  let output;
  try {
    ({ stdout: output } = await exec(ffprobePath, [
      "-v", "error",
      "-show_error",
      "-show_streams",
      "-show_format",
      "-of", "json",
      filePath,
    ], { maxBuffer: 16 * 1024 * 1024 }));
  } catch (error) {
    fail("MEDIA_PROBE_FAILED", "Rendered media could not be decoded by ffprobe", { stderr: String(error?.stderr || error?.message || error) });
  }
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    fail("MEDIA_PROBE_FAILED", "ffprobe returned invalid JSON");
  }
  const streams = Array.isArray(result.streams) ? result.streams : [];
  const videoStreams = streams.filter((stream) => stream.codec_type === "video");
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  const durationSeconds = Number(result.format?.duration || videoStreams[0]?.duration || audioStreams[0]?.duration || 0);
  const decodeOk = !result.error && streams.every((stream) => Boolean(stream.codec_name));
  return {
    durationSeconds,
    hasVideo: videoStreams.length > 0,
    hasAudio: audioStreams.length > 0,
    videoCodec: videoStreams[0]?.codec_name || "",
    audioCodec: audioStreams[0]?.codec_name || "",
    width: Number(videoStreams[0]?.width || 0),
    height: Number(videoStreams[0]?.height || 0),
    decodeOk,
  };
}

export async function decodeRenderedMedia(filePath, { ffmpegPath = "ffmpeg", exec = execFile } = {}) {
  try {
    await exec(ffmpegPath, [
      "-hide_banner",
      "-loglevel", "error",
      "-xerror",
      "-i", filePath,
      "-map", "0:v:0",
      "-map", "0:a:0",
      "-f", "null",
      "-",
    ], { maxBuffer: 16 * 1024 * 1024 });
    return { ok: true, decoder: "ffmpeg-null", fullAudioVideoDecode: true };
  } catch (error) {
    fail("MEDIA_DECODE_FAILED", "Staged master failed a full audio/video decode pass", { stderr: String(error?.stderr || error?.message || error) });
  }
}

export async function decodePosterImage(filePath, { ffmpegPath = "ffmpeg", exec = execFile } = {}) {
  try {
    await exec(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-xerror", "-i", filePath, "-frames:v", "1", "-f", "null", "-"], { maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, decoder: "ffmpeg-image-null", imageDecode: true };
  } catch (error) {
    fail("POSTER_IMAGE_INVALID", "Poster artifact failed an image decode pass", { stderr: String(error?.stderr || error?.message || error) });
  }
}

function normalizeAppearance(row, index) {
  if (!isObject(row)) fail("INVALID_TIMESTAMP_INDEX", `Appearance ${index} must be an object`);
  const startMs = Number(row.startMs);
  const endMs = Number(row.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) {
    fail("INVALID_TIMESTAMP_INDEX", `Appearance ${index} must use a non-empty [startMs, endMs) interval`, { startMs, endMs });
  }
  const cardId = assertIdentifier(row.cardId || row.sourceCardId || row.cueId, `appearances[${index}].cardId`);
  const snapshot = isObject(row.snapshot) ? structuredClone(row.snapshot)
    : isObject(row.sourceSnapshot) ? structuredClone(row.sourceSnapshot) : null;
  return {
    ...structuredClone(row),
    appearanceId: assertIdentifier(row.appearanceId || `${cardId}:${startMs}:${endMs}:${index}`, `appearances[${index}].appearanceId`),
    cardId,
    sourceCardId: String(row.sourceCardId || cardId),
    startMs: Math.round(startMs),
    endMs: Math.round(endMs),
    trackId: String(row.trackId || "visual"),
    trackRole: String(row.trackRole || row.role || "visual"),
    layer: Number.isFinite(Number(row.layer)) ? Number(row.layer) : 0,
    layerIndex: Number.isFinite(Number(row.layerIndex)) ? Number(row.layerIndex) : Number(row.layer || 0),
    zIndex: Number.isFinite(Number(row.zIndex ?? row.zOrder)) ? Number(row.zIndex ?? row.zOrder) : index,
    zOrder: Number.isFinite(Number(row.zOrder ?? row.zIndex)) ? Number(row.zOrder ?? row.zIndex) : index,
    cueId: row.cueId ? String(row.cueId) : "",
    role: row.role ? String(row.role) : "media",
    sourceSnapshot: snapshot || {},
    snapshot,
    printable: row.printable === undefined ? Boolean(snapshot) : row.printable === true,
    pureIvf: row.pureIvf === true,
    provenance: isObject(row.provenance) ? structuredClone(row.provenance) : {},
  };
}

export function validateTimestampIndex(timestampIndex = [], { durationMs = null } = {}) {
  const rows = Array.isArray(timestampIndex) ? timestampIndex : timestampIndex?.appearances;
  if (!Array.isArray(rows)) fail("INVALID_TIMESTAMP_INDEX", "timestampIndex must be an array or contain appearances[]");
  const appearances = rows.map(normalizeAppearance).sort((left, right) => (
    left.startMs - right.startMs || left.layer - right.layer || left.zIndex - right.zIndex || left.appearanceId.localeCompare(right.appearanceId)
  ));
  const ids = new Set();
  for (const appearance of appearances) {
    if (ids.has(appearance.appearanceId)) fail("INVALID_TIMESTAMP_INDEX", `Duplicate appearanceId: ${appearance.appearanceId}`);
    ids.add(appearance.appearanceId);
    if (durationMs !== null && appearance.endMs > durationMs + 250) {
      fail("INVALID_TIMESTAMP_INDEX", `Appearance ${appearance.appearanceId} exceeds rendered duration`, { endMs: appearance.endMs, durationMs });
    }
  }
  const normalized = {
    schemaVersion: SONG_CARD_TIMESTAMP_INDEX_SCHEMA,
    intervalRule: "half-open-[startMs,endMs)",
    intervalConvention: "half-open",
    selectionOrder: ["layer", "zIndex", "appearanceId"],
    durationMs: durationMs === null ? null : Math.round(durationMs),
    appearances,
  };
  normalized.indexDigest = String(timestampIndex?.indexDigest || `sha256:${digest(normalized)}`);
  return normalized;
}

export function reconcileTimestampIndexRenderPadding(timestampIndex = [], { durationMs, maxPaddingMs = 250 } = {}) {
  const renderedDurationMs = Math.round(Number(durationMs));
  const declaredDurationMs = Math.round(Number(timestampIndex?.durationMs));
  const paddingMs = renderedDurationMs - declaredDurationMs;
  if (!Number.isFinite(renderedDurationMs) || renderedDurationMs <= 0
    || !Number.isFinite(declaredDurationMs) || declaredDurationMs <= 0
    || paddingMs <= 0 || paddingMs > maxPaddingMs) return timestampIndex;
  const rows = Array.isArray(timestampIndex) ? timestampIndex : timestampIndex?.appearances;
  if (!Array.isArray(rows)) return timestampIndex;
  const paddingId = `render-padding:${declaredDurationMs}:${renderedDurationMs}`;
  const reconciled = {
    ...(Array.isArray(timestampIndex) ? {} : structuredClone(timestampIndex)),
    durationMs: renderedDurationMs,
    appearances: [
      ...structuredClone(rows),
      {
        appearanceId: paddingId,
        sourceCardId: paddingId,
        sourceCardKind: "render-padding",
        startMs: declaredDurationMs,
        endMs: renderedDurationMs,
        trackId: "track:render-padding",
        trackRole: "metadata",
        layer: -1,
        layerIndex: -1,
        zIndex: -1,
        zOrder: -1,
        role: "non-printable",
        snapshot: null,
        printable: false,
        pureIvf: false,
        provenance: {
          truthStatus: "explicit-non-printable",
          reason: "container-duration-padding",
          declaredDurationMs,
          renderedDurationMs,
          paddingMs,
        },
      },
    ],
  };
  delete reconciled.indexDigest;
  return reconciled;
}

export function cardsAtTimestamp(timestampIndex, timestampMs) {
  const at = Number(timestampMs);
  if (!Number.isFinite(at) || at < 0) fail("INVALID_ARGUMENT", "timestampMs must be a non-negative number");
  const index = timestampIndex?.schemaVersion === SONG_CARD_TIMESTAMP_INDEX_SCHEMA
    ? timestampIndex
    : validateTimestampIndex(timestampIndex);
  return querySongCardAppearances(index, at).active;
}

function detectCycle(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => adjacency.get(edge.from).push(edge.to));
  const visiting = new Set();
  const visited = new Set();
  function visit(nodeId) {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    if (adjacency.get(nodeId).some(visit)) return true;
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }
  return nodes.some((node) => visit(node.id));
}

export function validateLineage(lineage = {}) {
  const rawNodes = Array.isArray(lineage?.nodes) ? lineage.nodes : [];
  const rawEdges = Array.isArray(lineage?.edges) ? lineage.edges : [];
  const nodes = rawNodes.map((node, index) => {
    if (!isObject(node)) fail("INVALID_LINEAGE", `Lineage node ${index} must be an object`);
    return { ...structuredClone(node), id: assertIdentifier(node.id, `lineage.nodes[${index}].id`), kind: String(node.kind || "source") };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) fail("INVALID_LINEAGE", "Lineage node IDs must be unique");
  const edges = rawEdges.map((edge, index) => {
    const from = assertIdentifier(edge?.from, `lineage.edges[${index}].from`);
    const to = assertIdentifier(edge?.to, `lineage.edges[${index}].to`);
    if (!nodeIds.has(from) || !nodeIds.has(to)) fail("INVALID_LINEAGE", `Lineage edge ${index} references an unknown node`);
    if (from === to) fail("INVALID_LINEAGE", `Lineage edge ${index} is self-referential`);
    return { from, to, relation: String(edge.relation || "derived-from") };
  });
  if (detectCycle(nodes, edges)) fail("LINEAGE_CYCLE", "Lineage must be acyclic");
  return { schemaVersion: SONG_CARD_LINEAGE_SCHEMA, nodes, edges };
}

function buildCompleteLineage(input, { headId, edition, sourceRevision, renderSha256, semanticFingerprint }) {
  const validated = validateLineage(input);
  const nodes = [...validated.nodes];
  const edges = [...validated.edges];
  const sourceId = `source-revision:${digest(sourceRevision).slice(0, 24)}`;
  const renderId = `render:sha256:${renderSha256}`;
  const editionId = `song-card:${headStorageKey(headId)}:${edition}`;
  const existing = new Set(nodes.map((node) => node.id));
  if (!existing.has(sourceId)) nodes.push({ id: sourceId, kind: "source-revision", revision: String(sourceRevision) });
  if (!existing.has(renderId)) nodes.push({ id: renderId, kind: "render", sha256: renderSha256 });
  if (!existing.has(editionId)) nodes.push({ id: editionId, kind: "song-card-edition", headId, edition, semanticFingerprint });
  const outgoing = new Set(edges.map((edge) => edge.from));
  const suppliedSinks = validated.nodes.filter((node) => !outgoing.has(node.id));
  for (const node of suppliedSinks) edges.push({ from: node.id, to: renderId, relation: "contributed-to" });
  if (!edges.some((edge) => edge.from === sourceId && edge.to === renderId)) edges.push({ from: sourceId, to: renderId, relation: "rendered-as" });
  edges.push({ from: renderId, to: editionId, relation: "minted-as" });
  const completed = validateLineage({ nodes, edges });
  return { ...completed, outputNodeId: editionId, complete: true };
}

export function validateBoundedTelemetry(telemetry = [], {
  maxEvents = DEFAULT_TELEMETRY_LIMIT,
  maxEventBytes = DEFAULT_TELEMETRY_EVENT_BYTES,
} = {}) {
  if (!Array.isArray(telemetry)) fail("INVALID_TELEMETRY", "telemetry must be an array");
  if (telemetry.length > maxEvents) fail("TELEMETRY_LIMIT", `Telemetry is limited to ${maxEvents} events per mint`);
  return telemetry.map((event, index) => {
    if (!isObject(event)) fail("INVALID_TELEMETRY", `Telemetry event ${index} must be an object`);
    const type = assertIdentifier(event.type || event.event, `telemetry[${index}].type`);
    if (/frame|requestanimationframe|raf-tick|pixel-sample/iu.test(type) || "frameNumber" in event || "frameIndex" in event) {
      fail("PER_FRAME_TELEMETRY_FORBIDDEN", `Per-frame telemetry is not accepted: ${type}`);
    }
    const normalized = { ...structuredClone(event), type };
    delete normalized.event;
    if (Buffer.byteLength(JSON.stringify(normalized)) > maxEventBytes) fail("TELEMETRY_EVENT_TOO_LARGE", `Telemetry event ${index} exceeds ${maxEventBytes} bytes`);
    return normalized;
  });
}

function initialLedger() {
  return { schemaVersion: SONG_CARD_MINT_LEDGER_SCHEMA, revision: 0, updatedAt: null, heads: {} };
}

function cloneHeadForResult(head) {
  if (!head) return null;
  return structuredClone(head);
}

async function chmodTreeReadOnly(directoryPath) {
  const entries = await fsp.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await chmodTreeReadOnly(child);
    } else {
      await fsp.chmod(child, 0o444);
    }
  }
  await fsp.chmod(directoryPath, 0o555);
}

async function chmodDirectoriesWritable(directoryPath) {
  await fsp.chmod(directoryPath, 0o755);
  const entries = await fsp.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) await chmodDirectoriesWritable(path.join(directoryPath, entry.name));
  }
}

async function copyTree(source, destination) {
  await fsp.cp(source, destination, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
}

async function fileInventory(directoryPath, { exclude = new Set() } = {}) {
  const rows = [];
  async function walk(current, prefix = "") {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (exclude.has(relativePath)) continue;
      const absolutePath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) fail("BUNDLE_INTEGRITY_FAILED", `Bundle contains a symbolic link: ${relativePath}`);
      if (entry.isDirectory()) await walk(absolutePath, relativePath);
      else if (entry.isFile()) {
        const stat = await fsp.stat(absolutePath);
        rows.push({ path: relativePath, bytes: stat.size, sha256: await computeFileSha256(absolutePath) });
      } else fail("BUNDLE_INTEGRITY_FAILED", `Bundle contains a non-regular file: ${relativePath}`);
    }
  }
  await walk(directoryPath);
  return rows;
}

async function verifyFileInventory(directoryPath, expectedRows, { exclude = new Set() } = {}) {
  if (!Array.isArray(expectedRows) || expectedRows.length === 0) fail("BUNDLE_INTEGRITY_FAILED", "Bundle integrity inventory is missing");
  const actualRows = await fileInventory(directoryPath, { exclude });
  if (stableJson(actualRows) !== stableJson(expectedRows)) {
    fail("BUNDLE_INTEGRITY_FAILED", "Bundle files do not match the signed inventory", { expectedCount: expectedRows.length, actualCount: actualRows.length });
  }
  return actualRows;
}

async function detectPosterImage(filePath) {
  const handle = await fsp.open(filePath, "r");
  try {
    const bytes = Buffer.alloc(16);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const header = bytes.subarray(0, bytesRead);
    if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return { mediaType: "image/jpeg", format: "jpeg" };
    if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mediaType: "image/png", format: "png" };
    if (header.length >= 12 && header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP") return { mediaType: "image/webp", format: "webp" };
    if (header.length >= 6 && ["GIF87a", "GIF89a"].includes(header.subarray(0, 6).toString("ascii"))) return { mediaType: "image/gif", format: "gif" };
  } finally {
    await handle.close();
  }
  fail("POSTER_IMAGE_INVALID", "Poster artifact is not a recognized JPEG, PNG, WebP, or GIF image");
}

function normalizeProbe(probe) {
  return {
    durationSeconds: Number(probe?.durationSeconds || 0),
    hasVideo: probe?.hasVideo === true,
    hasAudio: probe?.hasAudio === true,
    decodeOk: probe?.decodeOk === true,
    videoCodec: String(probe?.videoCodec || ""),
    audioCodec: String(probe?.audioCodec || ""),
    width: Number(probe?.width || 0),
    height: Number(probe?.height || 0),
  };
}

function legacyHasRenderedVideo(legacyCard = {}) {
  const candidates = [
    legacyCard.video,
    legacyCard.renderedVideo,
    legacyCard.rendered_video,
    legacyCard.releaseManifest?.video,
    legacyCard.release_manifest?.video,
    legacyCard.media?.video,
    legacyCard.artifacts?.video,
    legacyCard.artifacts?.master,
    ...(Array.isArray(legacyCard.artifacts) ? legacyCard.artifacts.filter((row) => ["video", "master", "render"].includes(String(row?.role || "").toLowerCase())) : []),
  ];
  return candidates.some((candidate) => {
    if (typeof candidate === "string") return candidate.trim().length > 0;
    if (!isObject(candidate)) return false;
    return [candidate.path, candidate.uri, candidate.url, candidate.sha256, candidate.hash, candidate.contentHash].some((value) => typeof value === "string" && value.trim().length > 0);
  });
}

export class SongCardMintLedger {
  constructor({
    root,
    allowedSourceRoots = [process.cwd()],
    ffprobePath = "ffprobe",
    ffmpegPath = "ffmpeg",
    mediaProbe = null,
    mediaDecoder = null,
    imageDecoder = null,
    readSourceRevision = null,
    clock = () => new Date(),
    lockTimeoutMs = 10_000,
    staleLockMs = 120_000,
    injectCrash = null,
  } = {}) {
    if (!root) fail("INVALID_ARGUMENT", "SongCardMintLedger requires root");
    this.root = path.resolve(root);
    this.allowedSourceRoots = allowedSourceRoots.map((entry) => path.resolve(entry));
    this.ffprobePath = ffprobePath;
    this.ffmpegPath = ffmpegPath;
    this.mediaProbe = mediaProbe;
    this.mediaDecoder = mediaDecoder || (mediaProbe ? async () => ({ ok: true, decoder: "injected-media-probe", fullAudioVideoDecode: true }) : null);
    this.imageDecoder = imageDecoder || (mediaProbe ? async () => ({ ok: true, decoder: "injected-media-probe", imageDecode: true }) : null);
    this.readSourceRevision = readSourceRevision;
    this.clock = clock;
    this.lockTimeoutMs = lockTimeoutMs;
    this.staleLockMs = staleLockMs;
    this.injectCrash = injectCrash;
    this.paths = {
      heads: path.join(this.root, "heads.json"),
      wal: path.join(this.root, "mint.wal.ndjson"),
      governance: path.join(this.root, "governance.ndjson"),
      governancePrivate: path.join(this.root, ".governance.private.ndjson"),
      editions: path.join(this.root, "editions"),
      staging: path.join(this.root, ".staging"),
      locks: path.join(this.root, ".locks"),
      migrations: path.join(this.root, "migrations"),
    };
  }

  now() {
    return this.clock().toISOString();
  }

  async initialize() {
    await Promise.all([
      fsp.mkdir(this.paths.editions, { recursive: true }),
      fsp.mkdir(this.paths.staging, { recursive: true }),
      fsp.mkdir(this.paths.locks, { recursive: true }),
      fsp.mkdir(this.paths.migrations, { recursive: true }),
    ]);
    if (!(await pathExists(this.paths.heads))) await atomicWriteJson(this.paths.heads, initialLedger());
    return this;
  }

  async readLedger() {
    await this.initialize();
    const ledger = await readJson(this.paths.heads, initialLedger());
    if (ledger.schemaVersion !== SONG_CARD_MINT_LEDGER_SCHEMA || !isObject(ledger.heads)) fail("LEDGER_CORRUPT", "Mint head ledger has an invalid schema");
    return ledger;
  }

  async getHead(headId) {
    const id = assertIdentifier(headId, "headId");
    const ledger = await this.readLedger();
    return cloneHeadForResult(ledger.heads[id]);
  }

  editionDirectory(headId, edition) {
    return path.join(this.paths.editions, headStorageKey(headId), editionName(edition));
  }

  async readEdition(headId, edition) {
    const directory = this.editionDirectory(assertIdentifier(headId, "headId"), Number(edition));
    const manifest = await readJson(path.join(directory, "manifest.public.json"));
    const timestampIndex = await readJson(path.join(directory, "timestamp-index.json"));
    const lineage = await readJson(path.join(directory, "lineage.json"));
    const snapshot = await readJson(path.join(directory, "data", "mint-snapshot.json"), null);
    return { directory, manifest, timestampIndex, lineage, snapshot };
  }

  async cardsAtTime(headId, edition, timestampMs) {
    const record = await this.readEdition(headId, edition);
    return cardsAtTimestamp(record.timestampIndex, timestampMs);
  }

  async acquireLock(name) {
    await fsp.mkdir(this.paths.locks, { recursive: true });
    const lockPath = path.join(this.paths.locks, `${name}.lock`);
    const startedAt = Date.now();
    while (true) {
      try {
        const handle = await fsp.open(lockPath, "wx", 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: this.now() }));
        await handle.sync();
        return async () => {
          await handle.close().catch(() => {});
          await fsp.unlink(lockPath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
        };
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const stat = await fsp.stat(lockPath).catch(() => null);
        if (stat && Date.now() - stat.mtimeMs > this.staleLockMs) {
          const owner = await readJson(lockPath, null).catch(() => null);
          if (!processIsAlive(owner?.pid)) {
            await fsp.unlink(lockPath).catch(() => {});
            continue;
          }
        }
        if (Date.now() - startedAt > this.lockTimeoutMs) fail("LOCK_TIMEOUT", `Timed out waiting for mint lock ${name}`);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    }
  }

  async appendWal(type, payload = {}) {
    const event = { schemaVersion: "hapa.song-card-mint-wal-event.v1", eventId: crypto.randomUUID(), type, at: this.now(), ...payload };
    await appendDurableNdjson(this.paths.wal, event);
    return event;
  }

  async appendLifecycleEventOnce(input) {
    const event = createSongCardLifecycleEvent(input);
    const release = await this.acquireLock("governance-events");
    try {
      const events = await readNdjson(this.paths.governance);
      if (events.some((row) => row.eventId === event.eventId)) return { appended: false, event };
      await appendDurableNdjson(this.paths.governance, event);
      return { appended: true, event };
    } finally {
      await release();
    }
  }

  async ensurePublishedLifecycleEvent({ transaction, publicManifest = null, finalDirectory = null, lineage = null } = {}) {
    const headId = assertIdentifier(transaction?.headId, "transaction.headId");
    const edition = Number(transaction?.edition);
    const directory = finalDirectory || this.editionDirectory(headId, edition);
    const manifest = publicManifest || await readJson(path.join(directory, "manifest.public.json"));
    const editionLineage = lineage || await readJson(path.join(directory, "lineage.json"));
    const lineageValidation = validateSongCardEditionLineage(editionLineage);
    if (!lineageValidation.ok) fail("LIFECYCLE_LINEAGE_INVALID", "Lifecycle event requires a valid immutable edition lineage", { errors: lineageValidation.errors });
    const publishStatus = String(transaction?.publishStatus || manifest.edition?.publishStatus || "private-demo");
    if (transaction?.publishStatus && manifest.edition?.publishStatus && transaction.publishStatus !== manifest.edition.publishStatus) {
      fail("RECOVERY_INTEGRITY_FAILED", "Recovered publish status does not match the immutable manifest");
    }
    if (transaction?.lineageHash && transaction.lineageHash !== editionLineage.lineageHash) {
      fail("RECOVERY_INTEGRITY_FAILED", "Recovered lineage hash does not match the immutable lineage");
    }
    if (publishStatus !== "public-gate") return { appended: false, event: null, reason: "not-public-gate" };
    return this.appendLifecycleEventOnce({
      type: "published",
      headId,
      edition,
      lineageHash: editionLineage.lineageHash,
      reason: "public-gate",
      actor: "song-card-mint-ledger",
      at: transaction?.createdAt || manifest.edition?.mintedAt,
    });
  }

  async ensureRegisteredPublishedLifecycleEvent(headId, edition) {
    const finalDirectory = this.editionDirectory(headId, edition);
    const transaction = await readJson(path.join(finalDirectory, "transaction.json"), null);
    if (!transaction) return { appended: false, event: null, reason: "transaction-not-found" };
    return this.ensurePublishedLifecycleEvent({ transaction, finalDirectory });
  }

  async maybeCrash(point, context) {
    if (!this.injectCrash) return;
    const shouldCrash = typeof this.injectCrash === "function"
      ? await this.injectCrash(point, context)
      : this.injectCrash === point;
    if (shouldCrash) fail("INJECTED_CRASH", `Injected crash after ${point}`, { point, ...context });
  }

  async abortRequested(request, phase) {
    if (typeof request.shouldAbort !== "function") return false;
    return (await request.shouldAbort({ headId: request.headId, phase })) === true;
  }

  async cancelTransactionCandidate({ request, transaction, currentDirectory, stageDirectory, phase }) {
    await chmodDirectoriesWritable(currentDirectory).catch(() => {});
    await atomicWriteJson(path.join(currentDirectory, "transaction.json"), { ...transaction, status: "canceled", canceledAt: this.now(), canceledPhase: phase });
    if (currentDirectory !== stageDirectory && !(await pathExists(stageDirectory))) {
      await fsp.rename(currentDirectory, stageDirectory);
      await fsyncDirectory(path.dirname(currentDirectory));
    }
    await this.appendWal("mint_canceled", { transactionId: transaction.transactionId, headId: request.headId, edition: transaction.edition, phase });
    fail("MINT_CANCELED", "Mint was canceled before the immutable head commit", { phase, transactionId: transaction.transactionId });
  }

  async resolveSource(sourceVideoPath) {
    const requested = path.resolve(sourceVideoPath || "");
    const sourceLstat = await fsp.lstat(requested).catch((error) => {
      if (error?.code === "ENOENT") fail("SOURCE_NOT_FOUND", "Rendered video does not exist", { sourceVideoPath: requested });
      throw error;
    });
    if (!sourceLstat.isFile()) fail("INVALID_SOURCE", "Rendered video must be a regular file");
    if (sourceLstat.isSymbolicLink()) fail("SYMLINK_SOURCE_FORBIDDEN", "Rendered video may not be a symbolic link");
    const sourceRealPath = await fsp.realpath(requested);
    const roots = [];
    for (const configuredRoot of this.allowedSourceRoots) {
      const rootRealPath = await fsp.realpath(configuredRoot).catch(() => null);
      if (rootRealPath) roots.push(rootRealPath);
    }
    if (!roots.some((rootPath) => isInside(rootPath, sourceRealPath))) {
      fail("SOURCE_PATH_ESCAPE", "Rendered video is outside configured source roots", { sourceVideoPath: sourceRealPath });
    }
    return { requested, sourceRealPath, sourceLstat };
  }

  async assertExternalRevision(request, phase) {
    const reader = request.readSourceRevision || this.readSourceRevision;
    if (!reader) return null;
    const actual = await reader({ headId: request.headId, sourceRevision: request.sourceRevision, phase });
    if (String(actual) !== String(request.sourceRevision)) {
      fail("SOURCE_REVISION_CHANGED", `Source revision changed during ${phase}`, { expected: request.sourceRevision, actual, phase });
    }
    return actual;
  }

  async preflight(request, { source = null } = {}) {
    const headId = assertIdentifier(request.headId, "headId");
    const sourceRevision = assertIdentifier(String(request.sourceRevision || ""), "sourceRevision");
    const resolvedSource = source || await this.resolveSource(request.sourceVideoPath);
    await this.assertExternalRevision({ ...request, headId, sourceRevision }, "preflight");
    const beforeStat = await fsp.stat(resolvedSource.sourceRealPath);
    const sourceSha256 = await computeFileSha256(resolvedSource.sourceRealPath);
    const probe = normalizeProbe(this.mediaProbe
      ? await this.mediaProbe(resolvedSource.sourceRealPath, request)
      : await probeRenderedMedia(resolvedSource.sourceRealPath, { ffprobePath: this.ffprobePath }));
    if (!probe.hasVideo || !probe.hasAudio || !probe.decodeOk || !(probe.durationSeconds > 0)) {
      fail("MEDIA_PREFLIGHT_FAILED", "Rendered master must decode and contain non-empty audio and video streams", { probe });
    }
    const durationMs = Math.round(probe.durationSeconds * 1000);
    const timestampIndex = validateTimestampIndex(reconcileTimestampIndexRenderPadding(
      request.timestampIndex || [],
      { durationMs },
    ), { durationMs });
    const rendererTruth = request.rendererTruth || request.snapshot?.rendererTruth || null;
    if (rendererTruth?.ok !== true || rendererTruth?.allStatesVisible !== true || Number(rendererTruth?.silentDefaultCount || 0) !== 0
      || rendererTruth?.releaseSafe === false || rendererTruth?.truthStatus === "blocked") {
      fail("RENDERER_TRUTH_FAILED", "Mint preflight requires explicit renderer truth, visible states, and zero silent defaults", { rendererTruth });
    }
    if (!String(request.posterPath || "").trim()) fail("POSTER_REQUIRED", "Every immutable Song Card edition requires a verified poster image");
    const boundaries = [...new Set([0, durationMs, ...timestampIndex.appearances.flatMap((row) => [row.startMs, row.endMs])])].sort((left, right) => left - right);
    const coverageGaps = boundaries.slice(0, -1).flatMap((startMs, index) => {
      const endMs = boundaries[index + 1];
      return timestampIndex.appearances.some((row) => row.startMs < endMs && row.endMs > startMs) ? [] : [{ startMs, endMs }];
    });
    if (coverageGaps.length) fail("TEMPORAL_COVERAGE_FAILED", "Every rendered interval must resolve to a media, card, visualizer, or explicit non-printable appearance", { coverageGaps });
    if (request.publishStatus === "public-gate") {
      const rights = request.rights || {};
      const approvals = request.approvals || {};
      const licensingStatus = String(rights.licensingStatus || rights.status || "").trim().toLowerCase();
      const consentStatus = String(rights.consentStatus || "").trim().toLowerCase();
      if (!PUBLIC_LICENSE_STATUSES.has(licensingStatus) || !PUBLIC_CONSENT_STATUSES.has(consentStatus)) {
        fail("RIGHTS_GATE_FAILED", "Public Song Card mint requires cleared licensing and affirmative consent status", { licensingStatus, consentStatus });
      }
      if (approvals.technical !== true || approvals.creative !== true) fail("APPROVAL_GATE_FAILED", "Public Song Card mint requires technical and creative approval");
      if (request.safety?.ok !== true) fail("SAFETY_GATE_FAILED", "Public Song Card mint requires an explicit visual/media safety receipt");
    }
    const telemetry = validateBoundedTelemetry(request.telemetry || []);
    return { headId, sourceRevision, source: resolvedSource, beforeStat, sourceSha256, probe, durationMs, timestampIndex, rendererTruth, coverageGaps, telemetry };
  }

  async mint(request = {}) {
    await this.initialize();
    const headId = assertIdentifier(request.headId, "headId");
    if (isPrivateLocalReference(headId)) fail("PUBLIC_PATH_ESCAPE", "headId cannot contain a private local reference");
    const suppliedIdempotencyKey = assertIdentifier(request.idempotencyKey || `semantic:${request.semanticFingerprint || "derive"}`, "idempotencyKey");
    const idempotencyKey = songCardIdempotencyStorageKey(suppliedIdempotencyKey);
    const releaseHead = await this.acquireLock(`head-${headStorageKey(headId)}`);
    try {
      let ledger = await this.readLedger();
      let head = ledger.heads[headId];
      const requestedSemanticFingerprint = request.semanticFingerprint
        ? assertIdentifier(request.semanticFingerprint, "semanticFingerprint")
        : null;
      if (requestedSemanticFingerprint && isPrivateLocalReference(requestedSemanticFingerprint)) fail("PUBLIC_PATH_ESCAPE", "semanticFingerprint cannot contain a private local reference");
      const earlyPrior = head?.idempotency?.[idempotencyKey] || head?.idempotency?.[suppliedIdempotencyKey];
      if (earlyPrior && requestedSemanticFingerprint) {
        if (earlyPrior.semanticFingerprint !== requestedSemanticFingerprint) {
          fail("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for different semantic content", { idempotencyKey });
        }
        await this.ensureRegisteredPublishedLifecycleEvent(headId, earlyPrior.edition);
        return { created: false, reason: "idempotency-replay", head: cloneHeadForResult(head), edition: earlyPrior.edition };
      }
      if (requestedSemanticFingerprint && head?.latestSemanticFingerprint === requestedSemanticFingerprint) {
        await this.ensureRegisteredPublishedLifecycleEvent(headId, head.latestEdition);
        return { created: false, reason: "semantic-no-change", head: cloneHeadForResult(head), edition: head.latestEdition };
      }
      if (await this.abortRequested(request, "before-preflight")) fail("MINT_CANCELED", "Mint was canceled before preflight");
      const preflight = await this.preflight({ ...request, headId });
      const portableTimestampIndex = portablePublicValue(preflight.timestampIndex);
      if (await this.abortRequested(request, "after-preflight")) fail("MINT_CANCELED", "Mint was canceled after preflight");
      const semanticFingerprint = assertIdentifier(request.semanticFingerprint || digest({
        material: request.material || {},
        song: request.song || {},
        sourceRevision: preflight.sourceRevision,
        renderSha256: preflight.sourceSha256,
        timestampIndex: portableTimestampIndex,
      }), "semanticFingerprint");
      ledger = await this.readLedger();
      head = ledger.heads[headId];
      const priorIdempotency = head?.idempotency?.[idempotencyKey] || head?.idempotency?.[suppliedIdempotencyKey];
      if (priorIdempotency) {
        if (priorIdempotency.semanticFingerprint !== semanticFingerprint) {
          fail("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for different semantic content", { idempotencyKey });
        }
        await this.ensureRegisteredPublishedLifecycleEvent(headId, priorIdempotency.edition);
        return { created: false, reason: "idempotency-replay", head: cloneHeadForResult(head), edition: priorIdempotency.edition };
      }
      if (head?.latestSemanticFingerprint === semanticFingerprint) {
        await this.ensureRegisteredPublishedLifecycleEvent(headId, head.latestEdition);
        return { created: false, reason: "semantic-no-change", head: cloneHeadForResult(head), edition: head.latestEdition };
      }
      if (request.expectedHeadVersion !== undefined && Number(request.expectedHeadVersion) !== Number(head?.version || 0)) {
        fail("CAS_MISMATCH", "Song Card head changed before mint", { expected: request.expectedHeadVersion, actual: head?.version || 0 });
      }
      const edition = Number(head?.latestEdition || 0) + 1;
      const transactionId = crypto.randomUUID();
      const stageDirectory = path.join(this.paths.staging, `${headStorageKey(headId)}-${editionName(edition)}-${transactionId}`);
      const finalDirectory = this.editionDirectory(headId, edition);
      const createdAt = this.now();
      const relativeEditionPath = relativePosix(this.root, finalDirectory);
      const relativeMasterPath = "media/master.mp4";
      const relativeTimestampPath = "timestamp-index.json";
      const relativeLineagePath = "lineage.json";
      const relativeTelemetryPath = "telemetry.json";
      const relativeSnapshotPath = "data/mint-snapshot.json";
      const relativeGraphPath = "data/show-graph.json";
      const relativeContextPath = "data/context.json";
      const relativeRendererTruthPath = "data/renderer-truth.json";
      const relativeReceiptsPath = "data/receipts.json";
      const relativeCaptionsPath = "captions/captions.json";
      const relativePosterPath = "poster/poster.jpg";
      [relativeEditionPath, relativeMasterPath, relativeTimestampPath, relativeLineagePath, relativeTelemetryPath, relativeSnapshotPath, relativeGraphPath, relativeContextPath, relativeRendererTruthPath, relativeReceiptsPath, relativeCaptionsPath, relativePosterPath]
        .forEach((value, index) => assertRelativePublicPath(value, `publicPath[${index}]`));
      await this.appendWal("mint_started", { transactionId, headId, edition, idempotencyKey, semanticFingerprint });
      await Promise.all([
        fsp.mkdir(path.join(stageDirectory, "media"), { recursive: true }),
        fsp.mkdir(path.join(stageDirectory, "data"), { recursive: true }),
        fsp.mkdir(path.join(stageDirectory, "captions"), { recursive: true }),
        fsp.mkdir(path.join(stageDirectory, "poster"), { recursive: true }),
      ]);
      const stagedMaster = path.join(stageDirectory, "media", "master.mp4");
      await fsp.copyFile(preflight.source.sourceRealPath, stagedMaster, fs.constants.COPYFILE_EXCL);
      const stagedSha256 = await computeFileSha256(stagedMaster);
      const afterSourceSha256 = await computeFileSha256(preflight.source.sourceRealPath);
      const afterStat = await fsp.stat(preflight.source.sourceRealPath);
      if (stagedSha256 !== preflight.sourceSha256 || afterSourceSha256 !== preflight.sourceSha256
        || afterStat.size !== preflight.beforeStat.size || afterStat.mtimeMs !== preflight.beforeStat.mtimeMs) {
        fail("SOURCE_CHANGED_DURING_COPY", "Rendered master changed while it was staged");
      }
      await this.assertExternalRevision({ ...request, headId, sourceRevision: preflight.sourceRevision }, "publish");
      const stagedProbe = normalizeProbe(this.mediaProbe
        ? await this.mediaProbe(stagedMaster, request)
        : await probeRenderedMedia(stagedMaster, { ffprobePath: this.ffprobePath }));
      if (!stagedProbe.decodeOk || !stagedProbe.hasAudio || !stagedProbe.hasVideo || Math.abs(stagedProbe.durationSeconds - preflight.probe.durationSeconds) > 0.05) {
        fail("STAGED_MEDIA_MISMATCH", "Staged master did not pass the source media probe", { sourceProbe: preflight.probe, stagedProbe });
      }
      const decodeReceipt = this.mediaDecoder
        ? await this.mediaDecoder(stagedMaster, request)
        : await decodeRenderedMedia(stagedMaster, { ffmpegPath: this.ffmpegPath });
      if (decodeReceipt?.ok !== true || decodeReceipt?.fullAudioVideoDecode !== true) {
        fail("MEDIA_DECODE_FAILED", "Staged master did not produce an explicit full audio/video decode receipt", { decodeReceipt });
      }
      let posterArtifact = null;
      let posterSourceRealPath = "";
      if (request.posterPath) {
        const posterSource = await this.resolveSource(request.posterPath);
        posterSourceRealPath = posterSource.sourceRealPath;
        const posterImage = await detectPosterImage(posterSource.sourceRealPath);
        const posterDecode = this.imageDecoder
          ? await this.imageDecoder(posterSource.sourceRealPath, request)
          : await decodePosterImage(posterSource.sourceRealPath, { ffmpegPath: this.ffmpegPath });
        if (posterDecode?.ok !== true || posterDecode?.imageDecode !== true) fail("POSTER_IMAGE_INVALID", "Poster artifact did not produce a verified image decode receipt", { posterDecode });
        const stagedPoster = path.join(stageDirectory, relativePosterPath);
        await fsp.copyFile(posterSource.sourceRealPath, stagedPoster, fs.constants.COPYFILE_EXCL);
        posterArtifact = { role: "poster", path: relativePosterPath, sha256: await computeFileSha256(stagedPoster), bytes: (await fsp.stat(stagedPoster)).size, mediaType: posterImage.mediaType, format: posterImage.format, decodeVerified: true, decodeReceipt: { decoder: String(posterDecode.decoder || "injected"), imageDecode: true } };
      } else fail("POSTER_REQUIRED", "Every immutable Song Card edition requires a verified poster artifact");
      const publicTelemetry = portablePublicValue([
        ...preflight.telemetry,
        { type: "minted", at: createdAt, edition, semanticFingerprint },
      ]);
      const songId = headId.replace(/^song-card:/u, "") || String(request.song?.songId || request.song?.id || "");
      const domainHead = buildSongCardHead({
        songId,
        title: String(request.song?.title || ""),
        albumId: String(request.song?.albumId || ""),
        latestEdition: edition,
        latestEditionId: `${headId}:edition:${edition}`,
        semanticFingerprint,
        editions: [...(head?.editions || []).map((row) => `${headId}:edition:${row.edition}`), `${headId}:edition:${edition}`],
      });
      if (domainHead.id !== headId) fail("HEAD_IDENTITY_MISMATCH", "headId must be the canonical stable Song Card identity", { expected: domainHead.id, actual: headId });
      const masterArtifact = {
        role: "master",
        path: relativeMasterPath,
        sha256: stagedSha256,
        bytes: afterStat.size,
        durationMs: preflight.durationMs,
        hasAudio: true,
        hasVideo: true,
        decodeVerified: true,
        fullDecodeVerified: true,
        decodeReceipt: { decoder: String(decodeReceipt.decoder || "injected"), fullAudioVideoDecode: true },
        videoCodec: stagedProbe.videoCodec,
        audioCodec: stagedProbe.audioCodec,
        width: stagedProbe.width,
        height: stagedProbe.height,
      };
      const snapshot = request.snapshot || request.material || {};
      const portableSnapshot = canonicalMintValue(snapshot, { portable: true });
      const showGraph = portableSnapshot.showGraph || {};
      const director = showGraph.directorV2 || {};
      const portableContext = portablePublicValue(request.context || {});
      const portableRendererTruth = portablePublicValue(preflight.rendererTruth);
      const portableReceipts = portablePublicValue(request.receipts || { approvals: request.approvals || {}, rights: request.rights || {}, safety: request.safety || {} });
      const portableCaptions = portablePublicValue(request.captions || portableSnapshot.showGraph?.song?.lyricOverlay || {});
      const privateInputPaths = collectPrivateAbsolutePaths({
        idempotencyKey: suppliedIdempotencyKey,
        sourceVideoPath: request.sourceVideoPath || "",
        posterPath: request.posterPath || "",
        snapshot,
        timestampIndex: preflight.timestampIndex,
        context: request.context || {},
        rendererTruth: preflight.rendererTruth,
        receipts: request.receipts || {},
        captions: request.captions || {},
        telemetry: request.telemetry || [],
        lineage: request.lineage || {},
        rights: request.rights || {},
        approvals: request.approvals || {},
        safety: request.safety || {},
      });
      const priorEditionRecord = edition > 1 ? head?.editions?.find((row) => Number(row.edition) === edition - 1) : null;
      const priorLineage = edition > 1 ? (await this.readEdition(headId, edition - 1)).lineage : null;
      const changedFamilies = [...new Set((request.changedFamilies || request.semanticDiff?.changedFamilies || (edition === 1 ? ["initial"] : ["semantic"])).map(String))];
      let lineage;
      try {
        lineage = buildSongCardEditionLineage({
          headId,
          edition,
          semanticFingerprint,
          registryRevision: Object.keys(portableSnapshot.registry || {}).length ? portableSnapshot.registry : { id: `registry:${songId}`, revision: preflight.sourceRevision },
          editorSnapshot: Object.keys(portableSnapshot.editor || {}).length ? portableSnapshot.editor : { id: `editor:${preflight.sourceRevision}`, revision: preflight.sourceRevision },
          treatment: { id: director.treatmentId || `treatment:${songId}`, treatmentId: director.treatmentId || `treatment:${songId}`, sourceRevision: preflight.sourceRevision },
          variant: { id: director.variantId || `variant:${semanticFingerprint}`, variantId: director.variantId || `variant:${semanticFingerprint}`, variantHash: director.variantHash || semanticFingerprint },
          patches: portablePublicValue([...(Array.isArray(director.patches) ? director.patches : Array.isArray(portableSnapshot.editor?.patches) ? portableSnapshot.editor.patches : []), ...(request.lineage ? [{ kind: "upstream-lineage", lineage: request.lineage }] : [])]),
          showGraph: Object.keys(showGraph).length ? showGraph : { id: `show-graph:${semanticFingerprint}`, sourceRevision: preflight.sourceRevision },
          artifacts: [
            { ...masterArtifact, byteSize: masterArtifact.bytes, mimeType: "video/mp4" },
            { ...posterArtifact, byteSize: posterArtifact.bytes, mimeType: posterArtifact.mediaType },
          ],
          appearanceIndex: portableTimestampIndex,
          priorEdition: priorEditionRecord ? { id: `${headId}:edition:${edition - 1}`, headId, edition: edition - 1, semanticFingerprint: priorEditionRecord.semanticFingerprint, lineageHash: priorLineage?.lineageHash || null } : null,
          changedFamilies,
          incrementReason: request.incrementReason || request.semanticDiff?.summary || (edition === 1 ? "initial-edition" : "material-semantic-change"),
          mintedAt: createdAt,
        });
      } catch (error) {
        fail("LINEAGE_INCOMPLETE", error.message, { edition, headId });
      }
      const lineageValidation = validateSongCardEditionLineage(lineage);
      if (!lineageValidation.ok) fail("LINEAGE_INCOMPLETE", "Song Card edition lineage failed validation", { errors: lineageValidation.errors });
      const domainEdition = buildSongCardEdition({
        head: domainHead,
        edition,
        snapshot: portableSnapshot,
        semanticFingerprint,
        artifacts: [masterArtifact, ...(posterArtifact ? [posterArtifact] : [])],
        appearanceIndex: portableTimestampIndex,
        parentEditionId: edition > 1 ? `${headId}:edition:${edition - 1}` : null,
        lineage,
        telemetryRef: relativeTelemetryPath,
        approvals: canonicalMintValue(request.approvals || {}, { portable: true }),
        rights: canonicalMintValue(request.rights || {}, { portable: true }),
        publishStatus: request.publishStatus || "private-demo",
        mintedAt: createdAt,
      });
      const editionValidation = validateSongCardEdition(domainEdition);
      if (!editionValidation.ok) fail("EDITION_CONTRACT_INVALID", "Song Card edition failed the domain contract", { errors: editionValidation.errors });
      const publicManifest = {
        ...buildSongCardPublicManifest({
          head: domainHead,
          edition: domainEdition,
          files: {
            master: masterArtifact,
            ...(posterArtifact ? { poster: posterArtifact } : {}),
            appearanceIndex: { path: relativeTimestampPath, sha256: digest(portableTimestampIndex) },
            lineage: { path: relativeLineagePath, sha256: digest(lineage) },
            telemetry: { path: relativeTelemetryPath, sha256: digest(publicTelemetry), eventCount: publicTelemetry.length, perFrame: false },
            snapshot: { path: relativeSnapshotPath, sha256: digest(portableSnapshot) },
            showGraph: { path: relativeGraphPath, sha256: digest(showGraph) },
            context: { path: relativeContextPath, sha256: digest(portableContext) },
            rendererTruth: { path: relativeRendererTruthPath, sha256: digest(portableRendererTruth) },
            receipts: { path: relativeReceiptsPath, sha256: digest(portableReceipts) },
            captions: { path: relativeCaptionsPath, sha256: digest(portableCaptions) },
          },
          lineage,
        }),
        createdAt,
        sourceRevision: preflight.sourceRevision,
        render: masterArtifact,
        timestampIndex: { path: relativeTimestampPath, sha256: digest(portableTimestampIndex), intervalConvention: "half-open" },
        telemetry: { path: relativeTelemetryPath, sha256: digest(publicTelemetry), eventCount: publicTelemetry.length, perFrame: false },
        rendererTruth: {
          ok: preflight.rendererTruth.ok === true,
          cueReceiptCount: Number(preflight.rendererTruth.cueReceiptCount || 0),
          allStatesVisible: preflight.rendererTruth.allStatesVisible !== false,
          silentDefaultCount: Number(preflight.rendererTruth.silentDefaultCount || 0),
        },
        downstreamSync: { required: false, status: "pending", attempts: 0 },
        custody: { privateManifestPresent: true, publicPathsOnly: true },
      };
      assertNoAbsolutePaths(publicManifest);
      for (const [label, value] of Object.entries({
        timestampIndex: portableTimestampIndex,
        lineage,
        telemetry: publicTelemetry,
        snapshot: portableSnapshot,
        showGraph,
        context: portableContext,
        rendererTruth: portableRendererTruth,
        receipts: portableReceipts,
        captions: portableCaptions,
      })) assertNoAbsolutePaths(value, `bundle.${label}`);
      const custodyManifest = {
        ...buildSongCardPrivateManifest({
          head: domainHead,
          edition: domainEdition,
          custody: { transactionId, idempotencyKey, stagedOnSameVolume: true },
          sources: { renderedMaster: preflight.source.sourceRealPath, poster: posterSourceRealPath },
        }),
        transactionId,
        idempotencyKey,
        sourceAbsolutePath: preflight.source.sourceRealPath,
        posterSourceAbsolutePath: posterSourceRealPath,
        sourceStat: { size: preflight.beforeStat.size, mtimeMs: preflight.beforeStat.mtimeMs },
        sourceSha256: preflight.sourceSha256,
        sourceRevision: preflight.sourceRevision,
        sourceRevisionRechecked: true,
        privateInputAbsolutePaths: privateInputPaths,
        stagedOnSameVolume: true,
        finalAbsolutePath: finalDirectory,
        publicManifestSha256: digest(publicManifest),
      };
      const transaction = {
        schemaVersion: "hapa.song-card-mint-transaction.v1",
        transactionId,
        headId,
        edition,
        idempotencyKey,
        semanticFingerprint,
        createdAt,
        finalRelativePath: relativeEditionPath,
        publicManifestSha256: digest(publicManifest),
        renderSha256: stagedSha256,
        privateCustodySha256: digest(custodyManifest),
        sourceRevision: preflight.sourceRevision,
        publishStatus: request.publishStatus || "private-demo",
        lineageHash: lineage.lineageHash,
      };
      assertNoAbsolutePaths(transaction, "bundle.transaction");
      await Promise.all([
        atomicWriteJson(path.join(stageDirectory, "manifest.public.json"), publicManifest),
        atomicWriteJson(path.join(stageDirectory, ".custody.private.json"), custodyManifest),
        atomicWriteJson(path.join(stageDirectory, "timestamp-index.json"), portableTimestampIndex),
        atomicWriteJson(path.join(stageDirectory, "lineage.json"), lineage),
        atomicWriteJson(path.join(stageDirectory, "telemetry.json"), publicTelemetry),
        atomicWriteJson(path.join(stageDirectory, "transaction.json"), transaction),
        atomicWriteJson(path.join(stageDirectory, relativeSnapshotPath), portableSnapshot),
        atomicWriteJson(path.join(stageDirectory, relativeGraphPath), showGraph),
        atomicWriteJson(path.join(stageDirectory, relativeContextPath), portableContext),
        atomicWriteJson(path.join(stageDirectory, relativeRendererTruthPath), portableRendererTruth),
        atomicWriteJson(path.join(stageDirectory, relativeReceiptsPath), portableReceipts),
        atomicWriteJson(path.join(stageDirectory, relativeCaptionsPath), portableCaptions),
      ]);
      await fsyncDirectory(path.join(stageDirectory, "media"));
      await fsyncDirectory(stageDirectory);
      await this.appendWal("mint_staged", { transactionId, headId, edition, stageDirectory: relativePosix(this.root, stageDirectory) });
      await this.maybeCrash("stage", { transactionId, headId, edition });
      if (await this.abortRequested(request, "before-rename")) {
        await this.cancelTransactionCandidate({ request, transaction, currentDirectory: stageDirectory, stageDirectory, phase: "before-rename" });
      }
      if (await pathExists(finalDirectory)) fail("EDITION_EXISTS", `Edition ${edition} already exists for ${headId}`);
      await fsp.mkdir(path.dirname(finalDirectory), { recursive: true });
      await fsp.rename(stageDirectory, finalDirectory);
      await fsyncDirectory(path.dirname(finalDirectory));
      await this.appendWal("mint_renamed", { transactionId, headId, edition, editionPath: relativeEditionPath });
      await this.maybeCrash("rename", { transactionId, headId, edition });
      if (await this.abortRequested(request, "after-rename")) {
        await this.cancelTransactionCandidate({ request, transaction, currentDirectory: finalDirectory, stageDirectory, phase: "after-rename" });
      }
      await chmodTreeReadOnly(finalDirectory);
      const releaseLedger = await this.acquireLock("ledger-global");
      try {
        if (await this.abortRequested(request, "before-head-commit")) {
          await this.cancelTransactionCandidate({ request, transaction, currentDirectory: finalDirectory, stageDirectory, phase: "before-head-commit" });
        }
        ledger = await this.readLedger();
        head = ledger.heads[headId];
        if (Number(head?.latestEdition || 0) !== edition - 1) fail("CAS_MISMATCH", "Song Card head advanced during publish");
        if (request.expectedLedgerRevision !== undefined && Number(request.expectedLedgerRevision) !== Number(ledger.revision)) {
          fail("CAS_MISMATCH", "Mint ledger revision changed before publish", { expected: request.expectedLedgerRevision, actual: ledger.revision });
        }
        const editionRecord = {
          edition,
          semanticFingerprint,
          sourceRevision: preflight.sourceRevision,
          idempotencyKey,
          path: relativeEditionPath,
          manifestPath: `${relativeEditionPath}/manifest.public.json`,
          publicManifestSha256: digest(publicManifest),
          renderSha256: stagedSha256,
          privateCustodySha256: digest(custodyManifest),
          createdAt,
          status: "active",
          downstreamSync: "pending",
        };
        const nextHead = {
          schemaVersion: "hapa.song-card.v2",
          id: headId,
          headId,
          songId: String(request.song?.id || head?.songId || ""),
          version: Number(head?.version || 0) + 1,
          generation: Number(head?.generation || 0) + 1,
          latestEdition: edition,
          latestSemanticFingerprint: semanticFingerprint,
          updatedAt: this.now(),
          editions: [...(head?.editions || []), editionRecord],
          idempotency: { ...(head?.idempotency || {}), [idempotencyKey]: { semanticFingerprint, edition, transactionId } },
        };
        ledger.heads[headId] = nextHead;
        ledger.revision = Number(ledger.revision || 0) + 1;
        ledger.updatedAt = this.now();
        await atomicWriteJson(this.paths.heads, ledger);
        head = nextHead;
      } finally {
        await releaseLedger();
      }
      await this.maybeCrash("head", { transactionId, headId, edition });
      await this.ensurePublishedLifecycleEvent({ transaction, publicManifest, finalDirectory, lineage });
      await this.appendWal("mint_committed", { transactionId, headId, edition, publicManifestSha256: digest(publicManifest) });
      return { created: true, reason: "minted", head: cloneHeadForResult(head), edition, manifest: publicManifest };
    } finally {
      await releaseHead();
    }
  }

  async registerPublishedTransaction(transaction, { recoveredFrom }) {
    const headId = assertIdentifier(transaction.headId, "transaction.headId");
    const edition = Number(transaction.edition);
    const finalDirectory = this.editionDirectory(headId, edition);
    const publicManifest = await readJson(path.join(finalDirectory, "manifest.public.json"));
    const editionLineage = await readJson(path.join(finalDirectory, "lineage.json"));
    const actualManifestSha = digest(publicManifest);
    if (actualManifestSha !== transaction.publicManifestSha256) fail("RECOVERY_INTEGRITY_FAILED", "Recovered edition manifest hash does not match transaction");
    const actualRenderSha = await computeFileSha256(path.join(finalDirectory, "media", "master.mp4"));
    if (actualRenderSha !== transaction.renderSha256 || actualRenderSha !== publicManifest.render?.sha256) {
      fail("RECOVERY_INTEGRITY_FAILED", "Recovered edition render hash does not match transaction");
    }
    const lineageValidation = validateSongCardEditionLineage(editionLineage);
    if (!lineageValidation.ok) fail("RECOVERY_INTEGRITY_FAILED", "Recovered edition lineage is invalid", { errors: lineageValidation.errors });
    if (transaction.lineageHash && transaction.lineageHash !== editionLineage.lineageHash) fail("RECOVERY_INTEGRITY_FAILED", "Recovered lineage hash does not match the immutable lineage");
    if (transaction.publishStatus && publicManifest.edition?.publishStatus && transaction.publishStatus !== publicManifest.edition.publishStatus) fail("RECOVERY_INTEGRITY_FAILED", "Recovered publish status does not match the immutable manifest");
    await chmodTreeReadOnly(finalDirectory);
    const releaseLedger = await this.acquireLock("ledger-global");
    let nextHead;
    try {
      const ledger = await this.readLedger();
      const head = ledger.heads[headId];
      const prior = head?.idempotency?.[transaction.idempotencyKey];
      if (prior) {
        if (prior.semanticFingerprint !== transaction.semanticFingerprint) fail("IDEMPOTENCY_CONFLICT", "Recovery found a conflicting idempotency key");
        await this.ensurePublishedLifecycleEvent({ transaction, publicManifest, finalDirectory, lineage: editionLineage });
        return { recovered: false, reason: "already-registered", edition: prior.edition };
      }
      if (Number(head?.latestEdition || 0) !== edition - 1) fail("RECOVERY_CAS_MISMATCH", "Recovered edition is not the next head edition");
      const relativeEditionPath = relativePosix(this.root, finalDirectory);
      const editionRecord = {
        edition,
        semanticFingerprint: transaction.semanticFingerprint,
        sourceRevision: transaction.sourceRevision,
        idempotencyKey: transaction.idempotencyKey,
        path: relativeEditionPath,
        manifestPath: `${relativeEditionPath}/manifest.public.json`,
        publicManifestSha256: transaction.publicManifestSha256,
        renderSha256: transaction.renderSha256,
        privateCustodySha256: transaction.privateCustodySha256 || null,
        createdAt: transaction.createdAt,
        status: "active",
        downstreamSync: "pending",
      };
      nextHead = {
        schemaVersion: "hapa.song-card.v2",
        id: headId,
        headId,
        songId: String(publicManifest.song?.id || head?.songId || ""),
        version: Number(head?.version || 0) + 1,
        generation: Number(head?.generation || 0) + 1,
        latestEdition: edition,
        latestSemanticFingerprint: transaction.semanticFingerprint,
        updatedAt: this.now(),
        editions: [...(head?.editions || []), editionRecord],
        idempotency: { ...(head?.idempotency || {}), [transaction.idempotencyKey]: { semanticFingerprint: transaction.semanticFingerprint, edition, transactionId: transaction.transactionId } },
      };
      ledger.heads[headId] = nextHead;
      ledger.revision = Number(ledger.revision || 0) + 1;
      ledger.updatedAt = this.now();
      await atomicWriteJson(this.paths.heads, ledger);
    } finally {
      await releaseLedger();
    }
    await chmodTreeReadOnly(finalDirectory).catch(() => {});
    await this.ensurePublishedLifecycleEvent({ transaction, publicManifest, finalDirectory, lineage: editionLineage });
    await this.appendWal("mint_recovered", { transactionId: transaction.transactionId, headId, edition, recoveredFrom });
    return { recovered: true, reason: recoveredFrom, head: nextHead, edition };
  }

  async recover() {
    await this.initialize();
    const outcomes = [];
    const stagingEntries = await fsp.readdir(this.paths.staging, { withFileTypes: true });
    for (const entry of stagingEntries.filter((item) => item.isDirectory())) {
      const stageDirectory = path.join(this.paths.staging, entry.name);
      const transaction = await readJson(path.join(stageDirectory, "transaction.json"), null);
      if (!transaction) {
        outcomes.push({ recovered: false, reason: "incomplete-staging", path: relativePosix(this.root, stageDirectory) });
        continue;
      }
      if (transaction.status === "canceled") {
        outcomes.push({ recovered: false, reason: "canceled-staging", transactionId: transaction.transactionId, path: relativePosix(this.root, stageDirectory) });
        continue;
      }
      const releaseHead = await this.acquireLock(`head-${headStorageKey(transaction.headId)}`);
      try {
        const finalDirectory = this.editionDirectory(transaction.headId, transaction.edition);
        if (!(await pathExists(finalDirectory))) {
          await fsp.mkdir(path.dirname(finalDirectory), { recursive: true });
          await fsp.rename(stageDirectory, finalDirectory);
          await fsyncDirectory(path.dirname(finalDirectory));
        } else {
          await fsp.rm(stageDirectory, { recursive: true, force: true });
        }
        outcomes.push(await this.registerPublishedTransaction(transaction, { recoveredFrom: "staging" }));
      } catch (error) {
        outcomes.push({ recovered: false, reason: error.code || "recovery-error", message: error.message, transactionId: transaction.transactionId });
      } finally {
        await releaseHead();
      }
    }
    const headDirectories = await fsp.readdir(this.paths.editions, { withFileTypes: true });
    for (const headEntry of headDirectories.filter((item) => item.isDirectory())) {
      const headDirectory = path.join(this.paths.editions, headEntry.name);
      const editionEntries = await fsp.readdir(headDirectory, { withFileTypes: true });
      for (const editionEntry of editionEntries.filter((item) => item.isDirectory())) {
        const finalDirectory = path.join(headDirectory, editionEntry.name);
        const transaction = await readJson(path.join(finalDirectory, "transaction.json"), null);
        if (!transaction) continue;
        if (transaction.status === "canceled") {
          const canceledStage = path.join(this.paths.staging, `canceled-${transaction.transactionId}`);
          await chmodDirectoriesWritable(finalDirectory).catch(() => {});
          if (!(await pathExists(canceledStage))) await fsp.rename(finalDirectory, canceledStage);
          outcomes.push({ recovered: false, reason: "canceled-published-candidate", transactionId: transaction.transactionId, path: relativePosix(this.root, canceledStage) });
          continue;
        }
        const head = await this.getHead(transaction.headId);
        const registered = head?.editions?.some((row) => row.edition === Number(transaction.edition));
        if (registered) {
          try {
            await chmodTreeReadOnly(finalDirectory);
            await this.ensurePublishedLifecycleEvent({ transaction, finalDirectory });
            outcomes.push({ recovered: true, reason: "registered-permissions-repaired", headId: transaction.headId, edition: Number(transaction.edition) });
          } catch (error) {
            outcomes.push({ recovered: false, reason: error.code || "permission-repair-failed", message: error.message, transactionId: transaction.transactionId });
          }
          continue;
        }
        const releaseHead = await this.acquireLock(`head-${headStorageKey(transaction.headId)}`);
        try {
          outcomes.push(await this.registerPublishedTransaction(transaction, { recoveredFrom: "published-orphan" }));
        } catch (error) {
          outcomes.push({ recovered: false, reason: error.code || "recovery-error", message: error.message, transactionId: transaction.transactionId });
        } finally {
          await releaseHead();
        }
      }
    }
    return { ok: outcomes.every((row) => row.recovered !== false || ["already-registered", "canceled-staging", "canceled-published-candidate"].includes(row.reason)), outcomes };
  }

  async cleanupStaging({ olderThanMs = 24 * 60 * 60 * 1000 } = {}) {
    await this.initialize();
    const removed = [];
    const kept = [];
    const now = Date.now();
    for (const entry of await fsp.readdir(this.paths.staging, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const target = path.join(this.paths.staging, entry.name);
      const stat = await fsp.stat(target);
      if (olderThanMs <= 0 || now - stat.mtimeMs >= olderThanMs) {
        await fsp.rm(target, { recursive: true, force: true });
        removed.push(relativePosix(this.root, target));
      } else {
        kept.push(relativePosix(this.root, target));
      }
    }
    await this.appendWal("staging_retention", { olderThanMs, removed, keptCount: kept.length });
    return { removed, kept, editionDirectoriesTouched: 0 };
  }

  async updateEditionGovernance(headId, edition, status, reason) {
    const id = assertIdentifier(headId, "headId");
    const editionNumber = Number(edition);
    if (!Number.isInteger(editionNumber) || editionNumber < 1) fail("INVALID_ARGUMENT", "edition must be a positive integer");
    if (!reason || typeof reason !== "string") fail("INVALID_ARGUMENT", "A governance reason is required");
    const publicReason = portablePublicValue(reason) ?? "[private governance reason redacted]";
    const privateReasonDigest = digest(reason);
    const releaseHead = await this.acquireLock(`head-${headStorageKey(id)}`);
    const releaseLedger = await this.acquireLock("ledger-global");
    let result;
    let changed = false;
    try {
      const ledger = await this.readLedger();
      const head = ledger.heads[id];
      const target = head?.editions?.find((row) => row.edition === editionNumber);
      if (!target) fail("EDITION_NOT_FOUND", `Song Card ${id} edition ${editionNumber} was not found`);
      if (target.status !== status || target.statusReason !== publicReason || target.statusReasonPrivateDigest !== privateReasonDigest) {
        const changedAt = this.now();
        target.status = status;
        target.statusReason = publicReason;
        target.statusReasonPrivateDigest = privateReasonDigest;
        target.statusChangedAt = changedAt;
        head.version = Number(head.version || 0) + 1;
        head.updatedAt = changedAt;
        ledger.revision += 1;
        ledger.updatedAt = changedAt;
        await atomicWriteJson(this.paths.heads, ledger);
        changed = true;
      }
      result = structuredClone(target);
    } finally {
      await releaseLedger();
      await releaseHead();
    }
    if (changed) {
      await appendDurableNdjson(this.paths.governance, { schemaVersion: "hapa.song-card-governance-event.v1", eventId: crypto.randomUUID(), at: result.statusChangedAt, headId: id, edition: editionNumber, status, reason: publicReason });
      if (publicReason !== reason) await appendDurableNdjson(this.paths.governancePrivate, { schemaVersion: "hapa.song-card-private-governance-event.v1", eventId: crypto.randomUUID(), at: result.statusChangedAt, headId: id, edition: editionNumber, status, reason });
    }
    if (status === "revoked") {
      const { lineage } = await this.readEdition(id, editionNumber);
      const lineageValidation = validateSongCardEditionLineage(lineage);
      if (!lineageValidation.ok) fail("LIFECYCLE_LINEAGE_INVALID", "Revocation lifecycle event requires a valid immutable edition lineage", { errors: lineageValidation.errors });
      await this.appendLifecycleEventOnce({
        type: "revoked",
        headId: id,
        edition: editionNumber,
        lineageHash: lineage.lineageHash,
        reason: publicReason,
        actor: "song-card-mint-ledger",
        at: result.statusChangedAt,
      });
    }
    return result;
  }

  archiveEdition(headId, edition, { reason } = {}) {
    return this.updateEditionGovernance(headId, edition, "archived", reason);
  }

  revokeEdition(headId, edition, { reason } = {}) {
    return this.updateEditionGovernance(headId, edition, "revoked", reason);
  }

  async verifyPortableEditionSource(directory, { manifest, transaction, exportManifest = null } = {}) {
    assertNoAbsolutePaths(manifest, "import.manifest");
    assertNoAbsolutePaths(transaction, "import.transaction");
    if (exportManifest) assertNoAbsolutePaths(exportManifest, "import.exportManifest");
    if (transaction.schemaVersion !== "hapa.song-card-mint-transaction.v1") fail("IMPORT_INTEGRITY_FAILED", "Imported transaction schema is invalid");
    const manifestHeadId = String(manifest.head?.id || manifest.headId || "");
    const manifestEdition = Number(manifest.edition?.edition || manifest.edition || 0);
    const manifestSemanticFingerprint = String(manifest.edition?.semanticFingerprint || manifest.semanticFingerprint || "");
    if (transaction.headId !== manifestHeadId || Number(transaction.edition) !== manifestEdition || transaction.semanticFingerprint !== manifestSemanticFingerprint) {
      fail("IMPORT_INTEGRITY_FAILED", "Imported transaction identity does not match the manifest");
    }
    if (!/^idempotency:sha256:[a-f0-9]{64}$/u.test(String(transaction.idempotencyKey || ""))) {
      assertIdentifier(transaction.idempotencyKey, "transaction.idempotencyKey");
    }
    for (const [field, value] of [["publicManifestSha256", transaction.publicManifestSha256], ["renderSha256", transaction.renderSha256]]) {
      if (!/^[a-f0-9]{64}$/u.test(String(value || ""))) fail("IMPORT_INTEGRITY_FAILED", `Imported transaction ${field} is not a SHA-256 digest`);
    }
    if (!/^sha256:[a-f0-9]{64}$/u.test(String(transaction.lineageHash || ""))) fail("IMPORT_INTEGRITY_FAILED", "Imported transaction lineage hash is invalid");
    if (transaction.sourceRevision !== manifest.sourceRevision || transaction.publishStatus !== manifest.edition?.publishStatus || transaction.lineageHash !== manifest.lineage?.lineageHash) {
      fail("IMPORT_INTEGRITY_FAILED", "Imported transaction declarations do not match the manifest");
    }
    if (digest(manifest) !== transaction.publicManifestSha256) fail("IMPORT_INTEGRITY_FAILED", "Imported manifest does not match its transaction");
    const descriptors = [...Object.values(manifest.files || {}), manifest.telemetry]
      .filter((descriptor) => descriptor?.path)
      .filter((descriptor, index, rows) => rows.findIndex((candidate) => candidate.path === descriptor.path) === index);
    const expectedPaths = new Set(["manifest.public.json", "transaction.json", ".custody.private.json", ...(exportManifest ? ["export-manifest.json"] : []), ...descriptors.map((descriptor) => String(descriptor.path))]);
    for (const receiptRef of exportManifest?.migrationReceipts || []) expectedPaths.add(String(receiptRef.path || ""));
    for (const descriptor of descriptors) {
      assertRelativePublicPath(descriptor.path, "import.manifest.files.path");
      const absolute = path.resolve(directory, descriptor.path);
      if (!isInside(directory, absolute)) fail("IMPORT_INTEGRITY_FAILED", "Imported manifest file escapes its bundle");
      const stat = await fsp.lstat(absolute).catch(() => null);
      if (!stat?.isFile() || stat.isSymbolicLink()) fail("IMPORT_INTEGRITY_FAILED", `Imported file is missing or not regular: ${descriptor.path}`);
      const expectedSha = String(descriptor.sha256 || "").replace(/^sha256:/u, "");
      if (!expectedSha) fail("IMPORT_INTEGRITY_FAILED", `Imported file has no digest: ${descriptor.path}`);
      if (["master", "poster"].includes(String(descriptor.role || ""))) {
        if (await computeFileSha256(absolute) !== expectedSha) fail("IMPORT_INTEGRITY_FAILED", `Imported artifact hash mismatch: ${descriptor.path}`);
      } else {
        const value = await readJson(absolute);
        if (digest(value) !== expectedSha) fail("IMPORT_INTEGRITY_FAILED", `Imported support hash mismatch: ${descriptor.path}`);
        assertNoAbsolutePaths(value, `import.${descriptor.path}`);
      }
    }
    const inventory = await fileInventory(directory);
    const unexpected = inventory.filter((row) => !expectedPaths.has(row.path));
    if (unexpected.length) fail("IMPORT_INTEGRITY_FAILED", "Imported edition contains undeclared files", { paths: unexpected.map((row) => row.path) });
    if (transaction.renderSha256 !== manifest.render?.sha256) fail("IMPORT_INTEGRITY_FAILED", "Imported render declarations disagree");
    const timestampIndex = await readJson(path.join(directory, manifest.files.appearanceIndex.path));
    const lineage = await readJson(path.join(directory, manifest.files.lineage.path));
    validateTimestampIndex(timestampIndex, { durationMs: timestampIndex.durationMs });
    const lineageValidation = validateSongCardEditionLineage(lineage);
    if (!lineageValidation.ok) fail("IMPORT_INTEGRITY_FAILED", "Imported lineage does not validate", { errors: lineageValidation.errors });
    return { ok: true, inventory };
  }

  async verifyEditionBundleForTransfer(headId, edition) {
    const id = assertIdentifier(headId, "headId");
    const editionNumber = Number(edition);
    const head = await this.getHead(id);
    const headEdition = head?.editions?.find((row) => Number(row.edition) === editionNumber);
    if (!headEdition) fail("EDITION_NOT_FOUND", `Song Card ${id} edition ${editionNumber} is not registered`);
    const directory = this.editionDirectory(id, editionNumber);
    const manifest = await readJson(path.join(directory, "manifest.public.json"));
    const transaction = await readJson(path.join(directory, "transaction.json"));
    const custody = await readJson(path.join(directory, ".custody.private.json"));
    try {
      await this.verifyPortableEditionSource(directory, { manifest, transaction });
    } catch (error) {
      if (error instanceof MintLedgerError) fail("BUNDLE_INTEGRITY_FAILED", error.message, error.details);
      throw error;
    }
    if (digest(manifest) !== headEdition.publicManifestSha256 || digest(manifest) !== transaction.publicManifestSha256) {
      fail("BUNDLE_INTEGRITY_FAILED", "Immutable edition manifest no longer matches the committed head and transaction");
    }
    assertNoAbsolutePaths(manifest, "edition.manifest");
    assertNoAbsolutePaths(transaction, "edition.transaction");
    const idempotency = head.idempotency?.[transaction.idempotencyKey];
    if (!idempotency || idempotency.transactionId !== transaction.transactionId || Number(idempotency.edition) !== editionNumber || idempotency.semanticFingerprint !== transaction.semanticFingerprint) {
      fail("BUNDLE_INTEGRITY_FAILED", "Immutable edition transaction no longer matches the committed head");
    }
    const committedCustodySha = headEdition.privateCustodySha256 || transaction.privateCustodySha256 || "";
    if (headEdition.privateCustodySha256 && transaction.privateCustodySha256 && headEdition.privateCustodySha256 !== transaction.privateCustodySha256) {
      fail("BUNDLE_INTEGRITY_FAILED", "Private custody declarations disagree");
    }
    if (committedCustodySha && digest(custody) !== committedCustodySha) fail("BUNDLE_INTEGRITY_FAILED", "Private custody manifest no longer matches the committed edition");
    if (custody.schemaVersion !== SONG_CARD_MINT_PRIVATE_CUSTODY_SCHEMA || custody.sourceSha256 !== manifest.render?.sha256) {
      fail("BUNDLE_INTEGRITY_FAILED", "Private custody manifest is invalid");
    }
    const descriptors = [...Object.values(manifest.files || {}), manifest.telemetry]
      .filter((descriptor) => descriptor?.path)
      .filter((descriptor, index, rows) => rows.findIndex((candidate) => candidate.path === descriptor.path) === index);
    const expectedPaths = new Set(["manifest.public.json", "transaction.json", ".custody.private.json", ...descriptors.map((descriptor) => String(descriptor.path))]);
    for (const descriptor of descriptors) {
      assertRelativePublicPath(descriptor.path, "manifest.files.path");
      const absolute = path.resolve(directory, descriptor.path);
      if (!isInside(directory, absolute)) fail("BUNDLE_INTEGRITY_FAILED", "Manifest file escaped the immutable edition directory");
      const stat = await fsp.lstat(absolute).catch(() => null);
      if (!stat?.isFile() || stat.isSymbolicLink()) fail("BUNDLE_INTEGRITY_FAILED", `Immutable edition file is missing or not regular: ${descriptor.path}`);
      const expectedSha = String(descriptor.sha256 || "").replace(/^sha256:/u, "");
      if (!expectedSha) fail("BUNDLE_INTEGRITY_FAILED", `Immutable edition file lacks a digest: ${descriptor.path}`);
      if (["master", "poster"].includes(String(descriptor.role || ""))) {
        if (await computeFileSha256(absolute) !== expectedSha) fail("BUNDLE_INTEGRITY_FAILED", `Immutable artifact hash mismatch: ${descriptor.path}`);
      } else {
        const value = await readJson(absolute);
        if (digest(value) !== expectedSha) fail("BUNDLE_INTEGRITY_FAILED", `Immutable support hash mismatch: ${descriptor.path}`);
        assertNoAbsolutePaths(value, `edition.${descriptor.path}`);
      }
    }
    if (transaction.renderSha256 !== manifest.render?.sha256 || transaction.renderSha256 !== headEdition.renderSha256) {
      fail("BUNDLE_INTEGRITY_FAILED", "Immutable render declarations disagree");
    }
    const inventory = await fileInventory(directory);
    const unexpected = inventory.filter((row) => !expectedPaths.has(row.path));
    if (unexpected.length) fail("BUNDLE_INTEGRITY_FAILED", "Immutable edition contains undeclared files", { paths: unexpected.map((row) => row.path) });
    const timestampIndex = await readJson(path.join(directory, manifest.files.appearanceIndex.path));
    const lineage = await readJson(path.join(directory, manifest.files.lineage.path));
    validateTimestampIndex(timestampIndex, { durationMs: timestampIndex.durationMs });
    const lineageValidation = validateSongCardEditionLineage(lineage);
    if (!lineageValidation.ok) fail("BUNDLE_INTEGRITY_FAILED", "Immutable lineage no longer validates", { errors: lineageValidation.errors });
    return { ok: true, head, headEdition, manifest, transaction, inventory };
  }

  async exportEdition(headId, edition, destination) {
    await this.initialize();
    const id = assertIdentifier(headId, "headId");
    const editionNumber = Number(edition);
    const source = this.editionDirectory(id, editionNumber);
    if (!(await pathExists(source))) fail("EDITION_NOT_FOUND", "Edition does not exist");
    const target = path.resolve(destination);
    const [canonicalRoot, canonicalTarget] = await Promise.all([fsp.realpath(this.root), canonicalProspectivePath(target)]);
    if (isInside(canonicalRoot, canonicalTarget)) fail("INVALID_EXPORT_TARGET", "Edition exports must be outside the live mint ledger");
    if (await pathExists(target)) fail("EXPORT_EXISTS", "Export target already exists");
    const releaseHead = await this.acquireLock(`head-${headStorageKey(id)}`);
    try {
      const head = await this.getHead(id);
      const governance = head?.editions?.find((row) => Number(row.edition) === editionNumber);
      if (!governance) fail("EDITION_NOT_FOUND", `Song Card ${id} edition ${editionNumber} is not registered`);
      await this.verifyEditionBundleForTransfer(id, editionNumber);
      await copyTree(source, target);
      await chmodDirectoriesWritable(target);
      await fsp.rm(path.join(target, ".custody.private.json"), { force: true });
      const migrationReceipts = [];
      for (const name of await fsp.readdir(this.paths.migrations).catch(() => [])) {
        if (!name.endsWith(".json")) continue;
        const receipt = await readJson(path.join(this.paths.migrations, name), null);
        if (receipt?.targetHeadId !== id || Number(receipt?.targetEdition) !== editionNumber) continue;
        const allowedReceiptKeys = new Set(["schemaVersion", "migrationId", "migratedAt", "sourceSchema", "sourceSha256", "targetHeadId", "targetEdition", "created"]);
        if (receipt.schemaVersion !== SONG_CARD_MIGRATION_RECEIPT_SCHEMA || Object.keys(receipt).some((key) => !allowedReceiptKeys.has(key))) fail("MIGRATION_RECEIPT_INVALID", `Migration receipt ${name} is malformed`);
        assertNoAbsolutePaths(receipt, `migrationReceipt.${name}`);
        const receiptDirectory = path.join(target, "migration-receipts");
        await fsp.mkdir(receiptDirectory, { recursive: true });
        await atomicWriteJson(path.join(receiptDirectory, path.basename(name)), receipt);
        migrationReceipts.push({ path: `migration-receipts/${path.basename(name)}`, migrationId: receipt.migrationId, sourceSha256: receipt.sourceSha256, receiptSha256: digest(receipt) });
      }
      const manifest = await readJson(path.join(target, "manifest.public.json"));
      const renderSha256 = await computeFileSha256(path.join(target, "media", "master.mp4"));
      if (renderSha256 !== manifest.render?.sha256) fail("EXPORT_INTEGRITY_FAILED", "Exported render hash does not match manifest");
      const files = await fileInventory(target, { exclude: new Set(["export-manifest.json"]) });
      const publicGovernanceReason = portablePublicValue(governance.statusReason || "") ?? "[private governance reason redacted]";
      const exportManifestBody = {
        schemaVersion: "hapa.song-card.edition-export.v1",
        exportedAt: this.now(),
        headId: id,
        edition: editionNumber,
        governance: { status: governance.status || "active", reason: publicGovernanceReason, changedAt: governance.statusChangedAt || governance.createdAt || null },
        migrationReceipts,
        files,
      };
      const exportManifest = { ...exportManifestBody, bundleDigest: digest(exportManifestBody) };
      assertNoAbsolutePaths(exportManifest, "exportManifest");
      await atomicWriteJson(path.join(target, "export-manifest.json"), exportManifest);
      await chmodTreeReadOnly(target);
      return { destination: target, headId: id, edition: editionNumber, renderSha256, governance: exportManifest.governance, bundleDigest: exportManifest.bundleDigest };
    } finally {
      await releaseHead();
    }
  }

  async importEdition(sourceDirectory) {
    await this.initialize();
    const source = path.resolve(sourceDirectory);
    if (isInside(await fsp.realpath(this.root), await fsp.realpath(source))) fail("INVALID_IMPORT_SOURCE", "Edition imports must come from outside the live mint ledger");
    const manifest = await readJson(path.join(source, "manifest.public.json"));
    const transaction = await readJson(path.join(source, "transaction.json"));
    const exportManifest = await readJson(path.join(source, "export-manifest.json"), null);
    if (exportManifest) {
      const { bundleDigest, ...exportManifestBody } = exportManifest;
      if (exportManifest.schemaVersion !== "hapa.song-card.edition-export.v1" || bundleDigest !== digest(exportManifestBody)) {
        fail("IMPORT_INTEGRITY_FAILED", "Edition export manifest is invalid");
      }
      await verifyFileInventory(source, exportManifest.files, { exclude: new Set(["export-manifest.json"]) });
    } else await fileInventory(source);
    if (manifest.schemaVersion !== SONG_CARD_MINT_PUBLIC_MANIFEST_SCHEMA) fail("IMPORT_SCHEMA_INVALID", "Import is not a Song Card edition bundle");
    await this.verifyPortableEditionSource(source, { manifest, transaction, exportManifest });
    if (!/^idempotency:sha256:[a-f0-9]{64}$/u.test(String(transaction.idempotencyKey || ""))) transaction.idempotencyKey = songCardIdempotencyStorageKey(transaction.idempotencyKey);
    const renderSha256 = await computeFileSha256(path.join(source, "media", "master.mp4"));
    if (renderSha256 !== manifest.render?.sha256 || transaction.renderSha256 !== renderSha256) fail("IMPORT_INTEGRITY_FAILED", "Imported render hash does not match manifest");
    const importedHeadId = assertIdentifier(manifest.head?.id || manifest.headId, "manifest.head.id");
    const importedEdition = Number(manifest.edition?.edition || manifest.edition);
    const releaseHead = await this.acquireLock(`head-${headStorageKey(importedHeadId)}`);
    let result;
    try {
      const target = this.editionDirectory(importedHeadId, importedEdition);
      if (!(await pathExists(target))) {
        const staging = path.join(this.paths.staging, `import-${crypto.randomUUID()}`);
        await copyTree(source, staging);
        await chmodDirectoriesWritable(staging);
        const importedCustody = {
          schemaVersion: SONG_CARD_MINT_PRIVATE_CUSTODY_SCHEMA,
          headId: importedHeadId,
          editionId: `${importedHeadId}:edition:${importedEdition}`,
          custody: { imported: true, importedAt: this.now() },
          sources: { importBundleAbsolutePath: source },
          sourceSha256: renderSha256,
        };
        await atomicWriteJson(path.join(staging, ".custody.private.json"), importedCustody);
        transaction.privateCustodySha256 = digest(importedCustody);
        await atomicWriteJson(path.join(staging, "transaction.json"), transaction);
        await fsp.rm(path.join(staging, "export-manifest.json"), { force: true });
        await fsp.rm(path.join(staging, "migration-receipts"), { recursive: true, force: true });
        await fsp.mkdir(path.dirname(target), { recursive: true });
        await fsp.rename(staging, target);
      }
      result = await this.registerPublishedTransaction(transaction, { recoveredFrom: "import" });
    } finally {
      await releaseHead();
    }
    for (const receiptRef of exportManifest?.migrationReceipts || []) {
      const receiptName = path.basename(String(receiptRef.path || ""));
      if (!receiptName.endsWith(".json")) fail("IMPORT_INTEGRITY_FAILED", "Migration receipt reference is malformed");
      const receipt = await readJson(path.join(source, "migration-receipts", receiptName));
      const allowedReceiptKeys = new Set(["schemaVersion", "migrationId", "migratedAt", "sourceSchema", "sourceSha256", "targetHeadId", "targetEdition", "created"]);
      if (receipt.schemaVersion !== SONG_CARD_MIGRATION_RECEIPT_SCHEMA || Object.keys(receipt).some((key) => !allowedReceiptKeys.has(key)) || digest(receipt) !== receiptRef.receiptSha256) fail("IMPORT_INTEGRITY_FAILED", "Migration receipt integrity is invalid");
      assertNoAbsolutePaths(receipt, `import.migrationReceipt.${receiptName}`);
      if (receipt.targetHeadId !== importedHeadId || Number(receipt.targetEdition) !== importedEdition) fail("IMPORT_INTEGRITY_FAILED", "Migration receipt targets a different edition");
      const destination = path.join(this.paths.migrations, receiptName);
      if (!(await pathExists(destination))) {
        await atomicWriteJson(destination, receipt);
        await fsp.chmod(destination, 0o444);
      }
    }
    const importedStatus = exportManifest?.governance?.status || "active";
    if (["archived", "revoked"].includes(importedStatus)) {
      const currentHead = await this.getHead(importedHeadId);
      const currentStatus = currentHead?.editions?.find((row) => Number(row.edition) === importedEdition)?.status;
      if (currentStatus !== importedStatus) {
        await this.updateEditionGovernance(importedHeadId, importedEdition, importedStatus, exportManifest.governance.reason || "imported-governance-state");
      }
    }
    return { ...result, governance: { status: importedStatus, reason: exportManifest?.governance?.reason || "" } };
  }

  async backup(destination) {
    await this.initialize();
    const target = path.resolve(destination);
    const [canonicalRoot, canonicalTarget] = await Promise.all([fsp.realpath(this.root), canonicalProspectivePath(target)]);
    if (isInside(canonicalRoot, canonicalTarget)) fail("INVALID_BACKUP_TARGET", "Backup must be outside the live mint ledger");
    if (await pathExists(target)) fail("BACKUP_EXISTS", "Backup target already exists");
    const releaseLedger = await this.acquireLock("ledger-global");
    try {
      const committed = await this.readLedger();
      for (const [headId, head] of Object.entries(committed.heads || {})) {
        for (const edition of head.editions || []) await this.verifyEditionBundleForTransfer(headId, edition.edition);
      }
      await fsp.mkdir(target, { recursive: false });
      await copyTree(this.paths.editions, path.join(target, "editions"));
      await fsp.copyFile(this.paths.heads, path.join(target, "heads.json"));
      if (await pathExists(this.paths.wal)) await fsp.copyFile(this.paths.wal, path.join(target, "mint.wal.ndjson"));
      if (await pathExists(this.paths.governance)) await fsp.copyFile(this.paths.governance, path.join(target, "governance.ndjson"));
      if (await pathExists(this.paths.governancePrivate)) await fsp.copyFile(this.paths.governancePrivate, path.join(target, ".governance.private.ndjson"));
      if (await pathExists(this.paths.migrations)) await copyTree(this.paths.migrations, path.join(target, "migrations"));
      if (await pathExists(path.join(this.root, "plans"))) await copyTree(path.join(this.root, "plans"), path.join(target, "plans"));
      if (await pathExists(path.join(this.root, "events.ndjson"))) await fsp.copyFile(path.join(this.root, "events.ndjson"), path.join(target, "events.ndjson"));
      const files = await fileInventory(target, { exclude: new Set(["backup.json"]) });
      await atomicWriteJson(path.join(target, "backup.json"), {
        schemaVersion: "hapa.song-card-mint-backup.v1",
        createdAt: this.now(),
        ledgerSha256: await computeFileSha256(this.paths.heads),
        files,
        bundleDigest: digest(files),
      });
    } finally {
      await releaseLedger();
    }
    return { destination: target };
  }

  async restore(backupDirectory) {
    await this.initialize();
    const source = path.resolve(backupDirectory);
    if (isInside(await fsp.realpath(this.root), await fsp.realpath(source))) fail("INVALID_RESTORE_SOURCE", "Restore source must be outside the live mint ledger");
    const backupManifest = await readJson(path.join(source, "backup.json"));
    if (backupManifest.schemaVersion !== "hapa.song-card-mint-backup.v1") fail("BACKUP_SCHEMA_INVALID", "Backup manifest is invalid");
    if (backupManifest.bundleDigest !== digest(backupManifest.files || [])) fail("BACKUP_INTEGRITY_FAILED", "Backup inventory digest does not match manifest");
    await verifyFileInventory(source, backupManifest.files, { exclude: new Set(["backup.json"]) }).catch((error) => {
      if (error instanceof MintLedgerError) fail("BACKUP_INTEGRITY_FAILED", error.message, error.details);
      throw error;
    });
    const sourceLedgerPath = path.join(source, "heads.json");
    if (await computeFileSha256(sourceLedgerPath) !== backupManifest.ledgerSha256) fail("BACKUP_INTEGRITY_FAILED", "Backup ledger hash does not match manifest");
    const sourceLedger = await readJson(sourceLedgerPath);
    const releaseLedger = await this.acquireLock("ledger-global");
    try {
      const current = await this.readLedger();
      if (Object.keys(current.heads).length > 0) fail("RESTORE_NOT_EMPTY", "Restore requires an empty live ledger; use importEdition for merges");
      await fsp.rm(this.paths.editions, { recursive: true, force: true });
      await copyTree(path.join(source, "editions"), this.paths.editions);
      await atomicWriteJson(this.paths.heads, sourceLedger);
      if (await pathExists(path.join(source, "mint.wal.ndjson"))) await fsp.copyFile(path.join(source, "mint.wal.ndjson"), this.paths.wal);
      if (await pathExists(path.join(source, "governance.ndjson"))) await fsp.copyFile(path.join(source, "governance.ndjson"), this.paths.governance);
      if (await pathExists(path.join(source, ".governance.private.ndjson"))) await fsp.copyFile(path.join(source, ".governance.private.ndjson"), this.paths.governancePrivate);
      if (await pathExists(path.join(source, "migrations"))) {
        await fsp.rm(this.paths.migrations, { recursive: true, force: true });
        await copyTree(path.join(source, "migrations"), this.paths.migrations);
      }
      if (await pathExists(path.join(source, "plans"))) {
        await fsp.rm(path.join(this.root, "plans"), { recursive: true, force: true });
        await copyTree(path.join(source, "plans"), path.join(this.root, "plans"));
      }
      if (await pathExists(path.join(source, "events.ndjson"))) await fsp.copyFile(path.join(source, "events.ndjson"), path.join(this.root, "events.ndjson"));
    } finally {
      await releaseLedger();
    }
    return { restored: true, headCount: Object.keys(sourceLedger.heads).length };
  }

  async migrateLegacyCard({ legacyCard, mintRequest } = {}) {
    if (!isObject(legacyCard) || !isObject(mintRequest)) fail("INVALID_ARGUMENT", "legacyCard and mintRequest are required");
    const sourceSchema = String(legacyCard.schemaVersion || legacyCard.cardType || "unknown");
    const accepted = sourceSchema === "hapa.song-card.v1" || /hapa\.music-viz\.native-show-card\.v[12]/u.test(sourceSchema);
    if (!accepted) fail("MIGRATION_SCHEMA_UNSUPPORTED", `Unsupported legacy Song Card schema: ${sourceSchema}`);
    if (/hapa\.music-viz\.native-show-card\.v[12]/u.test(sourceSchema) && !legacyHasRenderedVideo(legacyCard)) {
      fail("MIGRATION_EMPTY_NATIVE_CARD", "Empty-video Native Show Cards remain compatibility heads and cannot become minted editions");
    }
    const legacyHash = digest(legacyCard);
    const migrationId = `migration-${legacyHash.slice(0, 32)}`;
    const lineageNode = { id: `legacy:${legacyHash}`, kind: "legacy-card", schemaVersion: sourceSchema, sha256: legacyHash };
    const result = await this.mint({
      ...mintRequest,
      idempotencyKey: mintRequest.idempotencyKey || migrationId,
      lineage: {
        nodes: [...(mintRequest.lineage?.nodes || []), lineageNode],
        edges: [...(mintRequest.lineage?.edges || [])],
      },
      telemetry: [...(mintRequest.telemetry || []), { type: "legacy-migration", sourceSchema }],
    });
    const receipt = {
      schemaVersion: SONG_CARD_MIGRATION_RECEIPT_SCHEMA,
      migrationId,
      migratedAt: this.now(),
      sourceSchema,
      sourceSha256: legacyHash,
      targetHeadId: mintRequest.headId,
      targetEdition: result.edition,
      created: result.created,
    };
    const receiptPath = path.join(this.paths.migrations, `${migrationId}.json`);
    if (!(await pathExists(receiptPath))) {
      await atomicWriteJson(receiptPath, receipt);
      await fsp.chmod(receiptPath, 0o444);
    }
    return { ...result, migrationReceipt: receipt, migrationReceiptPath: relativePosix(this.root, receiptPath) };
  }
}

export function createSongCardMintLedger(options) {
  return new SongCardMintLedger(options);
}
