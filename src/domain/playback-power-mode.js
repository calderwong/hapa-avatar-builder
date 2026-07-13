export const PLAYBACK_POWER_MODES = Object.freeze(["active", "docked", "hidden"]);

export function normalizePlaybackPowerMode(value) {
  return PLAYBACK_POWER_MODES.includes(value) ? value : "active";
}

export function playbackPowerPolicy(value, options = {}) {
  const mode = normalizePlaybackPowerMode(value);
  const activeFps = Math.max(1, Number(options.activeFps || 24));
  if (mode === "hidden") return { mode, maxFps: 0, maxPlayingVideos: 0, animationEnabled: false, audioEnabled: false };
  if (mode === "docked") return { mode, maxFps: Math.min(12, activeFps), maxPlayingVideos: 1, animationEnabled: true, audioEnabled: false };
  return { mode, maxFps: activeFps, maxPlayingVideos: Infinity, animationEnabled: true, audioEnabled: true };
}
