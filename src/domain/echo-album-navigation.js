function normalizedSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

// Album entry dates, never cut regeneration or file modification times.
export function compareEchoSongs(left = {}, right = {}, order = "name") {
  if (order === "newest" || order === "oldest") {
    const timestamp = song => {
      for (const value of [song.addedAt, song.createdAt]) {
        const time = typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
        if (Number.isFinite(time)) return time;
      }
      return null;
    };
    const a = timestamp(left), b = timestamp(right);
    if (a === null && b !== null) return 1;
    if (b === null && a !== null) return -1;
    if (a !== null && b !== null && a !== b) return order === "oldest" ? a - b : b - a;
  }
  return String(left.title || "").localeCompare(String(right.title || ""))
    || String(left.id || "").localeCompare(String(right.id || ""));
}

export function echoDirectorProject(row = {}) {
  return row?.music_video_project && typeof row.music_video_project === "object"
    ? row.music_video_project
    : null;
}

export function filterEchoDirectorProjectRows(rows = [], query = "") {
  const needle = normalizedSearchText(query);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const project = echoDirectorProject(row);
    if (!project?.song_id) return false;
    if (!needle) return true;
    return [project.song_title, project.song_id]
      .some((value) => normalizedSearchText(value).includes(needle));
  });
}

export function inspectEchoDirectorProjectDetail(detail = {}) {
  const project = echoDirectorProject(detail);
  const hasTimeline = Array.isArray(project?.timeline);
  const hasEditorGraph = Boolean(project?.director_show_graph?.tracks);
  return {
    project,
    canOpen: Boolean(project?.song_id && hasTimeline),
    hasTimeline,
    hasEditorGraph,
  };
}

export const ECHO_RETAINED_PROJECT_DETAILS = 3;

// The roster keeps canonical compact summaries. Heavy hydrated graphs are an
// explicitly bounded working set; the selected and saving songs are pinned.
export function retainEchoProjectDetails(rows, summaries, recentIds, protectedIds = [], limit = ECHO_RETAINED_PROJECT_DETAILS) {
  const keep = new Set(protectedIds.filter(Boolean));
  const loaded = new Set(rows.filter(row => Array.isArray(echoDirectorProject(row)?.timeline)).map(row => echoDirectorProject(row).song_id));
  for (const id of recentIds) {
    if (keep.size >= limit) break;
    if (loaded.has(id)) keep.add(id);
  }
  return rows.map(row => {
    const project = echoDirectorProject(row);
    return loaded.has(project?.song_id) && !keep.has(project.song_id)
      ? summaries.get(project.song_id) || { music_video_project: { song_id: project.song_id, song_title: project.song_title, audio_id: project.audio_id } }
      : row;
  });
}

// Saved plans can be rebuilt on revisiting. Pending/unsaved work is pinned by
// the caller alongside the corresponding detail, including restoration data.
export function retainEchoSongCardPlans(state, retainedIds) {
  const keep = new Set(retainedIds);
  const entries = Object.entries(state).filter(([id]) => keep.has(id));
  return entries.length === Object.keys(state).length ? state : Object.fromEntries(entries);
}
