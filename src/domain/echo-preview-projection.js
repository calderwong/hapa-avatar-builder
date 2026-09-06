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
export function applyEchoPreviewProjection(timeline = [], receipt, { songId, variantId = 'legacy' } = {}) {
  if (receipt?.songId !== songId || receipt?.variantId !== variantId || !Array.isArray(receipt?.items)) return timeline;
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
