/** Technical analysis adds evidence. It does not erase authored tags, palettes,
 * semantic annotations or reviews to make an automated coverage check pass. */
export function projectEchoMediaAffordance(asset, technical, source) {
  const metadata = asset.metadata || {};
  const inferred = {
    schemaVersion: "hapa.echo.media-semantic-affordance.v2", status: "inferred-unreviewed",
    artifactId: `sha256:${technical.contentHash.value}`, analyzer: "filename-parent-metadata-v1",
    model: null, version: "v1", contactFrameUris: technical.contactFrames.map(frame => frame.uri),
    fields: {
      objects: { value: metadata.objects || [], status: "inferred", basis: `${source}:title-tags` },
      actions: { value: metadata.actions || [], status: "inferred", basis: `${source}:technical-shape` },
      motion: { value: metadata.motion || null, status: "inferred", basis: "duration-fps-shape" },
      shotType: { value: metadata.shotType || null, status: "inferred", basis: "dimensions-source-kind" },
    },
    reviewStatus: "unreviewed",
  };
  return {
    ...asset,
    thumbnailUri: asset.thumbnailUri || technical.posterUri,
    metadata: {
      ...metadata,
      duration: technical.durationSec, width: technical.width, height: technical.height, frameRate: technical.fps,
      echosTechnicalAffordance: technical,
      echosSemanticAffordance: metadata.echosSemanticAffordance || inferred,
    },
  };
}
