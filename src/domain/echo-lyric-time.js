// The editor uses start/end; native director graphs use startSeconds/endSeconds.
// Keep this function self-contained: HyperFrames embeds the same implementation.
export function echoLyricBoundary(cue, boundary, fallback = 0) {
  const value = cue?.[boundary] ?? cue?.[`${boundary}Seconds`];
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
