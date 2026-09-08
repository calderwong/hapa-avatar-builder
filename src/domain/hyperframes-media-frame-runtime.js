import { mapEchoSourceWindowTime } from "./echo-playback-sync.js";

// HyperFrames 0.7 captures extracted frames as decoded sibling images. The
// original video may be paused on another frame even while the image is visible.
export function hyperFramesCapturedMediaElement(element) {
  if (element?.tagName !== "VIDEO") return element;
  const image = element.nextElementSibling;
  return image?.id === `__render_frame_${element.id}__`
    && image.classList.contains("__render_frame__")
    && image.complete && image.naturalWidth > 0
    && image.style.visibility !== "hidden"
    ? image : element;
}

// Preserve the upstream hook and re-install after runtime initialization/rebind.
// The hook runs after extracted images decode, before the capture screenshot.
export function createHyperFramesMediaRedrawBridge(root, redraw) {
  let installed = null;
  let running = false;
  return {
    install() {
      const previous = root.__hfReseekGpu;
      if (previous === installed) return true;
      if (typeof previous !== "function") return false;
      installed = function (time) {
        const result = previous.apply(this, arguments);
        if (!running) {
          running = true;
          try { redraw(time); } finally { running = false; }
        }
        return result;
      };
      root.__hfReseekGpu = installed;
      return true;
    },
  };
}

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
  // Chromium exposes microsecond media time. Round into the requested frame,
  // rather than just before its boundary (1/30 can otherwise become .033333).
  const seekTime = Math.ceil(target * 1e6 - 1e-6) / 1e6;
  const atTarget = () => Math.abs(video.currentTime - seekTime) <= 1e-6;
  video.pause();
  let presentedMediaTime = null;
  let decodedFrameReused = false;
  // Waiting for seeked (rather than two animation frames) also works for cold
  // decoders, reverse seeks and renderers whose animation clock is virtualized.
  if (video.seeking || !atTarget()) {
    await new Promise((resolve, reject) => {
      let frameHandle = null;
      let paintHandle = null;
      let fallbackScheduled = false;
      let framePresented = typeof video.requestVideoFrameCallback !== "function";
      const cleanup = () => {
        clearTimeout(timer);
        if (frameHandle !== null) video.cancelVideoFrameCallback(frameHandle);
        if (paintHandle !== null) globalThis.cancelAnimationFrame?.(paintHandle);
        video.removeEventListener("seeked", ready);
        video.removeEventListener("loadeddata", ready);
        video.removeEventListener("error", failed);
      };
      const ready = () => {
        if (video.seeking || video.readyState < 2 || !atTarget()) return;
        // Two output times can select the same source frame (e.g. 30fps output,
        // 24fps footage). Chromium then emits seeked but no new presentation
        // callback. After the settled seek and two native paint opportunities,
        // accept the decoded frame without inventing a presented mediaTime.
        if (!framePresented) {
          if (!fallbackScheduled && typeof globalThis.requestAnimationFrame === 'function') {
            fallbackScheduled = true;
            paintHandle = globalThis.requestAnimationFrame(() => {
              paintHandle = globalThis.requestAnimationFrame(() => {
                paintHandle = null; decodedFrameReused = true; framePresented = true; ready();
              });
            });
          }
          return;
        }
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
        if (!atTarget()) {
          frameHandle = video.requestVideoFrameCallback(presented);
          return;
        }
        // Chromium may present the requested frame before dispatching seeked.
        // Retain that observation; ready still waits for the seek to settle.
        // A paused video need not present another frame after seeked.
        presentedMediaTime = metadata.mediaTime;
        framePresented = true;
        ready();
      };
      if (!framePresented) frameHandle = video.requestVideoFrameCallback(presented);
      try { video.currentTime = seekTime; } catch (error) { cleanup(); reject(error); }
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
    presentationEvidence: decodedFrameReused ? 'settled-seek-without-new-presentation' : presentedMediaTime == null ? 'already-decoded' : 'video-frame-callback',
  };
}
