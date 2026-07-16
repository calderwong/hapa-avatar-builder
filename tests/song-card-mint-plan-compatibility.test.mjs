import test from "node:test";
import assert from "node:assert/strict";
import {
  assessSongCardMintPlanCompatibility,
  inspectSongCardMintGraphCompatibility,
  resolveSongCardMintWorkingAliasIdentity,
} from "../src/domain/song-card-mint-plan-compatibility.js";

function legacyGraph() {
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "registry-song", durationSeconds: 12 },
    stems: { items: ["Vocals", "Drums"].map((title, index) => ({ id: `stem:${index}`, title, stemType: title })) },
    tracks: [
      {
        id: "media-a",
        role: "media",
        cards: [{ id: "legacy:media:0", startSeconds: 0, endSeconds: 12 }],
      },
      {
        id: "ivf-stack",
        role: "visualizer",
        cards: [{
          id: "legacy:ivf:0",
          startSeconds: 0,
          endSeconds: 12,
          visualization: { sourceId: "isf:one", status: "portable-card-missing" },
        }],
      },
    ],
    directorV2: { variantId: "cut-one", variantHash: "fnv:legacy", stemBuses: [] },
  };
}

function canonicalGraph() {
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "registry-song", durationSeconds: 12 },
    stems: {
      items: [
        { id: "stem:vocals", stemType: "Vocals", audioPath: "/audio/vocals.wav" },
        { id: "stem:drums", stemType: "Drums", audioPath: "/audio/drums.wav" },
      ],
    },
    tracks: [
      { id: "track-a", role: "foundation", cards: [{ id: "media:0", startSeconds: 0, endSeconds: 12 }] },
      {
        id: "track-b",
        role: "visualizer",
        cards: [{
          id: "viz:0",
          startSeconds: 0,
          endSeconds: 12,
          visualization: { sourceId: "isf:one", card: { schemaVersion: "hapa.visualizer-card.v2", id: "isf:one", source: { uri: "/static/isf/one.fs", hash: `sha256:${"1".repeat(64)}` } } },
        }],
      },
      { id: "track-c", role: "accent", cards: [] },
    ],
    directorV2: {
      variantId: "cut-one",
      variantHash: "content-v2:canonical",
      stemBuses: [{ id: "bus:vocals" }, { id: "bus:drums" }],
    },
  };
}

function plan() {
  const timeline = [{ start_sec: 0, end_sec: 12, media_id: "media:one" }];
  const visualizerTimeline = [{ start_sec: 0, end_sec: 12, visualizer_id: "isf:one" }];
  return {
    planId: "plan:legacy",
    songId: "registry-song",
    input: {
      project: {
        song_id: "song-slug",
        audio_id: "registry-song",
        duration: 12,
        timeline,
        visualizer_timeline: visualizerTimeline,
        lyric_style: "cyan",
        active_direction_script_variant: { id: "cut-one" },
      },
      showGraph: legacyGraph(),
      receipts: { existing: { ok: true } },
    },
  };
}

function workingDetachedPlan() {
  const saved = plan();
  const graph = canonicalGraph();
  graph.tracks.find((track) => track.role === "visualizer").cards[0].visualization = {
    sourceId: "isf:one",
    status: "portable-card-missing",
  };
  graph.directorV2 = {
    ...graph.directorV2,
    variantId: "working:cut-one",
    variantHash: "content-v2:working-cut-one",
    parentVariantId: "cut-one",
  };
  saved.input.showGraph = graph;
  saved.input.project.active_direction_script_variant = {
    id: "cut-one",
    workingFork: true,
    workingHash: graph.directorV2.variantHash,
  };
  return saved;
}

test("detects the pathless projectToEditorGraph producer signature without classifying arbitrary small graphs", () => {
  const legacy = inspectSongCardMintGraphCompatibility(legacyGraph());
  assert.equal(legacy.legacyProjection, true);
  assert.equal(legacy.syntheticStemCount, 2);
  assert.equal(legacy.detachedVisualizerCount, 1);

  const intentionallySmall = inspectSongCardMintGraphCompatibility({
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    tracks: [{ id: "custom", role: "foundation", cards: [] }],
    stems: { items: [] },
    directorV2: {},
  });
  assert.equal(intentionallySmall.legacyProjection, false);
});

test("modern graphs with a detached portable visualizer require canonical repair", () => {
  const saved = workingDetachedPlan();
  const inspection = inspectSongCardMintGraphCompatibility(saved.input.showGraph);
  const result = assessSongCardMintPlanCompatibility({ plan: saved });

  assert.equal(inspection.legacyProjection, false);
  assert.equal(inspection.detachedVisualizerCount, 1);
  assert.equal(result.status, "non-runnable");
  assert.equal(result.requiresRepair, true);
  assert.deepEqual(result.reasons, ["canonical-compiled-graph-not-resolved"]);
});

test("visualizer-track cards without a visualization object still require canonical repair", () => {
  const saved = plan();
  saved.input.showGraph = canonicalGraph();
  const card = saved.input.showGraph.tracks.find((track) => track.role === "visualizer").cards[0];
  card.media = { id: "isf:one", title: "One" };
  delete card.visualization;

  const inspection = inspectSongCardMintGraphCompatibility(saved.input.showGraph);
  const result = assessSongCardMintPlanCompatibility({ plan: saved });
  assert.equal(inspection.visualizerCount, 1);
  assert.equal(inspection.detachedVisualizerCount, 1);
  assert.equal(result.status, "non-runnable");
  assert.equal(result.requiresRepair, true);
});

test("intentional None pass-through cards remain canonical and runnable", () => {
  const graph = canonicalGraph();
  graph.tracks.find((track) => track.role === "visualizer").cards = [{
    id: "viz:none",
    startSeconds: 0,
    endSeconds: 12,
    visualization: null,
    disabled: true,
    knockedOut: true,
    provenance: { portableCardStatus: "pass-through-no-visualizer" },
  }];
  const saved = plan();
  saved.input.showGraph = graph;
  const inspection = inspectSongCardMintGraphCompatibility(graph);
  const result = assessSongCardMintPlanCompatibility({ plan: saved });

  assert.equal(inspection.visualizerCount, 0);
  assert.equal(inspection.detachedVisualizerCount, 0);
  assert.equal(inspection.canonical, true);
  assert.equal(result.status, "current");
  assert.equal(result.runnable, true);
});

test("partial v2 cards without renderer identity still require canonical repair", () => {
  const graph = canonicalGraph();
  graph.tracks.find((track) => track.role === "visualizer").cards[0].visualization.card = {
    schemaVersion: "hapa.visualizer-card.v2",
    id: "isf:one",
    source: {},
  };
  const saved = plan();
  saved.input.showGraph = graph;
  const inspection = inspectSongCardMintGraphCompatibility(graph);
  const result = assessSongCardMintPlanCompatibility({ plan: saved });

  assert.equal(inspection.detachedVisualizerCount, 1);
  assert.equal(inspection.canonical, false);
  assert.equal(result.status, "non-runnable");
  assert.equal(result.requiresRepair, true);
});

test("invalid hashes and mismatched requested IDs are detached and can be canonically repaired", () => {
  for (const [label, mutate] of [
    ["invalid hash", (card) => { card.visualization.card.source.hash = "sha256:one"; }],
    ["mismatched requested ID", (card) => { card.visualization.sourceId = "isf:other"; }],
    ["missing source URI", (card) => { delete card.visualization.card.source.uri; }],
  ]) {
    const saved = plan();
    saved.input.showGraph = canonicalGraph();
    const visualizer = saved.input.showGraph.tracks.find((track) => track.role === "visualizer").cards[0];
    mutate(visualizer);
    const inspection = inspectSongCardMintGraphCompatibility(saved.input.showGraph);
    const sourceVariant = {
      id: "cut-one",
      timeline: structuredClone(saved.input.project.timeline),
      visualizer_timeline: structuredClone(saved.input.project.visualizer_timeline),
      project_patch: { lyric_style: "cyan" },
    };
    const canonicalProject = {
      song_id: "song-slug",
      audio_id: "registry-song",
      duration: 12,
      visualizer_timeline: structuredClone(sourceVariant.visualizer_timeline),
      active_direction_script_variant: { id: "cut-one" },
    };
    const result = assessSongCardMintPlanCompatibility({
      plan: saved,
      canonicalProject,
      canonicalGraph: canonicalGraph(),
      sourceVariant,
    });

    assert.equal(inspection.detachedVisualizerCount, 1, label);
    assert.equal(inspection.canonical, false, label);
    assert.equal(result.status, "rehydrated", label);
    assert.equal(result.runnable, true, label);
    assert.equal(result.requiresRepair, true, label);
    assert.equal(result.canonicalGraphInspection.detachedVisualizerCount, 0, label);
  }
});

test("a proven working alias normalizes to its saved append-only cut", () => {
  const saved = workingDetachedPlan();
  const sourceVariant = {
    id: "cut-one",
    timeline: structuredClone(saved.input.project.timeline),
    visualizer_timeline: structuredClone(saved.input.project.visualizer_timeline),
    project_patch: { lyric_style: "cyan" },
  };
  const canonicalProject = {
    song_id: "song-slug",
    audio_id: "registry-song",
    duration: 12,
    visualizer_timeline: structuredClone(sourceVariant.visualizer_timeline),
    active_direction_script_variant: { id: "cut-one" },
  };
  const result = assessSongCardMintPlanCompatibility({
    plan: saved,
    canonicalProject,
    canonicalGraph: canonicalGraph(),
    sourceVariant,
  });

  assert.equal(result.status, "rehydrated");
  assert.equal(result.receipt.savedVariantId, "cut-one");
  assert.equal(result.receipt.identityProof.workingAlias, true);
  assert.equal(result.receipt.workingAliasIdentity.graphVariantId, "working:cut-one");
  assert.equal(result.receipt.workingAliasIdentity.resolvedVariantId, "cut-one");
});

test("a fully portable working alias is still reloaded from its proven saved cut", () => {
  const saved = workingDetachedPlan();
  saved.input.showGraph.tracks.find((track) => track.role === "visualizer").cards = structuredClone(
    canonicalGraph().tracks.find((track) => track.role === "visualizer").cards,
  );
  const sourceVariant = {
    id: "cut-one",
    timeline: structuredClone(saved.input.project.timeline),
    visualizer_timeline: structuredClone(saved.input.project.visualizer_timeline),
    project_patch: { lyric_style: "cyan" },
  };
  const result = assessSongCardMintPlanCompatibility({
    plan: saved,
    canonicalProject: {
      song_id: "song-slug",
      audio_id: "registry-song",
      duration: 12,
      visualizer_timeline: structuredClone(sourceVariant.visualizer_timeline),
      active_direction_script_variant: { id: "cut-one" },
    },
    canonicalGraph: canonicalGraph(),
    sourceVariant,
  });

  assert.equal(result.status, "rehydrated");
  assert.equal(result.requiresRepair, true);
  assert.equal(result.receipt.repairProducer, "projectToEditorGraph:saved-working-alias");
  assert.equal(result.receipt.identityProof.workingAlias, true);
});

test("working alias normalization rejects every incomplete or contradictory identity proof", () => {
  for (const [label, mutate, expectedReason] of [
    ["parent variant", (saved) => { saved.input.showGraph.directorV2.parentVariantId = "cut-two"; }, "working-alias-parent-variant-mismatch"],
    ["active saved variant", (saved) => { saved.input.project.active_direction_script_variant.id = "cut-two"; }, "working-alias-active-variant-mismatch"],
    ["working marker", (saved) => { saved.input.project.active_direction_script_variant.workingFork = false; }, "working-alias-marker-missing"],
    ["working hash", (saved) => { saved.input.project.active_direction_script_variant.workingHash = "content-v2:other"; }, "working-alias-hash-mismatch"],
    ["graph hash", (saved) => { saved.input.showGraph.directorV2.variantHash = ""; }, "working-alias-hash-missing"],
  ]) {
    const saved = workingDetachedPlan();
    mutate(saved);
    const identity = resolveSongCardMintWorkingAliasIdentity({
      project: saved.input.project,
      graph: saved.input.showGraph,
    });
    const result = assessSongCardMintPlanCompatibility({ plan: saved });

    assert.equal(identity.applicable, true, label);
    assert.equal(identity.ok, false, label);
    assert.equal(identity.resolvedVariantId, null, label);
    assert.ok(identity.reasons.includes(expectedReason), label);
    assert.equal(result.status, "non-runnable", label);
    assert.deepEqual(result.reasons, ["working-variant-alias-identity-mismatch"], label);
  }
});

test("rehydrates only when song, duration, variant, timeline, visualizers, and project patch all match", () => {
  const saved = plan();
  const sourceVariant = {
    id: "cut-one",
    timeline: structuredClone(saved.input.project.timeline),
    visualizer_timeline: structuredClone(saved.input.project.visualizer_timeline),
    project_patch: { lyric_style: "cyan" },
  };
  const canonicalProject = {
    song_id: "song-slug",
    audio_id: "registry-song",
    duration: 12,
    visualizer_timeline: structuredClone(sourceVariant.visualizer_timeline),
    director_show_graph: canonicalGraph(),
  };
  const result = assessSongCardMintPlanCompatibility({
    plan: saved,
    canonicalProject,
    canonicalGraph: canonicalProject.director_show_graph,
    sourceVariant,
    sourceEvidence: { sourceKind: "sidecar" },
  });

  assert.equal(result.status, "rehydrated");
  assert.equal(result.runnable, true);
  assert.equal(result.input.showGraph.tracks.length, 3);
  assert.equal(result.input.project.timeline[0].media_id, "media:one", "saved editorial cut remains intact");
  assert.deepEqual(result.input.receipts.existing, { ok: true });
  assert.equal(result.receipt.identityProof.editorialPayload, true);
  assert.equal(result.receipt.sourceGraphHash, inspectSongCardMintGraphCompatibility(saved.input.showGraph).graphHash);
  assert.equal(result.input.project.director_show_graph, undefined, "the canonical graph is stored once at input.showGraph");
  assert.equal(result.input.project.director_show_graph_reference.sha256, result.receipt.canonicalGraphHash);
});

test("canonical graph replacement invalidates every render-derived approval and artifact", () => {
  const saved = plan();
  saved.input.renderMasterPath = "/tmp/old-render.mp4";
  saved.input.posterPath = "/tmp/old-poster.jpg";
  saved.input.render = { masterPath: "/tmp/old-render.mp4", masterSha256: "old-master" };
  saved.input.rendererTruth = { ok: true, allStatesVisible: true, silentDefaultCount: 0 };
  saved.input.managedArtifacts = { workspaceId: "old-workspace" };
  saved.input.approvals = { technical: true, creative: true };
  saved.input.safety = { ok: true };
  saved.input.receipts.releaseExport = { masterSha256: "old-master" };
  saved.input.receipts.releaseExportVerification = { ok: true };
  const sourceVariant = {
    id: "cut-one",
    timeline: structuredClone(saved.input.project.timeline),
    visualizer_timeline: structuredClone(saved.input.project.visualizer_timeline),
    project_patch: { lyric_style: "cyan" },
  };
  const result = assessSongCardMintPlanCompatibility({
    plan: saved,
    canonicalProject: {
      song_id: "song-slug",
      audio_id: "registry-song",
      duration: 12,
      visualizer_timeline: sourceVariant.visualizer_timeline,
      director_show_graph: canonicalGraph(),
    },
    canonicalGraph: canonicalGraph(),
    sourceVariant,
  });

  assert.equal(result.status, "rehydrated");
  assert.equal(result.input.renderMasterPath, "");
  assert.equal(result.input.posterPath, "");
  assert.equal(result.input.render.status, "requires-fresh-render");
  assert.equal(result.input.rendererTruth.ok, false);
  assert.equal(result.input.managedArtifacts, null);
  assert.equal(result.input.approvals.technical, false);
  assert.equal(result.input.approvals.creative, false);
  assert.equal(result.input.safety.ok, false);
  assert.equal(result.input.receipts.releaseExport, undefined);
  assert.equal(result.input.receipts.releaseExportVerification, undefined);
  assert.equal(result.input.receipts.existing.ok, true, "unrelated source receipts remain intact");
  assert.equal(result.receipt.renderEvidenceInvalidation.requiresFreshRender, true);
});

test("fails closed when any saved song, variant, or duration declaration contradicts the canonical source", () => {
  const sourceVariantFor = (saved) => ({
    id: "cut-one",
    timeline: structuredClone(saved.input.project.timeline),
    visualizer_timeline: structuredClone(saved.input.project.visualizer_timeline),
    project_patch: { lyric_style: "cyan" },
  });
  const canonicalProject = {
    song_id: "song-slug",
    audio_id: "registry-song",
    duration: 12,
    visualizer_timeline: plan().input.project.visualizer_timeline,
  };
  for (const [label, mutate, expectedReason] of [
    ["wrong Song Card head", (saved) => { saved.songId = "wrong-head"; }, "song-identity-mismatch"],
    ["wrong Show Graph song", (saved) => { saved.input.showGraph.song.id = "wrong-graph"; }, "song-identity-mismatch"],
    ["conflicting active variant", (saved) => { saved.input.project.active_direction_script_variant.id = "cut-two"; }, "variant-identity-mismatch"],
    ["conflicting project duration", (saved) => { saved.input.project.duration = 999; }, "duration-identity-mismatch"],
  ]) {
    const saved = plan();
    mutate(saved);
    const result = assessSongCardMintPlanCompatibility({
      plan: saved,
      canonicalProject,
      canonicalGraph: canonicalGraph(),
      sourceVariant: sourceVariantFor(saved),
    });
    assert.equal(result.status, "non-runnable", label);
    assert.ok(result.reasons.includes(expectedReason), label);
  }
});

test("rehydrated input keeps one canonical graph instead of embedding it again in the project", () => {
  const saved = plan();
  saved.input.project.direction_script_variants = [{ id: "large-library", payload: "x".repeat(200_000) }];
  saved.input.project.hyperframe_script = "y".repeat(200_000);
  const canonical = canonicalGraph();
  canonical.largeUniquePayload = "canonical-marker-".repeat(20_000);
  const sourceVariant = {
    id: "cut-one",
    timeline: structuredClone(saved.input.project.timeline),
    visualizer_timeline: structuredClone(saved.input.project.visualizer_timeline),
    project_patch: { lyric_style: "cyan" },
  };
  const result = assessSongCardMintPlanCompatibility({
    plan: saved,
    canonicalProject: {
      song_id: "song-slug",
      audio_id: "registry-song",
      duration: 12,
      visualizer_timeline: sourceVariant.visualizer_timeline,
    },
    canonicalGraph: canonical,
    sourceVariant,
  });
  const encoded = JSON.stringify(result.input);
  const graphBytes = JSON.stringify(canonical).length;
  assert.equal(result.status, "rehydrated");
  assert.equal(result.input.project.direction_script_variants, undefined);
  assert.equal(result.input.project.hyperframe_script, undefined);
  assert.ok(encoded.length < graphBytes + 50_000, `rehydrated input should contain one graph, got ${encoded.length} bytes for ${graphBytes}-byte graph`);
});

test("fails closed instead of silently replacing a changed saved edit", () => {
  const saved = plan();
  const sourceVariant = {
    id: "cut-one",
    timeline: [{ start_sec: 0, end_sec: 12, media_id: "different-media" }],
    visualizer_timeline: structuredClone(saved.input.project.visualizer_timeline),
    project_patch: { lyric_style: "cyan" },
  };
  const result = assessSongCardMintPlanCompatibility({
    plan: saved,
    canonicalProject: { song_id: "song-slug", audio_id: "registry-song", duration: 12 },
    canonicalGraph: canonicalGraph(),
    sourceVariant,
  });
  assert.equal(result.status, "non-runnable");
  assert.equal(result.runnable, false);
  assert.ok(result.reasons.includes("saved-editorial-payload-mismatch"));
  assert.equal(result.blocker.code, "mint-plan-canonical-graph-unavailable");
});

test("non-legacy saved graphs remain auditable instead of being blanket-skipped", () => {
  const saved = plan();
  saved.input.showGraph = canonicalGraph();
  const result = assessSongCardMintPlanCompatibility({ plan: saved });
  assert.equal(result.status, "current");
  assert.equal(result.runnable, true);
  assert.equal(result.receipt.action, "audited-current-graph");
});
