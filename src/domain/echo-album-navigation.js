function normalizedSearchText(value) {
  return String(value || "").trim().toLowerCase();
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
