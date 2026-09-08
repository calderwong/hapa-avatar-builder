import { mapEchoSourceWindowTime } from "./echo-playback-sync.js";

// The compiler's media element attributes are also the HyperFrames extraction
// contract. Use that origin/rate for standalone captures, including the incoming
// crossfade handle. A loaded video alone does not establish a decoded song frame.
export function hyperFramesVideoFrameTime(video, timeSeconds, fps = 30, timeMapping = null) {
  const data = video.dataset;
  const rate = Number(data.playbackRate) || 1;
  const origin = Number(data.start) || 0;
  const sourceStart = Number(data.mediaStart) || 0;
  const sourceEnd = data.mediaEnd == null ? null : Number(data.mediaEnd);
  return mapEchoSourceWindowTime({
    elapsedSeconds: Math.max(0, Number(timeSeconds) - origin) * (timeMapping ? 1 : rate),
    durationSeconds: video.duration,
    sourceInSeconds: sourceStart,
    sourceOutSeconds: sourceEnd,
    loop: data.playbackMode === "loop",
    endGuardSeconds: 1 / Math.max(1, fps),
    cueDurationSeconds: Number(data.logicalDuration || data.duration),
    timeMapping,
  });
}

export async function prepareHyperFramesVideoFrame(video, timeSeconds, {
  fps = 30,
  timeoutMs = 10000,
  timeMapping = null,
} = {}) {
  if (!(video.readyState >= 2) || !(video.videoWidth > 0) || !Number.isFinite(video.duration)) {
    throw new Error(`Video must decode before seeking: ${video.id}`);
  }
  const target = hyperFramesVideoFrameTime(video, timeSeconds, fps, timeMapping);
  video.pause();
  let presentedMediaTime = null;
  // Waiting for seeked (rather than two animation frames) also works for cold
  // decoders, reverse seeks and renderers whose animation clock is virtualized.
  if (video.seeking || Math.abs(video.currentTime - target) > 1e-7) {
    await new Promise((resolve, reject) => {
      let frameHandle = null;
      let framePresented = typeof video.requestVideoFrameCallback !== "function";
      const cleanup = () => {
        clearTimeout(timer);
        if (frameHandle !== null) video.cancelVideoFrameCallback(frameHandle);
        video.removeEventListener("seeked", ready);
        video.removeEventListener("loadeddata", ready);
        video.removeEventListener("error", failed);
      };
      const ready = () => {
        if (!framePresented || video.seeking || video.readyState < 2 || Math.abs(video.currentTime - target) > 1e-7) return;
        cleanup(); resolve();
      };
      const failed = () => { cleanup(); reject(new Error(`Video frame decode failed: ${video.id}`)); };
      const timer = setTimeout(() => {
        cleanup(); reject(new Error(`Video frame seek timed out: ${video.id} at ${target}`));
      }, timeoutMs);
      video.addEventListener("seeked", ready);
      video.addEventListener("loadeddata", ready);
      video.addEventListener("error", failed);
      const presented = (_now, metadata) => {
        frameHandle = null;
        if (video.seeking || Math.abs(video.currentTime - target) > 1e-7) {
          frameHandle = video.requestVideoFrameCallback(presented);
          return;
        }
        presentedMediaTime = metadata.mediaTime;
        framePresented = true;
        ready();
      };
      if (!framePresented) frameHandle = video.requestVideoFrameCallback(presented);
      try { video.currentTime = target; } catch (error) { cleanup(); reject(error); }
    });
  }
  return {
    mediaElementId: video.id,
    songTimeSeconds: Number(timeSeconds),
    sourceTimeSeconds: target,
    observedTimeSeconds: video.currentTime,
    presentedMediaTimeSeconds: presentedMediaTime,
    width: video.videoWidth,
    height: video.videoHeight,
    route: "decoded-video",
  };
}
