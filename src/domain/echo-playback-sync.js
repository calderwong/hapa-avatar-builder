export function planEchoPlaybackCorrection({ expectedSeconds = 0, currentSeconds = 0, seeking = false, cueEntry = false } = {}) {
  const driftSeconds = Number(expectedSeconds) - Number(currentSeconds);
  if (seeking) return { action: "none", driftSeconds, playbackRate: 1 };
  if ((cueEntry && Math.abs(driftSeconds) > 0.08) || Math.abs(driftSeconds) > 0.75) {
    return { action: "seek", driftSeconds, targetSeconds: Math.max(0, Number(expectedSeconds)), playbackRate: 1 };
  }
  if (Math.abs(driftSeconds) > 0.04) {
    return { action: "rate", driftSeconds, playbackRate: Math.max(0.96, Math.min(1.04, 1 + driftSeconds * 0.08)) };
  }
  return { action: "none", driftSeconds, playbackRate: 1 };
}

export function mapEchoSourceTime({ elapsedSeconds = 0, durationSeconds = 0, loop = true, endGuardSeconds = 0.06 } = {}) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  const duration = Math.max(0, Number(durationSeconds) || 0);
  if (!duration) return elapsed;
  const guard = Math.min(Math.max(0.01, Number(endGuardSeconds) || 0.06), Math.max(0.01, duration / 4));
  const playableEnd = Math.max(0, duration - guard);
  if (!loop) return Math.min(playableEnd, elapsed);
  if (elapsed < playableEnd) return elapsed;
  return playableEnd > 0 ? elapsed % playableEnd : 0;
}
