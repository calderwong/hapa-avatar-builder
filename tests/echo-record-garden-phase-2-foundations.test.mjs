import assert from "node:assert/strict";
import test from "node:test";

import { ECHO_RECORD_GARDEN_ACCEPTANCE_BUDGETS } from "../src/domain/echo-record-garden-acceptance.js";

import {
  ECHO_RECORD_ENTITY_STATE_SCHEMA,
  ECHO_RECORD_FACE_CONTRACT_SCHEMA,
  ECHO_RECORD_PLACEMENT_BUDGETS_MS,
  ECHO_RECORD_RESIDENCY_PLAN_SCHEMA,
  ECHO_RECORD_VIDEO_COORDINATOR_SCHEMA,
  attachEchoRecordObjectPreservingWorldTransform,
  buildEchoRecordFaceContract,
  createEchoRecordEntityRegistry,
  createEchoRecordEntityState,
  createEchoRecordPlacementLatencyState,
  createEchoRecordVideoCoordinator,
  echoRecordEntityIdentity,
  markEchoRecordPlacementMilestone,
  planEchoRecordGardenRecordResidency,
  restoreEchoRecordEntityState,
  snapshotEchoRecordEntityState,
  summarizeEchoRecordPlacementLatencies,
  transitionEchoRecordEntity,
} from "../src/domain/echo-record-garden-runtime.js";

function record(songId, {
  title = `Song ${songId}`,
  revisionId = "revision-1",
  coverUri = `/covers/${songId}.jpg`,
} = {}) {
  const id = `echo-record:${songId}`;
  return {
    id,
    songId,
    title,
    identity: {
      stableId: id,
      sourceId: songId,
      identityBasis: "source-song-id",
    },
    source: { revisionId },
    cover: coverUri ? { uri: coverUri } : {},
  };
}

function videoFace(songId, options = {}) {
  return buildEchoRecordFaceContract({
    record: record(songId, options),
    media: {
      uri: `/media/${songId}.mp4`,
      posterUri: `/posters/${songId}.jpg`,
      kind: "video",
      revisionId: options.revisionId || "revision-1",
    },
    visible: options.visible ?? true,
    reducedMotion: options.reducedMotion ?? false,
    mediaFailed: options.mediaFailed ?? false,
  });
}

test("Record identity ignores mutable title and revision while rejecting conflicting stable IDs", () => {
  const first = record("garden-song", { title: "First title", revisionId: "revision-1" });
  const revised = record("garden-song", { title: "Revised title", revisionId: "revision-2" });

  assert.deepEqual(echoRecordEntityIdentity(first), echoRecordEntityIdentity(revised));
  assert.equal(echoRecordEntityIdentity(first).objectKey, "echo-record-object:echo-record:garden-song");
  assert.throws(
    () => echoRecordEntityIdentity({
      ...first,
      id: "echo-record:conflict",
    }),
    /conflicting stable IDs/,
  );
});

test("physical lifecycle preserves one identity and transform while removal stops playback once", () => {
  const worldTransform = {
    position: [1.25, 0.8, -0.5],
    rotation: [0.1, 0.2, 0.3],
    quaternion: [0, 0, 0, 1],
    scale: [1, 1, 1],
  };
  let entity = createEchoRecordEntityState(record("persistent"), {
    worldTransform,
    atMs: 1,
  });
  assert.equal(entity.schemaVersion, ECHO_RECORD_ENTITY_STATE_SCHEMA);

  for (const [event, expectedState] of [
    ["pickup", "hand"],
    ["place", "platter"],
    ["play", "playing"],
  ]) {
    const result = transitionEchoRecordEntity(entity, event, {
      eventId: `${event}-1`,
      atMs: entity.updatedAtMs + 1,
    });
    assert.equal(result.accepted, true);
    entity = result.entity;
    assert.equal(entity.state, expectedState);
    assert.equal(entity.recordId, "echo-record:persistent");
    assert.deepEqual(entity.worldTransform, worldTransform);
  }

  const removal = transitionEchoRecordEntity(entity, "remove", {
    eventId: "remove-1",
    atMs: 5,
  });
  assert.equal(removal.accepted, true);
  assert.equal(removal.entity.state, "lifted");
  assert.equal(removal.effects.stopPlayback, true);
  assert.equal(removal.effects.stopGeneration, 1);
  assert.deepEqual(removal.entity.worldTransform, worldTransform);

  const repeated = transitionEchoRecordEntity(removal.entity, "remove", {
    eventId: "remove-1",
    atMs: 6,
  });
  assert.equal(repeated.accepted, false);
  assert.equal(repeated.reason, "duplicate-event");
  assert.equal(repeated.effects.stopPlayback, false);
  assert.equal(repeated.entity.playback.stopGeneration, 1);
});

test("snapshot restoration retains identity and transform but never resumes stale playback", () => {
  const source = createEchoRecordEntityState(record("restore-me"), {
    state: "playing",
    parentId: "record-platter",
    worldTransform: { position: [2, 0.75, 1] },
    atMs: 10,
  });
  const snapshot = snapshotEchoRecordEntityState(source);
  const restored = restoreEchoRecordEntityState(record("restore-me"), snapshot, { atMs: 20 });

  assert.equal(restored.recordId, source.recordId);
  assert.equal(restored.state, "restored");
  assert.equal(restored.restoredFromState, "playing");
  assert.equal(restored.playback.playing, false);
  assert.equal(restored.playback.stopGeneration, 1);
  assert.equal(restored.recovery.resumePlayback, false);
  assert.deepEqual(restored.worldTransform, source.worldTransform);
  assert.throws(
    () => restoreEchoRecordEntityState(record("another-song"), snapshot),
    /different stable entity/,
  );
});

test("runtime registry rejects clone proxies and keeps its bound object through metadata refresh", () => {
  let now = 100;
  const registry = createEchoRecordEntityRegistry({ now: () => now++ });
  const object3d = { name: "persistent-record-object" };
  const first = registry.ensure(record("registry-song"), { object3d });
  const refreshed = registry.ensure(record("registry-song", {
    title: "Updated title",
    revisionId: "revision-2",
  }));

  assert.equal(first, refreshed);
  assert.equal(refreshed.object3d, object3d);
  assert.throws(
    () => registry.ensure(record("registry-song"), { object3d: { name: "clone" } }),
    /cannot bind a second Object3D/,
  );
  assert.equal(registry.diagnostics().entities, 1);
  assert.equal(registry.diagnostics().boundObjects, 1);
  assert.equal(registry.diagnostics().duplicateObjectRejections, 1);
});

test("157-song crate swaps virtualize Record objects under the renderer and media ceilings", () => {
  const catalogSongIds = Array.from({ length: 157 }, (_, index) => `song-${index + 1}`);
  const residentResources = new Map();
  let createdResources = 0;
  let disposedResources = 0;
  let residentSongIds = [];
  let maximumResidents = 0;

  for (let page = 0; page < Math.ceil(catalogSongIds.length / 10); page += 1) {
    const visibleSongIds = catalogSongIds.slice(page * 10, page * 10 + 10);
    const plan = planEchoRecordGardenRecordResidency({
      catalogSongIds,
      residentSongIds,
      visibleSongIds,
      placedSongId: "song-151",
      heldSongId: "song-152",
      manipulatedSongIds: ["song-153", "song-154"],
      visibleLimit: 10,
    });
    assert.equal(plan.schemaVersion, ECHO_RECORD_RESIDENCY_PLAN_SCHEMA);
    plan.evictSongIds.forEach((songId) => {
      if (residentResources.delete(songId)) disposedResources += 1;
    });
    plan.createSongIds.forEach((songId) => {
      residentResources.set(songId, { faceTextureOwners: 1 });
      createdResources += 1;
    });
    residentSongIds = plan.residentSongIds;
    maximumResidents = Math.max(maximumResidents, residentResources.size);
    assert.equal(residentResources.size, plan.residentCount);
    assert.ok(plan.visibleSongIds.length <= 10);
    assert.ok(plan.residentCount <= 14, "ten crate Records plus four physical exceptions is the supported worst case");
  }

  const declaredWorstCaseTextureOwners = {
    environmentSurfaceAndAtmosphere: 33,
    environmentResponse: 1,
    residentRecordFaces: maximumResidents,
    sharedRecordTitleAtlas: 1,
    catalogConsoleTitleAndButtonAtlas: 2,
    fivePrintedCardBaseAndOverlayPairs: 10,
    cinematicDirectorComposite: 1,
    mediaHandoffHeadroom: 2,
  };
  const rendererTextureCeiling = Object.values(declaredWorstCaseTextureOwners)
    .reduce((total, count) => total + count, 0);
  assert.equal(maximumResidents, 14);
  assert.equal(rendererTextureCeiling, 64);
  assert.ok(rendererTextureCeiling <= ECHO_RECORD_GARDEN_ACCEPTANCE_BUDGETS.maxRendererTextures);
  assert.equal(10 + 1 + 3, 14, "ten Record loops, one shared composite, and three optional/warm residents fill the pool exactly");

  residentResources.forEach(() => { disposedResources += 1; });
  residentResources.clear();
  assert.equal(residentResources.size, 0);
  assert.equal(disposedResources, createdResources, "teardown releases every page-created Record resource exactly once");
});

test("Object3D reparenting uses attach and verifies the world matrix is retained", () => {
  const previousParent = { name: "crate" };
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 2, 1, 1];
  const object3d = {
    parent: previousParent,
    matrixWorld: { elements: matrix },
    updateWorldMatrix() {},
  };
  let attachCount = 0;
  const nextParent = {
    name: "hand",
    attach(value) {
      attachCount += 1;
      value.parent = this;
    },
  };

  const result = attachEchoRecordObjectPreservingWorldTransform(object3d, nextParent);
  assert.equal(result.changed, true);
  assert.equal(result.worldTransformPreserved, true);
  assert.equal(object3d.parent, nextParent);
  assert.equal(attachCount, 1);

  const repeated = attachEchoRecordObjectPreservingWorldTransform(object3d, nextParent);
  assert.equal(repeated.changed, false);
  assert.equal(attachCount, 1);
});

test("living Record face keeps title composition separate across loop and fallback states", () => {
  const living = videoFace("living-face");
  assert.equal(living.schemaVersion, ECHO_RECORD_FACE_CONTRACT_SCHEMA);
  assert.equal(living.media.state, "looping");
  assert.equal(living.media.shouldAllocateVideo, true);
  assert.equal(living.media.shouldPlay, true);
  assert.equal(living.media.muted, true);
  assert.equal(living.media.loop, true);
  assert.equal(living.media.playsInline, true);
  assert.equal(living.media.blackFallbackAllowed, false);
  assert.equal(living.composition.separateSurfaces, true);
  assert.notEqual(living.composition.mediaSurfaceId, living.composition.titleSurfaceId);
  assert.equal(living.title.independentOfMediaTexture, true);

  const reduced = videoFace("living-face", { reducedMotion: true });
  assert.equal(reduced.recordId, living.recordId);
  assert.equal(reduced.media.state, "reduced-motion-poster");
  assert.equal(reduced.media.shouldPlay, false);
  assert.equal(reduced.title.text, living.title.text);

  const virtualized = videoFace("living-face", { visible: false });
  assert.equal(virtualized.media.state, "virtualized");
  assert.equal(virtualized.media.shouldAllocateVideo, false);

  const failed = buildEchoRecordFaceContract({
    record: record("failed-face", { coverUri: "" }),
    media: { uri: "/media/failed-face.mp4", kind: "video" },
    mediaFailed: true,
  });
  assert.equal(failed.media.state, "failed-labelled-fallback");
  assert.equal(failed.media.shouldAllocateVideo, false);
  assert.equal(failed.title.text, "Song failed-face");
});

test("visible-video coordinator enforces the seven-resource cap and promotes prewarm without recreation", () => {
  const faces = Array.from({ length: 8 }, (_, index) => videoFace(`bounded-${index + 1}`));
  const created = [];
  const disposed = [];
  const coordinator = createEchoRecordVideoCoordinator({
    maxVisible: 99,
    maxPrewarm: 99,
    maxResident: 99,
    createResource(contract, metadata) {
      const resource = { key: contract.media.identity, metadata };
      created.push(resource.key);
      return resource;
    },
    disposeResource(resource) {
      disposed.push(resource?.key || "missing-resource");
    },
    now: () => 250,
  });

  const first = coordinator.reconcile({
    visible: faces.slice(0, 6),
    prewarm: faces.slice(6),
  });
  assert.equal(first.schemaVersion, ECHO_RECORD_VIDEO_COORDINATOR_SCHEMA);
  assert.deepEqual(first.limits, { visible: 7, prewarm: 7, resident: 7 });
  assert.equal(first.visibleKeys.length, 6);
  assert.equal(first.prewarmKeys.length, 1);
  assert.equal(first.residentCount, 7);
  assert.equal(created.length, 7);

  const prewarmedKey = faces[6].media.identity;
  const prewarmedResource = coordinator.getResource(prewarmedKey);
  coordinator.mark(prewarmedKey, "ready");
  const second = coordinator.reconcile({
    visible: [faces[6], ...faces.slice(0, 5)],
    prewarm: [faces[5]],
  });
  assert.ok(second.promotedKeys.includes(prewarmedKey));
  assert.equal(coordinator.getResource(prewarmedKey), prewarmedResource);
  assert.equal(created.length, 7, "prewarm promotion must reuse the prepared resource");
  assert.equal(disposed.length, 0);

  const third = coordinator.reconcile({ visible: [faces[6]], prewarm: [faces[7]] });
  assert.equal(third.residentCount, 2);
  assert.equal(created.length, 8);
  assert.equal(disposed.length, 6);
  const final = coordinator.dispose();
  assert.equal(final.residentCount, 0);
  assert.equal(disposed.length, 8);
  assert.throws(() => coordinator.reconcile({ visible: faces }), /disposed/);
});

test("placement trace separates readiness milestones and reports warm/cold p95 budgets", () => {
  let warm = createEchoRecordPlacementLatencyState({
    recordId: "echo-record:warm",
    songId: "warm",
    warmed: true,
    intentAtMs: 100,
    retainedVisual: "poster",
  });
  for (const [milestone, atMs] of [
    ["seated", 110],
    ["fetch-start", 112],
    ["audio-unlock-start", 115],
    ["audio-unlocked", 125],
    ["fetch-complete", 140],
    ["metadata", 145],
    ["decoded", 180],
    ["audio-start", 450],
    ["first-frame", 500],
    ["director-graph-ready", 700],
  ]) {
    warm = markEchoRecordPlacementMilestone(warm, milestone, { atMs });
  }

  assert.equal(warm.status, "ready");
  assert.equal(warm.blackFrameAllowed, false);
  assert.equal(warm.metrics.seatingMs, 10);
  assert.equal(warm.metrics.seatingWithinInteractionFrame, true);
  assert.equal(warm.metrics.audioUnlockMs, 10);
  assert.equal(warm.metrics.fetchMs, 28);
  assert.equal(warm.metrics.decodeMs, 35);
  assert.equal(warm.metrics.audioStartMs, 350);
  assert.equal(warm.metrics.audioStartBudgetStatus, "within-budget");
  assert.equal(warm.metrics.budgetMs, ECHO_RECORD_PLACEMENT_BUDGETS_MS.warmAudioStart);
  assert.equal(
    markEchoRecordPlacementMilestone(warm, "audio-start", { atMs: 999 }),
    warm,
    "duplicate async callbacks must not rewrite the first measured milestone",
  );
  assert.throws(
    () => markEchoRecordPlacementMilestone(warm, "failed", { atMs: 99 }),
    /cannot precede the placement intent/,
  );

  let cold = createEchoRecordPlacementLatencyState({
    recordId: "echo-record:cold",
    warmed: false,
    intentAtMs: 0,
    retainedVisual: "retained-frame",
  });
  cold = markEchoRecordPlacementMilestone(cold, "seated", { atMs: 12 });
  cold = markEchoRecordPlacementMilestone(cold, "audio-start", { atMs: 1_400 });
  const summary = summarizeEchoRecordPlacementLatencies([warm, cold]);

  assert.deepEqual(summary.warm, {
    count: 1,
    p95Ms: 350,
    budgetMs: 500,
    pass: true,
  });
  assert.deepEqual(summary.cold, {
    count: 1,
    p95Ms: 1_400,
    budgetMs: 1_500,
    pass: true,
  });
});
