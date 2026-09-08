// Shared by the live player pool and packaged HyperFrames DOM. Transition
// handles change visibility only; source motion remains on logical song time.
export function hyperFramesMediaPresentationWindow(instances = [], instanceIndex = 0, {
  crossfadeSeconds = 0.45,
  seamToleranceSeconds = 0.050001,
} = {}) {
  const media = Array.isArray(instances) ? instances : [];
  const index = Number(instanceIndex);
  const current = media[index];
  if (!current) return null;
  const start = Number(current.start) || 0;
  const end = Number(current.end) || start;
  const duration = Math.max(0, end - start);
  const kind = String(current.transition || "crossfade").toLowerCase();
  const previous = media.slice(0, index).reverse().find(candidate => candidate
    && candidate.source?.type !== "generated-visualizer"
    && String(candidate.trackId || "") === String(current.trackId || "")
    && Math.abs(Number(candidate.end) - start) <= seamToleranceSeconds);
  const previousDuration = previous ? Math.max(0, Number(previous.end) - Number(previous.start)) : 0;
  const incomingFade = previous && ["crossfade", "scanline-dissolve"].includes(kind)
    ? Math.max(0, Math.min(crossfadeSeconds, duration / 2, previousDuration / 2)) : 0;
  return {
    logicalStart: start, logicalEnd: end, logicalDuration: duration,
    presentationStart: start - incomingFade, presentationEnd: end,
    presentationDuration: duration + incomingFade, incomingFadeSeconds: incomingFade,
    previousCueId: previous?.id || previous?.cueId || null,
  };
}

export function hyperFramesMediaOpacityState(instances = [], instanceIndex = 0, timeSeconds = 0, options = {}) {
  const media = Array.isArray(instances) ? instances : [];
  const current = media[Number(instanceIndex)];
  const window = hyperFramesMediaPresentationWindow(media, instanceIndex, options);
  if (!current || !window) return { visible: false, alpha: 0, localSeconds: 0, phase: "missing" };
  const time = Number(timeSeconds) || 0;
  const localSeconds = Math.max(0, time - window.logicalStart);
  const fade = window.incomingFadeSeconds;
  if (fade > 0 && time >= window.presentationStart && time < window.logicalStart) {
    return { visible: true, alpha: Math.max(0, Math.min(1, (time - window.presentationStart) / fade)), localSeconds, phase: "incoming-crossfade" };
  }
  if (time >= window.logicalStart && time < window.logicalEnd) {
    const kind = String(current.transition || "crossfade").toLowerCase();
    const fadeWindow = Math.min(0.5, window.logicalDuration);
    if (kind === "fade-in" && localSeconds < fadeWindow)
      return { visible: true, alpha: localSeconds / fadeWindow, localSeconds, phase: "entering" };
    if (kind === "fade-out" && window.logicalEnd - time < fadeWindow)
      return { visible: true, alpha: (window.logicalEnd - time) / fadeWindow, localSeconds, phase: "exiting" };
    return { visible: true, alpha: 1, localSeconds, phase: "active" };
  }
  return { visible: false, alpha: 0, localSeconds, phase: "inactive" };
}

export function echoTimelineMediaInstances(timeline = []) {
  return timeline.map((shot, index) => ({
    id: shot.id || `${shot.media_id}:${shot.start_sec}`, trackId: shot.trackId || "echo-media",
    start: Number(shot.start_sec ?? shot.startSeconds) || 0,
    end: Number(shot.end_sec ?? shot.endSeconds) || 0,
    transition: shot.transition || "cut", source: { type: shot.media_contract?.type },
    shot, index,
  }));
}
