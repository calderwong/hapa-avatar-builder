import test from "node:test";
import assert from "node:assert/strict";
import {
  beginEchoSongCardPlanWait,
  buildEchoDirectionForkRequest,
  createEchoDirectionWorkingFork,
  deriveEchoDirectionVariantProject,
  deriveEchoSavedDirectionPlanningProject,
  deriveEchoDirectionWorkingProject,
  echoDirectionVariantOptionLabel,
  echoDirectionVariantFingerprint,
  groupEchoDirectionVariants,
  pinEchoSongCardPlanSnapshot,
  restoreEchoSongCardPlanSnapshot,
  validateEchoDirectionVariantProjection,
} from "../src/domain/echo-direction-variants.js";

function project() {
  return {
    song_id: "song-one",
    song_title: "Song One",
    duration: 20,
    timeline: [{ start_sec: 0, end_sec: 20, media_id: "legacy-media", media_uri: "/media/legacy.mp4" }],
    visualizer_timeline: [{ start_sec: 0, end_sec: 20, visualizer_id: "legacy-viz", visualizer_title: "Legacy Viz" }],
    media_density_telemetry: { profile: "legacy" },
    director_show_graph: {
      song: { id: "song-one", durationSeconds: 20 },
      tracks: [{ id: "legacy-track", role: "media", cards: [{ id: "legacy-card", startSeconds: 0, endSeconds: 20, media: { id: "legacy-media" } }] }],
      directorV2: { variantId: "legacy", variantHash: "legacy-hash" },
    },
    direction_script_variants: [{ id: "large-nested-row" }],
  };
}

function variant(id, density, ordinal) {
  return {
    id,
    title: `Generic ${id}`,
    seed: `seed:${id}`,
    variationSet: { id: "wide-library", label: "Wide library cuts" },
    cut: { ordinal, label: `Cut ${ordinal}` },
    densityProfile: { id: density.toLowerCase(), label: density },
    coveragePass: ordinal,
    timeline: [{ start_sec: 0, end_sec: 20, media_id: `${id}-media`, media_uri: `/media/${id}.mp4`, media_card_id: `${id}-card` }],
    visualizer_timeline: [{ start_sec: 0, end_sec: 20, visualizer_id: `${id}-viz`, visualizer_title: `${id} Viz` }],
    media_density_telemetry: { profile: density.toLowerCase() },
    telemetry: { uniqueMedia: 17 + ordinal, replacementShots: 17 + ordinal },
    hyperframe_script: `<div data-cut="${id}"></div>`,
  };
}

test("metadata groups generated cuts and gives density, pass, and breadth useful labels", () => {
  const airy = variant("airy-b", "Airy", 2);
  const dense = variant("dense-a", "Dense", 1);
  const legacy = { id: "older", title: "Older balanced recast" };
  const groups = groupEchoDirectionVariants([legacy, dense, airy]);
  assert.deepEqual(groups.map((group) => group.label), ["Wide library cuts", "Earlier append-only cuts"]);
  assert.deepEqual(groups[0].variants.map((row) => row.id), ["airy-b", "dense-a"]);
  assert.equal(echoDirectionVariantOptionLabel(airy), "Airy · Cut 2 · Library pass 2 · 19 unique");
  assert.equal(echoDirectionVariantOptionLabel(legacy), "Older balanced recast");
});

test("selected cut derives its own timelines, density, and graph instead of the stale Legacy graph", () => {
  const base = project();
  const cut = variant("airy-a", "Airy", 1);
  const derived = deriveEchoDirectionVariantProject(base, cut);
  assert.equal(derived.timeline[0].media_id, "airy-a-media");
  assert.equal(derived.visualizer_timeline[0].visualizer_id, "airy-a-viz");
  assert.equal(derived.media_density_telemetry.profile, "airy");
  assert.equal(derived.director_show_graph.directorV2.variantId, "airy-a");
  assert.notEqual(derived.director_show_graph.directorV2.variantHash, "legacy-hash");
  assert.ok(derived.director_show_graph.tracks.some((track) => track.cards.some((card) => card.media?.id === "airy-a-media")));
  assert.equal(base.timeline[0].media_id, "legacy-media");
  assert.equal(base.director_show_graph.directorV2.variantId, "legacy");
});

test("a certified selected cut reuses the delivered top-level graph without a duplicate graph inside the variant", () => {
  const base = project();
  const cut = variant("certified-cut", "Dense", 2);
  const fingerprint = echoDirectionVariantFingerprint(cut);
  cut.execution_preview = { status: "ready", cutId: cut.id, graphSha256: "sha256:certified", certified: true };
  base.selected_direction_script_variant_id = cut.id;
  base.director_show_graph_receipt = {
    status: "ready",
    source: "validated-derived-execution-graph",
    cutId: cut.id,
    cutFingerprint: fingerprint,
  };
  base.director_show_graph.tracks[0].cards[0].media.id = "certified-execution-media";

  const derived = deriveEchoDirectionVariantProject(base, cut);
  assert.equal(derived.director_show_graph.tracks[0].cards[0].media.id, "certified-execution-media");
  assert.equal(derived.director_show_graph.directorV2.variantHash, fingerprint);
  assert.equal(cut.director_show_graph, undefined);
});

test("saved cuts cannot inject a wrong-song graph or detach their derived fingerprint", () => {
  const base = project();
  const cut = variant("wrong-song-cut", "Dense", 1);
  cut.director_show_graph = {
    ...structuredClone(base.director_show_graph),
    song: { id: "song-two", durationSeconds: 20 },
  };
  assert.throws(
    () => deriveEchoDirectionVariantProject(base, cut),
    (error) => error.code === "echo_direction_variant_projection_invalid"
      && error.validation.reasons.includes("variant-graph-song-mismatch"),
  );

  const valid = deriveEchoDirectionVariantProject(base, variant("valid-cut", "Airy", 2));
  const tampered = structuredClone(valid.director_show_graph);
  tampered.directorV2.variantHash = "fnv:tampered";
  const validation = validateEchoDirectionVariantProjection({ baseProject: base, variant: variant("valid-cut", "Airy", 2), graph: tampered });
  assert.equal(validation.ok, false);
  assert.ok(validation.reasons.includes("variant-graph-fingerprint-mismatch"));
});

test("variant identity is computed from full production content instead of trusting a repeated declared claim", () => {
  const base = project();
  const first = variant("content-cut", "Dense", 1);
  const second = structuredClone(first);
  first.fingerprint = "fnv:declared-stale";
  second.fingerprint = "fnv:declared-stale";
  first.director_show_graph = {
    ...structuredClone(base.director_show_graph),
    tracks: [{ id: "media", role: "media", cards: [{ id: "a", startSeconds: 0, endSeconds: 20, media: { id: "media-A" } }] }],
  };
  second.director_show_graph = {
    ...structuredClone(base.director_show_graph),
    tracks: [{ id: "media", role: "media", cards: [{ id: "b", startSeconds: 0, endSeconds: 20, media: { id: "media-B" } }] }],
  };
  const firstHash = echoDirectionVariantFingerprint(first);
  const secondHash = echoDirectionVariantFingerprint(second);
  assert.notEqual(firstHash, secondHash);
  assert.equal(deriveEchoDirectionVariantProject(base, first).director_show_graph.directorV2.variantHash, firstHash);
  assert.equal(deriveEchoDirectionVariantProject(base, second).director_show_graph.directorV2.variantHash, secondHash);

  const currentClaim = variant("current-claim", "Airy", 2);
  currentClaim.fingerprint = echoDirectionVariantFingerprint(currentClaim);
  const delivered = structuredClone(currentClaim);
  delivered.runtime_shader_repair_receipt = { status: "not-required", checkedAt: "runtime" };
  delivered.execution_preview = { status: "ready", graphSha256: "sha256:delivery-only" };
  assert.equal(deriveEchoDirectionVariantProject(base, delivered).active_direction_script_variant.projectionValidation.declaredFingerprintStatus, "verified");
  assert.equal(deriveEchoDirectionVariantProject(base, currentClaim).active_direction_script_variant.projectionValidation.declaredFingerprintStatus, "verified");
  currentClaim.fingerprint = `content-v2:${"0".repeat(64)}`;
  assert.throws(
    () => deriveEchoDirectionVariantProject(base, currentClaim),
    (error) => error?.validation?.reasons?.includes("variant-declared-fingerprint-mismatch"),
  );
});

test("runtime-only graph repair preserves the saved editorial fingerprint out of band", () => {
  const base = project();
  const source = variant("runtime-repair-cut", "Dense", 1);
  source.fingerprint = echoDirectionVariantFingerprint(source);
  const repaired = structuredClone(source);
  repaired.director_show_graph = structuredClone(deriveEchoDirectionVariantProject(base, source).director_show_graph);
  repaired.runtime_shader_repair_receipt = {
    schemaVersion: "hapa.echo.runtime-shader-repair-receipt.v1",
    status: "not-required",
    sourceVariantMutated: false,
    scopes: [{ scope: "variant:runtime-repair-cut:derived-director-show-graph" }],
  };

  assert.throws(
    () => deriveEchoDirectionVariantProject(base, repaired),
    (error) => error?.validation?.reasons?.includes("variant-declared-fingerprint-mismatch"),
    "an in-band repair receipt cannot make an injected graph authoritative",
  );
  const projected = deriveEchoDirectionVariantProject(base, repaired, { identityVariant: source });
  assert.equal(projected.director_show_graph.directorV2.variantHash, source.fingerprint);
  assert.equal(projected.active_direction_script_variant.projectionValidation.declaredFingerprintStatus, "verified");
  assert.throws(
    () => deriveEchoDirectionVariantProject(base, repaired, { identityVariant: variant("different-cut", "Dense", 1) }),
    (error) => error?.validation?.reasons?.includes("variant-identity-id-mismatch"),
  );
});

test("generated density cuts do not inherit stale Legacy density telemetry or duplicate their label", () => {
  const cut = variant("wide-coverage-airy-v1", "Airy", 1);
  cut.cut.label = "Airy";
  delete cut.media_density_telemetry;
  cut.telemetry = { uniqueMedia: 23, mediaBearingShots: 23, actualVideoRatio: 0.451 };
  const derived = deriveEchoDirectionVariantProject(project(), cut);
  assert.equal(echoDirectionVariantOptionLabel(cut), "Airy · Library pass 1 · 23 unique");
  assert.equal(derived.media_density_telemetry.profile, undefined);
  assert.equal(derived.media_density_telemetry.actualVideoRatio, 0.451);
  assert.equal(derived.media_density_telemetry.densityProfile.id, "airy");
});

test("working continuation stays separate and serializes only an append-only child request", () => {
  const cut = variant("airy-a", "Airy", 1);
  const selected = deriveEchoDirectionVariantProject(project(), cut);
  const working = createEchoDirectionWorkingFork(selected, cut);
  assert.match(working.requestedChildId, /^airy-a-edit-[a-f0-9]{16}$/);
  assert.equal(working.project.direction_script_variants, undefined);
  working.project.timeline[0].media_id = "human-choice";
  working.project.timeline[0].media_uri = "/media/human-choice.mp4";
  working.project.lyric_style = "cinematic";
  working.project.output_profile = "vertical";
  const workingProject = deriveEchoDirectionWorkingProject(working);
  assert.equal(workingProject.director_show_graph.directorV2.parentVariantId, "airy-a");
  assert.ok(workingProject.director_show_graph.tracks.some((track) => track.cards.some((card) => card.media?.id === "human-choice")));
  const request = buildEchoDirectionForkRequest(working, workingProject);
  assert.equal(request.songId, "song-one");
  assert.equal(request.parentVariantId, "airy-a");
  assert.equal(request.requestedId, working.requestedChildId);
  assert.equal(buildEchoDirectionForkRequest(working, workingProject).requestedId, request.requestedId);
  assert.equal(request.timeline[0].media_id, "human-choice");
  assert.equal(request.projectPatch.lyric_style, "cinematic");
  assert.equal(request.projectPatch.output_profile.id, "vertical");
  assert.equal(request.projectPatch.output_profile.width, 1080);
  assert.equal(request.projectPatch.output_profile.height, 1920);
  assert.equal(request.direction_script_variants, undefined);
  assert.equal(request.director_show_graph, undefined);
  assert.equal(selected.timeline[0].media_id, "airy-a-media");
});

test("Song Card planning pins a preparing saved child instead of the reopened working alias", () => {
  const base = project();
  const savedCut = variant("saved-child", "Dense", 1);
  const selected = deriveEchoDirectionVariantProject(base, savedCut);
  const reopenedWorking = deriveEchoDirectionWorkingProject(createEchoDirectionWorkingFork(selected, savedCut));
  assert.equal(reopenedWorking.director_show_graph.directorV2.variantId, "working:saved-child");

  const preparingCut = structuredClone(savedCut);
  preparingCut.execution_preview = { status: "preparing", reason: "certification-running" };
  const pinned = deriveEchoSavedDirectionPlanningProject(base, preparingCut, {
    fallbackProject: reopenedWorking,
  });

  assert.equal(pinned.director_show_graph.directorV2.variantId, "saved-child");
  assert.notEqual(pinned.director_show_graph.directorV2.variantId, reopenedWorking.director_show_graph.directorV2.variantId);
  assert.equal(pinned.active_direction_script_variant.id, "saved-child");
  assert.equal(pinned.editor_graph_fallback.pinnedSavedCut, true);
  assert.equal(pinned.editor_graph_fallback.source, "saved-child-local-projection");
  assert.deepEqual(pinned.timeline, savedCut.timeline);
  assert.deepEqual(pinned.visualizer_timeline, savedCut.visualizer_timeline);
});

test("Song Card planning cannot reuse an older cut while a later save is waiting for its exact graph", () => {
  const songId = "song-one";
  const cutAProject = project();
  let state = pinEchoSongCardPlanSnapshot({}, songId, "cut-a", {
    cutId: "cut-a",
    project: cutAProject,
    showGraph: cutAProject.director_show_graph,
  });
  assert.equal(state[songId].status, "ready");
  assert.equal(state[songId].cutId, "cut-a");

  state = beginEchoSongCardPlanWait(state, songId, "unsaved:cut-a", "cut-a", { reusePrevious: true });
  state = beginEchoSongCardPlanWait(state, songId, "cut-b", "cut-b");
  assert.equal(state[songId].status, "waiting");
  assert.equal(state[songId].cutId, "cut-b");
  assert.equal(state[songId].project, undefined);
  assert.equal(state[songId].previous.status, "waiting");
  assert.equal(state[songId].previous.revision, "unsaved:cut-a");

  const restored = restoreEchoSongCardPlanSnapshot(state, songId);
  assert.equal(restored[songId].status, "waiting");
  assert.equal(restored[songId].cutId, "cut-a");
  const restoredReady = restoreEchoSongCardPlanSnapshot(restored, songId, { toReady: true });
  assert.equal(restoredReady[songId].status, "ready");
  assert.equal(restoredReady[songId].cutId, "cut-a");

  const cutBProject = { ...project(), song_title: "Song One · Cut B" };
  state = pinEchoSongCardPlanSnapshot(state, songId, "cut-b", {
    cutId: "cut-b",
    project: cutBProject,
    showGraph: cutBProject.director_show_graph,
  });
  assert.equal(state[songId].status, "ready");
  assert.equal(state[songId].cutId, "cut-b");
  assert.equal(state[songId].project.song_title, "Song One · Cut B");

  state = beginEchoSongCardPlanWait(state, songId, "cut-c", "cut-c");
  assert.equal(state[songId].previous.cutId, "cut-b");
  assert.equal(state[songId].project, undefined);
});

test("explicit saved-cut graphs are reframed to the selected Vertical project patch", () => {
  const base = project();
  base.output_profile = "landscape";
  base.director_show_graph.outputProfile = {
    id: "landscape",
    width: 1920,
    height: 1080,
  };
  base.director_show_graph.directorV2.outputProfile = base.director_show_graph.outputProfile;
  const cut = variant("vertical-explicit", "Dense", 1);
  cut.project_patch = { output_profile: "vertical" };
  cut.director_show_graph = structuredClone(base.director_show_graph);

  const selected = deriveEchoDirectionVariantProject(base, cut);
  assert.equal(selected.output_profile.id, "vertical");
  assert.equal(selected.director_show_graph.outputProfile.id, "vertical");
  assert.equal(selected.director_show_graph.outputProfile.width, 1080);
  assert.equal(selected.director_show_graph.outputProfile.height, 1920);
  assert.equal(selected.director_show_graph.directorV2.outputProfile.id, "vertical");
});

test("editable newer cuts retain high-quality media cards while switching to Vertical", () => {
  const cut = variant("wide-coverage-dense-v1", "Dense", 1);
  Object.assign(cut.timeline[0], {
    media_title: "The Murmuration",
    media_card_id: "ship-card-b37d",
    media_card_kind: "hapa.ship-card.v1",
    media_card_ref: "/cards/ship-card-b37d.json",
    media_card_title: "The Murmuration",
  });
  const immutableSource = structuredClone(cut);
  const selected = deriveEchoDirectionVariantProject(project(), cut);
  const working = createEchoDirectionWorkingFork(selected, cut);
  working.project.output_profile = "vertical";

  const editable = deriveEchoDirectionWorkingProject(working);
  const mediaCard = editable.director_show_graph.tracks
    .find((track) => track.role === "media")
    .cards[0];
  assert.equal(mediaCard.media.id, "wide-coverage-dense-v1-media");
  assert.equal(mediaCard.media.cardId, "ship-card-b37d");
  assert.equal(mediaCard.media.cardKind, "hapa.ship-card.v1");
  assert.equal(mediaCard.media.cardRef, "/cards/ship-card-b37d.json");
  assert.equal(mediaCard.media.cardTitle, "The Murmuration");
  assert.equal(editable.director_show_graph.directorV2.outputProfile.id, "vertical");
  assert.equal(editable.director_show_graph.directorV2.outputProfile.width, 1080);
  assert.equal(editable.director_show_graph.directorV2.outputProfile.height, 1920);

  const request = buildEchoDirectionForkRequest(working, editable);
  assert.equal(request.parentVariantId, "wide-coverage-dense-v1");
  assert.equal(request.timeline[0].media_card_id, "ship-card-b37d");
  assert.equal(request.timeline[0].media_card_kind, "hapa.ship-card.v1");
  assert.equal(request.timeline[0].media_card_ref, "/cards/ship-card-b37d.json");
  assert.equal(request.projectPatch.output_profile.id, "vertical");
  assert.equal(request.projectPatch.output_profile.width, 1080);
  assert.equal(request.projectPatch.output_profile.height, 1920);
  assert.deepEqual(cut, immutableSource);
});

test("variant and working cuts retain canonical stem paths and portable shader cards", () => {
  const base = project();
  base.director_show_graph.stems = { items: [{ id: "stem:synth", stemType: "Synth", audioPath: "/stems/synth.wav" }] };
  base.director_show_graph.directorV2.stemBuses = [{ id: "bus:synth", stemType: "Synth", audioPath: "/stems/synth.wav", truthStatus: "verified_registry_path" }];
  base.director_show_graph.tracks.push({
    id: "track-b",
    role: "visualizer",
    cards: [{
      id: "card:b:0",
      startSeconds: 0,
      endSeconds: 20,
      media: { id: "airy-a-viz", title: "airy-a Viz" },
      visualization: {
        sourceId: "airy-a-viz",
        card: { schemaVersion: "hapa.visualizer-card.v2", id: "airy-a-viz", inputs: [{ NAME: "gain" }], audioMap: { gain: { signal: "rms", depth: 0.3 } }, source: { uri: "/api/echos/isf/airy-a-viz", hash: `sha256:${"a".repeat(64)}` }, stemFocus: "synth" },
      },
      parameters: { visualizerMappings: { gain: "synth:rms" } },
    }],
  });
  const cut = variant("airy-a", "Airy", 1);
  const selected = deriveEchoDirectionVariantProject(base, cut);
  const visualizer = selected.director_show_graph.tracks.find((track) => track.id === "track-b").cards[0];
  assert.equal(selected.director_show_graph.stems.items[0].audioPath, "/stems/synth.wav");
  assert.equal(selected.director_show_graph.directorV2.stemBuses[0].truthStatus, "verified_registry_path");
  assert.equal(visualizer.visualization.card.source.hash, `sha256:${"a".repeat(64)}`);
  assert.equal(visualizer.visualization.card.stemFocus, "synth");

  const working = createEchoDirectionWorkingFork(selected, cut);
  working.project.timeline[0].media_id = "working-media";
  const continued = deriveEchoDirectionWorkingProject(working);
  const continuedVisualizer = continued.director_show_graph.tracks.find((track) => track.id === "track-b").cards[0];
  assert.equal(continued.director_show_graph.stems.items[0].audioPath, "/stems/synth.wav");
  assert.equal(continuedVisualizer.visualization.card.source.hash, `sha256:${"a".repeat(64)}`);
});
