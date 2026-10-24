// Director-cut media under Score Dust exports (P2 item 6).
//
// For each export frame the shot active at that song time is drawn first:
// images cover-fit, videos seeked to their exact source time (source-in
// offset + time into the shot, looping clips shorter than the shot). Hard cuts
// only; the preview's visual time-remap automation and transition blends are
// not reproduced here.

const TIMEOUT_MS = 8000;

function shotStart(shot) { return Number(shot.start_sec ?? shot.startSeconds) || 0; }
function shotEnd(shot) { return Number(shot.end_sec ?? shot.endSeconds) || 0; }
function shotUri(shot) { return shot?.media_contract?.runtimeUri || shot?.runtime_media_uri || shot?.media_uri || ""; }
function shotType(shot) {
  if (shot?.media_contract?.type) return shot.media_contract.type;
  if (!shotUri(shot) || shot.media_id === "none") return "none";
  return /\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i.test(shotUri(shot)) ? "image" : "video";
}
function sourceIn(shot) {
  const c = shot?.media_contract || {};
  return Number(c.sourceInSeconds ?? c.source_in_seconds ?? shot.source_in_sec ?? shot.trim_start_sec) || 0;
}

/** Shot and source time for a song time (pure; used by tests and the compositor). */
export function cutMediaAt(shots, t) {
  const shot = (shots || []).find((s) => t >= shotStart(s) && t < shotEnd(s)) || null;
  if (!shot) return null;
  const type = shotType(shot);
  if (type !== "image" && type !== "video") return null;
  return { shot, type, uri: shotUri(shot), sourceSeconds: sourceIn(shot) + (t - shotStart(shot)) };
}

function drawCover(ctx, source, sw, sh, w, h) {
  if (!sw || !sh) return;
  const scale = Math.max(w / sw, h / sh), dw = sw * scale, dh = sh * scale;
  ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

const once = (target, event, timeoutMs = TIMEOUT_MS) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${event}`)); }, timeoutMs);
  const ok = () => { cleanup(); resolve(); }, fail = () => { cleanup(); reject(new Error("Media could not be decoded")); };
  const cleanup = () => { clearTimeout(timer); target.removeEventListener(event, ok); target.removeEventListener("error", fail); };
  target.addEventListener(event, ok, { once: true }); target.addEventListener("error", fail, { once: true });
});

/**
 * createCutMediaCompositor({ shots, resolveUri })
 * drawAt(ctx, t, w, h, { alpha }) draws the media under song time t.
 * Unavailable media is skipped (black) and reported in the receipt.
 */
export function createCutMediaCompositor({ shots = [], resolveUri = (uri) => uri, dim = 0.25 } = {}) {
  const images = new Map(), videos = new Map(), failed = new Set();
  let drawn = 0, skipped = 0;

  async function image(uri) {
    if (!images.has(uri)) images.set(uri, new Promise((resolve, reject) => {
      const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => resolve(img); img.onerror = () => reject(new Error("Image failed")); img.src = uri;
    }));
    return images.get(uri);
  }
  async function video(uri) {
    if (!videos.has(uri)) videos.set(uri, (async () => {
      const el = document.createElement("video");
      Object.assign(el, { muted: true, playsInline: true, preload: "auto", crossOrigin: "anonymous" });
      el.src = uri;
      if (el.readyState < 1) await once(el, "loadedmetadata");
      // A server without Range support leaves the clip unseekable (every frame
      // would show frame 0); load the whole clip into memory instead.
      const seekableEnd = el.seekable.length ? el.seekable.end(el.seekable.length - 1) : 0;
      if (Number.isFinite(el.duration) && el.duration > 0.1 && seekableEnd < el.duration - 0.1) {
        const response = await fetch(uri);
        if (!response.ok) throw new Error(`Media fetch failed (${response.status})`);
        el.src = URL.createObjectURL(await response.blob());
        el.dataset.blobUrl = el.src;
        if (el.readyState < 1) await once(el, "loadedmetadata");
      }
      return el;
    })());
    return videos.get(uri);
  }

  async function drawAt(ctx, t, w, h, { alpha = 1 } = {}) {
    const media = cutMediaAt(shots, t);
    if (!media) return null;
    const uri = resolveUri(media.uri);
    if (failed.has(uri)) { skipped++; return null; }
    try {
      ctx.save(); ctx.globalAlpha = alpha;
      if (media.type === "image") { const img = await image(uri); drawCover(ctx, img, img.naturalWidth, img.naturalHeight, w, h); }
      else {
        const el = await video(uri), duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
        const target = duration ? media.sourceSeconds % duration : media.sourceSeconds;
        if (Math.abs(el.currentTime - target) > 1e-3 || el.readyState < 2) { el.currentTime = target; await once(el, "seeked"); }
        drawCover(ctx, el, el.videoWidth, el.videoHeight, w, h);
      }
      // A light dim keeps the dust readable over busy footage.
      if (dim > 0) { ctx.fillStyle = `rgba(0,0,0,${dim})`; ctx.fillRect(0, 0, w, h); }
      ctx.restore(); drawn++;
      return { shotId: media.shot.id || null, type: media.type, sourceSeconds: media.sourceSeconds };
    } catch {
      ctx.restore(); failed.add(uri); skipped++;
      return null;
    }
  }

  function dispose() {
    for (const pending of videos.values()) pending.then((el) => { if (el.dataset.blobUrl) URL.revokeObjectURL(el.dataset.blobUrl); el.removeAttribute("src"); el.load(); }).catch(() => {});
    videos.clear(); images.clear();
  }
  return { drawAt, dispose, receipt: () => ({ drawn, skipped, unavailable: [...failed] }) };
}
