const text = (value) => String(value ?? "").trim();

/**
 * Canonical audio selection shared by Echo preview, delivery, and render
 * certification. Precedence intentionally matches the user-facing Preview;
 * callers must never fall through to another alias after this choice is made.
 */
export function echoProjectAudioRoute(project = {}, showGraph = project?.director_show_graph || null) {
  const graphUri = text(showGraph?.song?.audioPath || showGraph?.song?.audioUri);
  const id = text(project?.audio_id) || text(project?.registry_track_id) || text(project?.song_id);
  if (graphUri) {
    const match = graphUri.match(/^\/api\/song-registry\/audio\/([^/?#]+)/u);
    let routeId = text(showGraph?.song?.id) || id || null;
    if (match) {
      try { routeId = decodeURIComponent(match[1]); } catch { routeId = match[1]; }
    }
    return { id: routeId, uri: graphUri, source: "show-graph.song.audioPath" };
  }
  return {
    id: id || null,
    uri: id ? `/api/song-registry/audio/${encodeURIComponent(id)}` : null,
    source: text(project?.audio_id)
      ? "audio_id"
      : text(project?.registry_track_id) ? "registry_track_id" : text(project?.song_id) ? "song_id" : null,
  };
}
