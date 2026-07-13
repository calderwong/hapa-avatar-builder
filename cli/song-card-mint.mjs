#!/usr/bin/env node
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSongCardHead,
  buildSongCardMintSnapshot,
  compileSongCardAppearanceIndex,
  diffSongCardMintSnapshots,
  fingerprintSongCardMintSnapshot,
  querySongCardAppearances,
  validateSongCardEdition,
} from "../src/domain/song-card-mint.js";
import {
  MintLedgerError,
  SongCardMintLedger,
  computeFileSha256,
  validateLineage,
  validateTimestampIndex,
} from "../server/song-card-mint-ledger.mjs";
import { SongCardMintController } from "../server/song-card-mint-controller.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..");
const DEFAULT_MINT_ROOT = path.join(APP_ROOT, "data", "song-card-mints");
const MUTATING_COMMANDS = new Set([
  "mint",
  "recover",
  "cleanup-staging",
  "archive",
  "revoke",
  "export",
  "import",
  "backup",
  "restore",
  "migrate",
]);

class CliError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new CliError(code, message, details);
}

function parseOptions(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      options._.push(...argv.slice(index + 1));
      break;
    }
    if (!argument.startsWith("--")) {
      options._.push(argument);
      continue;
    }
    const equals = argument.indexOf("=");
    const key = argument.slice(2, equals < 0 ? undefined : equals);
    if (!key) fail("INVALID_OPTION", "Empty command-line option");
    if (equals >= 0) {
      options[key] = argument.slice(equals + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function ledgerDigest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function safeTokenEqual(left, right) {
  const leftBytes = Buffer.from(String(left || ""));
  const rightBytes = Buffer.from(String(right || ""));
  return leftBytes.length > 0 && leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function authorizeMutation(command, options, env = process.env) {
  if (!MUTATING_COMMANDS.has(command)) return;
  if (options.apply !== true) {
    fail("APPLY_REQUIRED", `${command} changes Song Card mint state; rerun with --apply after reviewing the command.`);
  }
  const configuredTokens = [env.HAPA_SONG_CARD_MINT_TOKEN, env.HAPA_AVATAR_ADMIN_TOKEN].filter((value) => typeof value === "string" && value.length > 0);
  if (!configuredTokens.length) {
    fail("MINT_AUTH_NOT_CONFIGURED", "Set HAPA_SONG_CARD_MINT_TOKEN or HAPA_AVATAR_ADMIN_TOKEN before changing Song Card mint state.");
  }
  const supplied = typeof options.token === "string" ? options.token : "";
  if (!supplied || !configuredTokens.some((candidate) => safeTokenEqual(supplied, candidate))) {
    fail("MINT_AUTH_FAILED", "--token must match HAPA_SONG_CARD_MINT_TOKEN or HAPA_AVATAR_ADMIN_TOKEN.");
  }
}

function integerOption(value, field, { minimum = 0, required = false } = {}) {
  if ((value === undefined || value === null || value === "") && !required) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) fail("INVALID_OPTION", `${field} must be an integer greater than or equal to ${minimum}.`, { field, value });
  return number;
}

function requiredOption(options, key, command) {
  const value = options[key];
  if (typeof value !== "string" || !value.trim()) fail("MISSING_OPTION", `${command} requires --${key} <value>.`, { option: key });
  return value.trim();
}

async function readJsonFile(filePath, field) {
  if (!filePath) fail("MISSING_OPTION", `${field} is required.`);
  const resolved = path.resolve(String(filePath));
  try {
    return JSON.parse(await fsp.readFile(resolved, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") fail("FILE_NOT_FOUND", `${field} does not exist: ${resolved}`, { field, path: resolved });
    if (error instanceof SyntaxError) fail("INVALID_JSON", `${field} is not valid JSON: ${resolved}`, { field, path: resolved });
    throw error;
  }
}

function songIdentity(options, project = {}, showGraph = {}) {
  const requested = String(options["song-id"] || project.song_id || project.songId || project.song?.id || showGraph.song?.id || "").trim();
  if (!requested) fail("MISSING_OPTION", "This command requires --song-id <song-id>.", { option: "song-id" });
  const songId = requested.replace(/^song-card:/u, "");
  const head = buildSongCardHead({ songId });
  return { songId: head.songId, headId: head.id };
}

function editionOption(options, head, { required = false } = {}) {
  const value = options.edition ?? options._[0] ?? head?.latestEdition;
  return integerOption(value, "edition", { minimum: 1, required });
}

function configuredRoot(options) {
  return path.resolve(String(options.root || process.env.HAPA_SONG_CARD_MINT_ROOT || DEFAULT_MINT_ROOT));
}

function createLedger(options, sourcePaths = []) {
  const roots = [process.cwd(), APP_ROOT, ...sourcePaths.filter(Boolean).map((entry) => path.dirname(path.resolve(entry)))];
  return new SongCardMintLedger({ root: configuredRoot(options), allowedSourceRoots: [...new Set(roots)] });
}

function createController(options, sourcePaths = []) {
  const roots = [process.cwd(), APP_ROOT, ...sourcePaths.filter(Boolean).map((entry) => path.dirname(path.resolve(entry)))];
  return new SongCardMintController({ root: configuredRoot(options), allowedSourceRoots: [...new Set(roots)] });
}

async function fileDescriptor(filePath, role) {
  if (!filePath) return null;
  const resolved = path.resolve(String(filePath));
  let stat;
  try {
    stat = await fsp.stat(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") fail("FILE_NOT_FOUND", `${role} does not exist: ${resolved}`, { role, path: resolved });
    throw error;
  }
  if (!stat.isFile()) fail("INVALID_FILE", `${role} must be a regular file: ${resolved}`, { role, path: resolved });
  return { role, sha256: await computeFileSha256(resolved), bytes: stat.size, path: resolved };
}

async function buildControllerRequest(options, command = "plan") {
  const projectPath = requiredOption(options, "project", command);
  const graphPath = requiredOption(options, "graph", command);
  const [project, showGraph, master, poster] = await Promise.all([
    readJsonFile(projectPath, "project"),
    readJsonFile(graphPath, "graph"),
    fileDescriptor(options.master, "master"),
    fileDescriptor(options.poster, "poster"),
  ]);
  const { songId, headId } = songIdentity(options, project, showGraph);
  const song = {
    ...(project.song || {}),
    id: songId,
    songId,
    title: project.song?.title || project.song_title || project.title || showGraph.song?.title || "",
    albumId: project.song?.albumId || project.album_id || showGraph.song?.albumId || "",
    attribution: project.song?.attribution || project.attribution,
    authorship: project.song?.authorship || project.authorship,
  };
  const rendererTruth = project.rendererTruth || project.renderer_truth || showGraph.rendererTruth || showGraph.truth || null;
  const rights = project.rights || showGraph.rights || {};
  const approvals = project.approvals || showGraph.approvals || {};
  const safety = project.safety || project.visualSafety || showGraph.safety || {};
  const cardSnapshots = project.cardSnapshots || project.card_snapshots || showGraph.cardSnapshots || {};
  const body = {
    song,
    project,
    showGraph,
    render: { ...(project.render || {}), ...(showGraph.render || {}) },
    renderMasterPath: master?.path || "",
    posterPath: poster?.path || "",
    rendererTruth,
    rights,
    approvals,
    safety,
    cardSnapshots,
    registry: project.registry || showGraph.registry || {},
    context: project.context || project.songContext || {},
    captions: project.captions || showGraph.song?.lyricOverlay || project.timed_lyrics || null,
    receipts: project.receipts || { approvals, rights, safety },
    gate: String(options.gate || "private-demo"),
  };
  return {
    controller: createController(options, [master?.path, poster?.path, projectPath, graphPath]),
    body,
    songId,
    headId,
    master,
    poster,
  };
}

function releaseBlockers({ gate, rights, approvals, rendererTruth, safety, master, appearanceIndex }) {
  const blockers = [];
  if (rendererTruth?.ok !== true || Number(rendererTruth?.silentDefaultCount || 0) !== 0) blockers.push({ code: "RENDERER_TRUTH_REQUIRED", message: "Mint requires explicit renderer truth with zero silent defaults." });
  if (appearanceIndex?.gaps?.length) blockers.push({ code: "TEMPORAL_COVERAGE_GAP", message: "Every rendered interval must have an explicit appearance.", gaps: appearanceIndex.gaps });
  if (gate !== "public-gate") return blockers;
  const licensing = String(rights?.licensingStatus || rights?.status || "").toLowerCase();
  if (!["cleared", "licensed", "operator-authored", "public-domain"].includes(licensing)) blockers.push({ code: "RIGHTS_NOT_CLEARED", message: "Public mint requires cleared rights." });
  const consent = String(rights?.consentStatus || "").toLowerCase();
  if (!consent || consent === "unknown") blockers.push({ code: "CONSENT_NOT_CLEARED", message: "Public mint requires known consent status." });
  if (approvals?.creative !== true) blockers.push({ code: "CREATIVE_APPROVAL_REQUIRED", message: "Public mint requires explicit creative approval." });
  if (approvals?.technical !== true) blockers.push({ code: "TECHNICAL_APPROVAL_REQUIRED", message: "Public mint requires explicit technical approval." });
  if (rendererTruth?.releaseSafe === false || rendererTruth?.truthStatus === "blocked") blockers.push({ code: "RENDERER_TRUTH_BLOCKED", message: "Renderer truth blocks public release." });
  if (safety?.ok !== true) blockers.push({ code: "SAFETY_RECEIPT_REQUIRED", message: "Public mint requires an explicit passing safety receipt." });
  if (!master) blockers.push({ code: "RENDER_MASTER_REQUIRED", message: "Public mint requires a rendered master." });
  return blockers;
}

async function buildPlan(options) {
  const projectPath = requiredOption(options, "project", "plan");
  const graphPath = requiredOption(options, "graph", "plan");
  const [project, showGraph, master, poster] = await Promise.all([
    readJsonFile(projectPath, "project"),
    readJsonFile(graphPath, "graph"),
    fileDescriptor(options.master, "master"),
    fileDescriptor(options.poster, "poster"),
  ]);
  const { songId, headId } = songIdentity(options, project, showGraph);
  const ledger = createLedger(options, [options.master, options.poster, projectPath, graphPath]);
  const head = await ledger.getHead(headId);
  let beforeSnapshot = null;
  if (head?.latestEdition) {
    const latest = await ledger.readEdition(headId, head.latestEdition);
    beforeSnapshot = latest.snapshot || latest.manifest.edition?.snapshot || latest.manifest.snapshot || null;
  }
  const song = {
    ...(project.song || {}),
    id: songId,
    songId,
    title: project.song?.title || project.song_title || project.title || showGraph.song?.title || "",
    albumId: project.song?.albumId || project.album_id || showGraph.song?.albumId || "",
    attribution: project.song?.attribution || project.attribution,
    authorship: project.song?.authorship || project.authorship,
  };
  const render = {
    ...(project.render || {}),
    ...(showGraph.render || {}),
    masterSha256: master?.sha256 || project.render?.masterSha256 || null,
    masterBytes: master?.bytes || project.render?.masterBytes || null,
    posterSha256: poster?.sha256 || project.render?.posterSha256 || null,
    posterBytes: poster?.bytes || project.render?.posterBytes || null,
    gate: String(options.gate || "private-demo"),
  };
  const cardSnapshots = project.cardSnapshots || project.card_snapshots || showGraph.cardSnapshots || {};
  const rights = project.rights || showGraph.rights || {};
  const approvals = project.approvals || showGraph.approvals || {};
  const rendererTruth = project.rendererTruth || project.renderer_truth || showGraph.rendererTruth || showGraph.truth || {};
  const safety = project.safety || project.visualSafety || showGraph.safety || {};
  const snapshot = buildSongCardMintSnapshot({
    song,
    project,
    showGraph,
    render,
    registry: project.registry || showGraph.registry || {},
    cardSnapshots,
    rights,
    approvals,
    rendererTruth,
  });
  const semanticFingerprint = fingerprintSongCardMintSnapshot(snapshot);
  if (!beforeSnapshot && head?.latestSemanticFingerprint === semanticFingerprint) beforeSnapshot = snapshot;
  const semanticDiff = diffSongCardMintSnapshots(beforeSnapshot, snapshot);
  const appearanceIndex = compileSongCardAppearanceIndex({
    showGraph,
    cardSnapshots,
    durationSeconds: showGraph.song?.durationSeconds ?? project.duration ?? project.durationSeconds,
  });
  const latestEdition = Number(head?.latestEdition || 0);
  const expectedHeadGeneration = Number(head?.version || 0);
  const gate = String(options.gate || "private-demo");
  const blockers = releaseBlockers({ gate, rights, approvals, rendererTruth, safety, master, appearanceIndex });
  const planDigest = crypto.createHash("sha256").update(`${headId}\0${expectedHeadGeneration}\0${semanticFingerprint}`).digest("hex");
  const changed = semanticDiff.changed;
  const plan = {
    schemaVersion: "hapa.song-card.mint-plan.v1",
    id: `song-card-mint-plan:${planDigest.slice(0, 32)}`,
    songId,
    headId,
    status: blockers.length ? "blocked" : changed ? (master ? "ready" : "changed") : "up-to-date",
    changed,
    latestEdition,
    predictedEdition: latestEdition + (changed ? 1 : 0),
    expectedHeadGeneration,
    semanticFingerprint,
    semanticDiff,
    changedFamilies: semanticDiff.changedFamilies,
    dirtyRanges: semanticDiff.dirtyRanges,
    reusableWork: semanticDiff.reusableWork,
    renderWork: semanticDiff.renderWork,
    appearanceIndex,
    gate,
    blockers,
    renderMasterPath: master?.path || "",
    posterPath: poster?.path || "",
    snapshot,
  };
  return { plan, project, showGraph, song, rights, approvals, rendererTruth, safety, master, poster, ledger, head };
}

function lineageForPlan(plan, showGraph) {
  const revision = plan.snapshot.editor?.revision
    || showGraph.directorV2?.source?.sourceProjectHash
    || showGraph.directorV2?.variantHash
    || plan.semanticFingerprint;
  return {
    nodes: [{ id: `director-source:${crypto.createHash("sha256").update(String(revision)).digest("hex").slice(0, 24)}`, kind: "director-source", revision: String(revision) }],
    edges: [],
  };
}

async function verifyEdition(ledger, headId, edition, head = null) {
  const record = await ledger.readEdition(headId, edition);
  const masterPath = path.join(record.directory, "media", "master.mp4");
  const renderSha256 = await computeFileSha256(masterPath);
  const editionRecord = head?.editions?.find((row) => Number(row.edition) === Number(edition)) || null;
  const checks = {
    renderHash: renderSha256 === record.manifest.render?.sha256,
    headRenderHash: !editionRecord || renderSha256 === editionRecord.renderSha256,
    manifestHash: !editionRecord || ledgerDigest(record.manifest) === editionRecord.publicManifestSha256,
    timestampIndexHash: ledgerDigest(record.timestampIndex) === record.manifest.timestampIndex?.sha256,
    appearanceIndexDigest: record.timestampIndex.indexDigest === record.manifest.appearanceIndex?.digest,
    intervalContract: false,
    lineageContract: false,
    editionContract: false,
  };
  try {
    validateTimestampIndex(record.timestampIndex, { durationMs: record.timestampIndex.durationMs });
    checks.intervalContract = true;
  } catch {}
  try {
    validateLineage(record.lineage);
    checks.lineageContract = record.lineage.complete === true;
  } catch {}
  checks.editionContract = validateSongCardEdition({
    ...record.manifest.edition,
    appearanceIndex: record.timestampIndex,
    lineage: record.lineage,
  }, { publicManifest: record.manifest }).ok;
  return {
    headId,
    edition: Number(edition),
    ok: Object.values(checks).every(Boolean),
    checks,
    renderSha256,
    manifest: record.manifest,
  };
}

async function commandStatus(options) {
  const ledger = createLedger(options);
  if (options["song-id"]) {
    const { songId, headId } = songIdentity(options);
    const head = await ledger.getHead(headId);
    return { schemaVersion: "hapa.song-card.status-response.v1", ok: true, songId, headId, exists: Boolean(head), songCard: head, root: ledger.root };
  }
  const state = await ledger.readLedger();
  return {
    schemaVersion: "hapa.song-card.status-response.v1",
    ok: true,
    root: ledger.root,
    revision: state.revision,
    updatedAt: state.updatedAt,
    headCount: Object.keys(state.heads).length,
    songCards: Object.values(state.heads),
  };
}

async function commandPlan(options) {
  const { controller, body, songId } = await buildControllerRequest(options, "plan");
  const plan = await controller.plan(songId, body);
  return { schemaVersion: "hapa.song-card.mint-plan-response.v1", ok: true, plan };
}

async function commandMint(options) {
  const { controller, body, songId, master, poster } = await buildControllerRequest(options, "mint");
  if (!master) fail("MISSING_OPTION", "mint requires --master <rendered-master.mp4>.", { option: "master" });
  if (!poster) fail("MISSING_OPTION", "mint requires --poster <poster-image>.", { option: "poster" });
  const plan = await controller.plan(songId, body);
  const expectedHeadGeneration = options["expected-head"] === undefined
    ? plan.expectedHeadGeneration
    : integerOption(options["expected-head"], "expected-head", { minimum: 0, required: true });
  const result = await controller.mint(songId, {
    planId: plan.planId,
    idempotencyKey: String(options["idempotency-key"] || plan.planId),
    renderMasterPath: master.path,
    posterPath: poster.path,
    gate: body.gate,
    expectedEdition: plan.predictedEdition,
    expectedHeadGeneration,
  });
  const readModel = result.songCard || await controller.getSongCard(songId);
  const edition = result.editionRecord
    || readModel.editions?.find((row) => Number(row.edition) === Number(result.edition))
    || { edition: result.edition, id: `${plan.headId}:edition:${result.edition}` };
  return {
    schemaVersion: "hapa.song-card.mint-response.v1",
    ok: true,
    ...readModel,
    jobId: result.jobId || null,
    created: result.created,
    reason: result.reason,
    songCard: readModel.head || result.head,
    latestEdition: Number(readModel.latestEdition || result.edition || 0),
    editionNumber: Number(result.edition || 0),
    edition,
    manifest: result.manifest || null,
    plan,
  };
}

async function commandEditions(options) {
  const ledger = createLedger(options);
  const { songId, headId } = songIdentity(options);
  const head = await ledger.getHead(headId);
  const editions = [];
  for (const row of head?.editions || []) {
    const record = await ledger.readEdition(headId, row.edition);
    editions.push({ ...row, id: `${headId}:edition:${row.edition}`, manifest: record.manifest });
  }
  editions.sort((left, right) => right.edition - left.edition);
  return { schemaVersion: "hapa.song-card.editions-response.v1", ok: true, songId, headId, latestEdition: Number(head?.latestEdition || 0), songCard: head, editions };
}

async function commandVerify(options) {
  const ledger = createLedger(options);
  const { songId, headId } = songIdentity(options);
  const head = await ledger.getHead(headId);
  if (!head) fail("SONG_CARD_NOT_FOUND", `Song Card was not found: ${headId}`, { headId });
  const requested = editionOption(options, head);
  const numbers = requested ? [requested] : head.editions.map((row) => row.edition);
  const editions = [];
  for (const edition of numbers) editions.push(await verifyEdition(ledger, headId, edition, head));
  return { schemaVersion: "hapa.song-card.verify-response.v1", ok: editions.every((row) => row.ok), songId, headId, editions };
}

async function commandCardsAt(options) {
  const ledger = createLedger(options);
  const { songId, headId } = songIdentity(options);
  const head = await ledger.getHead(headId);
  if (!head) fail("SONG_CARD_NOT_FOUND", `Song Card was not found: ${headId}`, { headId });
  const edition = editionOption(options, head, { required: true });
  const timestampMs = integerOption(options["time-ms"], "time-ms", { minimum: 0, required: true });
  const record = await ledger.readEdition(headId, edition);
  const cards = querySongCardAppearances(record.timestampIndex, timestampMs);
  return { schemaVersion: "hapa.song-card.cards-at-time-response.v1", ok: true, songId, headId, edition, ...cards };
}

async function commandRecover(options) {
  const ledger = createLedger(options);
  return { schemaVersion: "hapa.song-card.recover-response.v1", ...(await ledger.recover()) };
}

async function commandCleanup(options) {
  const ledger = createLedger(options);
  const olderThanMs = integerOption(options["older-than-ms"] ?? 86_400_000, "older-than-ms", { minimum: 0, required: true });
  return { schemaVersion: "hapa.song-card.cleanup-response.v1", ok: true, ...(await ledger.cleanupStaging({ olderThanMs })) };
}

async function commandGovernance(command, options) {
  const ledger = createLedger(options);
  const { songId, headId } = songIdentity(options);
  const head = await ledger.getHead(headId);
  if (!head) fail("SONG_CARD_NOT_FOUND", `Song Card was not found: ${headId}`, { headId });
  const edition = editionOption(options, head, { required: true });
  const reason = requiredOption(options, "reason", command);
  const result = command === "archive"
    ? await ledger.archiveEdition(headId, edition, { reason })
    : await ledger.revokeEdition(headId, edition, { reason });
  return { schemaVersion: "hapa.song-card.governance-response.v1", ok: true, songId, headId, edition: result };
}

async function commandExport(options) {
  const ledger = createLedger(options);
  const { songId, headId } = songIdentity(options);
  const head = await ledger.getHead(headId);
  if (!head) fail("SONG_CARD_NOT_FOUND", `Song Card was not found: ${headId}`, { headId });
  const edition = editionOption(options, head, { required: true });
  const destination = String(options.out || options.destination || options._[1] || "").trim();
  if (!destination) fail("MISSING_OPTION", "export requires --out <destination>.", { option: "out" });
  return { schemaVersion: "hapa.song-card.export-response.v1", ok: true, songId, ...(await ledger.exportEdition(headId, edition, destination)) };
}

async function commandImport(options) {
  const source = String(options.source || options.from || options._[0] || "").trim();
  if (!source) fail("MISSING_OPTION", "import requires --source <edition-bundle>.", { option: "source" });
  const ledger = createLedger(options);
  return { schemaVersion: "hapa.song-card.import-response.v1", ok: true, ...(await ledger.importEdition(source)) };
}

async function commandBackup(options) {
  const destination = String(options.out || options.destination || options._[0] || "").trim();
  if (!destination) fail("MISSING_OPTION", "backup requires --out <destination>.", { option: "out" });
  const ledger = createLedger(options);
  return { schemaVersion: "hapa.song-card.backup-response.v1", ok: true, ...(await ledger.backup(destination)) };
}

async function commandRestore(options) {
  const source = String(options.source || options.from || options._[0] || "").trim();
  if (!source) fail("MISSING_OPTION", "restore requires --source <backup-directory>.", { option: "source" });
  const ledger = createLedger(options);
  return { schemaVersion: "hapa.song-card.restore-response.v1", ok: true, ...(await ledger.restore(source)) };
}

async function commandMigrate(options) {
  const legacyPath = String(options.legacy || options.source || options._[0] || "").trim();
  if (!legacyPath) fail("MISSING_OPTION", "migrate requires --legacy <legacy-song-card.json>.", { option: "legacy" });
  const legacyCard = await readJsonFile(legacyPath, "legacy");
  const built = await buildPlan(options);
  const { plan, ledger, song, showGraph, rights, approvals, rendererTruth, safety, master, poster, project } = built;
  if (!master) fail("MISSING_OPTION", "migrate requires --master <rendered-master.mp4>.", { option: "master" });
  const result = await ledger.migrateLegacyCard({
    legacyCard,
    mintRequest: {
      headId: plan.headId,
      idempotencyKey: options["idempotency-key"],
      semanticFingerprint: plan.semanticFingerprint,
      sourceRevision: String(plan.snapshot.editor?.revision || showGraph.directorV2?.source?.sourceProjectHash || plan.semanticFingerprint),
      sourceVideoPath: master.path,
      posterPath: poster?.path,
      song,
      snapshot: plan.snapshot,
      semanticDiff: plan.semanticDiff,
      changedFamilies: plan.changedFamilies,
      incrementReason: plan.semanticDiff?.summary || "legacy-migration-mint",
      timestampIndex: plan.appearanceIndex,
      lineage: lineageForPlan(plan, showGraph),
      telemetry: [{ type: "migration-requested", sourceSchema: legacyCard.schemaVersion || legacyCard.cardType || "unknown" }],
      rights,
      approvals,
      rendererTruth,
      safety,
      context: project.context || project.songContext || {},
      receipts: project.receipts || { approvals, rights, safety },
      captions: project.captions || showGraph.song?.lyricOverlay || project.timed_lyrics || {},
      publishStatus: plan.gate,
      expectedHeadVersion: options["expected-head"] === undefined ? plan.expectedHeadGeneration : integerOption(options["expected-head"], "expected-head", { minimum: 0, required: true }),
    },
  });
  return { schemaVersion: "hapa.song-card.migrate-response.v1", ok: true, ...result };
}

function help() {
  return {
    schemaVersion: "hapa.song-card.cli-help.v1",
    name: "song-card",
    usage: "npm run song-card -- <command> [options]",
    commands: ["status", "plan", "dry-run", "mint", "editions", "verify", "cards-at", "recover", "cleanup-staging", "archive", "revoke", "export", "import", "backup", "restore", "migrate"],
    commonOptions: ["--root", "--song-id", "--project", "--graph", "--master", "--poster", "--gate", "--idempotency-key", "--expected-head", "--edition", "--time-ms"],
    mutationRule: "Every command that changes the ledger or writes an artifact requires --apply and a --token matching HAPA_SONG_CARD_MINT_TOKEN or HAPA_AVATAR_ADMIN_TOKEN.",
  };
}

async function run(command, options) {
  const normalized = command === "dry-run" || (command === "mint" && options["dry-run"] === true) ? "plan" : command;
  if (!normalized || normalized === "help" || normalized === "--help" || normalized === "-h" || options.help === true) return help();
  authorizeMutation(normalized, options);
  if (normalized === "status") return commandStatus(options);
  if (normalized === "plan") return commandPlan(options);
  if (normalized === "mint") return commandMint(options);
  if (normalized === "editions") return commandEditions(options);
  if (normalized === "verify") return commandVerify(options);
  if (normalized === "cards-at") return commandCardsAt(options);
  if (normalized === "recover") return commandRecover(options);
  if (normalized === "cleanup-staging") return commandCleanup(options);
  if (normalized === "archive" || normalized === "revoke") return commandGovernance(normalized, options);
  if (normalized === "export") return commandExport(options);
  if (normalized === "import") return commandImport(options);
  if (normalized === "backup") return commandBackup(options);
  if (normalized === "restore") return commandRestore(options);
  if (normalized === "migrate") return commandMigrate(options);
  fail("UNKNOWN_COMMAND", `Unknown Song Card command: ${normalized}`, { command: normalized });
}

const [command, ...argv] = process.argv.slice(2);
try {
  const output = await run(command, parseOptions(argv));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} catch (error) {
  const code = error?.code || (error instanceof SyntaxError ? "INVALID_JSON" : "SONG_CARD_CLI_ERROR");
  const output = {
    schemaVersion: "hapa.song-card.cli-error.v1",
    ok: false,
    error: { code, message: error?.message || String(error), ...(error?.details && Object.keys(error.details).length ? { details: error.details } : {}) },
  };
  process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = error instanceof MintLedgerError || error instanceof CliError || error?.code ? 1 : 2;
}
