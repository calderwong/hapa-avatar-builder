import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  compileHyperFramesShow,
  hyperFramesMediaSourceCandidates,
  indexHyperFramesMediaContracts,
  inspectHyperFramesShow,
  preflightHyperFramesMedia,
  resolveHyperFramesLocalFileUri,
  resolveHyperFramesMediaSource,
} from "../src/domain/hyperframes-show-compiler.js";

function nativeMediaGraph(cards) {
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "song:media-preflight", title: "Media Preflight", durationSeconds: 12, lyricOverlay: { lines: [] } },
    stems: { items: [] },
    tracks: [{ id: "media-a", role: "media", cards }],
    directorV2: {},
  };
}

function mediaCard(id, media, extras = {}) {
  return { id, trackId: "media-a", startSeconds: 0, endSeconds: 4, media, parameters: {}, provenance: {}, ...extras };
}

test("HyperFrames compiler emits pinned templated executable shows", () => {
  const graph = JSON.parse(fs.readFileSync("work/dear-papa-stem-telemetry/native-show-graph.json", "utf8"));
  const telemetry = JSON.parse(fs.readFileSync("work/dear-papa-stem-telemetry/stem-telemetry.json", "utf8"));
  const project = JSON.parse(fs.readFileSync("data/music-video-projects/dear-papa-song-dear-papa-video-project.json", "utf8"));
  const a = compileHyperFramesShow({ showGraph: graph, telemetry, project, fps: 30 });
  const b = compileHyperFramesShow({ showGraph: graph, telemetry, project, fps: 30 });
  assert.deepEqual(a, b);
  assert.equal(a.deterministicPolicy.runtimeDecisionCalls, false);
  assert.equal(a.deterministicPolicy.runtimeAudioAnalysis, false);
  assert.equal(a.deterministicPolicy.randomCalls, false);
  assert.ok(Object.keys(a.templates).length < a.instances.media.length + a.instances.visualizers.length);
  assert.ok(a.stemFrames.stems.every((stem) => stem.frames.length > 1));
  assert.ok(a.instances.visualizers.every((layer) => layer.stemFocus && layer.audioSignal && Array.isArray(layer.inputs) && Array.isArray(layer.unsupported)));
  assert.ok(a.instances.visualizers.every((layer) => layer.visualizerMix > 0), "omitting visualizerMix must use the recipe/default instead of coercing null to zero");
  assert.ok(a.instances.visualizers.every((layer) => layer.effectiveOpacity > 0), "default-compiled visualizer layers must remain visible");
  assert.ok(inspectHyperFramesShow(a).ok);
});

test("HyperFrames preserves structured audio mappings and gives legacy shaders a deterministic reactive envelope", () => {
  const graph = JSON.parse(fs.readFileSync("work/dear-papa-stem-telemetry/native-show-graph.json", "utf8"));
  const telemetry = JSON.parse(fs.readFileSync("work/dear-papa-stem-telemetry/stem-telemetry.json", "utf8"));
  const project = JSON.parse(fs.readFileSync("data/music-video-projects/dear-papa-song-dear-papa-video-project.json", "utf8"));
  const declaredCard = graph.tracks.flatMap((track) => track.cards || []).find((card) => card.visualization?.card?.audioMap);
  const declaredUniform = Object.keys(declaredCard.visualization.card.audioMap)[0];
  const declaredMapping = declaredCard.visualization.card.audioMap[declaredUniform];
  const declaredShow = compileHyperFramesShow({ showGraph: graph, telemetry, project, fps: 30 });
  const declaredLayer = declaredShow.instances.visualizers.find((layer) => layer.id === declaredCard.id);

  assert.equal(typeof declaredLayer.audioMap[declaredUniform], "object", "stem:signal editor strings must not replace executable mapping objects");
  assert.equal(declaredLayer.audioMap[declaredUniform].signal, declaredMapping.signal);
  assert.equal(declaredLayer.audioMap[declaredUniform].depth, declaredMapping.depth, "portable mapping depth remains authoritative");
  assert.equal(declaredLayer.presentationModulation.mode, "audio-conditioned-proxy");
  assert.ok(declaredLayer.audioSignal.some((signal) => ["rms", "beat", "onset", "low", "bass", "mid", "high", "treble"].includes(signal)));

  const overrideGraph = structuredClone(graph);
  const overrideCard = overrideGraph.tracks.flatMap((track) => track.cards || []).find((card) => card.id === declaredCard.id);
  const overrideUniform = (overrideCard.visualization.card.inputs || []).find((input) => String(input.TYPE || input.type).toLowerCase() !== "image")?.NAME;
  assert.ok(overrideUniform, "fixture needs a value input for the stem override regression");
  overrideCard.visualization.card.stemFocus = "master";
  overrideCard.parameters = {
    ...(overrideCard.parameters || {}),
    visualizerMappings: {
      [overrideUniform]: "drums:rms",
    },
  };
  const overrideShow = compileHyperFramesShow({ showGraph: overrideGraph, telemetry, project, fps: 30 });
  const overrideLayer = overrideShow.instances.visualizers.find((layer) => layer.id === overrideCard.id);
  assert.equal(overrideLayer.audioMap[overrideUniform].stemFocus, "drums");
  assert.equal(overrideLayer.audioMap[overrideUniform].signal, "rms");
  assert.equal(overrideLayer.stemFocus, "drums", "one explicit mapping stem must override the portable master for presentation modulation");

  const compatibleLegacyShow = structuredClone(declaredShow);
  const compatibleLegacyLayer = compatibleLegacyShow.instances.visualizers.find((layer) => layer.id === declaredCard.id);
  compatibleLegacyLayer.audioMap = Object.fromEntries(Object.entries(compatibleLegacyLayer.audioMap).map(([uniform, mapping]) => [
    uniform,
    `${mapping.stemFocus || compatibleLegacyLayer.stemFocus}:${mapping.signal}`,
  ]));
  delete compatibleLegacyLayer.presentationModulation;
  assert.equal(inspectHyperFramesShow(compatibleLegacyShow).ok, true, "legacy string maps with real reactive signals remain inspectable");

  const sourceHash = `sha256:${"9".repeat(64)}`;
  const assetSha256 = `sha256:${"8".repeat(64)}`;
  const legacyGraph = nativeMediaGraph([
    mediaCard("cue-generated", { id: "none", title: "Generated IVF", localPath: "" }, { knockedOut: true }),
  ]);
  legacyGraph.tracks.push({
    id: "ivf-stack",
    role: "visualizer",
    cards: [{
      id: "legacy:ivf:reactive",
      startSeconds: 0,
      endSeconds: 12,
      parameters: { opacity: 0.5, blendMode: "screen" },
      visualization: { sourceId: "isf:legacy-reactive", nativeKey: "Legacy Reactive" },
    }],
  });
  const legacyShow = compileHyperFramesShow({
    showGraph: legacyGraph,
    telemetry: {
      fps: 2,
      stems: [{ id: "stem:master", role: "master", frames: [{ t: 0, rms: 0.1, onset: 0 }, { t: 0.5, rms: 0.8, onset: 1 }] }],
      masterMix: { frames: [{ t: 0, rms: 0.1, onset: 0 }, { t: 0.5, rms: 0.8, onset: 1 }] },
    },
    project: { timeline: [] },
    proxyRegistry: {
      proxies: [{
        id: "isf:legacy-reactive",
        sourceHash,
        assetPath: "/static/isf/proxies/legacy-reactive.png",
        assetSha256,
        width: 16,
        height: 9,
        frameCount: 8,
        fps: 4,
      }],
    },
  });
  const legacyLayer = legacyShow.instances.visualizers[0];
  assert.deepEqual(legacyLayer.audioSignal, ["rms", "beat"]);
  assert.equal(legacyLayer.presentationModulation.source, "generic-rms-beat-fallback");
  assert.equal(inspectHyperFramesShow(legacyShow).ok, true);

  const detached = structuredClone(legacyShow);
  detached.instances.visualizers[0].audioSignal = [];
  delete detached.instances.visualizers[0].presentationModulation;
  const detachedInspection = inspectHyperFramesShow(detached);
  assert.equal(detachedInspection.ok, false);
  assert.ok(detachedInspection.errors.includes("missing-stem-wiring:legacy:ivf:reactive"));
  assert.ok(detachedInspection.errors.includes("nonreactive-visualizer:legacy:ivf:reactive"));
});

test("HyperFrames matches source/runtime aliases and preserves explicit pure-IVF and knockout cues", () => {
  const contentHash = "d".repeat(64);
  const sourceUri = `/media/scroll-source-shot-${contentHash.slice(0, 12)}.mp4`;
  const runtimeUri = `/media/scroll-runtime-shot-${contentHash.slice(0, 12)}.mp4`;
  const project = {
    timeline: [
      {
        media_id: "source-card-id",
        media_uri: sourceUri,
        runtime_media_uri: runtimeUri,
        media_contract: { type: "video", originalUri: sourceUri, runtimeUri, contentHash },
      },
      { media_id: "none", media_uri: "", runtime_media_uri: "", media_contract: { type: "generated-visualizer", originalUri: "", runtimeUri: "" } },
    ],
  };
  const graph = nativeMediaGraph([
    mediaCard("cue-runtime", { id: "runtime-card-id", title: "Runtime Alias", localPath: runtimeUri }, { provenance: { rendererRoute: "video" } }),
    mediaCard("cue-pure-ivf", { id: "none", title: "Visualizer Only", localPath: "" }, { startSeconds: 4, endSeconds: 8, provenance: { rendererRoute: "generated-visualizer" } }),
    mediaCard("cue-knocked-out", { id: "knocked", title: "Intentional Knockout", localPath: "/media/unused.mp4" }, { startSeconds: 8, endSeconds: 12, knockedOut: true, provenance: { rendererRoute: "video" } }),
  ]);
  const show = compileHyperFramesShow({ showGraph: graph, telemetry: { fps: 10, stems: [] }, project });

  assert.equal(show.instances.media[0].source.contractResolution.status, "matched");
  assert.equal(show.instances.media[0].source.contractResolution.alias, `uri:${runtimeUri}`);
  assert.equal(show.instances.media[0].source.runtimeUri, runtimeUri);
  assert.equal(show.instances.media[0].source.originalUri, sourceUri);
  assert.equal(show.instances.media[0].source.contentHash, contentHash);
  assert.equal(show.instances.media[1].source.type, "generated-visualizer");
  assert.equal(show.instances.media[1].source.assetName, null);
  assert.equal(show.instances.media[1].source.classificationReason, "legacy-none-media-sentinel");
  assert.equal(show.instances.media[2].source.type, "generated-visualizer");
  assert.equal(show.instances.media[2].source.classificationReason, "explicit-knocked-out-media");

  const root = "/workspace/hapa-avatar-builder";
  const expectedRuntimePath = path.join(root, "data", runtimeUri.replace(/^\/+/, ""));
  const preflight = preflightHyperFramesMedia(graph, {
    project,
    root,
    projectPath: "/managed/render/inputs/project.json",
    isFile: (candidate) => candidate === expectedRuntimePath,
  });
  assert.equal(preflight.ok, true);
  assert.equal(preflight.declaredCount, 3);
  assert.equal(preflight.resolvedCount, 1);
  assert.equal(preflight.generatedCount, 2);
  assert.equal(preflight.unresolvedCount, 0);
});

test("HyperFrames contract aliases use exact URI, then stable media identity, then fail closed on ambiguous basenames", () => {
  const stableHash = "a".repeat(64);
  const sharedHashA = "b".repeat(64);
  const sharedHashB = "c".repeat(64);
  const project = {
    timeline: [
      { media_id: `hapa-media:sha256:${stableHash}`, media_contract: { type: "video", originalUri: "/archive/stable-source.mp4", runtimeUri: "/media/stable-runtime.mp4", contentHash: stableHash } },
      { media_id: "shared-media", media_contract: { type: "video", originalUri: "/archive/a/shared.mp4", runtimeUri: "/media/a/shared.mp4", contentHash: sharedHashA } },
      { media_id: "shared-media", media_contract: { type: "video", originalUri: "/archive/b/shared.mp4", runtimeUri: "/media/b/shared.mp4", contentHash: sharedHashB } },
    ],
  };
  const index = indexHyperFramesMediaContracts(project);
  const byMediaId = resolveHyperFramesMediaSource(mediaCard("stable-id", { id: `hapa-media:sha256:${stableHash}`, localPath: "/media/renamed-runtime.mp4" }), index);
  const byContentHash = resolveHyperFramesMediaSource(mediaCard("stable-hash", { id: "renamed-id", contentHash: stableHash, localPath: "/media/another-renamed-runtime.mp4" }), index);
  const exactDespiteAmbiguousId = resolveHyperFramesMediaSource(mediaCard("shared-exact", { id: "shared-media", localPath: "/media/a/shared.mp4" }), index);
  const ambiguousBasename = resolveHyperFramesMediaSource(mediaCard("shared-ambiguous", { id: "unknown", localPath: "shared.mp4" }), index);

  assert.equal(byMediaId.contractResolution.alias, `media-id:hapa-media:sha256:${stableHash}`);
  assert.equal(byContentHash.contractResolution.alias, `content-hash:sha256:${stableHash}`);
  assert.equal(exactDespiteAmbiguousId.contractResolution.status, "matched");
  assert.equal(exactDespiteAmbiguousId.contractResolution.alias, "uri:/media/a/shared.mp4");
  assert.equal(ambiguousBasename.contractResolution.status, "ambiguous");
  assert.equal(ambiguousBasename.contractResolution.alias, "basename:shared.mp4");
  assert.equal(ambiguousBasename.contractResolution.conflicts.length, 2);

  const preflight = preflightHyperFramesMedia([{ id: "shared-ambiguous", cueId: "shared-ambiguous", mediaId: "unknown", title: "Ambiguous Shared Clip", start: 1, end: 2, source: ambiguousBasename }], {
    root: "/workspace/hapa-avatar-builder",
    projectPath: "/managed/render/inputs/project.json",
    isFile: () => true,
  });
  assert.equal(preflight.ok, false, "an existing basename must not override an ambiguous contract alias");
  assert.deepEqual(preflight.unresolved[0], {
    ...preflight.unresolved[0],
    cueId: "shared-ambiguous",
    mediaId: "unknown",
    title: "Ambiguous Shared Clip",
    reason: "ambiguous-media-contract-alias",
  });
  assert.equal(preflight.unresolved[0].aliasConflicts.length, 2);
});

test("HyperFrames uses media manifest contracts as a secondary source", () => {
  const contentHash = "e".repeat(64);
  const runtimeUri = "/media/manifest-runtime.mp4";
  const project = {
    timeline: [{ media_id: "manifest-media", media_uri: "/media/manifest-source.mp4", runtime_media_uri: runtimeUri }],
    media_manifest: {
      items: [{ shotIndex: 0, mediaId: "manifest-media", type: "video", originalUri: "/media/manifest-source.mp4", runtimeUri, contentHash }],
    },
  };
  const source = resolveHyperFramesMediaSource(mediaCard("manifest-cue", { id: "manifest-media", localPath: runtimeUri }), indexHyperFramesMediaContracts(project));
  assert.equal(source.contractResolution.status, "matched");
  assert.equal(source.runtimeUri, runtimeUri);
  assert.equal(source.contentHash, contentHash);
});

test("HyperFrames inline shot contracts override stale positional media manifest aliases", () => {
  const staleHash = "1".repeat(64);
  const currentHash = "2".repeat(64);
  const staleUri = "/media/stale-base-shot.mp4";
  const currentUri = "/media/current-variant-shot.mp4";
  const project = {
    timeline: [{
      media_id: `hapa-media:sha256:${currentHash}`,
      media_uri: currentUri,
      runtime_media_uri: currentUri,
      media_contract: { type: "video", originalUri: currentUri, runtimeUri: currentUri, contentHash: currentHash },
    }],
    media_manifest: {
      items: [{
        shotIndex: 0,
        mediaId: `hapa-media:sha256:${staleHash}`,
        type: "video",
        originalUri: staleUri,
        runtimeUri: staleUri,
        contentHash: staleHash,
      }],
    },
  };
  const index = indexHyperFramesMediaContracts(project);
  const current = resolveHyperFramesMediaSource(mediaCard("variant-cue", {
    id: `hapa-media:sha256:${currentHash}`,
    title: "Current Variant Shot",
    localPath: currentUri,
  }), index);

  assert.equal(current.contractResolution.status, "matched");
  assert.equal(current.contractResolution.alias, `uri:${currentUri}`);
  assert.equal(current.originalUri, currentUri);
  assert.equal(current.contentHash, currentHash);
  assert.equal(index.ambiguousAliases.has(`uri:${currentUri}`), false);
  assert.equal(index.ambiguousAliases.has(`uri:${staleUri}`), false);
  assert.equal(index.byAlias.has(`uri:${staleUri}`), false, "a stale positional manifest URI must not be attached to an authoritative inline contract");
});

test("HyperFrames candidate resolution covers app media, local-file API, file URI, and absolute paths", () => {
  const root = "/workspace/hapa-avatar-builder";
  const projectPath = "/managed/render/inputs/project.json";
  const absolutePath = "/Users/example/Media/clip one.mp4";
  const appCandidates = hyperFramesMediaSourceCandidates({ source: { originalPath: "/media/runtime-clip.mp4" } }, { root, projectPath });
  const localFileUri = `/api/local-file?path=${encodeURIComponent(absolutePath)}`;
  const localFileCandidates = hyperFramesMediaSourceCandidates({ source: { originalPath: localFileUri } }, { root, projectPath });
  const fileCandidates = hyperFramesMediaSourceCandidates({ source: { originalPath: pathToFileURL(absolutePath).href } }, { root, projectPath });
  const absoluteCandidates = hyperFramesMediaSourceCandidates({ source: { originalPath: absolutePath } }, { root, projectPath });

  assert.deepEqual(appCandidates, [path.join(root, "data/media/runtime-clip.mp4")]);
  assert.equal(resolveHyperFramesLocalFileUri(localFileUri), absolutePath);
  assert.deepEqual(localFileCandidates, [absolutePath]);
  assert.deepEqual(fileCandidates, [absolutePath]);
  assert.deepEqual(absoluteCandidates, [absolutePath]);
});

test("HyperFrames leaves arbitrary blank media unresolved with actionable cue diagnostics", () => {
  const graph = nativeMediaGraph([mediaCard("cue-blank", { id: "not-none", title: "Blank But Not Visualizer", localPath: "" })]);
  const preflight = preflightHyperFramesMedia(graph, {
    project: { timeline: [] },
    root: "/workspace/hapa-avatar-builder",
    projectPath: "/managed/render/inputs/project.json",
    isFile: () => false,
  });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.unresolvedCount, 1);
  assert.deepEqual(preflight.unresolved[0], {
    ...preflight.unresolved[0],
    cueId: "cue-blank",
    mediaId: "not-none",
    title: "Blank But Not Visualizer",
    originalUri: null,
    runtimeUri: null,
    attemptedPaths: [],
    reason: "media-source-uri-missing",
  });
});

test("HyperFrames CLI writes an authoritative failed preflight report before asset packaging", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-hyperframes-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const graphPath = path.join(root, "graph.json");
  const telemetryPath = path.join(root, "telemetry.json");
  const projectPath = path.join(root, "project.json");
  const proxyRegistryPath = path.join(root, "proxies.json");
  const output = path.join(root, "output");
  fs.writeFileSync(graphPath, JSON.stringify(nativeMediaGraph([
    mediaCard("cue-missing", { id: "missing-media", title: "Missing Named Clip", localPath: "/definitely/missing.mp4" }, { provenance: { rendererRoute: "video" } }),
  ])));
  fs.writeFileSync(telemetryPath, JSON.stringify({ fps: 10, stems: [{ id: "master", role: "master", frames: [{ t: 0, rms: 0, peak: 0, onset: 0 }] }] }));
  fs.writeFileSync(projectPath, JSON.stringify({ timeline: [] }));
  fs.writeFileSync(proxyRegistryPath, JSON.stringify({ proxies: [] }));

  const result = spawnSync(process.execPath, [
    "scripts/compile-hyperframes-show-v2.mjs",
    `--graph=${graphPath}`,
    `--telemetry=${telemetryPath}`,
    `--project=${projectPath}`,
    `--proxy-registry=${proxyRegistryPath}`,
    `--output=${output}`,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cue-missing/u);
  assert.match(result.stderr, /Missing Named Clip/u);
  assert.equal(fs.existsSync(path.join(output, "assets")), false, "failed preflight must stop before package asset directories are created");
  const report = JSON.parse(fs.readFileSync(path.join(output, "compiler-report.json"), "utf8"));
  assert.equal(report.ok, false);
  assert.equal(report.validation.mediaPreflight, "fail");
  assert.equal(report.validation.showcaseReady, false);
  assert.equal(report.media.compiled, 0);
  assert.equal(report.media.preflight.unresolvedCount, 1);
  assert.equal(report.media.preflight.unresolved[0].cueId, "cue-missing");
  assert.equal(report.media.preflight.unresolved[0].reason, "media-source-file-unavailable");
});

test("HyperFrames CLI fails closed before packaging when an exact visualizer proxy asset is unavailable", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-hyperframes-visualizer-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const graphPath = path.join(root, "graph.json");
  const telemetryPath = path.join(root, "telemetry.json");
  const projectPath = path.join(root, "project.json");
  const proxyRegistryPath = path.join(root, "proxies.json");
  const output = path.join(root, "output");
  const sourceHash = `sha256:${"b".repeat(64)}`;
  const assetSha256 = `sha256:${"a".repeat(64)}`;
  const missingAssetPath = path.join(root, "missing-exact-proxy.png");
  const graph = nativeMediaGraph([
    mediaCard("cue-generated", { id: "none", title: "Generated IVF", localPath: "" }, { knockedOut: true }),
  ]);
  graph.tracks.push({
    id: "track-b",
    role: "visualizer",
    cards: [{
      id: "cue-missing-proxy",
      startSeconds: 0,
      endSeconds: 4,
      parameters: {},
      visualization: {
        sourceId: "isf:test-missing-proxy",
        card: {
          schemaVersion: "hapa.visualizer-card.v2",
          id: "isf:test-missing-proxy",
          title: "Missing Exact Proxy",
          source: { hash: sourceHash },
          inputs: [],
          controls: {},
          audioMap: {},
          layer: {},
        },
      },
    }],
  });
  fs.writeFileSync(graphPath, JSON.stringify(graph));
  fs.writeFileSync(telemetryPath, JSON.stringify({ fps: 10, stems: [{ id: "master", role: "master", frames: [{ t: 0, rms: 0, peak: 0, onset: 0 }] }] }));
  fs.writeFileSync(projectPath, JSON.stringify({ timeline: [] }));
  fs.writeFileSync(proxyRegistryPath, JSON.stringify({
    proxies: [{
      id: "isf:test-missing-proxy",
      sourceHash,
      assetPath: missingAssetPath,
      assetSha256,
      width: 2,
      height: 2,
      frameCount: 1,
      fps: 1,
    }],
  }));

  const result = spawnSync(process.execPath, [
    "scripts/compile-hyperframes-show-v2.mjs",
    `--graph=${graphPath}`,
    `--telemetry=${telemetryPath}`,
    `--project=${projectPath}`,
    `--proxy-registry=${proxyRegistryPath}`,
    `--output=${output}`,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cue-missing-proxy/u);
  assert.match(result.stderr, /exact-proxy-asset-unavailable/u);
  assert.equal(fs.existsSync(path.join(output, "assets")), false, "visualizer preflight must stop before any package asset directory is created");
  const report = JSON.parse(fs.readFileSync(path.join(output, "compiler-report.json"), "utf8"));
  assert.equal(report.ok, false);
  assert.equal(report.validation.mediaPreflight, "pass");
  assert.equal(report.validation.visualizerPreflight, "fail");
  assert.equal(report.validation.visualizerOffline, "fail");
  assert.equal(report.validation.showcaseReady, false);
  assert.equal(report.visualizers.compiledAssets, 0);
  assert.equal(report.visualizers.uniqueCompiledAssets, 0);
  assert.deepEqual(report.visualizers.offlineMissing, ["cue-missing-proxy"]);
  assert.equal(report.visualizers.preflight.unresolved[0].cueId, "cue-missing-proxy");
  assert.equal(report.visualizers.preflight.unresolved[0].reason, "exact-proxy-asset-unavailable");
  assert.deepEqual(report.visualizers.preflight.unresolved[0].attemptedPaths, [missingAssetPath]);
});

test("HyperFrames visualizer preflight accepts a later hash-exact proxy candidate after a stale readable candidate", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-hyperframes-proxy-candidate-order-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const graphPath = path.join(root, "graph.json");
  const telemetryPath = path.join(root, "telemetry.json");
  const projectPath = path.join(root, "project.json");
  const proxyRegistryPath = path.join(root, "proxies.json");
  const output = path.join(root, "output");
  const staleAssetPath = path.join(root, "stale-proxy.png");
  const exactAssetPath = path.join(root, "exact-proxy.png");
  const exactBytes = Buffer.from("hash-exact-proxy-candidate");
  fs.writeFileSync(staleAssetPath, "stale-proxy-candidate");
  fs.writeFileSync(exactAssetPath, exactBytes);
  const sourceHash = `sha256:${"c".repeat(64)}`;
  const assetSha256 = `sha256:${crypto.createHash("sha256").update(exactBytes).digest("hex")}`;
  const graph = nativeMediaGraph([
    mediaCard("cue-generated", { id: "none", title: "Generated IVF", localPath: "" }, { knockedOut: true }),
  ]);
  graph.tracks.push({
    id: "track-b",
    role: "visualizer",
    cards: [{
      id: "cue-exact-proxy",
      startSeconds: 0,
      endSeconds: 4,
      parameters: {},
      visualization: {
        sourceId: "isf:test-exact-proxy",
        card: {
          schemaVersion: "hapa.visualizer-card.v2",
          id: "isf:test-exact-proxy",
          title: "Exact Proxy Candidate",
          source: { hash: sourceHash },
          inputs: [],
          controls: {},
          audioMap: {},
          layer: {},
        },
      },
    }],
  });
  fs.writeFileSync(graphPath, JSON.stringify(graph));
  fs.writeFileSync(telemetryPath, JSON.stringify({ fps: 10, stems: [{ id: "master", role: "master", frames: [{ t: 0, rms: 0, peak: 0, onset: 0 }] }] }));
  fs.writeFileSync(projectPath, JSON.stringify({ timeline: [] }));
  fs.writeFileSync(proxyRegistryPath, JSON.stringify({
    proxies: [{
      id: "isf:test-exact-proxy",
      sourceHash,
      repositoryPath: staleAssetPath,
      assetPath: exactAssetPath,
      assetSha256,
      width: 2,
      height: 2,
      frameCount: 1,
      fps: 1,
    }],
  }));

  const result = spawnSync(process.execPath, [
    "scripts/compile-hyperframes-show-v2.mjs",
    `--graph=${graphPath}`,
    `--telemetry=${telemetryPath}`,
    `--project=${projectPath}`,
    `--proxy-registry=${proxyRegistryPath}`,
    `--output=${output}`,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(output, "compiler-report.json"), "utf8"));
  const proxyPreflight = report.visualizers.preflight.entries[0];
  assert.equal(report.ok, true);
  assert.equal(report.visualizers.compiledAssets, 1);
  assert.equal(report.visualizers.uniqueCompiledAssets, 1);
  assert.equal(proxyPreflight.firstReadablePath, staleAssetPath);
  assert.equal(proxyPreflight.resolvedPath, exactAssetPath);
  assert.equal(proxyPreflight.reason, "exact-proxy-asset-resolved");
});
