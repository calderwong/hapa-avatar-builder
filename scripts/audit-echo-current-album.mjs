#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { echoProjectAudioRoute } from "../src/domain/echo-audio-route.js";
import { resolveEchoRuntimeMediaUri } from "../server/echo-runtime-media-route.mjs";
import { echoInventoryHash as hash, createEchoSourceInspector, classifyEchoStemGap, reconcileEchoAcceptance } from "../server/echo-source-inventory.mjs";
import { deriveEchoDirectionVariantProject, echoDirectionVariantFingerprint } from "../src/domain/echo-direction-variants.js";
import { normalizeEchoLyricContract, echoLyricOverlayLines } from "../src/domain/echo-lyric-contract.js";
import { hashEchoLyricOverlayExecutionContract } from "../src/domain/hyperframes-show-compiler.js";
import { compareLyricText, isSourceDeclaredInstrumental } from "../src/domain/echo-lyric-quality.js";

const args = process.argv.slice(2);
const option = (key, fallback = "") => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(option("--output", path.join(root, "artifacts/echo-enhancement-current-baseline")));
const catalogPath = option("--catalog");
if (!catalogPath) throw new Error("Pass --catalog with a current benchmark-echo-catalog receipt to freeze selected cut IDs");
const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));
const optionalJson = async file => { try { return await readJson(file); } catch { return null; } };
const registryPath = option("--registry", process.env.SONG_REGISTRY_DATA_PATH || path.join(os.homedir(), "Desktop/hapa-song-registry/data/registry.json"));
const storePath = path.join(root, "data/hapa-songs-store.json");
const variantsRoot = path.join(root, "data/music-video-project-variants");
const projectsRoot = path.join(root, "data/music-video-projects");
const catalog = await readJson(catalogPath);
const storeRaw = await fs.readFile(storePath);
const store = JSON.parse(storeRaw);
const registryRaw = await fs.readFile(registryPath);
const registry = JSON.parse(registryRaw);
const songbook = await readJson(path.join(root, "data/dear-papa-songbook.json"));
const registrySongs = new Map((registry.songs || []).map(song => [song.id, song]));
const registryStems = new Map((registry.stems || []).map(stem => [stem.id, stem]));
const variantIndex = await readJson(path.join(variantsRoot, "index.json"));
const historic = await optionalJson(path.join(root, "artifacts/echo-lyric-quality-v4/final-acceptance.json"));
const selectedBySong = new Map(catalog.songs.map(song => [song.songId, song.selectedCut]));
const prior = await optionalJson(option("--previous", path.join(output, "baseline.json")));
const inspector = createEchoSourceInspector({ cache: await optionalJson(path.join(output, "source-hashes.json")) || {} });
const historicalRows = new Map((historic?.projects || []).map(row => [row.songId, row]));
const previousRows = new Map((prior?.rows || []).map(row => [row.songId, row]));
const rows = [];
await fs.mkdir(output, { recursive: true });

for (const song of store.songs) {
  const file = path.join(projectsRoot, `${song.id}-video-project.json`);
  try {
    const raw = await fs.readFile(file);
    const base = JSON.parse(raw).music_video_project;
    const selectedCut = selectedBySong.get(song.id);
    let project = base, cutSource = { path: file, sha256: hash(raw) };
    const issues = [];
    if (!selectedCut) issues.push("catalog-song-missing");
    if (selectedCut?.id && selectedCut.id !== "legacy") {
      const indexed = variantIndex.variants.find(row => (row.songId || row.song_id) === song.id && (row.variantId || row.variant_id) === selectedCut.id);
      const variantPath = path.resolve(variantsRoot, indexed?.relativePath || `${song.id}/${selectedCut.id}.json`);
      const relative = path.relative(path.join(variantsRoot, song.id), variantPath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("unsafe-cut-path");
      const variantRaw = await fs.readFile(variantPath);
      const variant = JSON.parse(variantRaw);
      const fingerprint = echoDirectionVariantFingerprint(variant);
      if (selectedCut.fingerprint !== fingerprint) issues.push("catalog-cut-fingerprint-drift");
      project = deriveEchoDirectionVariantProject(base, variant);
      cutSource = { path: variantPath, sha256: hash(variantRaw), fingerprint };
    }
    const registryTrackId = song.audio?.registryTrackId || base.registry_track_id;
    const registrySong = registrySongs.get(registryTrackId);
    const master = await inspector.inspect(song.audio?.localPath || registrySong?.localPath);
    const registryMaster = await inspector.inspect(registrySong?.localPath);
    if (master.sha256 !== registryMaster.sha256 || !master.sha256) issues.push("master-registry-byte-identity-unverified");
    const playbackAudioRoute = echoProjectAudioRoute(project);
    const runtimeAudio = resolveEchoRuntimeMediaUri(playbackAudioRoute.uri, { root, registryPayload: registry, songbookPayload: songbook });
    const playbackMaster = await inspector.inspect(runtimeAudio.resolvedPath);
    if (!runtimeAudio.ok || !playbackMaster.sha256) issues.push("playback-audio-identity-unverified");
    const audioId = playbackAudioRoute.id;
    if (audioId !== registryTrackId) issues.push("selected-cut-registry-id-differs");
    const stems = [];
    // Sequential streaming bounds memory and file descriptors, including large WAV stems.
    for (const stem of song.stems || []) {
      const registered = registryStems.get(stem.id);
      const roleOnly = String(stem.id || "").startsWith("stem-type-") && !stem.localPath && !stem.uri;
      const resource = roleOnly ? { status: "role-declaration-only", path: null, usable: false }
        : await inspector.inspect(stem.localPath || stem.archivePath || registered?.localPath);
      const registryResource = registered?.localPath && registered.localPath !== resource.path ? await inspector.inspect(registered.localPath) : null;
      stems.push({ id: stem.id, role: stem.kind, registryParentId: registered?.parentId || registered?.parentSongId || null,
        matchesPlaybackMaster: registered?.parentId ? registered.parentId === audioId : null, registryResource,
        registryPathMatches: registered?.localPath ? path.resolve(registered.localPath) === path.resolve(stem.localPath || ".") : null,
        ...resource });
    }
    const stemGap = classifyEchoStemGap({ declared: song.stems || [], projectRoles: base.stems_available || [], registryParentId: registryTrackId, inspected: stems });
    const truth = base.lyric_timing_truth || {};
    const timingPath = truth.sourcePath || base.lyric_timing_heal?.timingPath || null;
    const timingSource = await inspector.inspect(timingPath);
    const text = typeof song.lyrics === "string" ? song.lyrics : song.lyrics?.text || "";
    const activeLines = echoLyricOverlayLines(project);
    const contract = normalizeEchoLyricContract(project);
    const contractHash = hashEchoLyricOverlayExecutionContract({ ...contract, lines: activeLines });
    const metadataPath = song.audio?.localPath ? path.join(path.dirname(song.audio.localPath), "metadata.json") : null;
    const metadata = metadataPath ? await optionalJson(metadataPath) : null;
    const sourceDeclaredInstrumental = metadata ? isSourceDeclaredInstrumental(metadata) : null;
    const receiptPath = selectedCut?.id ? path.join(root, "artifacts/echo-render-readiness/projects", song.id, `${selectedCut.id}.json`) : null;
    const receipt = receiptPath ? await optionalJson(receiptPath) : null;
    const acceptance = reconcileEchoAcceptance({ currentContractHash: contractHash, historicalLyricRow: historicalRows.get(song.id), selectedCut, renderReceipt: receipt, projectHumanReviewed: truth.humanReviewed });
    const historicalReceiptNames = (await fs.readdir(path.join(root, "artifacts/echo-render-readiness/projects", song.id)).catch(() => []))
      .filter(name => name.endsWith(".json"));
    rows.push({ songId: song.id, title: song.title, registryTrackId, projectAudioId: audioId, projectSha256: hash(raw), projectBytes: raw.length,
      projectChangedSincePrevious: previousRows.has(song.id) ? previousRows.get(song.id).projectSha256 !== hash(raw) : null,
      selectedCut, cutSource, master: playbackMaster, storeMaster: master, registryMaster, playbackAudioRoute, runtimeAudio, stems, stemGap,
      lyricVersions: { storeTextSha256: hash(text), storeDeclaredSha256: song.lyrics?.sha256 || null, activeTimingSha256: hash(activeLines), contractHash,
        timingQuality: truth.qualityStatus || "missing", timingSource, timingTruth: truth, sourceDeclaredInstrumental,
        missingTruthReason: truth.qualityStatus ? null : sourceDeclaredInstrumental ? "source-declared-instrumental-no-word-alignment-required" : text.trim() ? "text-present-missing-timing-truth" : "unknown-vocal-status",
        metadataPath, sourceMetadataSha256: metadata ? hash(await fs.readFile(metadataPath)) : null, sourceMetadataPresent: Boolean(metadata), activeLineCount: activeLines.length, activeWordCount: activeLines.reduce((sum, line) => sum + (line.words?.length || 0), 0),
        textComparison: compareLyricText(activeLines, text), emptyTextStatus: text.trim() ? "text-present" : sourceDeclaredInstrumental ? "source-declared-instrumental" : "unknown" },
      acceptance: { ...acceptance, receiptPath: receipt ? receiptPath : null, historicalRenderReceiptCount: historicalReceiptNames.length }, issues });
    if (rows.length % 25 === 0) {
      await fs.writeFile(path.join(output, "source-hashes.json"), JSON.stringify(inspector.cache));
      console.log(`Inventoried ${rows.length}/${store.songs.length} songs`);
    }
  } catch (error) { rows.push({ songId: song.id, title: song.title, issues: [error.message], inventoryFailed: true }); }
}
const count = values => Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map())].sort());
const cohort = [
  ["dear-papa-song-dear-papa", "letter/comic, dense stem roles"],
  ["dear-papa-song-wish-her-well", "recent comic-linked alias and stemless master"],
  ["dear-papa-song-til-the-light-walks-inn-wandering", "difficult vocal phrasing"],
  ["dear-papa-song-miss-medusa", "store/project stem reconciliation"],
  ["dear-papa-song-r-g-b-nice-whale", "ensemble/continuity, stemless master"],
  ["dear-papa-song-bongbongboink", "missing-text/instrumental declaration check"],
].map(([songId, purpose]) => { const row = rows.find(row => row.songId === songId); return { songId, purpose, projectSha256: row?.projectSha256, selectedCut: row?.selectedCut, audioSha256: row?.master?.sha256, lyricContractHash: row?.lyricVersions?.contractHash, instrumentalDeclaration: row?.lyricVersions?.sourceDeclaredInstrumental }; });
const projectNames = (await fs.readdir(projectsRoot)).filter(name => name.endsWith("-video-project.json")).map(name => name.replace(/-video-project\.json$/u, ""));
const report = { schemaVersion: "hapa.echo.current-album-inventory.v1", generatedAt: new Date().toISOString(), mutationMode: "read-only-sources",
  selectionPolicy: "Frozen latest non-legacy catalog cuts; browser working copies are not inventoried or promoted.",
  scope: "Bytes, source metadata, cut/lyric identity and historical evidence reconciliation. Decode, vocal annotation, render pixels and human taste are separate gates.",
  sourceHashes: { storeSha256: hash(storeRaw), registrySha256: hash(registryRaw), catalogReceiptSha256: hash(await fs.readFile(catalogPath)) },
  summary: { storeSongs: store.songs.length, projects: projectNames.length, rows: rows.length, inventoryFailures: rows.filter(row => row.inventoryFailed).length,
    stemGapReasons: count(rows.map(row => row.stemGap?.reason || "unavailable")), timingQuality: count(rows.map(row => row.lyricVersions?.timingQuality || "unavailable")),
    sourceDeclaredInstrumentals: rows.filter(row => row.lyricVersions?.sourceDeclaredInstrumental === true).length,
    unknownMissingText: rows.filter(row => row.lyricVersions?.emptyTextStatus === "unknown").length,
    matchingHistoricalLyricContracts: rows.filter(row => row.acceptance?.historicalLyrics?.matchesCurrentContract).length,
    matchingHistoricalRenderCuts: rows.filter(row => row.acceptance?.render?.matchesCurrentCut).length,
    issues: count(rows.flatMap(row => row.issues)), addedSincePrevious: rows.filter(row => previousRows.size && !previousRows.has(row.songId)).map(row => row.songId),
    removedSincePrevious: [...previousRows.keys()].filter(id => !rows.some(row => row.songId === id)), projectWithoutStore: projectNames.filter(id => !rows.some(row => row.songId === id)),
  },
  historicalAcceptance: { generatedAt: historic?.generatedAt, summary: historic?.summary, humanTasteInferred: false },
  environment: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, ramBytes: os.totalmem(), osRelease: os.release(), node: process.version,
    packageVersions: { electron: (await readJson(path.join(root, "node_modules/electron/package.json"))).version }, catalogMeasurements: { firstMs: catalog.firstRequest.elapsedMs, warmP95Ms: catalog.warmP95Ms, condition: catalog.condition },
    outputProfile: { width: 1920, height: 1080, fps: 30 }, gpuAndBrowser: "Record in browser acceptance receipt; not inferred from CPU model",
    measuredEnvironment: option("--environment") ? await readJson(path.resolve(option("--environment"))) : null },
  hashMetrics: inspector.metrics(), cohort, rows };
await fs.writeFile(path.join(output, "source-hashes.json"), JSON.stringify(inspector.cache));
await fs.writeFile(path.join(output, "baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(path.join(output, "cohort.json"), `${JSON.stringify({ schemaVersion: "hapa.echo.enhancement-cohort.v1", generatedAt: report.generatedAt, cohort }, null, 2)}\n`);
console.log(JSON.stringify({ output, summary: report.summary, hashMetrics: report.hashMetrics }, null, 2));
if (report.summary.inventoryFailures) process.exitCode = 1;
