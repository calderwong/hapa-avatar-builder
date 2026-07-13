import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import {
  buildSongCardHead,
  buildSongCardMintSnapshot,
  compileSongCardAppearanceIndex,
  createPrintedSongCard,
  diffSongCardMintSnapshots,
  fingerprintSongCardMintSnapshot,
  querySongCardAppearances,
  stableMintStringify,
  validateSongCardEdition,
} from "../src/domain/song-card-mint.js";
import { projectToEditorGraph } from "../src/domain/multitrack-editor.js";
import { buildPrintedCardLineageReceipt, validateSongCardEditionLineage } from "../src/domain/song-card-lineage.js";
import { buildVisualizerRendererTruthReceipt } from "../src/domain/visualizer-renderer-capability.js";
import {
  MintLedgerError,
  SongCardMintLedger,
  computeFileSha256,
  decodePosterImage,
  songCardIdempotencyStorageKey,
  validateBoundedTelemetry,
  validateLineage,
  validateTimestampIndex,
} from "./song-card-mint-ledger.mjs";

const execFile = promisify(execFileCallback);

export const SONG_CARD_MINT_PLAN_SCHEMA = "hapa.song-card.mint-plan.v1";
export const SONG_CARD_MINT_JOB_SCHEMA = "hapa.song-card.mint-job.v1";
export const SONG_CARD_MANAGED_RENDER_SCHEMA = "hapa.song-card.managed-render.v1";
export const SONG_CARD_MANAGED_EXPORT_SCHEMA = "hapa.song-card.managed-export.v1";

function controllerError(code, message, statusCode = 400, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function sha(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableMintStringify(value)).digest("hex");
}

function hashFn(value) {
  return sha(value);
}

function stableRawValue(value) {
  if (Array.isArray(value)) return value.map(stableRawValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableRawValue(value[key])]));
}

function rawDigest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableRawValue(value))).digest("hex");
}

function containsPrivateAbsolutePath(value) {
  if (typeof value === "string") return (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith("file:"))
    && !value.startsWith("/api/") && !value.startsWith("/media/") && !value.startsWith("/static/");
  if (Array.isArray(value)) return value.some(containsPrivateAbsolutePath);
  return Boolean(value && typeof value === "object" && Object.values(value).some(containsPrivateAbsolutePath));
}

async function treeIsReadOnly(directory) {
  const stat = await fsp.stat(directory);
  if ((stat.mode & 0o222) !== 0) return false;
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!(await treeIsReadOnly(child))) return false;
    } else if (entry.isFile() && ((await fsp.stat(child)).mode & 0o222) !== 0) return false;
  }
  return true;
}

const PUBLIC_LICENSE_STATUSES = new Set(["cleared", "licensed", "operator-authored", "public-domain"]);
const PUBLIC_CONSENT_STATUSES = new Set(["approved", "cleared", "granted", "licensed", "operator-approved"]);

function songKey(value) {
  const result = String(value || "").trim();
  if (!result || result.length > 200 || !/^[A-Za-z0-9._:-]+$/u.test(result)) throw controllerError("invalid_song_id", "Song ID is malformed.");
  return result.replace(/^song-card:/u, "");
}

function headIdFor(songId) {
  return `song-card:${songKey(songId)}`;
}

async function exists(filePath) {
  try { await fsp.access(filePath); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

function isInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function safeFileSegment(value, fallback = "song-card") {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
  return normalized || fallback;
}

async function uniqueDestination(basePath, extension = "") {
  for (let copy = 1; copy <= 10_000; copy += 1) {
    const suffix = copy === 1 ? "" : `-${copy}`;
    const candidate = `${basePath}${suffix}${extension}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw controllerError("export_destination_exhausted", "Could not allocate a unique managed export destination.", 409);
}

function defaultAppOwnedExportRoot() {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Hapa Avatar Builder", "Exports", "Song Cards");
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Hapa Avatar Builder", "Exports", "Song Cards");
  return path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "hapa-avatar-builder", "exports", "song-cards");
}

async function prepareWritableExportRoot(directory, { privateDirectory = false } = {}) {
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  const canonical = await fsp.realpath(directory);
  const stat = await fsp.stat(canonical);
  if (!stat.isDirectory()) throw Object.assign(new Error("Export destination is not a directory."), { code: "ENOTDIR" });
  if (privateDirectory) await fsp.chmod(canonical, 0o700);
  const probePath = path.join(canonical, `.hapa-export-probe-${process.pid}-${crypto.randomUUID()}`);
  let handle;
  try {
    handle = await fsp.open(probePath, "wx", 0o600);
    await handle.writeFile("hapa-song-card-export-probe\n", "utf8");
    await handle.sync();
  } finally {
    await handle?.close().catch(() => {});
    await fsp.rm(probePath, { force: true }).catch(() => {});
  }
  return canonical;
}

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await fsp.readFile(filePath, "utf8")); } catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = await fsp.open(temporary, "wx", 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); } finally { await handle.close(); }
  await fsp.rename(temporary, filePath);
}

async function appendEvent(filePath, event) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fsp.open(filePath, "a", 0o600);
  try { await handle.writeFile(`${JSON.stringify(event)}\n`); await handle.sync(); } finally { await handle.close(); }
}

function aggregateRendererTruth(showGraph = {}, supplied = null) {
  if (supplied && typeof supplied === "object") return structuredClone(supplied);
  const cards = (showGraph.tracks || []).flatMap((track) => (track.cards || []).filter((card) => card?.visualization));
  const receipts = cards.map((card) => buildVisualizerRendererTruthReceipt(card));
  return {
    schemaVersion: "hapa.show.release-renderer-truth.v1",
    status: receipts.length ? "declared" : "not-supplied",
    cueReceiptCount: receipts.length,
    allStatesVisible: receipts.length > 0 && receipts.every((receipt) => receipt.allStatesVisible === true),
    silentDefaultCount: receipts.reduce((sum, receipt) => sum + Number(receipt.silentDefaultCount || 0), 0),
    ok: receipts.length > 0 && receipts.every((receipt) => receipt.ok === true) && receipts.every((receipt) => receipt.allStatesVisible === true) && receipts.every((receipt) => Number(receipt.silentDefaultCount || 0) === 0),
    receipts,
  };
}

function publicHead(head, songId, title = "") {
  if (!head) return buildSongCardHead({ songId, title });
  const { idempotency: _idempotency, ...rest } = head;
  return { ...rest, id: head.id || head.headId, schemaVersion: "hapa.song-card.v2", semanticFingerprint: head.latestSemanticFingerprint || "", editionCount: (head.editions || []).length };
}

function planBlockers({ renderMasterPath, posterPath, rendererTruth, appearanceIndex, rights, approvals, safety }) {
  const hard = [];
  const publicOnly = [];
  if (!renderMasterPath) hard.push({ code: "render-master-required", label: "A completed rendered master is not available yet." });
  if (!posterPath) hard.push({ code: "poster-required", label: "A verified poster will be generated after rendering." });
  if (rendererTruth?.ok !== true || rendererTruth?.allStatesVisible !== true || Number(rendererTruth?.silentDefaultCount || 0) !== 0
    || rendererTruth?.releaseSafe === false || rendererTruth?.truthStatus === "blocked") {
    hard.push({ code: "renderer-truth-unverified", label: "Renderer truth must pass with visible states and zero silent defaults." });
  }
  if ((appearanceIndex?.gaps || []).length) hard.push({ code: "temporal-card-coverage-gap", label: "Every rendered interval needs card or explicit visualizer truth.", ranges: appearanceIndex.gaps });
  const licensingStatus = String(rights?.licensingStatus || rights?.status || "").trim().toLowerCase();
  const consentStatus = String(rights?.consentStatus || "").trim().toLowerCase();
  if (!PUBLIC_LICENSE_STATUSES.has(licensingStatus) || !PUBLIC_CONSENT_STATUSES.has(consentStatus)) publicOnly.push({ code: "rights-or-consent-uncleared", label: "Public mint requires cleared rights and affirmative consent." });
  if (approvals?.technical !== true || approvals?.creative !== true) publicOnly.push({ code: "publish-approvals-missing", label: "Public mint requires technical and creative approval." });
  if (safety?.ok !== true) publicOnly.push({ code: "safety-receipt-missing", label: "Public mint requires a visual/media safety receipt." });
  return { hard, publicOnly };
}

function lineageFor({ songId, sourceRevision, snapshot, showGraph }) {
  const songNode = `song:${songId}`;
  const editorNode = `editor:${sourceRevision}`;
  const treatmentNode = `treatment:${showGraph.directorV2?.treatmentId || sha(snapshot.editor || {}).slice(0, 20)}`;
  const graphNode = `show-graph:${sha(showGraph).slice(0, 24)}`;
  return { nodes: [{ id: songNode, kind: "song" }, { id: editorNode, kind: "editor-revision" }, { id: treatmentNode, kind: "director-treatment" }, { id: graphNode, kind: "show-graph" }], edges: [{ from: songNode, to: editorNode, relation: "edited-as" }, { from: editorNode, to: treatmentNode, relation: "directed-as" }, { from: treatmentNode, to: graphNode, relation: "compiled-as" }] };
}

export class SongCardMintController {
  constructor({
    root,
    allowedSourceRoots = [process.cwd()],
    ledger = null,
    clock = () => new Date(),
    managedRenderRoot = null,
    exportRoot = null,
    fallbackExportRoot = null,
    runCommand = execFile,
  } = {}) {
    if (!root) throw controllerError("mint_root_required", "Song Card mint root is required.", 500);
    this.root = path.resolve(root);
    this.clock = clock;
    this.ledger = ledger || new SongCardMintLedger({ root: this.root, allowedSourceRoots });
    this.managedRenderRoot = path.resolve(managedRenderRoot || path.join(this.root, ".managed-renders"));
    const configuredExportRoot = exportRoot || process.env.HAPA_SONG_CARD_EXPORT_ROOT || "";
    this.exportRoot = path.resolve(configuredExportRoot || path.join(os.homedir(), "Downloads", "Hapa Song Cards"));
    this.exportRootIsBuilderManaged = !configuredExportRoot;
    this.fallbackExportRoot = path.resolve(fallbackExportRoot || process.env.HAPA_SONG_CARD_FALLBACK_EXPORT_ROOT || defaultAppOwnedExportRoot());
    this.runCommand = runCommand;
    this.paths = { plans: path.join(this.root, "plans"), events: path.join(this.root, "events.ndjson"), managedRenders: this.managedRenderRoot };
    if (Array.isArray(this.ledger.allowedSourceRoots) && !this.ledger.allowedSourceRoots.includes(this.managedRenderRoot)) {
      this.ledger.allowedSourceRoots.push(this.managedRenderRoot);
    }
    this.artifactVerificationCache = new Map();
  }

  now() { return this.clock().toISOString(); }

  async writableExportRoot() {
    const ledgerRoot = await fsp.realpath(this.root);
    const candidates = [
      { role: "preferred", path: this.exportRoot, privateDirectory: this.exportRootIsBuilderManaged },
      { role: "builder-fallback", path: this.fallbackExportRoot, privateDirectory: true },
    ].filter((candidate, index, rows) => rows.findIndex((row) => row.path === candidate.path) === index);
    const failures = [];
    for (const candidate of candidates) {
      if (isInside(ledgerRoot, path.resolve(candidate.path))) {
        if (candidate.role === "preferred") throw controllerError("invalid_export_root", "Managed exports must be outside the live Song Card mint ledger.", 409);
        failures.push({ role: candidate.role, path: candidate.path, code: "INVALID_EXPORT_ROOT", message: "Fallback export folder is inside the live mint ledger." });
        continue;
      }
      try {
        const canonical = await prepareWritableExportRoot(candidate.path, { privateDirectory: candidate.privateDirectory });
        if (isInside(ledgerRoot, canonical)) {
          if (candidate.role === "preferred") throw controllerError("invalid_export_root", "Managed exports must be outside the live Song Card mint ledger.", 409);
          failures.push({ role: candidate.role, path: candidate.path, code: "INVALID_EXPORT_ROOT", message: "Fallback export folder resolves inside the live mint ledger." });
          continue;
        }
        return {
          root: canonical,
          fallbackUsed: candidate.role === "builder-fallback",
          fallbackReason: candidate.role === "builder-fallback" ? failures[0]?.message || "The preferred export folder was unavailable." : "",
          preferredRoot: this.exportRoot,
        };
      } catch (error) {
        if (error?.code === "invalid_export_root") throw error;
        failures.push({
          role: candidate.role,
          path: candidate.path,
          code: String(error?.code || "EXPORT_ROOT_UNAVAILABLE"),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    throw controllerError(
      "export_root_unavailable",
      "The preferred export folder is unavailable and the Builder-owned fallback could not be prepared. Check folder permissions or free disk space, then retry.",
      503,
      { attempts: failures },
    );
  }

  async initialize() {
    await Promise.all([
      this.ledger.initialize(),
      fsp.mkdir(this.paths.plans, { recursive: true }),
      fsp.mkdir(this.paths.managedRenders, { recursive: true, mode: 0o700 }),
    ]);
    return this;
  }

  async prepareManagedRender(songIdInput, { masterPath, posterPath = "" } = {}) {
    await this.initialize();
    const songId = songKey(songIdInput);
    if (!String(masterPath || "").trim()) throw controllerError("render_master_required", "A worker-produced rendered master is required.");
    const resolvedMaster = await this.ledger.resolveSource(masterPath);
    const masterSha256 = await computeFileSha256(resolvedMaster.sourceRealPath);
    const suppliedPoster = String(posterPath || "").trim()
      ? await this.ledger.resolveSource(posterPath)
      : null;
    const suppliedPosterSha256 = suppliedPoster ? await computeFileSha256(suppliedPoster.sourceRealPath) : "";
    const workspaceFingerprint = sha({
      songId,
      masterSha256,
      poster: suppliedPosterSha256 || "automatic-representative-frame-v1",
    });
    const workspaceId = `managed-render:${workspaceFingerprint.slice(0, 32)}`;
    const directory = path.join(
      this.paths.managedRenders,
      safeFileSegment(songId),
      workspaceFingerprint.slice(0, 32),
    );
    const managedMasterPath = path.join(directory, "master.mp4");
    const managedPosterPath = path.join(directory, "poster.jpg");
    await fsp.mkdir(directory, { recursive: true, mode: 0o700 });

    if (!(await exists(managedMasterPath))) {
      await fsp.copyFile(resolvedMaster.sourceRealPath, managedMasterPath, fs.constants.COPYFILE_EXCL);
      await fsp.chmod(managedMasterPath, 0o600);
    }
    const managedMasterSha256 = await computeFileSha256(managedMasterPath);
    if (managedMasterSha256 !== masterSha256) {
      throw controllerError("managed_master_hash_mismatch", "Managed render copy does not match the worker-produced master.", 409);
    }

    let posterGenerated = false;
    if (!(await exists(managedPosterPath))) {
      if (suppliedPoster) {
        await fsp.copyFile(suppliedPoster.sourceRealPath, managedPosterPath, fs.constants.COPYFILE_EXCL);
      } else {
        const temporaryPoster = `${managedPosterPath}.${process.pid}.${crypto.randomUUID()}.tmp.jpg`;
        try {
          await this.runCommand(this.ledger.ffmpegPath || "ffmpeg", [
            "-hide_banner", "-loglevel", "error", "-y",
            "-i", managedMasterPath,
            "-an", "-vf", "thumbnail=60,scale='min(1280,iw)':-2",
            "-frames:v", "1", "-q:v", "2",
            temporaryPoster,
          ], { maxBuffer: 8 * 1024 * 1024 });
          await fsp.rename(temporaryPoster, managedPosterPath);
          posterGenerated = true;
        } finally {
          await fsp.rm(temporaryPoster, { force: true }).catch(() => {});
        }
      }
      await fsp.chmod(managedPosterPath, 0o600);
    }
    const posterDecode = this.ledger.imageDecoder
      ? await this.ledger.imageDecoder(managedPosterPath, { songId, masterPath: managedMasterPath })
      : await decodePosterImage(managedPosterPath, { ffmpegPath: this.ledger.ffmpegPath || "ffmpeg" });
    if (posterDecode?.ok !== true || posterDecode?.imageDecode !== true) {
      await fsp.rm(managedPosterPath, { force: true }).catch(() => {});
      throw controllerError("managed_poster_invalid", "The automatically managed poster did not decode as an image.", 409, { posterDecode });
    }
    const [masterStat, posterStat, posterSha256] = await Promise.all([
      fsp.stat(managedMasterPath),
      fsp.stat(managedPosterPath),
      computeFileSha256(managedPosterPath),
    ]);
    return {
      schemaVersion: SONG_CARD_MANAGED_RENDER_SCHEMA,
      workspaceId,
      songId,
      master: { role: "master", path: managedMasterPath, sha256: masterSha256, bytes: masterStat.size, managed: true },
      poster: { role: "poster", path: managedPosterPath, sha256: posterSha256, bytes: posterStat.size, managed: true, generated: posterGenerated || !suppliedPoster },
      sourceVerified: true,
      posterDecode: { decoder: String(posterDecode.decoder || "unknown"), imageDecode: true },
    };
  }

  planPath(planId) { return path.join(this.paths.plans, `${String(planId).replace(/^plan:/u, "")}.json`); }

  async getPlan(planId) {
    const plan = await readJson(this.planPath(planId));
    if (!plan) throw controllerError("mint_plan_not_found", "Mint plan was not found.", 404);
    return plan;
  }

  async plan(songIdInput, body = {}, { persist = true } = {}) {
    await this.initialize();
    const songId = songKey(songIdInput);
    const headId = headIdFor(songId);
    const project = structuredClone(body.project || {});
    const showGraph = structuredClone(body.showGraph?.tracks ? body.showGraph : project.director_show_graph?.tracks ? project.director_show_graph : projectToEditorGraph(project));
    const song = structuredClone(body.song || { id: songId, songId, title: project.song_title || showGraph.song?.title || songId });
    let renderMasterPath = String(body.renderMasterPath || body.render?.masterPath || "").trim();
    let posterPath = String(body.posterPath || body.render?.posterPath || "").trim();
    let managedRender = null;
    if (renderMasterPath && (!posterPath || body.manageArtifacts === true)) {
      managedRender = await this.prepareManagedRender(songId, { masterPath: renderMasterPath, posterPath });
      renderMasterPath = managedRender.master.path;
      posterPath = managedRender.poster.path;
    }
    const renderExists = renderMasterPath && await exists(renderMasterPath);
    const posterExists = posterPath && await exists(posterPath);
    const [renderSha256, posterSha256, renderStat, posterStat] = await Promise.all([
      renderExists ? computeFileSha256(renderMasterPath) : "",
      posterExists ? computeFileSha256(posterPath) : "",
      renderExists ? fsp.stat(renderMasterPath) : null,
      posterExists ? fsp.stat(posterPath) : null,
    ]);
    const rendererTruth = aggregateRendererTruth(showGraph, body.rendererTruth);
    const rights = structuredClone(body.rights || song.authorship || {});
    const approvals = structuredClone(body.approvals || {});
    const safety = structuredClone(body.safety || {});
    const appearanceIndex = compileSongCardAppearanceIndex({ showGraph, cardSnapshots: body.cardSnapshots || {}, durationSeconds: showGraph.song?.durationSeconds || project.duration, hashFn });
    const snapshot = buildSongCardMintSnapshot({ song, project, showGraph, render: { ...(body.render || {}), masterSha256: renderSha256 || null, masterBytes: renderStat?.size || null, posterSha256: posterSha256 || null, posterBytes: posterStat?.size || null }, registry: body.registry || {}, cardSnapshots: body.cardSnapshots || {}, rights, approvals, rendererTruth });
    const semanticFingerprint = fingerprintSongCardMintSnapshot(snapshot, hashFn);
    const sourceRevision = `sha256:${sha({ project, showGraph })}`;
    const head = await this.ledger.getHead(headId);
    const latestRecord = head?.latestEdition ? await this.ledger.readEdition(headId, head.latestEdition).catch(() => null) : null;
    const semanticDiff = diffSongCardMintSnapshots(latestRecord?.snapshot || null, snapshot, hashFn);
    const blockers = planBlockers({ renderMasterPath, posterPath, rendererTruth, appearanceIndex, rights, approvals, safety });
    const predictedEdition = Number(head?.latestEdition || 0) + (semanticDiff.changed ? 1 : 0);
    const planSeed = { headId, sourceRevision, semanticFingerprint, predictedEdition, gate: body.gate || "private-demo" };
    const planId = `plan:${sha(planSeed).slice(0, 32)}`;
    const plan = {
      schemaVersion: SONG_CARD_MINT_PLAN_SCHEMA,
      id: planId,
      planId,
      songId,
      headId,
      status: semanticDiff.changed ? renderMasterPath && blockers.hard.length === 0 ? "ready" : "changed" : "up-to-date",
      changed: semanticDiff.changed,
      latestEdition: Number(head?.latestEdition || 0),
      predictedEdition,
      expectedHeadGeneration: Number(head?.generation || head?.version || 0),
      semanticFingerprint,
      sourceRevision,
      semanticDiff,
      changedFamilies: semanticDiff.changedFamilies,
      dirtyRanges: semanticDiff.dirtyRanges,
      reusableWork: semanticDiff.reusableWork,
      blockers: [...blockers.hard, ...blockers.publicOnly],
      publicBlockers: blockers.publicOnly,
      hardBlockers: blockers.hard,
      renderMasterPath,
      renderMasterSha256: renderSha256,
      renderMasterBytes: Number(renderStat?.size || 0),
      posterPath,
      posterSha256,
      posterBytes: Number(posterStat?.size || 0),
      managedArtifacts: managedRender ? {
        schemaVersion: managedRender.schemaVersion,
        workspaceId: managedRender.workspaceId,
        sourceVerified: true,
        posterGenerated: managedRender.poster.generated === true,
      } : null,
      rendererTruth: { ok: rendererTruth.ok === true, cueReceiptCount: Number(rendererTruth.cueReceiptCount || 0), allStatesVisible: rendererTruth.allStatesVisible === true, silentDefaultCount: Number(rendererTruth.silentDefaultCount || 0) },
      appearanceSummary: { count: appearanceIndex.appearances.length, gaps: appearanceIndex.gaps.length, indexDigest: appearanceIndex.indexDigest },
      gate: body.gate || "private-demo",
      createdAt: this.now(),
      input: { song, project, showGraph, render: body.render || {}, renderMasterPath, rendererTruth, rights, approvals, safety, cardSnapshots: body.cardSnapshots || {}, registry: body.registry || {}, context: body.context || {}, captions: body.captions || null, receipts: body.receipts || {}, posterPath, managedArtifacts: managedRender ? { workspaceId: managedRender.workspaceId, posterGenerated: managedRender.poster.generated === true } : null },
      snapshot,
      appearanceIndex,
      lineage: lineageFor({ songId, sourceRevision, snapshot, showGraph }),
    };
    if (persist) await atomicJson(this.planPath(planId), plan);
    return this.publicPlan(plan);
  }

  publicPlan(plan) {
    const { input: _input, snapshot: _snapshot, appearanceIndex: _index, lineage: _lineage, ...result } = plan;
    return result;
  }

  async mint(songIdInput, options = {}) {
    const songId = songKey(songIdInput);
    const stored = await this.getPlan(options.planId);
    if (stored.songId !== songId) throw controllerError("mint_plan_song_mismatch", "Mint plan belongs to a different Song Card.", 409);
    if (stored.status === "canceled") throw controllerError("mint_plan_canceled", "Canceled mint plans cannot publish.", 409);
    const confirmedMasterPath = String(stored.input?.renderMasterPath || stored.renderMasterPath || "").trim();
    const requestedMasterPath = String(options.renderMasterPath || confirmedMasterPath).trim();
    if (!confirmedMasterPath || path.resolve(requestedMasterPath) !== path.resolve(confirmedMasterPath)) {
      throw controllerError("mint_plan_source_mismatch", "Rendered master differs from the confirmed mint plan; create and review a new plan.", 409);
    }
    const confirmedPosterPath = String(stored.input?.posterPath || stored.posterPath || "").trim();
    const requestedPosterPath = String(options.posterPath || confirmedPosterPath).trim();
    if (!confirmedPosterPath || path.resolve(requestedPosterPath) !== path.resolve(confirmedPosterPath)) {
      throw controllerError("mint_plan_poster_mismatch", "Poster image differs from the confirmed mint plan; create and review a new plan.", 409);
    }
    const requestedGate = options.gate || stored.gate || "private-demo";
    if (requestedGate !== stored.gate) {
      throw controllerError("mint_plan_gate_mismatch", "Release gate differs from the confirmed mint plan; create and review a new plan.", 409);
    }
    const requestedIdempotencyKey = options.idempotencyKey || stored.planId;
    const currentHead = await this.ledger.getHead(stored.headId);
    const priorIdempotency = currentHead?.idempotency?.[songCardIdempotencyStorageKey(requestedIdempotencyKey)] || currentHead?.idempotency?.[requestedIdempotencyKey];
    if (priorIdempotency) {
      if (priorIdempotency.semanticFingerprint !== stored.semanticFingerprint) {
        throw controllerError("idempotency_conflict", "Idempotency key belongs to different confirmed mint content.", 409);
      }
      return { schemaVersion: SONG_CARD_MINT_JOB_SCHEMA, created: false, reason: "idempotency-replay", edition: priorIdempotency.edition, head: publicHead(currentHead, songId, stored.input.song?.title), songCard: await this.getSongCard(songId) };
    }
    if (currentHead?.latestSemanticFingerprint === stored.semanticFingerprint) {
      return { schemaVersion: SONG_CARD_MINT_JOB_SCHEMA, created: false, reason: "semantic-no-change", edition: currentHead.latestEdition, head: publicHead(currentHead, songId, stored.input.song?.title), songCard: await this.getSongCard(songId) };
    }
    const exactInput = { ...stored.input, renderMasterPath: confirmedMasterPath, posterPath: confirmedPosterPath, gate: stored.gate };
    const exactPublic = await this.plan(songId, exactInput, { persist: true });
    const exact = await this.getPlan(exactPublic.planId);
    if (exact.semanticFingerprint !== stored.semanticFingerprint || exact.sourceRevision !== stored.sourceRevision) {
      throw controllerError("mint_plan_changed", "Mint inputs changed after confirmation; create and review a new plan.", 409, {
        confirmedSemanticFingerprint: stored.semanticFingerprint,
        actualSemanticFingerprint: exact.semanticFingerprint,
        confirmedSourceRevision: stored.sourceRevision,
        actualSourceRevision: exact.sourceRevision,
      });
    }
    if (!exact.changed) {
      const head = await this.ledger.getHead(exact.headId);
      return { schemaVersion: SONG_CARD_MINT_JOB_SCHEMA, created: false, reason: "semantic-no-change", edition: head?.latestEdition || 0, head: publicHead(head, songId, exact.input.song?.title), songCard: await this.getSongCard(songId) };
    }
    if (Number(options.expectedEdition || exact.predictedEdition) !== exact.predictedEdition) throw controllerError("expected_edition_mismatch", "Predicted edition changed before mint.", 409, { expected: options.expectedEdition, actual: exact.predictedEdition });
    const actualGeneration = Number((await this.ledger.getHead(exact.headId))?.generation || (await this.ledger.getHead(exact.headId))?.version || 0);
    if (options.expectedHeadGeneration !== undefined && Number(options.expectedHeadGeneration) !== actualGeneration) throw controllerError("stale_expected_head", "Song Card head changed before mint.", 409, { expected: options.expectedHeadGeneration, actual: actualGeneration });
    if (exact.hardBlockers.length) throw controllerError("mint_preflight_blocked", "Mint plan has unresolved hard blockers.", 409, { blockers: exact.hardBlockers });
    const gate = exact.gate || "private-demo";
    if (gate === "public-gate" && exact.blockers.length) throw controllerError("publish_gate_blocked", "Public mint gate has unresolved blockers.", 409, { blockers: exact.blockers });
    const jobId = `mint:${sha({ planId: exact.planId, idempotencyKey: requestedIdempotencyKey }).slice(0, 32)}`;
    exact.status = "minting";
    exact.jobId = jobId;
    exact.idempotencyKey = requestedIdempotencyKey;
    exact.startedAt = this.now();
    exact.progress = { stage: "preflight", completed: 0, total: 4 };
    exact.logs = [...(exact.logs || []), { at: this.now(), message: "mint-requested" }].slice(-50);
    await atomicJson(this.planPath(exact.planId), exact);
    await appendEvent(this.paths.events, { schemaVersion: "hapa.song-card.mint-event.v1", eventId: crypto.randomUUID(), type: "mint-requested", at: this.now(), jobId, planId: exact.planId, headId: exact.headId, correlationId: jobId });
    try {
      const result = await this.ledger.mint({
        headId: exact.headId,
        idempotencyKey: requestedIdempotencyKey,
        semanticFingerprint: exact.semanticFingerprint,
        sourceRevision: exact.sourceRevision,
        sourceVideoPath: exact.input.renderMasterPath,
        posterPath: exact.input.posterPath || "",
        song: exact.input.song,
        snapshot: exact.snapshot,
        semanticDiff: exact.semanticDiff,
        changedFamilies: exact.changedFamilies,
        incrementReason: exact.semanticDiff?.summary || "confirmed-material-mint",
        timestampIndex: exact.appearanceIndex,
        lineage: exact.lineage,
        telemetry: [{ type: "mint-staged", correlationId: jobId }],
        rendererTruth: exact.input.rendererTruth,
        rights: exact.input.rights,
        approvals: exact.input.approvals,
        safety: exact.input.safety,
        context: exact.input.context,
        captions: exact.input.captions,
        receipts: exact.input.receipts,
        publishStatus: gate,
        expectedHeadVersion: actualGeneration,
        shouldAbort: async () => {
          const current = await this.getPlan(exact.planId);
          return current.status === "canceled";
        },
      });
      const completed = await this.getPlan(exact.planId);
      completed.status = "completed";
      completed.completedAt = this.now();
      completed.edition = result.edition;
      completed.progress = { stage: "completed", completed: 4, total: 4 };
      completed.logs = [...(completed.logs || []), { at: this.now(), message: "mint-succeeded" }].slice(-50);
      await atomicJson(this.planPath(completed.planId), completed);
      await appendEvent(this.paths.events, { schemaVersion: "hapa.song-card.mint-event.v1", eventId: crypto.randomUUID(), type: "mint-succeeded", at: this.now(), jobId, planId: exact.planId, headId: exact.headId, edition: result.edition, correlationId: jobId, durationMs: 0 });
      return { schemaVersion: SONG_CARD_MINT_JOB_SCHEMA, jobId, ...result, editionRecord: result.manifest?.edition || null, songCard: await this.getSongCard(songId) };
    } catch (error) {
      const failed = await this.getPlan(exact.planId).catch(() => null);
      if (failed && failed.status !== "canceled") {
        failed.status = "failed";
        failed.failedAt = this.now();
        failed.error = { code: error.code || "mint-failed", message: error.message };
        failed.progress = { ...(failed.progress || {}), stage: "failed" };
        failed.logs = [...(failed.logs || []), { at: this.now(), message: `mint-failed:${error.code || error.message}` }].slice(-50);
        await atomicJson(this.planPath(failed.planId), failed);
      }
      await appendEvent(this.paths.events, { schemaVersion: "hapa.song-card.mint-event.v1", eventId: crypto.randomUUID(), type: "mint-failed", at: this.now(), jobId, planId: exact.planId, headId: exact.headId, correlationId: jobId, error: error.code || error.message });
      throw error;
    }
  }

  async cancel(planId, { reason = "operator-canceled" } = {}) {
    const plan = await this.getPlan(planId);
    if (plan.status === "completed") return this.publicPlan({ ...plan, cancellationTooLate: true });
    plan.status = "canceled";
    plan.canceledAt = this.now();
    plan.cancelReason = reason;
    plan.progress = { ...(plan.progress || {}), stage: "canceled" };
    plan.logs = [...(plan.logs || []), { at: this.now(), message: `mint-canceled:${reason}` }].slice(-50);
    await atomicJson(this.planPath(plan.planId), plan);
    return this.publicPlan(plan);
  }

  async retry(planId) { const plan = await this.getPlan(planId); return this.plan(plan.songId, plan.input); }
  async getJob(jobId) { const plans = await fsp.readdir(this.paths.plans).catch(() => []); for (const name of plans) { const plan = await readJson(path.join(this.paths.plans, name)); if (plan?.jobId === jobId || `mint:${sha({ planId: plan?.planId, idempotencyKey: plan?.planId }).slice(0, 32)}` === jobId) return this.publicPlan(plan); } throw controllerError("mint_job_not_found", "Mint job was not found.", 404); }

  async getSongCard(songIdInput) {
    const songId = songKey(songIdInput); const head = await this.ledger.getHead(headIdFor(songId));
    const editions = [];
    for (const summary of [...(head?.editions || [])].sort((a, b) => b.edition - a.edition)) {
      const detail = await this.ledger.readEdition(headIdFor(songId), summary.edition);
      const parent = summary.edition > 1 ? await this.ledger.readEdition(headIdFor(songId), summary.edition - 1).catch(() => null) : null;
      const semanticDiff = diffSongCardMintSnapshots(parent?.snapshot || null, detail.snapshot || {}, hashFn);
      editions.push({
        ...detail.manifest.edition,
        ...summary,
        songId,
        semanticDiff,
        manifest: structuredClone(detail.manifest),
        lineage: structuredClone(detail.lineage),
        telemetrySummary: {
          path: detail.manifest.telemetry?.path || detail.manifest.files?.telemetry?.path || "telemetry.json",
          sha256: detail.manifest.telemetry?.sha256 || detail.manifest.files?.telemetry?.sha256 || "",
          eventCount: Number(detail.manifest.telemetry?.eventCount || detail.manifest.files?.telemetry?.eventCount || 0),
          perFrame: detail.manifest.telemetry?.perFrame === true || detail.manifest.files?.telemetry?.perFrame === true,
        },
        temporalCardLedger: { schemaVersion: detail.timestampIndex.schemaVersion, cards: detail.timestampIndex.appearances },
        artifact: detail.manifest.render,
      });
    }
    return { schemaVersion: "hapa.song-card.read-model.v1", card: publicHead(head, songId), head: publicHead(head, songId), latestEdition: Number(head?.latestEdition || 0), editions };
  }

  async listEditions(songId) { return (await this.getSongCard(songId)).editions; }
  async detail(songIdInput, edition) {
    const songId = songKey(songIdInput);
    const editionNumber = Number(edition);
    const row = await this.ledger.readEdition(headIdFor(songId), editionNumber);
    const parent = editionNumber > 1 ? await this.ledger.readEdition(headIdFor(songId), editionNumber - 1).catch(() => null) : null;
    return {
      ...row.manifest,
      appearanceIndex: row.timestampIndex,
      lineage: row.lineage,
      semanticDiff: diffSongCardMintSnapshots(parent?.snapshot || null, row.snapshot || {}, hashFn),
      telemetrySummary: {
        path: row.manifest.telemetry?.path || row.manifest.files?.telemetry?.path || "telemetry.json",
        sha256: row.manifest.telemetry?.sha256 || row.manifest.files?.telemetry?.sha256 || "",
        eventCount: Number(row.manifest.telemetry?.eventCount || row.manifest.files?.telemetry?.eventCount || 0),
        perFrame: row.manifest.telemetry?.perFrame === true || row.manifest.files?.telemetry?.perFrame === true,
      },
    };
  }
  async cardsAtTime(songIdInput, edition, timeMs) { const songId = songKey(songIdInput); const row = await this.ledger.readEdition(headIdFor(songId), Number(edition)); return querySongCardAppearances(row.timestampIndex, Number(timeMs)); }

  async recordEvent(songIdInput, edition, event) {
    const normalized = validateBoundedTelemetry([event])[0];
    const songId = songKey(songIdInput);
    const row = { schemaVersion: "hapa.song-card.telemetry-event.v1", eventId: crypto.randomUUID(), songId, headId: headIdFor(songId), edition: Number(edition), at: this.now(), correlationId: event.correlationId || crypto.randomUUID(), ...normalized };
    await appendEvent(this.paths.events, row); return row;
  }

  recordOpen(songId, edition, body = {}) { return this.recordEvent(songId, edition, { type: "edition-opened", surface: body.surface || "song-card-viewer", correlationId: body.correlationId }); }
  recordPlaySummary(songId, edition, body = {}) { return this.recordEvent(songId, edition, { type: "play-summary", durationMs: Math.max(0, Number(body.durationMs || 0)), watchedMs: Math.max(0, Number(body.watchedMs || 0)), seeks: Math.max(0, Number(body.seeks || 0)), correlationId: body.correlationId }); }

  async print(songIdInput, editionNumber, timeMs, { appearanceId = "", surface = "song-card-viewer" } = {}) {
    const songId = songKey(songIdInput); const head = await this.ledger.getHead(headIdFor(songId)); const row = await this.ledger.readEdition(headIdFor(songId), Number(editionNumber)); const query = querySongCardAppearances(row.timestampIndex, Number(timeMs));
    const appearance = query.active.find((item) => item.appearanceId === appearanceId) || query.primary;
    if (!appearance?.snapshot) throw controllerError("no_printable_card", "No printable historical card exists at this timestamp.", 404, { truthStatus: query.truthStatus });
    const card = createPrintedSongCard({ head: publicHead(head, songId), edition: row.manifest.edition, appearance, timestampMs: Number(timeMs), activeAppearances: query.active, printedAt: this.now() });
    const lineageReceipt = buildPrintedCardLineageReceipt({ lineage: row.lineage, appearance, timestampMs: Number(timeMs), printedCard: card, printedAt: this.now() });
    card.songCardPrint.lineageReceipt = lineageReceipt;
    const telemetry = await this.recordEvent(songId, editionNumber, { type: "card-printed", appearanceId: appearance.appearanceId, sourceCardId: appearance.sourceCardId, timestampMs: Number(timeMs), surface, sourceDigest: appearance.sourceDigest, lineageReceiptHash: lineageReceipt.receiptHash });
    return { schemaVersion: "hapa.song-card.print-result.v1", card, primary: appearance, active: query.active, telemetry, lineageReceipt };
  }

  async artifactInfo(songIdInput, edition, role = "master") {
    const songId = songKey(songIdInput); const row = await this.ledger.readEdition(headIdFor(songId), Number(edition)); const artifact = role === "master" ? row.manifest.render : row.manifest.files?.[role];
    if (!artifact?.path || String(artifact.path).includes("..") || path.isAbsolute(artifact.path)) throw controllerError("artifact_not_found", "Edition artifact was not found.", 404);
    const absolute = path.resolve(row.directory, artifact.path); const relative = path.relative(row.directory, absolute); if (relative.startsWith("..") || path.isAbsolute(relative)) throw controllerError("artifact_path_escape", "Artifact path escaped the immutable edition.", 400);
    const stat = await fsp.stat(absolute).catch(() => null); if (!stat?.isFile()) throw controllerError("artifact_not_found", "Edition artifact was not found.", 404);
    const expected = String(artifact.sha256 || artifact.digest || "").replace(/^sha256:/u, "");
    if (artifact.bytes && Number(artifact.bytes) !== stat.size) throw controllerError("artifact_hash_mismatch", "Edition artifact byte size no longer matches its immutable manifest.", 409);
    const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${expected}`;
    let cached = this.artifactVerificationCache.get(absolute);
    if (!cached || cached.identity !== identity) {
      const pending = computeFileSha256(absolute).then((actual) => ({ identity, actual }));
      this.artifactVerificationCache.set(absolute, { identity, pending });
      cached = await pending;
      this.artifactVerificationCache.set(absolute, cached);
    } else if (cached.pending) {
      cached = await cached.pending;
      this.artifactVerificationCache.set(absolute, cached);
    }
    const actual = cached.actual;
    if (expected && expected !== actual) throw controllerError("artifact_hash_mismatch", "Edition artifact hash verification failed.", 409);
    return { role, relativePath: artifact.path, size: stat.size, sha256: actual, contentType: role === "master" ? "video/mp4" : role === "poster" ? artifact.mediaType || "image/jpeg" : "application/octet-stream", openReadStream: (options = {}) => fs.createReadStream(absolute, options) };
  }

  async privateManifest(songIdInput, edition) { const row = await this.ledger.readEdition(headIdFor(songKey(songIdInput)), Number(edition)); return readJson(path.join(row.directory, ".custody.private.json")); }
  async verify(songIdInput, edition) {
    const songId = songKey(songIdInput);
    const editionNumber = Number(edition);
    const head = await this.ledger.getHead(headIdFor(songId));
    const headEdition = head?.editions?.find((row) => Number(row.edition) === editionNumber) || null;
    const detail = await this.ledger.readEdition(headIdFor(songId), editionNumber);
    const master = await this.artifactInfo(songId, editionNumber, "master");
    const declaredJson = {
      appearanceIndex: [detail.manifest.files?.appearanceIndex || detail.manifest.timestampIndex, detail.timestampIndex],
      lineage: [detail.manifest.files?.lineage, detail.lineage],
      snapshot: [detail.manifest.files?.snapshot, detail.snapshot],
      showGraph: [detail.manifest.files?.showGraph, await readJson(path.join(detail.directory, "data", "show-graph.json"), null)],
      context: [detail.manifest.files?.context, await readJson(path.join(detail.directory, "data", "context.json"), null)],
      rendererTruth: [detail.manifest.files?.rendererTruth, await readJson(path.join(detail.directory, "data", "renderer-truth.json"), null)],
      receipts: [detail.manifest.files?.receipts, await readJson(path.join(detail.directory, "data", "receipts.json"), null)],
      captions: [detail.manifest.files?.captions, await readJson(path.join(detail.directory, "captions", "captions.json"), null)],
      telemetry: [detail.manifest.files?.telemetry || detail.manifest.telemetry, await readJson(path.join(detail.directory, "telemetry.json"), null)],
    };
    const supportFileHashes = Object.values(declaredJson).every(([descriptor, value]) => Boolean(descriptor?.sha256) && value !== null && rawDigest(value) === String(descriptor.sha256).replace(/^sha256:/u, ""));
    let intervalContract = false;
    let lineageContract = false;
    try { validateTimestampIndex(detail.timestampIndex, { durationMs: detail.timestampIndex.durationMs }); intervalContract = true; } catch {}
    try { validateLineage(detail.lineage); lineageContract = detail.lineage.complete === true && validateSongCardEditionLineage(detail.lineage).ok; } catch {}
    const checks = {
      renderHash: master.sha256 === detail.manifest.render?.sha256,
      headRenderHash: Boolean(headEdition) && master.sha256 === headEdition.renderSha256,
      manifestHash: Boolean(headEdition) && rawDigest(detail.manifest) === headEdition.publicManifestSha256,
      supportFileHashes,
      appearanceIndexDigest: detail.timestampIndex.indexDigest === detail.manifest.appearanceIndex?.digest,
      intervalContract,
      lineageContract,
      editionContract: validateSongCardEdition({ ...detail.manifest.edition, appearanceIndex: detail.timestampIndex, lineage: detail.lineage }, { publicManifest: detail.manifest }).ok,
      publicPathsOnly: !containsPrivateAbsolutePath(detail.manifest),
      immutablePermissions: await treeIsReadOnly(detail.directory),
    };
    return { schemaVersion: "hapa.song-card.edition-verification.v1", ok: Object.values(checks).every(Boolean), songId, edition: editionNumber, checks, renderSha256: master.sha256, appearanceIndexDigest: detail.timestampIndex.indexDigest, lineageComplete: lineageContract, publicPathsOnly: checks.publicPathsOnly };
  }
  async recover() {
    const recovery = await this.ledger.recover();
    const reconciledJobs = [];
    for (const name of await fsp.readdir(this.paths.plans).catch(() => [])) {
      if (!name.endsWith(".json")) continue;
      const planPath = path.join(this.paths.plans, name);
      const plan = await readJson(planPath, null);
      if (!plan || plan.status !== "minting") continue;
      const head = await this.ledger.getHead(plan.headId);
      const recoveryIdempotencyKey = plan.idempotencyKey || plan.planId;
      const committed = head?.idempotency?.[songCardIdempotencyStorageKey(recoveryIdempotencyKey)] || head?.idempotency?.[recoveryIdempotencyKey];
      if (committed?.semanticFingerprint === plan.semanticFingerprint) {
        plan.status = "completed";
        plan.completedAt = this.now();
        plan.edition = committed.edition;
        plan.progress = { stage: "completed-after-recovery", completed: 4, total: 4 };
        plan.logs = [...(plan.logs || []), { at: this.now(), message: "restart-reconciled-committed-edition" }].slice(-50);
      } else {
        plan.status = "failed";
        plan.failedAt = this.now();
        plan.retryable = true;
        plan.progress = { ...(plan.progress || {}), stage: "restart-interrupted" };
        plan.logs = [...(plan.logs || []), { at: this.now(), message: "restart-reconciled-retryable" }].slice(-50);
      }
      await atomicJson(planPath, plan);
      reconciledJobs.push({ planId: plan.planId, jobId: plan.jobId || null, status: plan.status, edition: plan.edition || null });
    }
    return { ...recovery, reconciledJobs };
  }
  cleanup(options) { return this.ledger.cleanupStaging(options); }
  archive(songId, edition, options) { return this.ledger.archiveEdition(headIdFor(songId), edition, options); }
  revoke(songId, edition, options) { return this.ledger.revokeEdition(headIdFor(songId), edition, options); }
  export(songId, edition, destination) { return this.ledger.exportEdition(headIdFor(songId), edition, destination); }

  async exportEdition(songIdInput, editionInput, { format = "bundle" } = {}) {
    await this.initialize();
    const songId = songKey(songIdInput);
    const edition = Number(editionInput);
    if (!Number.isInteger(edition) || edition < 1) throw controllerError("invalid_edition", "A positive Song Card edition is required.");
    const requestedFormat = String(format || "bundle").trim().toLowerCase();
    const normalizedFormat = ["video", "mp4", "video/mp4"].includes(requestedFormat)
      ? "video"
      : ["bundle", "song-card", "song_card"].includes(requestedFormat)
        ? "bundle"
        : "";
    if (!normalizedFormat) throw controllerError("invalid_export_format", "Export format must be video or bundle.");

    const headId = headIdFor(songId);
    const record = await this.ledger.readEdition(headIdFor(songId), edition).catch((error) => {
      if (error?.code === "ENOENT") throw controllerError("edition_not_found", `Song Card ${songId} Edition ${edition} was not found.`, 404);
      throw error;
    });
    await this.ledger.verifyEditionBundleForTransfer(headId, edition);
    const exportSelection = await this.writableExportRoot();
    const exportRoot = exportSelection.root;
    const baseName = `${safeFileSegment(songId)}-song-card-edition-${String(edition).padStart(4, "0")}`;
    let result;
    if (normalizedFormat === "video") {
      const artifact = await this.artifactInfo(songId, edition, "master");
      const source = path.resolve(record.directory, artifact.relativePath);
      const destination = await uniqueDestination(path.join(exportRoot, baseName), ".mp4");
      await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
      const exportedSha256 = await computeFileSha256(destination);
      if (exportedSha256 !== artifact.sha256) {
        await fsp.rm(destination, { force: true });
        throw controllerError("export_hash_mismatch", "Exported video does not match the immutable edition.", 409);
      }
      await fsp.chmod(destination, 0o644);
      result = {
        schemaVersion: SONG_CARD_MANAGED_EXPORT_SCHEMA,
        format: "video",
        songId,
        edition,
        destination,
        fileName: path.basename(destination),
        sha256: exportedSha256,
        bytes: (await fsp.stat(destination)).size,
        exportRoot,
        fallbackUsed: exportSelection.fallbackUsed,
        fallbackReason: exportSelection.fallbackReason || null,
        preferredExportRoot: exportSelection.fallbackUsed ? exportSelection.preferredRoot : null,
      };
    } else {
      const destination = await uniqueDestination(path.join(exportRoot, `${baseName}-bundle`));
      const exported = await this.ledger.exportEdition(headIdFor(songId), edition, destination);
      result = {
        schemaVersion: SONG_CARD_MANAGED_EXPORT_SCHEMA,
        format: "bundle",
        songId,
        edition,
        destination: exported.destination,
        fileName: path.basename(exported.destination),
        bundleDigest: exported.bundleDigest,
        renderSha256: exported.renderSha256,
        exportRoot,
        fallbackUsed: exportSelection.fallbackUsed,
        fallbackReason: exportSelection.fallbackReason || null,
        preferredExportRoot: exportSelection.fallbackUsed ? exportSelection.preferredRoot : null,
      };
    }
    await appendEvent(this.paths.events, {
      schemaVersion: "hapa.song-card.managed-export-event.v1",
      eventId: crypto.randomUUID(),
      type: "edition-exported",
      at: this.now(),
      headId: headIdFor(songId),
      edition,
      format: normalizedFormat,
      destination: result.destination,
      fallbackUsed: exportSelection.fallbackUsed,
    });
    return result;
  }

  import(source) { return this.ledger.importEdition(source); }
  backup(destination) { return this.ledger.backup(destination); }
  restore(source) { return this.ledger.restore(source); }
  migrate(input) { return this.ledger.migrateLegacyCard(input); }

  async catalogProjection() {
    const ledger = await this.ledger.readLedger(); const heads = Object.values(ledger.heads).map((head) => publicHead(head, head.songId)); const editions = heads.flatMap((head) => (ledger.heads[head.id]?.editions || []).map((row) => ({ id: `${head.id}:edition:${row.edition}`, songId: head.songId, title: head.title || head.songId, ...row }))); return { heads, editions };
  }
}

export function createSongCardMintController(options) { return new SongCardMintController(options); }
export { MintLedgerError };
