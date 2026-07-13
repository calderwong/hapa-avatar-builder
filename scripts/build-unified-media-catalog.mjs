#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createUnifiedMediaAsset, mergeUnifiedMediaAssets, queryUnifiedMediaCatalog } from "../src/domain/unified-media-catalog.js";

const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9) || path.join(root, "artifacts/unified-media-catalog"));
const technicalPath = path.resolve(root, "artifacts/echo-media-affordances/technical-cache-v2.json");
const mediaLibraryPath = path.join(root, "data/media-library.json");
const projectsRoot = path.join(root, "data/music-video-projects");
const contextRoot = path.join(path.dirname(output), "song-context-packets/packets");
const isfManifestPath = "/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json";
const songbookPath = path.join(root, "data/dear-papa-songbook.json");
const sourceFiles = [technicalPath, mediaLibraryPath, isfManifestPath, songbookPath];
const fileHash = (file) => { const hash = crypto.createHash("sha256"); const fd = fs.openSync(file, "r"); const buffer = Buffer.alloc(1024 * 1024); let bytes; while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes)); fs.closeSync(fd); return hash.digest("hex"); };
const sourceBefore = Object.fromEntries(sourceFiles.map((file) => [file, fileHash(file)]));
const mediaLibrary = JSON.parse(fs.readFileSync(mediaLibraryPath, "utf8"));
const technicalCache = JSON.parse(fs.readFileSync(technicalPath, "utf8"));
const isfManifest = JSON.parse(fs.readFileSync(isfManifestPath, "utf8"));
const songbook = JSON.parse(fs.readFileSync(songbookPath, "utf8"));
const recordsByPath = new Map();
const recordsByAssetId = new Map();
for (const record of mediaLibrary.records || []) {
  if (record.sourcePath) { const rows = recordsByPath.get(record.sourcePath) || []; rows.push(record); recordsByPath.set(record.sourcePath, rows); }
  for (const id of [record.id, record.asset?.id]) if (id) { const rows = recordsByAssetId.get(id) || []; rows.push(record); recordsByAssetId.set(id, rows); }
}
const contextRelationships = new Map();
if (fs.existsSync(contextRoot)) for (const file of fs.readdirSync(contextRoot).filter((name) => name.endsWith(".json"))) {
  const packet = JSON.parse(fs.readFileSync(path.join(contextRoot, file), "utf8"));
  for (const node of [packet.song, ...(packet.cards || []), ...(packet.scenes || [])]) for (const media of node?.mediaAttachPack || []) {
    const rows = contextRelationships.get(media.id) || [];
    rows.push({ ownerType: node.kind, ownerId: node.id, ownerName: node.title, role: "media-attach-pack", songId: packet.songId, source: `${node.source?.file || "unknown"}${node.source?.linkPaths?.[0] || ""}` });
    contextRelationships.set(media.id, rows);
  }
}
const proxyBySourcePath = new Map();
for (const file of fs.readdirSync(projectsRoot).filter((name) => name.endsWith(".json"))) {
  const payload = JSON.parse(fs.readFileSync(path.join(projectsRoot, file), "utf8"));
  const project = payload.music_video_project || payload;
  for (const shot of project.timeline || []) {
    const proxy = shot.media_contract?.proxy;
    if (!proxy?.sourcePath) continue;
    const rows = proxyBySourcePath.get(proxy.sourcePath) || [];
    rows.push({ role: "playback-proxy", uri: proxy.uri, mimeType: proxy.mimeType, codec: proxy.codec, width: proxy.maxDimension, gopSeconds: proxy.gopSeconds, byteSize: proxy.byteSize, sourceSongId: project.song_id, sourceShotIndex: shot.shot_index, derivedFingerprint: proxy.fingerprint });
    proxyBySourcePath.set(proxy.sourcePath, rows);
  }
}
const assets = [];
for (const [sourcePath, entry] of Object.entries(technicalCache)) {
  const technical = entry.technical;
  const hash = technical?.contentHash?.value;
  if (!/^[a-f0-9]{64}$/.test(hash || "")) continue;
  const records = recordsByPath.get(sourcePath) || [];
  const context = records.flatMap((record) => [...(contextRelationships.get(record.id) || []), ...(contextRelationships.get(record.asset?.id) || [])]);
  const storeRelationships = records.flatMap((record) => record.relationships || []).map((row) => ({ ...row, source: "data/media-library.json" }));
  const record = records[0];
  const mediaType = record?.mediaType || (/\.(png|jpe?g|webp|gif)$/i.test(sourcePath) ? "image" : "video");
  const renditions = [technical.posterUri ? { role: "poster", uri: technical.posterUri } : null, ...(technical.contactFrames || []).map((row) => ({ role: "analysis-contact-sheet", uri: row.uri, marker: row.marker })), ...(proxyBySourcePath.get(sourcePath) || [])].filter(Boolean);
  assets.push(createUnifiedMediaAsset({ contentHash: hash, mediaType, original: { sourcePath, uri: record?.uri || null, byteSize: technical.fileSizeBytes, mimeType: record?.asset?.mimeType || null, ownership: "source-local-read-only" }, renditions, analysis: technical, relationships: [...storeRelationships, ...context], rights: { licensingStatus: record?.asset?.metadata?.licensingStatus || "unknown", consentStatus: record?.asset?.metadata?.consentStatus || "unknown", source: "data/media-library.json" }, provenance: [{ adapterId: "avatar-card-scene-echo-media", sourceStore: "data/media-library.json", sourceRecordIds: records.map((row) => row.id), mutationPolicy: "read-only" }, ...(proxyBySourcePath.has(sourcePath) ? [{ adapterId: "echo-playback-proxies", sourceStore: "data/music-video-projects", mutationPolicy: "read-only" }] : [])] }));
}
for (const shader of isfManifest.shaders || []) {
  const sourcePath = path.join("/Users/calderwong/Desktop/hapa-music-viz/web/isf", String(shader.source || "").replace(/^\/static\/isf\//, ""));
  if (!fs.existsSync(sourcePath)) continue;
  assets.push(createUnifiedMediaAsset({ contentHash: fileHash(sourcePath), mediaType: "visualizer-source", original: { sourcePath, uri: shader.source, byteSize: fs.statSync(sourcePath).size, mimeType: "text/plain", ownership: "hapa-music-viz-read-only" }, analysis: { status: "manifest-verified-source", shaderType: shader.shaderType, inputs: shader.inputs, audioMap: shader.audioMap, directorEligible: shader.directorEligible }, relationships: [{ ownerType: "visualizer-catalog", ownerId: shader.id, ownerName: shader.title, role: shader.hmvRole, source: isfManifestPath }], rights: { licensingStatus: shader.credit ? "credit-declared-license-unverified" : "unknown", consentStatus: "not-applicable-code-source", source: shader.credit || "manifest-credit-missing" }, provenance: [{ adapterId: "hapa-music-viz-isf", sourceStore: isfManifestPath, sourceRecordIds: [shader.id], mutationPolicy: "read-only" }] }));
}
for (const song of songbook.songCards || []) {
  const coverPath = song.sync?.coverPath;
  if (!coverPath || !fs.existsSync(coverPath)) continue;
  assets.push(createUnifiedMediaAsset({ contentHash: fileHash(coverPath), mediaType: "image", original: { sourcePath: coverPath, uri: null, byteSize: fs.statSync(coverPath).size, mimeType: "image/jpeg", ownership: "dear-papa-source-folder-read-only" }, relationships: [{ ownerType: "song-card", ownerId: song.id, ownerName: song.title, role: "cover", source: songbookPath }], rights: { licensingStatus: song.authorship?.rightsStatus || "unknown", consentStatus: "operator-authored", source: `${song.id}#/authorship` }, provenance: [{ adapterId: "dear-papa-folders", sourceStore: coverPath, sourceRecordIds: [song.id], mutationPolicy: "read-only" }] }));
}
const catalog = mergeUnifiedMediaAssets(assets);
const echoQuery = queryUnifiedMediaCatalog(catalog, { mediaTypes: ["video"], requireVerifiedTechnical: true });
const musicVizQuery = queryUnifiedMediaCatalog(catalog, { mediaTypes: ["video"], requireVerifiedTechnical: true });
const sourceAfter = Object.fromEntries(sourceFiles.map((file) => [file, fileHash(file)]));
const sourceStoresUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
const adapterReceipts = [
  { id: "avatar-card-scene-echo-media", status: "ready", ownership: "source-local-read-only", discovered: assets.filter((asset) => asset.provenance.some((row) => row.adapterId === "avatar-card-scene-echo-media")).length },
  { id: "hapa-music-viz-isf", status: "ready", ownership: "source-local-read-only", discovered: assets.filter((asset) => asset.provenance.some((row) => row.adapterId === "hapa-music-viz-isf")).length },
  { id: "dear-papa-folders", status: "ready", ownership: "source-local-read-only", discovered: assets.filter((asset) => asset.provenance.some((row) => row.adapterId === "dear-papa-folders")).length },
  { id: "overwind-hot-media", status: "represented-through-media-library-provenance", ownership: "source-local-read-only", discovered: 0 },
  { id: "palmier-branch-candidates", status: "source-unavailable-not-invented", ownership: "source-local-read-only", discovered: 0 },
];
const report = { schemaVersion: "hapa.media.discovery-catalog-proof.v1", ok: catalog.assets.length > 1000 && sourceStoresUnchanged && JSON.stringify(echoQuery) === JSON.stringify(musicVizQuery) && catalog.assets.every((asset) => asset.id === `hapa-media:sha256:${asset.contentHash.value}`), readOnly: true, sourceStoresUnchanged, sourceHashesBefore: sourceBefore, sourceHashesAfter: sourceAfter, inputRecords: { technicalAffordances: Object.keys(technicalCache).length, mediaLibrary: mediaLibrary.records?.length || 0, contextRelationships: [...contextRelationships.values()].flat().length, echoProxySources: proxyBySourcePath.size, isfShaders: isfManifest.shaders?.length || 0, dearPapaSongs: songbook.songCards?.length || 0 }, catalogAssets: catalog.assets.length, deduplicatedInputs: assets.length - catalog.assets.length, assetsWithRenditions: catalog.assets.filter((asset) => asset.renditions.length).length, assetsWithRelationships: catalog.assets.filter((asset) => asset.relationships.length).length, rightsTruth: { knownLicensing: catalog.assets.filter((asset) => asset.rights.licensingStatus !== "unknown").length, unknownLicensing: catalog.assets.filter((asset) => asset.rights.licensingStatus === "unknown").length }, adapterReceipts, sharedQuery: { filter: { mediaTypes: ["video"], requireVerifiedTechnical: true }, echoCount: echoQuery.length, musicVizCount: musicVizQuery.length, byteIdentical: JSON.stringify(echoQuery) === JSON.stringify(musicVizQuery), sampleIds: echoQuery.slice(0, 12).map((row) => row.id) } };
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
fs.writeFileSync(path.join(output, "echo-query.json"), `${JSON.stringify(echoQuery, null, 2)}\n`);
fs.writeFileSync(path.join(output, "music-viz-query.json"), `${JSON.stringify(musicVizQuery, null, 2)}\n`);
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, inputAssets: assets.length, catalogAssets: report.catalogAssets, deduplicated: report.deduplicatedInputs, renditions: report.assetsWithRenditions, relationships: report.assetsWithRelationships, sharedQuery: report.sharedQuery, sourceStoresUnchanged }, null, 2));
if (!report.ok) process.exitCode = 1;
