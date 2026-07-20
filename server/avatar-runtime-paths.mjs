import os from "node:os";
import path from "node:path";

export const LEGACY_GENERATED_MEDIA_ROUTE_PREFIX = "/generated/media-queue";

export function resolveAvatarBuilderStateRoot(env = process.env) {
  return path.resolve(
    env.HAPA_AVATAR_STATE_ROOT
      || path.join(os.homedir(), "Library", "Application Support", "Hapa Avatar Builder"),
  );
}

export function resolveAvatarGeneratedMediaRoot(env = process.env) {
  return path.resolve(
    env.HAPA_AVATAR_GENERATED_MEDIA_ROOT
      || path.join(resolveAvatarBuilderStateRoot(env), "generated-media"),
  );
}

export function resolveEchoSceneKeyframeGeneratedRoot(env = process.env) {
  return path.resolve(
    env.HAPA_ECHO_KEYFRAME_GENERATED_ROOT
      || path.join(resolveAvatarGeneratedMediaRoot(env), "echo-scene-keyframes"),
  );
}
