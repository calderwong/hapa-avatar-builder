import test from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SongCardMintController } from "../server/song-card-mint-controller.mjs";
import { createEchoMintPlanCanonicalResolver } from "../server/echo-mint-plan-canonical-resolver.mjs";
import { assessSongCardMintPlanCompatibility } from "../src/domain/song-card-mint-plan-compatibility.js";
import { contentHash } from "../src/domain/echo-director-v2.js";
import { reidentifyEchoCompiledShowGraph } from "../src/domain/echo-compiled-show-graph.js";

function fixture() {
  const timeline = [{ start_sec: 0, end_sec: 10, media_id: "media:one", media_title: "One" }];
  const visualizerTimeline = [{ start_sec: 0, end_sec: 10, visualizer_id: "isf:one", visualizer_title: "One" }];
  const project = {
    song_id: "song-slug",
    audio_id: "registry-song",
    song_title: "Song",
    duration: 10,
    timeline,
    visualizer_timeline: visualizerTimeline,
    active_direction_script_variant: { id: "cut-one" },
  };
  const legacyGraph = {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "registry-song", title: "Song", durationSeconds: 10 },
    stems: { items: [{ id: "stem:0", stemType: "Vocals", title: "Vocals" }] },
    tracks: [
      { id: "media-a", role: "media", cards: [{ id: "legacy:media:0", startSeconds: 0, endSeconds: 10 }] },
      { id: "ivf-stack", role: "visualizer", cards: [{ id: "legacy:ivf:0", startSeconds: 0, endSeconds: 10, visualization: { sourceId: "isf:one" } }] },
    ],
    directorV2: { variantId: "cut-one", variantHash: "fnv:legacy", stemBuses: [] },
  };
  const canonicalGraph = {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "registry-song", title: "Song", durationSeconds: 10 },
    stems: { items: [{ id: "stem:vocals", stemType: "Vocals", audioPath: "/audio/vocals.wav" }] },
    tracks: [
      { id: "track-a", role: "foundation", cards: [{ id: "media:one", startSeconds: 0, endSeconds: 10, media: { id: "media:one" } }] },
      { id: "track-b", role: "visualizer", cards: [{ id: "viz:one", startSeconds: 0, endSeconds: 10, visualization: { sourceId: "isf:one", card: { schemaVersion: "hapa.visualizer-card.v2", id: "isf:one", source: { uri: "/static/isf/one.fs", hash: `sha256:${"1".repeat(64)}` } } } }] },
      { id: "track-c", role: "accent", cards: [] },
    ],
    directorV2: { variantId: "cut-one", variantHash: "content-v2:canonical", stemBuses: [{ id: "bus:vocals" }], rendererSupport: {} },
  };
  const sourceVariant = { id: "cut-one", timeline, visualizer_timeline: visualizerTimeline };
  const canonicalProject = { ...project, director_show_graph: canonicalGraph };
  const plan = {
    schemaVersion: "hapa.song-card.mint-plan.v1",
    id: "plan:legacy",
    planId: "plan:legacy",
    songId: "registry-song",
    headId: "song-card:registry-song",
    status: "changed",
    input: {
      song: { id: "registry-song", title: "Song" },
      project,
      showGraph: legacyGraph,
      receipts: {},
    },
    hardBlockers: [],
    blockers: [],
    logs: [],
  };
  return { plan, canonicalProject, canonicalGraph, sourceVariant };
}

async function createCanonicalResolverStore(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-working-alias-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const projectsRoot = path.join(root, "projects");
  const variantsRoot = path.join(root, "variants");
  const albumRoot = path.join(root, "album");
  const songId = "song-slug";
  const timeline = [{ start_sec: 0, end_sec: 10, media_id: "media:one", media_title: "One" }];
  const visualizerTimeline = [{ start_sec: 0, end_sec: 10, visualizer_id: "isf:one", visualizer_title: "One" }];
  const rawProject = {
    song_id: songId,
    audio_id: "registry-song",
    song_title: "Song",
    duration: 10,
    timeline,
    visualizer_timeline: visualizerTimeline,
    active_direction_script_variant: { id: "base" },
  };
  const sourceProjectHash = contentHash(rawProject);
  const compiledGraph = reidentifyEchoCompiledShowGraph({
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "registry-song", title: "Song", durationSeconds: 10 },
    stems: { items: [{ id: "stem:vocals", stemType: "Vocals", audioPath: "/audio/vocals.wav" }] },
    tracks: [
      { id: "track-a", role: "foundation", cards: [{ id: "media:one", startSeconds: 0, endSeconds: 10, media: { id: "media:one" } }] },
      { id: "track-b", role: "visualizer", cards: [{ id: "viz:one", startSeconds: 0, endSeconds: 10, visualization: { sourceId: "isf:one", card: { schemaVersion: "hapa.visualizer-card.v2", id: "isf:one", source: { uri: "/static/isf/one.fs", hash: `sha256:${"1".repeat(64)}` } } } }] },
      { id: "track-c", role: "accent", cards: [] },
    ],
    directorV2: {
      stemBuses: [{ id: "bus:vocals" }],
      source: { sourceProjectHash, inputHashes: { project: "a".repeat(64) } },
      provenance: { sourceProjectHash },
    },
  });
  const sourceVariant = { id: "cut-one", timeline, visualizer_timeline: visualizerTimeline };
  await Promise.all([
    fsp.mkdir(projectsRoot, { recursive: true }),
    fsp.mkdir(path.join(variantsRoot, songId), { recursive: true }),
    fsp.mkdir(path.join(albumRoot, songId), { recursive: true }),
  ]);
  await Promise.all([
    fsp.writeFile(path.join(projectsRoot, `${songId}-video-project.json`), `${JSON.stringify(rawProject)}\n`),
    fsp.writeFile(path.join(variantsRoot, songId, "cut-one.json"), `${JSON.stringify(sourceVariant)}\n`),
    fsp.writeFile(path.join(albumRoot, songId, "native-show-graph.json"), `${JSON.stringify(compiledGraph)}\n`),
  ]);
  return { root, projectsRoot, variantsRoot, albumRoot, rawProject, compiledGraph };
}

test("controller retry supersedes a proven legacy plan with a new canonical plan revision", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-plan-rehydration-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const value = fixture();
  const resolver = async (plan) => assessSongCardMintPlanCompatibility({
    plan,
    canonicalProject: value.canonicalProject,
    canonicalGraph: value.canonicalGraph,
    sourceVariant: value.sourceVariant,
    sourceEvidence: { sourceKind: "test-sidecar" },
  });
  const controller = new SongCardMintController({
    root,
    mintPlanCompatibilityResolver: resolver,
    enforceMintPlanCompatibility: true,
  });
  await controller.initialize();
  await fsp.writeFile(controller.planPath(value.plan.planId), `${JSON.stringify(value.plan, null, 2)}\n`);

  const replacement = await controller.retry(value.plan.planId);
  const superseded = await controller.getPlan(value.plan.planId);
  const storedReplacement = await controller.getPlan(replacement.planId);

  assert.notEqual(replacement.planId, value.plan.planId);
  assert.equal(superseded.status, "superseded");
  assert.equal(superseded.supersededBy, replacement.planId);
  assert.equal(storedReplacement.input.showGraph.tracks.length, 3);
  assert.equal(storedReplacement.input.project.timeline[0].media_id, "media:one");
  assert.equal(storedReplacement.mintPlanCompatibility.action, "rehydrated-canonical-compiled-graph");
});

test("render assertion blocks the stale plan before a worker can start", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-plan-render-guard-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const value = fixture();
  const controller = new SongCardMintController({
    root,
    mintPlanCompatibilityResolver: async (plan) => assessSongCardMintPlanCompatibility({
      plan,
      canonicalProject: value.canonicalProject,
      canonicalGraph: value.canonicalGraph,
      sourceVariant: value.sourceVariant,
    }),
  });
  await controller.initialize();
  await fsp.writeFile(controller.planPath(value.plan.planId), `${JSON.stringify(value.plan, null, 2)}\n`);

  await assert.rejects(
    controller.assertPlanRunnable(value.plan.planId),
    (error) => error?.code === "mint_plan_rehydration_required" && error?.details?.compatibility?.identityProof?.editorialPayload === true,
  );
  assert.equal((await controller.getPlan(value.plan.planId)).status, "changed", "the guard diagnoses without mutating the plan");
});

test("production planning repairs the legacy fallback before it can be persisted", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-plan-create-guard-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const value = fixture();
  const controller = new SongCardMintController({
    root,
    mintPlanCompatibilityResolver: async (plan) => assessSongCardMintPlanCompatibility({
      plan,
      canonicalProject: value.canonicalProject,
      canonicalGraph: value.canonicalGraph,
      sourceVariant: value.sourceVariant,
    }),
    enforceMintPlanCompatibility: true,
  });

  const planned = await controller.plan("registry-song", value.plan.input);
  const stored = await controller.getPlan(planned.planId);
  assert.equal(stored.input.showGraph.tracks.length, 3);
  assert.equal(stored.input.showGraph.tracks.some((track) => track.id === "ivf-stack"), false);
  assert.equal(stored.input.receipts.mintPlanCompatibility.identityProof.variantId, true);
});

test("rehydration cannot bless an old rendered master for the replacement graph", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-plan-artifact-invalidation-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const value = fixture();
  const oldMaster = path.join(root, "old-master.mp4");
  const oldPoster = path.join(root, "old-poster.jpg");
  await fsp.writeFile(oldMaster, "an old rendered master");
  await fsp.writeFile(oldPoster, "an old poster");
  value.plan.input.renderMasterPath = oldMaster;
  value.plan.input.posterPath = oldPoster;
  value.plan.input.render = { masterPath: oldMaster, masterSha256: "old-master" };
  value.plan.input.rendererTruth = { ok: true, allStatesVisible: true, silentDefaultCount: 0, cueReceiptCount: 1 };
  value.plan.input.approvals = { technical: true, creative: true };
  value.plan.input.safety = { ok: true };
  value.plan.input.receipts = {
    releaseExport: { masterSha256: "old-master" },
    releaseExportVerification: { ok: true },
  };
  const controller = new SongCardMintController({
    root: path.join(root, "ledger"),
    mintPlanCompatibilityResolver: async (plan) => assessSongCardMintPlanCompatibility({
      plan,
      canonicalProject: value.canonicalProject,
      canonicalGraph: value.canonicalGraph,
      sourceVariant: value.sourceVariant,
    }),
    enforceMintPlanCompatibility: true,
  });
  await controller.initialize();
  await fsp.writeFile(controller.planPath(value.plan.planId), `${JSON.stringify(value.plan, null, 2)}\n`);

  const rebuilt = await controller.rehydratePlan(value.plan.planId);
  const replacement = await controller.getPlan(rebuilt.plan.planId);
  assert.equal(replacement.renderMasterPath, "");
  assert.equal(replacement.posterPath, "");
  assert.equal(replacement.input.renderMasterPath, "");
  assert.equal(replacement.input.posterPath, "");
  assert.equal(replacement.input.rendererTruth.ok, false);
  assert.equal(replacement.input.receipts.releaseExport, undefined);
  assert.equal(replacement.input.receipts.releaseExportVerification, undefined);
  assert.ok(replacement.hardBlockers.some((row) => row.code === "render-master-required"));
  assert.ok(replacement.hardBlockers.some((row) => row.code === "poster-required"));
  assert.notEqual(replacement.status, "ready");
});

test("canonical recovery loads the saved cut behind a proven working alias", async (t) => {
  const store = await createCanonicalResolverStore(t);
  const saved = fixture().plan;
  const workingHash = "content-v2:working-cut-one";
  const detachedGraph = structuredClone(store.compiledGraph);
  detachedGraph.tracks.find((track) => track.role === "visualizer").cards[0].visualization = {
    sourceId: "isf:one",
    status: "portable-card-missing",
  };
  detachedGraph.directorV2 = {
    ...detachedGraph.directorV2,
    variantId: "working:cut-one",
    variantHash: workingHash,
    parentVariantId: "cut-one",
  };
  saved.input.project = {
    ...store.rawProject,
    active_direction_script_variant: {
      id: "cut-one",
      workingFork: true,
      workingHash,
    },
  };
  saved.input.showGraph = detachedGraph;
  const resolver = createEchoMintPlanCanonicalResolver({
    avatarRoot: store.root,
    projectsRoot: store.projectsRoot,
    variantsRoot: store.variantsRoot,
    albumRoot: store.albumRoot,
    shaderCatalog: [],
  });

  const result = await resolver(saved);

  assert.equal(result.status, "rehydrated");
  assert.equal(result.receipt.savedVariantId, "cut-one");
  assert.equal(result.receipt.workingAliasIdentity.resolvedVariantId, "cut-one");
  assert.equal(result.receipt.sourceEvidence.sourceId, path.join("variants", "song-slug", "cut-one.json"));
  assert.equal(result.input.showGraph.directorV2.variantId, "cut-one");
});

test("canonical recovery rejects a working alias when its lineage proof disagrees", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-working-alias-mismatch-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const value = fixture();
  const saved = value.plan;
  const graph = structuredClone(saved.input.showGraph);
  graph.tracks = value.canonicalGraph.tracks;
  graph.stems = value.canonicalGraph.stems;
  graph.directorV2 = {
    ...value.canonicalGraph.directorV2,
    variantId: "working:cut-one",
    variantHash: "content-v2:working-cut-one",
    parentVariantId: "cut-two",
  };
  graph.tracks.find((track) => track.role === "visualizer").cards[0].visualization = {
    sourceId: "isf:one",
    status: "portable-card-missing",
  };
  saved.input.showGraph = graph;
  saved.input.project.active_direction_script_variant = {
    id: "cut-one",
    workingFork: true,
    workingHash: graph.directorV2.variantHash,
  };
  const resolver = createEchoMintPlanCanonicalResolver({ avatarRoot: root, shaderCatalog: [] });

  const result = await resolver(saved);

  assert.equal(result.status, "non-runnable");
  assert.deepEqual(result.reasons, ["working-variant-alias-identity-mismatch"]);
  assert.ok(result.blocker.details.workingAliasIdentity.reasons.includes("working-alias-parent-variant-mismatch"));
});

test("canonical resolution reloads the shader catalog and binds its current digest", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-plan-catalog-freshness-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const projectsRoot = path.join(root, "projects");
  const variantsRoot = path.join(root, "variants");
  const albumRoot = path.join(root, "album");
  const songId = "song-slug";
  const timeline = [{ start_sec: 0, end_sec: 10, media_id: "media:one" }];
  const visualizerTimeline = [{ start_sec: 0, end_sec: 10, visualizer_id: "isf:one" }];
  const rawProject = {
    song_id: songId,
    audio_id: "registry-song",
    song_title: "Song",
    duration: 10,
    timeline,
    visualizer_timeline: visualizerTimeline,
    active_direction_script_variant: { id: "base" },
  };
  const sourceProjectHash = contentHash(rawProject);
  const compiledGraph = reidentifyEchoCompiledShowGraph({
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "registry-song", title: "Song", durationSeconds: 10 },
    stems: { items: [{ id: "stem:vocals", stemType: "Vocals", audioPath: "/audio/vocals.wav" }] },
    tracks: [
      { id: "track-a", role: "foundation", cards: [{ id: "media:one", startSeconds: 0, endSeconds: 10, media: { id: "media:one" } }] },
      { id: "track-b", role: "visualizer", cards: [{ id: "viz:one", startSeconds: 0, endSeconds: 10, visualization: { sourceId: "isf:one", card: { schemaVersion: "hapa.visualizer-card.v2", id: "isf:one", source: { uri: "/static/isf/one.fs", hash: `sha256:${"1".repeat(64)}` } } } }] },
      { id: "track-c", role: "accent", cards: [] },
    ],
    directorV2: {
      stemBuses: [{ id: "bus:vocals" }],
      source: { sourceProjectHash, inputHashes: { project: "a".repeat(64) } },
      provenance: { sourceProjectHash },
    },
  });
  const sourceVariant = { id: "cut-one", timeline, visualizer_timeline: visualizerTimeline };
  await Promise.all([
    fsp.mkdir(projectsRoot, { recursive: true }),
    fsp.mkdir(path.join(variantsRoot, songId), { recursive: true }),
    fsp.mkdir(path.join(albumRoot, songId), { recursive: true }),
  ]);
  await Promise.all([
    fsp.writeFile(path.join(projectsRoot, `${songId}-video-project.json`), `${JSON.stringify(rawProject)}\n`),
    fsp.writeFile(path.join(variantsRoot, songId, "cut-one.json"), `${JSON.stringify(sourceVariant)}\n`),
    fsp.writeFile(path.join(albumRoot, songId, "native-show-graph.json"), `${JSON.stringify(compiledGraph)}\n`),
  ]);
  const saved = fixture().plan;
  saved.songId = "registry-song";
  saved.input.project = {
    ...rawProject,
    active_direction_script_variant: { id: "cut-one" },
  };
  saved.input.showGraph.song.id = "registry-song";
  saved.input.showGraph.directorV2.variantId = "cut-one";
  let loads = 0;
  const resolver = createEchoMintPlanCanonicalResolver({
    avatarRoot: root,
    projectsRoot,
    variantsRoot,
    albumRoot,
    shaderCatalogLoader: async () => [{ id: `catalog:${++loads}`, source: `shader-${loads}.fs`, sourceHash: String(loads).repeat(64) }],
  });

  const first = await resolver(saved);
  const second = await resolver(saved);
  assert.equal(first.status, "rehydrated");
  assert.equal(second.status, "rehydrated");
  assert.equal(loads, 2);
  assert.notEqual(first.receipt.sourceEvidence.shaderCatalogSha256, second.receipt.sourceEvidence.shaderCatalogSha256);
});

test("persisted replacement plans do not duplicate the canonical graph inside the project", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-plan-size-regression-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const value = fixture();
  const marker = "canonical-size-marker-";
  const directionMarker = "direction-size-marker-";
  const repetitions = 100_000;
  value.canonicalGraph.largeUniquePayload = marker.repeat(repetitions);
  value.canonicalGraph.directorV2.effects = [{ payload: directionMarker.repeat(30_000) }];
  value.canonicalProject.director_show_graph = value.canonicalGraph;
  value.plan.input.project.direction_script_variants = [{ id: "authoring-library", payload: "library-payload-".repeat(20_000) }];
  const controller = new SongCardMintController({
    root,
    mintPlanCompatibilityResolver: async (plan) => assessSongCardMintPlanCompatibility({
      plan,
      canonicalProject: value.canonicalProject,
      canonicalGraph: value.canonicalGraph,
      sourceVariant: value.sourceVariant,
    }),
    enforceMintPlanCompatibility: true,
  });
  await controller.initialize();
  await fsp.writeFile(controller.planPath(value.plan.planId), `${JSON.stringify(value.plan, null, 2)}\n`);

  const rebuilt = await controller.rehydratePlan(value.plan.planId);
  const replacementPath = controller.planPath(rebuilt.plan.planId);
  const encoded = await fsp.readFile(replacementPath, "utf8");
  const markerCount = encoded.split(marker).length - 1;
  const directionMarkerCount = encoded.split(directionMarker).length - 1;
  assert.equal(markerCount, repetitions * 2, "the graph should exist only in input.showGraph and the immutable snapshot");
  assert.equal(directionMarkerCount, 30_000 * 3, "direction-family projection should be the only intentional third copy");
  assert.equal(encoded.includes("authoring-library"), false, "the append-only authoring library is referenced, not copied into an execution plan");
  assert.ok(JSON.stringify(value.canonicalGraph).length > 2 * 1024 * 1024, "fixture must remain Bok-scale");
  assert.ok((await fsp.stat(replacementPath)).size <= 8 * 1024 * 1024, "Bok-scale persisted plans must remain at or below 8 MiB");
  assert.ok(encoded.length < JSON.stringify(value.canonicalGraph).length * 3 + 250_000, `replacement plan unexpectedly expanded to ${encoded.length} bytes`);
});
