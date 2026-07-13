import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBuilderExpandedDirectorCandidates,
  hasHapaDevProtoOrigin,
} from "../src/domain/builder-direction-candidates.js";

function video(id, uri, overrides = {}) {
  return {
    id,
    name: id,
    uri,
    type: "video",
    tags: ["video", "motion"],
    metadata: {
      width: 1280,
      height: 720,
      duration: 8,
      thumbnailUri: `/media/${id}.jpg`,
      ...overrides.metadata,
    },
    ...overrides,
  };
}

test("hapa-dev-proto filtering follows explicit lineage roots, not titles or OCR", () => {
  assert.equal(hasHapaDevProtoOrigin({ title: "Hapa Dev Proto retrospective", tags: ["hapa-dev-proto"] }), false);
  assert.equal(hasHapaDevProtoOrigin({ sourceSystem: "hapa-dev-proto" }), true);
  assert.equal(hasHapaDevProtoOrigin({
    folderIngest: { sourcePath: "/Users/calderwong/comics/reviclips/card-opaque.mp4" },
  }), true);
  assert.equal(hasHapaDevProtoOrigin({
    storage: { targetPath: "/Users/calderwong/comics/hapa-trains/card-loop.mp4" },
  }), true);
  assert.equal(hasHapaDevProtoOrigin({
    folderIngest: { sourcePath: "/Users/calderwong/comics/dear-papa-album/scene.mp4" },
  }), false);
});

test("expanded candidate extraction keeps distinct Scroll, Scene Item Card, and Avatar Card pools", () => {
  const digestA = "a".repeat(64);
  const digestB = "b".repeat(64);
  const digestC = "c".repeat(64);
  const scrollAsset = video("scroll-asset", "/media/scroll.mp4", {
    metadata: {
      width: 1280,
      height: 720,
      duration: 8,
      thumbnailUri: "/media/scroll.jpg",
      scrollSite: {
        sha256: digestA,
        cohort: "root",
        analyzer: { role: "transition" },
        authored: { eligible: true, use: "connector", routeOrder: 0 },
      },
    },
  });
  const sceneAsset = video("scene-asset", "/media/scene.mp4", {
    metadata: {
      width: 768,
      height: 1168,
      duration: 6,
      thumbnailUri: "/media/scene.jpg",
      cardId: "item-scene-card",
      echosTechnicalAffordance: {
        status: "verified-source-file",
        contentHash: { algorithm: "sha256", value: digestB },
        pixelFormat: "yuv420p",
      },
    },
  });
  const avatarAsset = video("avatar-asset", "/media/avatar.mp4", {
    metadata: {
      width: 848,
      height: 1072,
      duration: 10,
      thumbnailUri: "/media/avatar.jpg",
      folderIngest: { contentFingerprint: digestC, sourcePath: "/Users/calderwong/comics/dear-papa-album/avatar.mp4" },
    },
  });
  const forbiddenAvatar = video("forbidden", "/media/forbidden.mp4", {
    metadata: {
      width: 848,
      height: 1072,
      duration: 10,
      thumbnailUri: "/media/forbidden.jpg",
      folderIngest: { contentFingerprint: "d".repeat(64), sourcePath: "/Users/calderwong/comics/reviclips/card.mp4" },
    },
  });
  const result = buildBuilderExpandedDirectorCandidates({
    mediaLibrary: {
      records: [{
        id: `hapa-media:sha256:${digestA}`,
        name: "Scroll",
        mediaType: "video",
        tags: ["director-eligible", "scroll-cohort-root"],
        relationships: [{ ownerType: "card", ownerId: `scroll-video-${digestA}` }],
        asset: scrollAsset,
      }],
    },
    sceneStore: { scenes: [{ id: "scene-1", title: "Scene One", tags: [], assets: [sceneAsset] }] },
    avatarStore: { avatars: [{ id: "avatar-1", primaryName: "Avatar One", assets: [avatarAsset, forbiddenAvatar] }] },
  }, {
    availableMediaFiles: new Set(["scroll.mp4", "scene.mp4", "avatar.mp4", "forbidden.mp4"]),
    itemCardById: new Map([["item-scene-card", { id: "item-scene-card", title: "Printable Scene Card" }]]),
    sceneOptions: {
      requireSceneItemCard: true,
      requireVerifiedTechnical: true,
      requireBrowserSafePixelFormat: true,
    },
  });

  assert.deepEqual(result.telemetry, {
    total: 3,
    scroll: 1,
    scene: 1,
    avatar: 1,
    uniqueTechnicalIdentities: 3,
    minShortEdge: 720,
    minDurationSeconds: 2.5,
    excludedOrigin: "hapa-dev-proto-explicit-provenance-only",
  });
  assert.equal(result.groups.scene[0].cardId, "item-scene-card");
  assert.equal(result.groups.scene[0].cardKind, "item");
  assert.equal(result.groups.avatar[0].cardId, "avatar-1");
  assert.equal(result.groups.avatar[0].sha256, digestC);
  assert.equal(result.candidates.some((candidate) => candidate.id.includes("forbidden")), false);
});
