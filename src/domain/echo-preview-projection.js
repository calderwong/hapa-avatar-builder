// Preview derivatives are a view-only projection. These helpers never decorate
// the authoring project, saved variant, or final-render graph.
export function echoPreviewSourceUri(shot = {}) {
  return String(shot.media_contract?.originalUri || shot.media_uri || shot.runtime_media_uri || '');
}
export function echoPreviewShotKey(shot = {}) {
  const contract = shot.media_contract || {};
  return JSON.stringify([String(shot.media_id || ''), echoPreviewSourceUri(shot),
    Number(shot.start_sec), Number(shot.end_sec), contract.sourceInSeconds ?? contract.source_in_seconds ?? 0,
    contract.sourceOutSeconds ?? contract.source_out_seconds ?? null,
    contract.timeMapping || contract.time_mapping || null]);
}
export function applyEchoPreviewProjection(timeline = [], receipt, { songId, variantId = 'legacy', maximumDimension = 1280 } = {}) {
  if ((receipt?.maximumDimension || 1280) !== maximumDimension || receipt?.songId !== songId || receipt?.variantId !== variantId || !Array.isArray(receipt?.items)) return timeline;
  const ready = new Map(receipt.items.filter(row => row.status === 'ready'
    && /^[a-f0-9]{64}$/.test(row.proxy?.sha256 || '')
    && /^\/media\/echo-proxies-v2\/[a-f0-9]{64}\/preview\.mp4$/.test(row.proxy?.uri || '')).map(row => [row.shotKey, row.proxy]));
  return timeline.map(shot => {
    const proxy = ready.get(echoPreviewShotKey(shot));
    if (!proxy) return shot;
    return { ...shot, runtime_media_uri: proxy.uri, media_contract: { ...shot.media_contract,
      type: 'video', originalUri: echoPreviewSourceUri(shot), runtimeUri: proxy.uri,
      proxy, contentHash: proxy.sha256, actualDurationSeconds: proxy.durationSeconds,
      dimensions: { width: proxy.width, height: proxy.height }, byteSize: proxy.byteSize,
    } };
  });
}

// Historical shader inputs must use the same approved preview rendition as the
// visible player. Preserve source timing and never decorate the authoring cue.
export function echoPreviewHistoryMediaCue(cue, sourceShot, previewShot) {
  const proxy = previewShot?.media_contract?.proxy;
  if (!cue?.media || !sourceShot || !previewShot || !proxy
    || echoPreviewShotKey(sourceShot) !== echoPreviewShotKey(previewShot)
    || String(cue.media.id || '') !== String(sourceShot.media_id || '')
    || !/^[a-f0-9]{64}$/.test(proxy.sha256 || '')
    || !/^\/media\/echo-proxies-v2\/[a-f0-9]{64}\/preview\.mp4$/.test(proxy.uri || '')
    || previewShot.runtime_media_uri !== proxy.uri) return cue;
  return { ...cue, media: { ...cue.media, uri: proxy.uri, sourceHash: proxy.sha256,
    originalUri: cue.media.uri, originalSourceHash: cue.media.sourceHash || null,
    fidelity: 'sampled-H264-preview; originals retained for export' } };
}


export const ECHO_PREVIEW_QUALITY_PRESETS = Object.freeze({
  full: Object.freeze({ shaderScale: 1, layerLimit: 0, mediaDimension: 1280 }),
  balanced: Object.freeze({ shaderScale: .75, layerLimit: 4, mediaDimension: 960 }),
  responsive: Object.freeze({ shaderScale: .5, layerLimit: 2, mediaDimension: 640 }),
});
export function normalizeEchoPreviewQuality(value = {}) {
  return { shaderScale: [1, .75, .5].includes(Number(value.shaderScale)) ? Number(value.shaderScale) : 1,
    layerLimit: [0, 2, 4].includes(Number(value.layerLimit)) ? Number(value.layerLimit) : 0,
    mediaDimension: [640, 960, 1280].includes(Number(value.mediaDimension)) ? Number(value.mediaDimension) : 1280 };
}
export function echoPreviewShaderSize(width, height, quality) {
  const scale = normalizeEchoPreviewQuality(quality).shaderScale;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function echoPreviewShaderLayers(cards = [], quality) {
  const limit = normalizeEchoPreviewQuality(quality).layerLimit;
  return { admitted: limit ? cards.slice(0, limit) : cards, omitted: limit ? cards.slice(limit) : [] };
}
