#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const MEDIA_ROOT = path.join(ROOT, "data/media");
const PROJECT_ROOT = path.join(ROOT, "data/music-video-projects");
const BACKUP_ROOT = path.join(ROOT, "data/backups/echo-unplayable-media-heal");
const REPORT_PATH = path.join(ROOT, "artifacts/echo-unplayable-media-heal/report.json");
const apply = process.argv.includes("--apply");
const rehealFromBackups = process.argv.includes("--reheal-from-backups");
const skipCoverage = process.argv.includes("--skip-coverage");
const VIDEO_DURATION_TOLERANCE_SECONDS = 0.08;

function resolveUri(uri = "") {
  const value = String(uri || "").split("#")[0];
  if (value.startsWith("/media/")) return path.resolve(MEDIA_ROOT, decodeURIComponent(value.slice(7)));
  if (value.startsWith("/api/local-file?")) {
    try { return new URL(value, "http://127.0.0.1").searchParams.get("path") || ""; } catch { return ""; }
  }
  if (value.startsWith("file://")) {
    try { return decodeURIComponent(new URL(value).pathname); } catch { return ""; }
  }
  return path.isAbsolute(value) ? value : "";
}

function isImageShot(shot = {}) {
  if (shot.media_contract?.type === "image") return true;
  const resolved = resolveUri(shot.runtime_media_uri || shot.media_uri || "");
  return /\.(png|jpe?g|webp|gif|avif)$/i.test(resolved);
}

function mediaUri(shot = {}) {
  return shot.media_contract?.runtimeUri || shot.runtime_media_uri || shot.media_uri || "";
}

const probeCache = new Map();
function probe(uri = "", { still = false } = {}) {
  const file = resolveUri(uri);
  const cacheKey = `${still ? "still" : "video"}:${file}`;
  if (probeCache.has(cacheKey)) return probeCache.get(cacheKey);
  let result = { playable: false, browserPreferred: false, file, duration: 0, reason: "unresolved" };
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size < (still ? 16 : 4096)) {
      result = { playable: false, browserPreferred: false, file, bytes: stat.size, duration: 0, reason: "undersized-or-empty-container" };
    } else {
      const output = execFileSync("/opt/homebrew/bin/ffprobe", [
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,pix_fmt,width,height:format=duration",
        "-of", "json", file
      ], { encoding: "utf8", timeout: 10_000 });
      const parsed = JSON.parse(output);
      const stream = parsed.streams?.[0];
      const duration = Number(parsed.format?.duration || 0);
      const dimensionsValid = Boolean(stream?.codec_name && stream.width > 0 && stream.height > 0);
      const playable = dimensionsValid && (still || duration > 0.1);
      result = {
        playable,
        browserPreferred: playable && (still || (stream.codec_name === "h264" && stream.pix_fmt === "yuv420p")),
        file,
        bytes: stat.size,
        duration: Number.isFinite(duration) ? duration : 0,
        codec: stream?.codec_name || null,
        pixelFormat: stream?.pix_fmt || null,
        width: stream?.width || 0,
        height: stream?.height || 0,
        reason: playable ? "ffprobe-verified" : "missing-or-invalid-video-stream"
      };
    }
  } catch (error) {
    result = { playable: false, browserPreferred: false, file, duration: 0, reason: String(error.message || error).split("\n")[0] };
  }
  probeCache.set(cacheKey, result);
  return result;
}

const gaps = JSON.parse(fs.readFileSync(path.join(ROOT, "data/echos-gaps-report.json"), "utf8"));
const gapsById = new Map((gaps.videos || []).map((video) => [String(video.id), video]));
const genericCandidates = (gaps.videos || []).filter((video) => {
  const tags = new Set((video.tags || []).map((tag) => String(tag).toLowerCase()));
  return video.uri && !tags.has("media-file-invalid") && !tags.has("technical-ffprobe-failed") && !tags.has("missing-source-file");
}).sort((left, right) => Number(right.score || 0) - Number(left.score || 0) || String(left.id).localeCompare(String(right.id)));

function normalizeCandidate(candidate = {}, selectionSource = "unknown", rank = 0) {
  const id = String(candidate.mediaId || candidate.id || "");
  const catalog = gapsById.get(id) || {};
  return {
    id,
    title: candidate.title || candidate.mediaTitle || catalog.title || id,
    uri: candidate.uri || candidate.mediaUri || catalog.uri || "",
    thumbnailUri: candidate.posterUri || candidate.thumbnailUri || catalog.thumbnailUri || "",
    utility: Number.isFinite(Number(candidate.utility)) ? Number(candidate.utility) : null,
    eligible: candidate.eligible !== false,
    hardFilters: Array.isArray(candidate.hardFilters) ? candidate.hardFilters : [],
    selectionSource,
    rank
  };
}

function shotLocalCandidates(shot = {}) {
  const values = [];
  if (shot.semantic_casting?.selected) values.push(normalizeCandidate(shot.semantic_casting.selected, "semantic-casting.selected", 0));
  for (const [index, candidate] of (shot.semantic_casting?.alternatives || []).entries()) {
    values.push(normalizeCandidate(candidate, "semantic-casting.alternative", index + 1));
  }
  for (const [index, candidate] of (shot.decision_evidence?.rejectedAlternatives || []).entries()) {
    values.push(normalizeCandidate(candidate, "director-decision.alternative", index + 1));
  }
  const seen = new Set();
  return values.filter((candidate) => {
    const key = candidate.id || candidate.uri;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assessCandidate(candidate, { shotDuration, neighborIds }) {
  const technical = probe(candidate.uri);
  const rejectionReasons = [];
  if (!candidate.uri) rejectionReasons.push("missing-uri");
  if (!candidate.eligible || candidate.hardFilters.length) rejectionReasons.push(`semantic-hard-filter:${candidate.hardFilters.join("|") || "ineligible"}`);
  if (neighborIds.has(candidate.id)) rejectionReasons.push("adjacent-repeat");
  if (!technical.playable) rejectionReasons.push(`unplayable:${technical.reason}`);
  if (!technical.browserPreferred) rejectionReasons.push(`browser-risk:${technical.codec || "unknown"}/${technical.pixelFormat || "unknown"}`);
  if (technical.duration + VIDEO_DURATION_TOLERANCE_SECONDS < shotDuration) rejectionReasons.push(`duration-short:${technical.duration.toFixed(3)}<${shotDuration.toFixed(3)}`);
  return { candidate, technical, accepted: rejectionReasons.length === 0, rejectionReasons };
}

function chooseReplacement(sourceShot, timeline, index) {
  const shotDuration = Math.max(0.1, Number(sourceShot.end_sec) - Number(sourceShot.start_sec));
  const neighborIds = new Set([timeline[index - 1]?.media_id, timeline[index + 1]?.media_id].filter(Boolean));
  const localAudit = shotLocalCandidates(sourceShot).map((candidate) => assessCandidate(candidate, { shotDuration, neighborIds }));
  const local = localAudit.find((item) => item.accepted);
  if (local) return { selected: local, localAudit, genericAudit: [], selectionTier: "shot-local" };

  const genericAudit = [];
  let selected = null;
  for (let candidateIndex = 0; candidateIndex < genericCandidates.length; candidateIndex += 1) {
    const candidate = normalizeCandidate(genericCandidates[candidateIndex], "album-catalog.generic", candidateIndex);
    const assessed = assessCandidate(candidate, { shotDuration, neighborIds });
    if (genericAudit.length < 12 || assessed.accepted) genericAudit.push(assessed);
    if (assessed.accepted) { selected = assessed; break; }
  }
  return { selected, localAudit, genericAudit, selectionTier: selected ? "generic" : "none" };
}

function compactAssessment(item) {
  return {
    mediaId: item.candidate.id,
    title: item.candidate.title,
    uri: item.candidate.uri,
    selectionSource: item.candidate.selectionSource,
    rank: item.candidate.rank,
    utility: item.candidate.utility,
    accepted: item.accepted,
    rejectionReasons: item.rejectionReasons,
    technical: item.technical
  };
}

function originalDescriptor(shot = {}) {
  return {
    mediaId: shot.media_id,
    title: shot.media_title,
    uri: shot.media_uri,
    runtimeUri: shot.runtime_media_uri || shot.media_uri,
    technical: probe(mediaUri(shot))
  };
}

function replacementShot(currentShot, sourceShot, selection, audit, previousFallback = null) {
  const candidate = selection.candidate;
  const technical = selection.technical;
  const shotDuration = Math.max(0.1, Number(currentShot.end_sec) - Number(currentShot.start_sec));
  const contract = {
    schemaVersion: "hapa.echo.playback-media.v2",
    type: "video",
    originalUri: candidate.uri,
    runtimeUri: candidate.uri,
    sourceInSeconds: 0,
    sourceOutSeconds: shotDuration,
    playbackMode: "hold-last-frame",
    mimeType: "video/mp4",
    dimensions: { width: technical.width, height: technical.height },
    contentHash: null,
    proxy: { status: "pending", uri: candidate.uri },
    posterUri: candidate.thumbnailUri || "",
    keyframeIntervalSeconds: null,
    byteSize: technical.bytes,
    preloadPriority: currentShot.media_contract?.preloadPriority || "lazy",
    durationCoverage: {
      status: "verified",
      cueSeconds: shotDuration,
      sourceSeconds: technical.duration,
      toleranceSeconds: VIDEO_DURATION_TOLERANCE_SECONDS
    }
  };
  return {
    ...currentShot,
    media_id: candidate.id,
    media_title: candidate.title,
    media_uri: candidate.uri,
    runtime_media_uri: candidate.uri,
    media_thumbnail: candidate.thumbnailUri || "",
    edit_reason: `${sourceShot.edit_reason || currentShot.edit_reason || ""} Technical heal: unreadable source replaced by the highest-ranked valid shot-local alternative; semantic preference remains inferred pending human review.`.trim(),
    technical_fallback: {
      schemaVersion: "hapa.echo.technical-media-fallback.v2",
      status: "applied",
      mode: "valid-video-replacement",
      original: previousFallback?.original || originalDescriptor(sourceShot),
      priorReplacement: previousFallback ? {
        mediaId: currentShot.media_id,
        title: currentShot.media_title,
        uri: currentShot.media_uri,
        selectedBy: previousFallback.selectedBy || null
      } : null,
      reason: "source-container-unplayable",
      selectedBy: candidate.selectionSource,
      selectionTier: audit.selectionTier,
      semanticUtility: candidate.utility,
      candidateAudit: [...audit.localAudit, ...audit.genericAudit].map(compactAssessment),
      generatedAt: new Date().toISOString()
    },
    media_contract: contract
  };
}

function syncManifestItem(project, shot, index) {
  if (!project.media_manifest?.items?.[index]) return;
  project.media_manifest.items[index] = {
    shotIndex: index,
    mediaId: shot.media_id,
    ...shot.media_contract
  };
}

function loadBackupOriginals() {
  const originals = new Map();
  if (!fs.existsSync(BACKUP_ROOT)) return originals;
  for (const file of fs.readdirSync(BACKUP_ROOT).filter((value) => value.endsWith("-video-project.json"))) {
    const payload = JSON.parse(fs.readFileSync(path.join(BACKUP_ROOT, file), "utf8"));
    const project = payload.music_video_project || payload;
    for (const [index, shot] of (project.timeline || []).entries()) {
      if (shot.media_id !== "none" && !isImageShot(shot) && !probe(mediaUri(shot)).playable) {
        originals.set(`${project.song_id}:${index}`, shot);
      }
    }
  }
  return originals;
}

function visualizerCovers(project, shot) {
  const start = Number(shot.start_sec);
  const end = Number(shot.end_sec);
  let cursor = start;
  const intervals = (project.visualizer_timeline || [])
    .filter((item) => Number(item.end_sec) > start && Number(item.start_sec) < end && item.visualizer_id !== "none")
    .sort((left, right) => Number(left.start_sec) - Number(right.start_sec));
  for (const interval of intervals) {
    if (Number(interval.start_sec) > cursor + 0.051) return false;
    cursor = Math.max(cursor, Number(interval.end_sec));
    if (cursor >= end - 0.051) return true;
  }
  return cursor >= end - 0.051;
}

function validateCoverage(projectEntries) {
  const coverage = {
    totalIntervals: 0,
    validVideoIntervals: 0,
    browserPreferredVideoIntervals: 0,
    browserRiskVideoIntervals: 0,
    validImageIntervals: 0,
    explicitIvfIntervals: 0,
    explicitPosterFallbackIntervals: 0,
    uncoveredIntervals: 0,
    invalid: [],
    timelineInternalGaps: []
  };
  for (const { file, project } of projectEntries) {
    let cursor = 0;
    for (const [index, shot] of (project.timeline || []).entries()) {
      coverage.totalIntervals += 1;
      const start = Number(shot.start_sec);
      const end = Number(shot.end_sec);
      if (start > cursor + 0.051) coverage.timelineInternalGaps.push({ songId: project.song_id, index, gapStart: cursor, gapEnd: start });
      cursor = Math.max(cursor, end);
      if (shot.media_id === "none" || shot.media_contract?.type === "generated-visualizer") {
        if (visualizerCovers(project, shot)) coverage.explicitIvfIntervals += 1;
        else coverage.invalid.push({ file, songId: project.song_id, index, start, end, reason: "generated-visualizer-without-covering-ivf" });
        continue;
      }
      if (isImageShot(shot)) {
        const still = probe(mediaUri(shot), { still: true });
        if (still.playable) coverage.validImageIntervals += 1;
        else coverage.invalid.push({ file, songId: project.song_id, index, start, end, reason: `invalid-image:${still.reason}`, uri: mediaUri(shot) });
        continue;
      }
      const technical = probe(mediaUri(shot));
      if (technical.playable) {
        coverage.validVideoIntervals += 1;
        if (technical.browserPreferred) coverage.browserPreferredVideoIntervals += 1;
        else coverage.browserRiskVideoIntervals += 1;
        continue;
      }
      const fallbackMode = shot.technical_fallback?.mode || shot.media_contract?.fallback?.type;
      const posterUri = shot.media_contract?.posterUri || shot.media_thumbnail || "";
      const poster = posterUri ? probe(posterUri, { still: true }) : null;
      if (fallbackMode === "poster" && poster?.playable) coverage.explicitPosterFallbackIntervals += 1;
      else coverage.invalid.push({ file, songId: project.song_id, index, start, end, reason: `invalid-video-without-explicit-fallback:${technical.reason}`, uri: mediaUri(shot) });
    }
  }
  coverage.uncoveredIntervals = coverage.invalid.length;
  coverage.coveredIntervals = coverage.totalIntervals - coverage.uncoveredIntervals;
  coverage.allIntervalsCovered = coverage.uncoveredIntervals === 0 && coverage.timelineInternalGaps.length === 0;
  coverage.coverageRule = "Every interval must have an ffprobe-decodable video/image, or an explicit covering IVF/poster fallback. Browser-preferred H.264/yuv420p is reported separately and is enforced by the album proxy gate.";
  return coverage;
}

const backupOriginals = loadBackupOriginals();
const files = fs.readdirSync(PROJECT_ROOT).filter((file) => file.endsWith("-video-project.json")).sort();
const projectEntries = [];
const changes = [];
for (const file of files) {
  const filePath = path.join(PROJECT_ROOT, file);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const project = payload.music_video_project || payload;
  let dirty = false;
  project.timeline = (project.timeline || []).map((currentShot, index, timeline) => {
    const backupShot = backupOriginals.get(`${project.song_id}:${index}`);
    const currentUnplayable = currentShot.media_id !== "none" && !isImageShot(currentShot) && !probe(mediaUri(currentShot)).playable;
    const shouldReheal = rehealFromBackups && backupShot && currentShot.technical_fallback?.status === "applied";
    if (!currentUnplayable && !shouldReheal) return currentShot;
    const sourceShot = shouldReheal ? backupShot : currentShot;
    const audit = chooseReplacement(sourceShot, timeline, index);
    if (!audit.selected) return currentShot;
    const nextShot = replacementShot(currentShot, sourceShot, audit.selected, audit, currentShot.technical_fallback || null);
    const unchanged = currentShot.media_id === nextShot.media_id && currentShot.media_uri === nextShot.media_uri && currentShot.technical_fallback?.selectedBy === nextShot.technical_fallback.selectedBy;
    if (unchanged) return currentShot;
    dirty = true;
    changes.push({
      songId: project.song_id,
      shotIndex: index,
      startSeconds: currentShot.start_sec,
      endSeconds: currentShot.end_sec,
      sectionLabel: currentShot.section_label,
      lyricText: (project.timed_lyrics || []).filter((line) => Number(line.start) < Number(currentShot.end_sec) && Number(line.end) > Number(currentShot.start_sec)).map((line) => line.text),
      original: originalDescriptor(sourceShot),
      before: {
        mediaId: currentShot.media_id,
        title: currentShot.media_title,
        uri: currentShot.media_uri,
        selectedBy: currentShot.technical_fallback?.selectedBy || null,
        technical: probe(mediaUri(currentShot))
      },
      after: {
        mediaId: nextShot.media_id,
        title: nextShot.media_title,
        uri: nextShot.media_uri,
        posterUri: nextShot.media_thumbnail,
        selectedBy: nextShot.technical_fallback.selectedBy,
        selectionTier: nextShot.technical_fallback.selectionTier,
        semanticUtility: nextShot.technical_fallback.semanticUtility,
        technical: audit.selected.technical
      },
      candidateAudit: nextShot.technical_fallback.candidateAudit
    });
    return nextShot;
  });
  if (dirty) {
    for (const [index, shot] of project.timeline.entries()) syncManifestItem(project, shot, index);
    project.hyperframe_script_stale = true;
    project.updated_at = new Date().toISOString();
    if (apply) {
      fs.mkdirSync(BACKUP_ROOT, { recursive: true });
      const backup = path.join(BACKUP_ROOT, file);
      if (!fs.existsSync(backup)) fs.copyFileSync(filePath, backup);
      fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
    }
  }
  projectEntries.push({ file, project: apply && dirty ? (payload.music_video_project || payload) : project });
}

const coverage = skipCoverage ? { skipped: true } : validateCoverage(projectEntries);
const report = {
  schemaVersion: "hapa.echo.unplayable-media-heal.v2",
  mode: apply ? "apply" : "dry-run",
  rehealFromBackups,
  projectsScanned: files.length,
  backupOriginalsFound: backupOriginals.size,
  candidatePool: genericCandidates.length,
  changesAppliedOrPlanned: changes.length,
  changes,
  coverage,
  generatedAt: new Date().toISOString()
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  mode: report.mode,
  rehealFromBackups,
  projectsScanned: report.projectsScanned,
  backupOriginalsFound: report.backupOriginalsFound,
  changes: changes.map((row) => ({ songId: row.songId, shotIndex: row.shotIndex, from: row.before.mediaId, to: row.after.mediaId, selectedBy: row.after.selectedBy })),
  coverage
}, null, 2));

if (!skipCoverage && !coverage.allIntervalsCovered) process.exitCode = 1;
