#!/usr/bin/env node
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  buildSongCardMintSnapshot,
  compileSongCardAppearanceIndex,
  createPrintedSongCard,
  diffSongCardMintSnapshots,
  fingerprintSongCardMintSnapshot,
  querySongCardAppearances,
} from "../src/domain/song-card-mint.js";
import {
  MintLedgerError,
  SongCardMintLedger,
  computeFileSha256,
  probeRenderedMedia,
} from "../server/song-card-mint-ledger.mjs";

const execFile = promisify(execFileCallback);
const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

export const DEFAULT_DEAR_PAPA_SOURCE = path.join(
  PROJECT_ROOT,
  "outputs/hyperframes-dear-papa-v2-foundation-demo/renders/dear-papa-foundation-production.mp4",
);
export const DEFAULT_DEAR_PAPA_GRAPH = path.join(
  PROJECT_ROOT,
  "work/dear-papa-stem-telemetry/native-show-graph.json",
);
export const DEFAULT_DEAR_PAPA_MINT_OUTPUT = path.join(
  PROJECT_ROOT,
  "outputs/dear-papa-song-card-mint-demo",
);

const DEMO_SCHEMA = "hapa.song-card.two-edition-production-gate.v1";
const EDIT_SCHEMA = "hapa.song-card.editor-interval-edit.v1";
const RIGHTS = Object.freeze({
  licensingStatus: "operator-authored-hapa-creative-commons",
  consentStatus: "operator-authored",
  attribution: ["Author: Calder", "Dear Papa album"],
});

function clone(value) {
  return structuredClone(value);
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableDigest(value) {
  return sha256(JSON.stringify(stableValue(value)));
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

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function takeFlagValue(argv, index, name) {
  const token = argv[index];
  if (token === name) {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    return { value, consumed: 2 };
  }
  if (token.startsWith(`${name}=`)) return { value: token.slice(name.length + 1), consumed: 1 };
  return null;
}

export function parseCliArgs(argv = []) {
  const options = {
    apply: false,
    output: DEFAULT_DEAR_PAPA_MINT_OUTPUT,
    mintRoot: null,
    sourceVideoPath: DEFAULT_DEAR_PAPA_SOURCE,
    graphPath: DEFAULT_DEAR_PAPA_GRAPH,
  };
  for (let index = 0; index < argv.length;) {
    const token = argv[index];
    if (token === "--apply") {
      options.apply = true;
      index += 1;
      continue;
    }
    const matches = [
      ["--output", "output"],
      ["--mint-root", "mintRoot"],
      ["--source", "sourceVideoPath"],
      ["--graph", "graphPath"],
    ].map(([flag, key]) => ({ key, match: takeFlagValue(argv, index, flag) })).find((row) => row.match);
    if (!matches) throw new Error(`Unknown argument: ${token}`);
    options[matches.key] = path.resolve(matches.match.value);
    index += matches.match.consumed;
  }
  options.output = path.resolve(options.output);
  options.mintRoot = path.resolve(options.mintRoot || path.join(options.output, "mint-ledger"));
  options.sourceVideoPath = path.resolve(options.sourceVideoPath);
  options.graphPath = path.resolve(options.graphPath);
  return options;
}

function graphCards(graph) {
  return (graph.tracks || []).flatMap((track, trackIndex) => (track.cards || []).map((card, cardIndex) => ({
    track,
    card,
    trackIndex,
    cardIndex,
  })));
}

/**
 * Makes one deterministic, inspectable editor change. The selected foundation
 * cue borrows the next cue's media and is trimmed slightly; no ranking,
 * prompting, or other creative decision pass is performed.
 */
export function buildDeterministicEditorSwap(graph) {
  const editedGraph = clone(graph);
  const durationSeconds = Number(editedGraph.song?.durationSeconds || 0);
  const minimumCueSeconds = Math.min(2, Math.max(0.5, durationSeconds * 0.4));
  const tracks = editedGraph.tracks || [];
  let selected = null;
  for (let trackIndex = 0; trackIndex < tracks.length && !selected; trackIndex += 1) {
    const track = tracks[trackIndex];
    if (!/foundation|visual|program/iu.test(String(track.role || track.id || ""))) continue;
    for (let cardIndex = 0; cardIndex < (track.cards || []).length - 1; cardIndex += 1) {
      const card = track.cards[cardIndex];
      const donor = track.cards[cardIndex + 1];
      const cueDuration = Number(card.endSeconds || 0) - Number(card.startSeconds || 0);
      const leftId = card.media?.id || card.visualization?.sourceId || "";
      const rightId = donor.media?.id || donor.visualization?.sourceId || "";
      if (cueDuration >= minimumCueSeconds && rightId && leftId !== rightId) {
        selected = { track, card, donor, trackIndex, cardIndex, cueDuration };
        break;
      }
    }
  }
  if (!selected) throw new Error("The show graph has no deterministic foundation cue suitable for a swap/trim edit");

  const { track, card, donor, cueDuration } = selected;
  const original = clone(card);
  const trimSeconds = Math.min(0.25, Math.max(0.05, cueDuration * 0.05));
  const editedEndSeconds = Number((Number(card.endSeconds) - trimSeconds).toFixed(3));
  card.media = clone(donor.media);
  if (donor.visualization) card.visualization = clone(donor.visualization);
  else delete card.visualization;
  card.endSeconds = editedEndSeconds;
  card.provenance = {
    ...(card.provenance || {}),
    songCardMintEditorEdit: {
      schemaVersion: EDIT_SCHEMA,
      operation: "swap-media-and-trim-end",
      donorCueId: donor.id,
      originalMediaId: original.media?.id || null,
      replacementMediaId: donor.media?.id || null,
      originalEndSeconds: original.endSeconds,
      editedEndSeconds,
      decisionRun: "reused-existing-editor-decision-no-new-creative-run",
    },
  };
  const edit = {
    schemaVersion: EDIT_SCHEMA,
    operation: "swap-media-and-trim-end",
    trackId: track.id,
    cueId: card.id,
    donorCueId: donor.id,
    originalMediaId: original.media?.id || null,
    replacementMediaId: donor.media?.id || null,
    startSeconds: Number(original.startSeconds),
    originalEndSeconds: Number(original.endSeconds),
    editedEndSeconds,
    trimSeconds: Number((Number(original.endSeconds) - editedEndSeconds).toFixed(3)),
    visualChangeInterval: [Number(original.startSeconds), editedEndSeconds],
    dirtyInterval: [Number(original.startSeconds), Number(original.endSeconds)],
    creativeDecisionRun: false,
  };
  editedGraph.songCardMintEditor = edit;
  return { editedGraph, edit, originalCue: original, editedCue: clone(card) };
}

function vttTimestamp(seconds) {
  const ms = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

export function buildCaptionVtt(graph) {
  const lines = graph.song?.lyricOverlay?.lines || [];
  const cues = lines.map((line, index) => `${index + 1}\n${vttTimestamp(line.start)} --> ${vttTimestamp(line.end)}\n${line.text}`);
  return `WEBVTT\n\n${cues.join("\n\n")}${cues.length ? "\n\n" : ""}`;
}

function intervalFilter(startSeconds, endSeconds) {
  const enable = `between(t\\,${startSeconds}\\,${endSeconds})`;
  return [
    `drawbox=x=0:y=0:w=iw:h=max(8\\,ih*0.018):color=0xF6C96D@0.92:t=fill:enable='${enable}'`,
    `drawbox=x=0:y=ih-max(8\\,ih*0.018):w=iw:h=max(8\\,ih*0.018):color=0x67E8F9@0.92:t=fill:enable='${enable}'`,
  ].join(",");
}

export function editionTwoFfmpegArgs({ sourceVideoPath, outputVideoPath, startSeconds, endSeconds }) {
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", sourceVideoPath,
    "-map", "0:v:0", "-map", "0:a:0",
    "-vf", intervalFilter(startSeconds, endSeconds),
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    "-map_metadata", "-1", "-map_chapters", "-1", "-movflags", "+faststart",
    outputVideoPath,
  ];
}

async function runFfmpeg(args) {
  try {
    await execFile("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error);
    throw new Error(`ffmpeg failed: ${detail}`);
  }
}

async function audioPacketMd5(mediaPath) {
  try {
    const { stdout } = await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", mediaPath,
      "-map", "0:a:0", "-c", "copy", "-f", "md5", "-",
    ], { maxBuffer: 4 * 1024 * 1024 });
    const match = String(stdout).trim().match(/MD5=([a-f0-9]{32})/iu);
    if (!match) throw new Error(`Unexpected ffmpeg MD5 output: ${stdout}`);
    return match[1].toLowerCase();
  } catch (error) {
    throw new Error(`Unable to verify the audio packet checksum: ${String(error?.stderr || error?.message || error)}`);
  }
}

async function ensureEditionTwoRender({ sourceVideoPath, outputVideoPath, edit, receiptPath }) {
  const sourceSha256 = await computeFileSha256(sourceVideoPath);
  const editDigest = stableDigest(edit);
  const priorReceipt = await pathExists(receiptPath) ? await readJson(receiptPath).catch(() => null) : null;
  if (await pathExists(outputVideoPath)) {
    const outputSha256 = await computeFileSha256(outputVideoPath);
    if (priorReceipt?.sourceSha256 === sourceSha256 && priorReceipt?.editDigest === editDigest && priorReceipt?.outputSha256 === outputSha256 && priorReceipt?.audioPacketsPreserved === true) {
      return { ...priorReceipt, reused: true };
    }
  }
  await fsp.mkdir(path.dirname(outputVideoPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(outputVideoPath), `.${path.basename(outputVideoPath)}.${process.pid}.tmp.mp4`);
  await fsp.rm(temporaryPath, { force: true });
  const args = editionTwoFfmpegArgs({
    sourceVideoPath,
    outputVideoPath: temporaryPath,
    startSeconds: edit.visualChangeInterval[0],
    endSeconds: edit.visualChangeInterval[1],
  });
  await runFfmpeg(args);
  await fsp.rename(temporaryPath, outputVideoPath);
  const outputSha256 = await computeFileSha256(outputVideoPath);
  const sourceAudioPacketMd5 = await audioPacketMd5(sourceVideoPath);
  const outputAudioPacketMd5 = await audioPacketMd5(outputVideoPath);
  if (sourceAudioPacketMd5 !== outputAudioPacketMd5) throw new Error("Edition 2 did not preserve Edition 1 audio packets");
  const receipt = {
    schemaVersion: "hapa.song-card.interval-render-receipt.v1",
    sourceEdition: 1,
    sourceSha256,
    outputSha256,
    editDigest,
    visualChangeInterval: edit.visualChangeInterval,
    filterActivationOutsideInterval: false,
    audioMode: "stream-copy",
    sourceAudioPacketMd5,
    outputAudioPacketMd5,
    audioPacketsPreserved: sourceAudioPacketMd5 === outputAudioPacketMd5,
    videoMode: "interval-gated-drawbox-filter",
    creativeDecisionRun: false,
    ffmpeg: { executable: "ffmpeg", args: args.map((arg) => arg === sourceVideoPath ? "<edition-1-master>" : arg === temporaryPath ? "<edition-2-master>" : arg) },
    reused: false,
  };
  await writeJson(receiptPath, receipt);
  return receipt;
}

function projectSnapshot(graph, revision, edit = null) {
  return {
    schemaVersion: "hapa.echo-state.multitrack-editor-project.v1",
    revision,
    song_id: graph.song?.id,
    song_title: graph.song?.title,
    duration: graph.song?.durationSeconds,
    source: "native-show-graph",
    editLog: edit ? [edit] : [],
  };
}

function buildSnapshot({ graph, revision, render, rendererTruth, edit = null }) {
  return buildSongCardMintSnapshot({
    song: { id: graph.song?.id, title: graph.song?.title, albumId: "echo-album" },
    project: projectSnapshot(graph, revision, edit),
    showGraph: graph,
    render,
    registry: { songRegistryId: graph.song?.id, graphSchema: graph.schemaVersion },
    cardSnapshots: {},
    rights: RIGHTS,
    approvals: { technical: true, creative: false, scope: "private-production-gate" },
    rendererTruth,
  });
}

function rendererTruthFor({ graph, probe, appearanceIndex }) {
  const gaps = appearanceIndex.gaps || [];
  return {
    schemaVersion: "hapa.song-card.renderer-truth.v1",
    ok: probe.decodeOk === true && probe.hasVideo === true && probe.hasAudio === true && gaps.length === 0,
    allStatesVisible: gaps.length === 0,
    silentDefaultCount: 0,
    cueReceiptCount: graphCards(graph).length,
    appearanceReceiptCount: appearanceIndex.appearances?.length || 0,
    intervalConvention: appearanceIndex.intervalRule,
    evidence: "ffprobe-plus-half-open-appearance-coverage",
    probe,
  };
}

function lineageFor({ graphSha256, renderSha256, revision, edit = null }) {
  const graphNode = `show-graph:${graphSha256.slice(0, 24)}`;
  const sourceNode = `render-source:${renderSha256.slice(0, 24)}`;
  const nodes = [
    { id: graphNode, kind: "native-show-graph", sha256: graphSha256 },
    { id: sourceNode, kind: "rendered-master", sha256: renderSha256 },
  ];
  const edges = [{ from: graphNode, to: sourceNode, relation: "rendered-as" }];
  if (edit) {
    const editNode = `editor-edit:${stableDigest(edit).slice(0, 24)}`;
    nodes.push({ id: editNode, kind: "editor-interval-edit", revision });
    edges.push({ from: editNode, to: sourceNode, relation: "applied-to-interval" });
  }
  return { nodes, edges };
}

async function extractPoster(masterPath, posterPath, durationSeconds) {
  await fsp.mkdir(path.dirname(posterPath), { recursive: true });
  const atSeconds = Math.max(0, Math.min(Number(durationSeconds || 1) - 0.05, Number(durationSeconds || 1) * 0.35));
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y", "-ss", String(atSeconds), "-i", masterPath,
    "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", posterPath,
  ]);
  return { atSeconds, sha256: await computeFileSha256(posterPath), bytes: (await fsp.stat(posterPath)).size };
}

async function writeEditionSupportArtifacts({ output, edition, graph, masterPath, manifest, probe, receipt }) {
  const directory = path.join(output, "edition-support", `edition-${edition}`);
  await fsp.mkdir(directory, { recursive: true });
  const graphPath = path.join(directory, "native-show-graph.json");
  const captionsPath = path.join(directory, "captions.vtt");
  const posterPath = path.join(directory, "poster.jpg");
  const rendererPath = path.join(directory, "renderer-truth.json");
  const rightsPath = path.join(directory, "rights.json");
  const receiptsPath = path.join(directory, "receipts.json");
  await writeJson(graphPath, graph);
  await fsp.writeFile(captionsPath, buildCaptionVtt(graph), "utf8");
  const poster = await extractPoster(masterPath, posterPath, probe.durationSeconds);
  await writeJson(rendererPath, {
    schemaVersion: "hapa.song-card.renderer-truth.v1",
    edition,
    masterSha256: manifest.render.sha256,
    probe,
    ffprobeVerified: true,
  });
  await writeJson(rightsPath, { schemaVersion: "hapa.song-card.rights.v1", edition, ...RIGHTS });
  await writeJson(receiptsPath, {
    schemaVersion: "hapa.song-card.production-receipts.v1",
    edition,
    technicalApproval: true,
    creativeApproval: false,
    publishStatus: manifest.edition.publishStatus,
    mintManifest: "manifest.public.json",
    intervalRender: receipt || null,
  });
  return {
    directory,
    poster,
    files: {
      graph: { path: path.relative(output, graphPath), sha256: await computeFileSha256(graphPath) },
      captions: { path: path.relative(output, captionsPath), sha256: await computeFileSha256(captionsPath) },
      poster: { path: path.relative(output, posterPath), sha256: poster.sha256 },
      renderer: { path: path.relative(output, rendererPath), sha256: await computeFileSha256(rendererPath) },
      rights: { path: path.relative(output, rightsPath), sha256: await computeFileSha256(rightsPath) },
      receipts: { path: path.relative(output, receiptsPath), sha256: await computeFileSha256(receiptsPath) },
    },
  };
}

function containsAbsolutePath(value) {
  if (typeof value === "string") return (path.isAbsolute(value) && !/^\/(?:api|media|static)\//u.test(value)) || value.startsWith("file:");
  if (Array.isArray(value)) return value.some(containsAbsolutePath);
  return Boolean(value && typeof value === "object" && Object.values(value).some(containsAbsolutePath));
}

async function verifyEdition(ledger, headId, edition) {
  const record = await ledger.readEdition(headId, edition);
  const masterPath = path.join(record.directory, record.manifest.render.path);
  const actualSha256 = await computeFileSha256(masterPath);
  const probe = await probeRenderedMedia(masterPath);
  const mode = (await fsp.stat(masterPath)).mode;
  const required = [
    "manifest.public.json", "timestamp-index.json", "lineage.json", "telemetry.json", "transaction.json", "media/master.mp4",
    "data/mint-snapshot.json", "data/show-graph.json", "data/context.json", "data/renderer-truth.json", "data/receipts.json", "captions/captions.json",
  ];
  if (record.manifest.files?.poster?.path) required.push(record.manifest.files.poster.path);
  const filesPresent = (await Promise.all(required.map((relative) => pathExists(path.join(record.directory, relative))))).every(Boolean);
  const checks = {
    sha256MatchesManifest: actualSha256 === record.manifest.render.sha256,
    ffprobeDecodeOk: probe.decodeOk && probe.hasVideo && probe.hasAudio,
    immutablePermissionBits: (mode & 0o222) === 0,
    offlineFilesPresent: filesPresent,
    publicManifestPortable: !containsAbsolutePath(record.manifest),
    lineageComplete: record.lineage.complete === true,
    timestampIndexPinned: Boolean(record.timestampIndex.indexDigest),
  };
  return { ok: Object.values(checks).every(Boolean), edition, masterPath, actualSha256, probe, checks, record };
}

function editedAppearanceAt(record, cueId, timestampMs) {
  return querySongCardAppearances(record.timestampIndex, timestampMs).active.find((row) => row.cueId === cueId && row.snapshot);
}

async function createHistoricalPrint({ verification, timestampMs, cueId, outputPath }) {
  const { record } = verification;
  const active = querySongCardAppearances(record.timestampIndex, timestampMs).active;
  const appearance = editedAppearanceAt(record, cueId, timestampMs);
  if (!appearance) throw new Error(`Edition ${verification.edition} has no printable historical ${cueId} appearance at ${timestampMs}ms`);
  const printed = createPrintedSongCard({
    head: record.manifest.head,
    edition: record.manifest.edition,
    appearance,
    activeAppearances: active,
    timestampMs,
    printedAt: record.manifest.createdAt,
  });
  await writeJson(outputPath, printed);
  return printed;
}

async function runFailureFixtures({ output, sourceVideoPath, graph, snapshot, appearanceIndex }) {
  const fixturesRoot = path.join(output, "failure-fixtures");
  await fsp.mkdir(fixturesRoot, { recursive: true });
  const staleLedger = new SongCardMintLedger({
    root: path.join(fixturesRoot, "stale-revision-ledger"),
    allowedSourceRoots: [path.dirname(sourceVideoPath)],
    readSourceRevision: async () => "editor-revision:actual-newer",
  });
  let staleError = null;
  try {
    await staleLedger.mint({
      headId: `song-card:${graph.song.id}-stale-fixture`,
      idempotencyKey: "stale-fixture",
      semanticFingerprint: "sha256:stale-fixture",
      sourceRevision: "editor-revision:expected-older",
      sourceVideoPath,
      song: { id: `${graph.song.id}-stale-fixture`, title: `${graph.song.title} stale fixture` },
      snapshot,
      timestampIndex: appearanceIndex,
      lineage: { nodes: [], edges: [] },
    });
  } catch (error) {
    staleError = error;
  }

  const invalidPath = path.join(fixturesRoot, "invalid-no-av.mp4");
  await fsp.writeFile(invalidPath, "not a rendered media file", "utf8");
  const invalidLedger = new SongCardMintLedger({
    root: path.join(fixturesRoot, "invalid-media-ledger"),
    allowedSourceRoots: [fixturesRoot],
  });
  let failureError = null;
  try {
    await invalidLedger.mint({
      headId: `song-card:${graph.song.id}-invalid-fixture`,
      idempotencyKey: "invalid-media-fixture",
      semanticFingerprint: "sha256:invalid-media-fixture",
      sourceRevision: "invalid-media-fixture",
      sourceVideoPath: invalidPath,
      song: { id: `${graph.song.id}-invalid-fixture`, title: `${graph.song.title} invalid fixture` },
      snapshot,
      timestampIndex: appearanceIndex,
      lineage: { nodes: [], edges: [] },
    });
  } catch (error) {
    failureError = error;
  }
  const result = {
    schemaVersion: "hapa.song-card.failure-fixtures.v1",
    staleRevision: {
      detected: staleError instanceof MintLedgerError && staleError.code === "SOURCE_REVISION_CHANGED",
      code: staleError?.code || null,
    },
    invalidMedia: {
      detected: failureError instanceof MintLedgerError && failureError.code === "MEDIA_PROBE_FAILED",
      code: failureError?.code || null,
    },
  };
  await writeJson(path.join(fixturesRoot, "failure-fixtures.json"), result);
  return result;
}

async function runTamperFixture({ output, immutableMasterPath, expectedSha256 }) {
  const fixturePath = path.join(output, "failure-fixtures", "mutable-tamper-copy.mp4");
  await fsp.mkdir(path.dirname(fixturePath), { recursive: true });
  await fsp.copyFile(immutableMasterPath, fixturePath);
  await fsp.chmod(fixturePath, 0o644);
  await fsp.appendFile(fixturePath, Buffer.from("HAPA_TAMPER_FIXTURE"));
  const tamperedSha256 = await computeFileSha256(fixturePath);
  const immutableSha256AfterFixture = await computeFileSha256(immutableMasterPath);
  const result = {
    schemaVersion: "hapa.song-card.tamper-fixture.v1",
    detected: tamperedSha256 !== expectedSha256,
    expectedSha256,
    tamperedSha256,
    immutableOriginalUnchanged: immutableSha256AfterFixture === expectedSha256,
    note: "The mutation is performed on a disposable copy; immutable edition bytes are never modified.",
  };
  await writeJson(path.join(output, "failure-fixtures", "tamper-detection.json"), result);
  return result;
}

function dryRunPlan(options, graph, edit) {
  return {
    schemaVersion: DEMO_SCHEMA,
    mode: "dry-run",
    applied: false,
    sourceVideoPath: options.sourceVideoPath,
    graphPath: options.graphPath,
    output: options.output,
    mintRoot: options.mintRoot,
    song: { id: graph.song?.id, title: graph.song?.title, durationSeconds: graph.song?.durationSeconds },
    editorEdit: edit,
    plan: [
      "Verify the bounded Edition 1 rendered master with SHA-256 and ffprobe.",
      "Mint immutable Edition 1 and replay its idempotency key.",
      "Apply the one-interval editor swap/trim without a creative decision run.",
      "Derive Edition 2 from Edition 1 with an interval-gated visual marker and audio stream-copy.",
      "Mint immutable Edition 2 and verify offline custody plus historical timestamp printing.",
      "Run tamper, stale-revision, and invalid-media failure fixtures.",
    ],
    note: "Nothing was rendered, minted, or written. Re-run with --apply to execute.",
  };
}

export async function runDearPapaSongCardMintDemo(inputOptions = {}) {
  const options = {
    apply: inputOptions.apply === true,
    output: path.resolve(inputOptions.output || DEFAULT_DEAR_PAPA_MINT_OUTPUT),
    mintRoot: path.resolve(inputOptions.mintRoot || path.join(inputOptions.output || DEFAULT_DEAR_PAPA_MINT_OUTPUT, "mint-ledger")),
    sourceVideoPath: path.resolve(inputOptions.sourceVideoPath || DEFAULT_DEAR_PAPA_SOURCE),
    graphPath: path.resolve(inputOptions.graphPath || DEFAULT_DEAR_PAPA_GRAPH),
  };
  if (!(await pathExists(options.sourceVideoPath))) throw new Error(`Dear Papa rendered source is missing: ${options.sourceVideoPath}`);
  if (!(await pathExists(options.graphPath))) throw new Error(`Dear Papa native show graph is missing: ${options.graphPath}`);
  const graph = await readJson(options.graphPath);
  if (!graph.song?.id || !(Number(graph.song?.durationSeconds) > 0)) throw new Error("The native show graph is missing bounded song identity or duration");
  const { editedGraph, edit } = buildDeterministicEditorSwap(graph);
  if (!options.apply) return dryRunPlan(options, graph, edit);

  await fsp.mkdir(options.output, { recursive: true });
  const sourceProbe = await probeRenderedMedia(options.sourceVideoPath);
  const requestedDuration = Number(graph.song.durationSeconds);
  if (!sourceProbe.decodeOk || !sourceProbe.hasAudio || !sourceProbe.hasVideo) throw new Error("Edition 1 source must decode with both audio and video");
  if (Math.abs(sourceProbe.durationSeconds - requestedDuration) > 0.25) {
    throw new Error(`Edition 1 duration ${sourceProbe.durationSeconds}s does not match bounded graph duration ${requestedDuration}s`);
  }
  const sourceSha256 = await computeFileSha256(options.sourceVideoPath);
  const graphSha256 = await computeFileSha256(options.graphPath);
  const revision1 = `editor-revision:${graphSha256.slice(0, 24)}`;
  const appearance1 = compileSongCardAppearanceIndex({ showGraph: graph, durationSeconds: sourceProbe.durationSeconds });
  const rendererTruth1 = rendererTruthFor({ graph, probe: sourceProbe, appearanceIndex: appearance1 });
  const snapshot1 = buildSnapshot({
    graph,
    revision: revision1,
    render: { role: "master", sha256: sourceSha256, durationSeconds: sourceProbe.durationSeconds, probe: sourceProbe },
    rendererTruth: rendererTruth1,
  });
  const fingerprint1 = fingerprintSongCardMintSnapshot(snapshot1);
  const headId = `song-card:${graph.song.id}`;
  const candidatePoster1 = path.join(options.output, "candidate-assets", "edition-1-poster.jpg");
  await extractPoster(options.sourceVideoPath, candidatePoster1, sourceProbe.durationSeconds);
  const ledger = new SongCardMintLedger({
    root: options.mintRoot,
    allowedSourceRoots: [...new Set([path.dirname(options.sourceVideoPath), options.output])],
  });
  const request1 = {
    headId,
    idempotencyKey: `dear-papa:e1:${fingerprint1}`,
    semanticFingerprint: fingerprint1,
    sourceRevision: revision1,
    sourceVideoPath: options.sourceVideoPath,
    song: { id: graph.song.id, title: graph.song.title, albumId: "echo-album" },
    snapshot: snapshot1,
    timestampIndex: appearance1,
    posterPath: candidatePoster1,
    context: { songId: graph.song.id, title: graph.song.title, editionCandidate: 1, boundedDurationSeconds: requestedDuration },
    rendererTruth: rendererTruth1,
    receipts: { technicalApproval: true, creativeApproval: false, sourceSha256, graphSha256, newCreativeDecisionRun: false },
    captions: graph.song?.lyricOverlay || { lines: [] },
    lineage: lineageFor({ graphSha256, renderSha256: sourceSha256, revision: revision1 }),
    telemetry: [
      { type: "render-verified", durationMs: Math.round(sourceProbe.durationSeconds * 1000), renderer: "hyperframes-foundation" },
      { type: "mint-requested", editionCandidate: 1 },
    ],
    rights: RIGHTS,
    approvals: { technical: true, creative: false, gate: "private-production-demo" },
    safety: { ok: true, scope: "private-production-demo-render" },
  };
  const mint1 = await ledger.mint(request1);
  const retry1 = await ledger.mint(request1);
  if (mint1.edition !== 1 || retry1.edition !== 1 || retry1.created !== false || !["idempotency-replay", "semantic-no-change"].includes(retry1.reason)) {
    throw new Error("Edition 1 idempotent retry did not resolve to the same immutable edition");
  }
  const verification1Before = await verifyEdition(ledger, headId, 1);

  const edition2Path = path.join(options.output, "renders", "dear-papa-song-card-edition-2.mp4");
  const intervalReceiptPath = path.join(options.output, "renders", "edition-2-interval-render-receipt.json");
  const intervalReceipt = await ensureEditionTwoRender({
    sourceVideoPath: verification1Before.masterPath,
    outputVideoPath: edition2Path,
    edit,
    receiptPath: intervalReceiptPath,
  });
  const probe2 = await probeRenderedMedia(edition2Path);
  if (!probe2.decodeOk || !probe2.hasAudio || !probe2.hasVideo || Math.abs(probe2.durationSeconds - sourceProbe.durationSeconds) > 0.05) {
    throw new Error("Edition 2 interval render did not preserve decodable A/V and duration");
  }
  const renderSha2562 = await computeFileSha256(edition2Path);
  if (renderSha2562 === sourceSha256) throw new Error("Edition 2 interval render did not produce changed rendered bytes");
  const editedGraphSha256 = stableDigest(editedGraph);
  const revision2 = `editor-revision:${editedGraphSha256.slice(0, 24)}`;
  const appearance2 = compileSongCardAppearanceIndex({ showGraph: editedGraph, durationSeconds: probe2.durationSeconds });
  const rendererTruth2 = rendererTruthFor({ graph: editedGraph, probe: probe2, appearanceIndex: appearance2 });
  const snapshot2 = buildSnapshot({
    graph: editedGraph,
    revision: revision2,
    edit,
    render: { role: "master", sha256: renderSha2562, durationSeconds: probe2.durationSeconds, probe: probe2, intervalRender: intervalReceipt },
    rendererTruth: rendererTruth2,
  });
  const semanticDiff = diffSongCardMintSnapshots(snapshot1, snapshot2);
  const fingerprint2 = fingerprintSongCardMintSnapshot(snapshot2);
  if (!semanticDiff.changed || fingerprint1 === fingerprint2) throw new Error("The deterministic editor mutation did not produce a material next-mint fingerprint");
  const candidatePoster2 = path.join(options.output, "candidate-assets", "edition-2-poster.jpg");
  await extractPoster(edition2Path, candidatePoster2, probe2.durationSeconds);
  const request2 = {
    headId,
    idempotencyKey: `dear-papa:e2:${fingerprint2}`,
    semanticFingerprint: fingerprint2,
    sourceRevision: revision2,
    sourceVideoPath: edition2Path,
    song: { id: graph.song.id, title: graph.song.title, albumId: "echo-album" },
    snapshot: snapshot2,
    timestampIndex: appearance2,
    posterPath: candidatePoster2,
    context: { songId: graph.song.id, title: graph.song.title, editionCandidate: 2, boundedDurationSeconds: requestedDuration, parentEdition: 1 },
    rendererTruth: rendererTruth2,
    receipts: { technicalApproval: true, creativeApproval: false, intervalRender: intervalReceipt, semanticDiff, newCreativeDecisionRun: false },
    captions: editedGraph.song?.lyricOverlay || { lines: [] },
    lineage: lineageFor({ graphSha256: editedGraphSha256, renderSha256: renderSha2562, revision: revision2, edit }),
    telemetry: [
      { type: "editor-material-change", changedFamilies: semanticDiff.changedFamilies, dirtyRanges: semanticDiff.dirtyRanges },
      { type: "interval-render-completed", interval: edit.visualChangeInterval, audioMode: "stream-copy" },
      { type: "mint-requested", editionCandidate: 2 },
    ],
    rights: RIGHTS,
    approvals: { technical: true, creative: false, gate: "private-production-demo" },
    safety: { ok: true, scope: "private-production-demo-render" },
  };
  const mint2 = await ledger.mint(request2);
  if (mint2.edition !== 2) throw new Error(`Expected Edition 2, received Edition ${mint2.edition}`);
  const verification1 = await verifyEdition(ledger, headId, 1);
  const verification2 = await verifyEdition(ledger, headId, 2);
  const edition1UnchangedAfterEdition2 = verification1.actualSha256 === verification1Before.actualSha256;
  const timestampMs = Math.round((edit.startSeconds + Math.min(0.1, (edit.editedEndSeconds - edit.startSeconds) / 2)) * 1000);
  const printDirectory = path.join(options.output, "historical-prints");
  const print1 = await createHistoricalPrint({
    verification: verification1,
    timestampMs,
    cueId: edit.cueId,
    outputPath: path.join(printDirectory, "dear-papa-edition-1-card-print.json"),
  });
  const print2 = await createHistoricalPrint({
    verification: verification2,
    timestampMs,
    cueId: edit.cueId,
    outputPath: path.join(printDirectory, "dear-papa-edition-2-card-print.json"),
  });
  const historicalPrintsPinned = print1.songCardPrint.edition === 1
    && print2.songCardPrint.edition === 2
    && print1.songCardPrint.sourceDigest !== print2.songCardPrint.sourceDigest;

  const support1 = await writeEditionSupportArtifacts({
    output: options.output,
    edition: 1,
    graph,
    masterPath: verification1.masterPath,
    manifest: verification1.record.manifest,
    probe: verification1.probe,
    receipt: null,
  });
  const support2 = await writeEditionSupportArtifacts({
    output: options.output,
    edition: 2,
    graph: editedGraph,
    masterPath: verification2.masterPath,
    manifest: verification2.record.manifest,
    probe: verification2.probe,
    receipt: intervalReceipt,
  });
  const tamper = await runTamperFixture({
    output: options.output,
    immutableMasterPath: verification1.masterPath,
    expectedSha256: verification1.actualSha256,
  });
  const failureFixtures = await runFailureFixtures({
    output: options.output,
    sourceVideoPath: edition2Path,
    graph,
    snapshot: snapshot2,
    appearanceIndex: appearance2,
  });
  const head = await ledger.getHead(headId);
  const kioskSoakPath = path.join(options.output, "kiosk-soak-receipt.json");
  const electronKioskSoakPath = path.join(options.output, "electron-kiosk-soak-receipt.json");
  const uiEvidencePath = path.join(options.output, "ui-evidence", "ui-evidence-report.json");
  const repairReceiptPath = path.join(path.dirname(options.sourceVideoPath), "black-interval-repair-receipt.json");
  const kioskSoak = await pathExists(kioskSoakPath) ? await readJson(kioskSoakPath) : null;
  const electronKioskSoak = await pathExists(electronKioskSoakPath) ? await readJson(electronKioskSoakPath) : null;
  const uiEvidence = await pathExists(uiEvidencePath) ? await readJson(uiEvidencePath) : null;
  const blackRepair = await pathExists(repairReceiptPath) ? await readJson(repairReceiptPath) : null;
  const checks = {
    realBoundedSource: sourceProbe.decodeOk && sourceProbe.hasVideo && sourceProbe.hasAudio && Math.abs(sourceProbe.durationSeconds - requestedDuration) <= 0.25,
    stableSongCardIdentity: head?.headId === headId,
    editionOneMinted: head?.editions?.some((row) => row.edition === 1),
    editionOneRetryIdempotent: retry1.created === false && retry1.edition === 1,
    materialEditDetected: semanticDiff.changed && semanticDiff.changedFamilies.includes("videos") && semanticDiff.changedFamilies.includes("timing"),
    oneIntervalEditorEdit: edit.creativeDecisionRun === false && edit.visualChangeInterval.length === 2,
    editionTwoMintedExactlyOnce: head?.latestEdition === 2 && head?.editions?.length === 2,
    editionOneVerified: verification1.ok,
    editionTwoVerified: verification2.ok,
    editionOneImmutableAfterEditionTwo: edition1UnchangedAfterEdition2,
    intervalRenderPreservedAv: probe2.hasAudio && probe2.hasVideo && probe2.decodeOk && intervalReceipt.audioMode === "stream-copy" && intervalReceipt.audioPacketsPreserved === true,
    historicalTimestampPrintsPinned: historicalPrintsPinned,
    supportArtifactsGenerated: Boolean(support1.poster.sha256 && support2.poster.sha256),
    tamperDetectedWithoutEditionMutation: tamper.detected && tamper.immutableOriginalUnchanged,
    staleRevisionFailsClosed: failureFixtures.staleRevision.detected,
    invalidMediaFailsClosed: failureFixtures.invalidMedia.detected,
    ...(kioskSoak ? { twiceThroughKioskSoak: kioskSoak.ok === true && kioskSoak.checks?.noUnintendedBlackIntervals === true } : {}),
    ...(electronKioskSoak ? { twiceThroughElectronApplicationSoak: electronKioskSoak.ok === true && electronKioskSoak.checks?.fourNaturalHtmlVideoElementPasses === true && electronKioskSoak.checks?.noPresentationTimestampGaps === true && electronKioskSoak.checks?.noReportedDroppedFrames === true } : {}),
    ...(uiEvidence ? { uiEvidenceCaptured: uiEvidence.ok === true } : {}),
    ...(blackRepair ? { undeclaredBlackIntervalsRepaired: blackRepair.ok === true && blackRepair.remainingBlackIntervals?.length === 0 && blackRepair.audioPacketsPreserved === true } : {}),
  };
  const report = {
    schemaVersion: DEMO_SCHEMA,
    ok: Object.values(checks).every(Boolean),
    status: Object.values(checks).every(Boolean) ? "verified-private-production-demo" : "failed",
    applied: true,
    song: { id: graph.song.id, title: graph.song.title, durationSeconds: requestedDuration },
    head: { headId, latestEdition: head?.latestEdition, editionCount: head?.editions?.length },
    editorEdit: edit,
    semanticDiff,
    editions: [
      { edition: 1, created: true, thisRunCreated: mint1.created, commitEvidence: head?.editions?.find((row) => row.edition === 1) || null, retry: { created: retry1.created, reason: retry1.reason }, sha256: verification1.actualSha256, probe: verification1.probe, checks: verification1.checks, support: support1.files },
      { edition: 2, created: true, thisRunCreated: mint2.created, commitEvidence: head?.editions?.find((row) => row.edition === 2) || null, sha256: verification2.actualSha256, probe: verification2.probe, checks: verification2.checks, support: support2.files },
    ],
    historicalPrints: {
      timestampMs,
      cueId: edit.cueId,
      edition1: print1.songCardPrint,
      edition2: print2.songCardPrint,
    },
    fixtures: { tamper, ...failureFixtures },
    checks,
    screenshots: uiEvidence ? {
      captured: uiEvidence.ok === true,
      placeholdersWritten: false,
      report: "ui-evidence/ui-evidence-report.json",
      files: (uiEvidence.evidence || []).map((row) => row.file).filter(Boolean),
    } : {
      captured: false,
      placeholdersWritten: false,
      reason: "This CLI gate did not run a browser UI capture, so it makes no screenshot-evidence claim.",
    },
    supplementalEvidence: {
      ...(kioskSoak ? { kioskSoak: { path: "kiosk-soak-receipt.json", receiptSha256: kioskSoak.receiptSha256, status: kioskSoak.status } } : {}),
      ...(electronKioskSoak ? { electronApplicationKioskSoak: { path: "electron-kiosk-soak-receipt.json", receiptSha256: electronKioskSoak.receiptSha256, status: electronKioskSoak.status } } : {}),
      ...(blackRepair ? { blackIntervalRepair: { path: path.relative(options.output, repairReceiptPath), outputSha256: blackRepair.outputSha256, audioPacketsPreserved: blackRepair.audioPacketsPreserved } } : {}),
    },
    custody: {
      mintRoot: options.mintRoot,
      offlineReplayVerified: verification1.checks.offlineFilesPresent && verification2.checks.offlineFilesPresent,
      downstreamSyncRequired: false,
    },
  };
  await writeJson(path.join(options.output, "production-gate-report.json"), report);
  if (!report.ok) throw new Error(`Song Card production gate failed: ${JSON.stringify(checks)}`);
  return report;
}

async function main() {
  try {
    const result = await runDearPapaSongCardMintDemo(parseCliArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, code: error?.code || "DEMO_FAILED", error: String(error?.message || error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
