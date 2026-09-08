import { createEchoEmptyShaderMedia } from './echo-empty-shader-media.js';
import { prepareHyperFramesVideoFrame } from './hyperframes-media-frame-runtime.js';
import { createEchoProxyFrameDecoder } from './echo-proxy-frame-decoder.js';

// Detached, silent source frames for one ISF surface. Never borrows the operator's
// video/audio elements. At most one video decoder and one still are retained.
export function createEchoIsfHistoryMedia({ createElement = tag => document.createElement(tag), resolveUri = uri => uri, timeoutMs = 10000, waitForPresentation = false, directProxyFrames = true, directHardwareAcceleration = 'no-preference' } = {}) {
  let video = null, image = null, currentVideoUri = '', currentImageUri = '', sourceOriginSeconds = 0, disposed = false;
  const lifetime = new AbortController();
  const emptyMedia = createEchoEmptyShaderMedia({ createCanvas: () => createElement('canvas') });
  const direct = createEchoProxyFrameDecoder({ timeoutMs, hardwareAcceleration: directHardwareAcceleration });
  const unsupported = new Map();
  const load = (element, uri, signal, kind) => new Promise((resolve, reject) => {
    const event = kind === 'video' ? 'loadeddata' : 'load';
    const cleanup = () => { clearTimeout(timer); element.removeEventListener(event, ready); element.removeEventListener('error', failed); signal?.removeEventListener('abort', cancelled); lifetime.signal.removeEventListener('abort', cancelled); };
    const finish = error => { cleanup(); error ? reject(error) : resolve(); };
    const ready = () => finish();
    const failed = () => finish(new Error('Historical media decode failed'));
    const cancelled = () => finish(new Error('Historical media cancelled'));
    const timer = setTimeout(() => finish(new Error('Historical media decode timeout')), timeoutMs);
    element.addEventListener(event, ready, { once: true }); element.addEventListener('error', failed, { once: true });
    signal?.addEventListener('abort', cancelled, { once: true }); lifetime.signal.addEventListener('abort', cancelled, { once: true });
    if (signal?.aborted || disposed) return cancelled();
    element.src = uri;
    if (kind === 'video') element.load();
  });
  return {
    async at(cue, songTime, { fps = 30, signal, emptyInterval = false } = {}) {
      if (disposed || signal?.aborted) throw new Error('Historical media cancelled');
      if (cue == null && emptyInterval === true) return emptyMedia.at(false);
      const media = cue?.media;
      if (!media?.uri || !['video', 'image'].includes(media.kind)) return { element: null, receipt: null };
      const uri = resolveUri(media.uri);
      if (directProxyFrames && !waitForPresentation && media.kind === 'video' && /\/media\/echo-proxies-v2\/[a-f0-9]{64}\/preview\.mp4$/.test(uri) && !unsupported.has(uri)) {
        try {
          const frame = await direct.at(cue, songTime, { fps, signal, sourceUri: uri });
          if (video) { video.pause(); video.removeAttribute('src'); video.load(); video = null; currentVideoUri = ''; }
          return { ...frame, receipt: { ...frame.receipt, fidelity: media.fidelity || 'sampled-H264-preview; originals retained for export', originalUri: media.originalUri || null, originalSourceHash: media.originalSourceHash || null } };
        } catch (error) {
          direct.reset();
          if (disposed || signal?.aborted) throw error;
          unsupported.set(uri, String(error.message));
          while (unsupported.size > 32) unsupported.delete(unsupported.keys().next().value);
        }
      }
      direct.reset();
      if (media.kind === 'image') {
        image ||= createElement('img');
        if (currentImageUri !== uri || !image.complete || !image.naturalWidth) {
          await load(image, uri, signal, 'image'); currentImageUri = uri;
        }
        return { element: image, receipt: { route: 'decoded-image', uri, sourceHash: media.sourceHash } };
      }
      if (!video) { video = createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto'; }
      if (currentVideoUri !== uri || video.readyState < 2) {
        await load(video, uri, signal, 'video'); currentVideoUri = uri;
        // A positive media timestamp is preserved by preview preparation. The
        // browser exposes its initial decoded position after loadeddata.
        sourceOriginSeconds = Math.max(0, Number(video.currentTime) || 0);
      }
      Object.assign(video.dataset, { start: String(cue.startSeconds), mediaStart: String(media.sourceInSeconds || 0),
        logicalDuration: String(cue.durationSeconds), playbackRate: '1', playbackMode: media.playbackMode || 'once' });
      if (media.sourceOutSeconds != null) video.dataset.mediaEnd = String(media.sourceOutSeconds); else delete video.dataset.mediaEnd;
      const receipt = await prepareHyperFramesVideoFrame(video, songTime, { fps, timeoutMs, waitForPresentation, sourceOriginSeconds, timeMapping: media.timeMapping, signal: signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal });
      return { element: video, receipt: { ...receipt, uri, sourceHash: media.sourceHash, directDecoderFallback: unsupported.get(uri) || null, fidelity: media.fidelity || "original-source", originalUri: media.originalUri || null, originalSourceHash: media.originalSourceHash || null } };
    },
    dispose() { if (disposed) return; disposed = true; lifetime.abort(); direct.dispose(); unsupported.clear(); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } image?.removeAttribute('src'); video = null; image = null; },
  };
}
