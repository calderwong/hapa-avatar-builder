export const ECHO_LYRIC_VISUAL_VARIATION_SET = "echo-lyric-visual-fusion-v1";

export const ECHO_LYRIC_VISUAL_VARIATIONS = Object.freeze([
  Object.freeze({
    id: "lyric-visual-cinema-v1",
    title: "Lyric Visual Fusion · Cinema",
    sourcePattern: ["human-accepted", "reference"],
    density: Object.freeze({ id: "cinema", label: "Cinema", targetVideoRatio: 0.72, ordinal: 1 }),
  }),
  Object.freeze({
    id: "lyric-visual-reference-v1",
    title: "Lyric Visual Fusion · Reference Forward",
    sourcePattern: ["reference", "human-accepted"],
    density: Object.freeze({ id: "reference-forward", label: "Reference Forward", targetVideoRatio: 0.84, ordinal: 2 }),
  }),
  Object.freeze({
    id: "lyric-visual-performance-v1",
    title: "Lyric Visual Fusion · Performance Dense",
    sourcePattern: ["human-accepted", "reference"],
    density: Object.freeze({ id: "performance-dense", label: "Performance Dense", targetVideoRatio: 0.94, ordinal: 3 }),
  }),
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value || "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timedLyrics(project = {}) {
  return list(
    project.song_edit_map?.timedLyrics
    || project.songEditMap?.timedLyrics
    || project.timed_lyrics
    || project.timedLyrics,
  ).map((line, index) => ({
    id: text(line.id) || `timed-line-${index + 1}`,
    start: finite(line.start ?? line.start_sec ?? line.startSeconds),
    end: finite(line.end ?? line.end_sec ?? line.endSeconds, finite(line.start ?? line.start_sec ?? line.startSeconds)),
    text: text(line.text || line.lyric || line.line),
    confidence: Number.isFinite(Number(line.confidence)) ? Number(line.confidence) : null,
  })).filter((line) => line.text && line.end >= line.start);
}

export function attachTimedLyricContextToProject(project = {}) {
  const lines = timedLyrics(project);
  const songContext = [project.song_title, project.local_spine, project.visual_prompt, project.enriched_prompt]
    .map(text).filter(Boolean).join(" · ");
  let shotsWithLyrics = 0;
  let lyricLinesAttached = 0;
  const timeline = list(project.timeline).map((shot) => {
    const start = finite(shot.start_sec ?? shot.startSeconds);
    const end = finite(shot.end_sec ?? shot.endSeconds, start);
    const overlapping = lines.filter((line) => line.start < end && line.end > start);
    if (!overlapping.length) return songContext ? { ...shot, song_visual_context: songContext } : { ...shot };
    shotsWithLyrics += 1;
    lyricLinesAttached += overlapping.length;
    const confidences = overlapping.map((line) => line.confidence).filter(Number.isFinite);
    return {
      ...shot,
      lyric_context: overlapping.map((line) => line.text).join(" / "),
      lyric_lines: overlapping.map((line) => line.text),
      lyric_line_ids: overlapping.map((line) => line.id),
      lyric_context_source: "project.song_edit_map.timedLyrics-overlap",
      lyric_context_confidence: confidences.length
        ? Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(4))
        : null,
      ...(songContext ? { song_visual_context: songContext } : {}),
    };
  });
  return {
    project: { ...project, timeline },
    evidence: {
      timedLyricLines: lines.length,
      timelineShots: timeline.length,
      shotsWithLyrics,
      lyricLinesAttached,
      source: lines.length ? "project-timed-lyrics" : "unavailable",
    },
  };
}

function normalized(value) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

const SHORTLIST_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "was", "were", "are", "but", "not", "you", "your",
  "his", "her", "their", "our", "into", "over", "under", "while", "when", "what", "where", "who", "how",
]);

function shortlistTokens(value) {
  return new Set(normalized(value).split(/\s+/u).filter((token) => token.length >= 3 && !SHORTLIST_STOPWORDS.has(token)));
}

function projectSemanticText(project = {}) {
  return [
    project.song_title,
    project.local_spine,
    project.visual_prompt,
    project.enriched_prompt,
    ...timedLyrics(project).map((line) => line.text),
  ].map(text).filter(Boolean).join(" ");
}

function candidateSemanticScore(candidate = {}, projectTokens = new Set()) {
  const candidateTokens = shortlistTokens([
    candidate.title,
    candidate.visualDescription?.text,
    ...list(candidate.semanticTags),
    ...list(candidate.tags),
  ].join(" "));
  if (!candidateTokens.size || !projectTokens.size) return 0;
  let hits = 0;
  for (const token of projectTokens) if (candidateTokens.has(token)) hits += 1;
  return hits / Math.sqrt(projectTokens.size * candidateTokens.size);
}

export function enrichedCandidatesForSong(candidates = [], project = {}, options = {}) {
  const limit = Math.max(2, Math.trunc(finite(options.limit, 320)));
  const projectTokens = shortlistTokens(projectSemanticText(project));
  const ranked = list(candidates).map((candidate) => ({
    candidate,
    score: candidateSemanticScore(candidate, projectTokens),
  })).sort((left, right) => (
    right.score - left.score
    || text(left.candidate.technicalIdentity || left.candidate.id).localeCompare(text(right.candidate.technicalIdentity || right.candidate.id))
  ));
  const selected = ranked.slice(0, limit);
  return {
    candidates: selected.map((row) => row.candidate),
    sourceCount: ranked.length,
    limit,
    positiveMatches: selected.filter((row) => row.score > 0).length,
    topScore: Number((selected[0]?.score || 0).toFixed(4)),
  };
}

export function referenceCandidatesForSong(candidates = [], project = {}, options = {}) {
  const ids = new Set([
    project.song_id,
    project.songId,
    project.registry_track_id,
    project.registryTrackId,
    project.audio_id,
    project.audioId,
  ].map(text).filter(Boolean));
  const title = normalized(project.song_title || project.songTitle);
  const scoped = list(candidates).filter((candidate) => (
    list(candidate.sourceSongIds).some((id) => ids.has(text(id)))
    || (title && list(candidate.sourceSongTitles).some((candidateTitle) => normalized(candidateTitle) === title))
  ));
  const fallback = scoped.length ? null : enrichedCandidatesForSong(candidates, project, { limit: options.fallbackLimit || 160 });
  return {
    candidates: scoped.length ? scoped : fallback.candidates,
    mode: scoped.length ? "same-song-reference-cards" : "album-reference-semantic-fallback",
    scopedCount: scoped.length,
    albumCount: list(candidates).length,
    fallbackShortlist: fallback ? {
      limit: fallback.limit,
      positiveMatches: fallback.positiveMatches,
      topScore: fallback.topScore,
    } : null,
  };
}

export function highQualityHumanAcceptedCandidates(candidates = [], options = {}) {
  const minimumShortEdge = Math.max(1, finite(options.minimumShortEdge, 720));
  const accepted = list(candidates).filter((candidate) => (
    candidate.humanAcceptedIdentity?.decisionState === "accepted"
    && candidate.visualDescription?.text
    && candidate.visualPalette
  ));
  const highResolution = accepted.filter((candidate) => (
    Math.min(finite(candidate.width), finite(candidate.height)) >= minimumShortEdge
  ));
  return {
    candidates: highResolution.length >= 2 ? highResolution : accepted,
    minimumShortEdge: highResolution.length >= 2 ? minimumShortEdge : 0,
    acceptedEnrichedCount: accepted.length,
    highResolutionCount: highResolution.length,
    resolutionFallback: highResolution.length < 2,
  };
}
