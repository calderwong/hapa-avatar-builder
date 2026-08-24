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

/**
 * Echo audio is mutable behind a stable registry route while a song is being
 * repaired or refreshed. Give each load attempt a distinct URL and explicitly
 * bypass the browser cache so Retry cannot replay an earlier invalid response.
 */
export function echoAudioFetchRequest(uri, attempt = 0) {
  const value = text(uri);
  if (!value) return { url: null, options: { cache: "no-store" } };
  const normalizedAttempt = Math.max(0, Math.trunc(Number(attempt) || 0));
  const hashIndex = value.indexOf("#");
  const base = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const separator = base.includes("?") ? "&" : "?";
  return {
    url: `${base}${separator}hapaAudioAttempt=${normalizedAttempt}${hash}`,
    options: { cache: "no-store" },
  };
}
