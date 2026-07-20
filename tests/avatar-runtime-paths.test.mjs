import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  LEGACY_GENERATED_MEDIA_ROUTE_PREFIX,
  resolveAvatarBuilderStateRoot,
  resolveAvatarGeneratedMediaRoot,
  resolveEchoSceneKeyframeGeneratedRoot,
} from "../server/avatar-runtime-paths.mjs";

test("generated media defaults outside the repository and supports explicit custody roots", () => {
  const env = { HAPA_AVATAR_STATE_ROOT: "/tmp/hapa-avatar-state" };
  assert.equal(resolveAvatarBuilderStateRoot(env), path.resolve("/tmp/hapa-avatar-state"));
  assert.equal(resolveAvatarGeneratedMediaRoot(env), path.resolve("/tmp/hapa-avatar-state/generated-media"));
  assert.equal(resolveEchoSceneKeyframeGeneratedRoot(env), path.resolve("/tmp/hapa-avatar-state/generated-media/echo-scene-keyframes"));
  assert.equal(LEGACY_GENERATED_MEDIA_ROUTE_PREFIX, "/generated/media-queue");
});

test("specific generated-media overrides remain authoritative", () => {
  assert.equal(
    resolveEchoSceneKeyframeGeneratedRoot({ HAPA_ECHO_KEYFRAME_GENERATED_ROOT: "/tmp/exact-keyframes" }),
    path.resolve("/tmp/exact-keyframes"),
  );
});
