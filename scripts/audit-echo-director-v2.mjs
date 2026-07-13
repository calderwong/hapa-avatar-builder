#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  assessTimingTruth,
  resolveEchoMediaUri,
  stableStringify,
} from "../src/domain/echo-director-v2.js";

function parseArgs(argv) {
  const options = {
    projects: "./data/music-video-projects",
    output: "./artifacts/echo-director-v2",
    avatarRoot: "/Users/calderwong/Desktop/hapa-avatar-builder",
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function projectBody(payload) {
  return payload?.music_video_project || payload?.project || payload;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function countBy(values) {
  return Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map())].sort());
}

function humanBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(unit === "B" ? 0 : 1)} ${unit}`;
}

function inspectProject(filePath, avatarRoot) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const project = projectBody(JSON.parse(sourceText)) || {};
  const timeline = Array.isArray(project.timeline) ? project.timeline : [];
  const visualizers = Array.isArray(project.visualizer_timeline) ? project.visualizer_timeline : [];
  const uniqueMedia = new Map();
  for (const shot of timeline) {
    const uri = String(shot.media_uri || shot.uri || "").split("#")[0];
    if (!uri || uniqueMedia.has(uri)) continue;
    const localPath = resolveEchoMediaUri(uri, avatarRoot);
    let bytes = 0;
    try { bytes = fs.statSync(localPath).size; } catch { /* Missing assets remain explicit. */ }
    uniqueMedia.set(uri, {
      uri,
      localPath,
      bytes,
      exists: Boolean(localPath && fs.existsSync(localPath)),
      kind: /\.(png|jpe?g|webp|gif)$/i.test(uri) ? "image" : /\.(mp4|mov|m4v|webm)$/i.test(uri) ? "video" : "unknown",
    });
  }
  const stems = (project.stems_available || []).map((stem) => String(typeof stem === "string" ? stem : stem.stemType || stem.kind || stem.title || stem.id || ""));
  const uniqueStems = [...new Set(stems.map((stem) => stem.trim().toLowerCase()).filter(Boolean))];
  const genericReasons = timeline.filter((shot) => /matching .+ mood|apply transition|maintain shader continuity/i.test(String(shot.edit_reason || ""))).length;
  const visualizerFieldCoverage = Object.fromEntries([
    "inputs",
    "audioMap",
    "stemFocus",
    "layerRole",
    "blendMode",
    "opacity",
    "controls",
  ].map((field) => [field, visualizers.filter((item) => item[field] !== undefined && item[field] !== null).length]));
  const timingTruth = assessTimingTruth(project);
  return {
    file: path.basename(filePath),
    bytes: Buffer.byteLength(sourceText),
    hyperframeBytes: Buffer.byteLength(String(project.hyperframe_script || "")),
    songId: String(project.song_id || ""),
    songTitle: String(project.song_title || ""),
    durationSeconds: Number(project.duration || 0),
    provenanceStatus: String(project.provenance?.status || "missing"),
    lyricVariant: String(project.lyric_variant || "missing"),
    stemRecords: stems.length,
    uniqueStemTypes: uniqueStems.length,
    duplicateStemRecords: Math.max(0, stems.length - uniqueStems.length),
    shots: timeline.length,
    genericEditReasons: genericReasons,
    visualizerSegments: visualizers.length,
    visualizerFieldCoverage,
    timingTruth,
    media: {
      unique: uniqueMedia.size,
      bytes: sum([...uniqueMedia.values()].map((media) => media.bytes)),
      existing: [...uniqueMedia.values()].filter((media) => media.exists).length,
      missing: [...uniqueMedia.values()].filter((media) => !media.exists).length,
      images: [...uniqueMedia.values()].filter((media) => media.kind === "image").length,
      videos: [...uniqueMedia.values()].filter((media) => media.kind === "video").length,
      unknown: [...uniqueMedia.values()].filter((media) => media.kind === "unknown").length,
    },
  };
}

function markdown(report) {
  const s = report.summary;
  return `# Echo Director v2 Baseline\n\nGenerated from current project files without mutating app or registry data.\n\n## Totals\n\n- Projects: ${s.projects}\n- Shots: ${s.shots}\n- Visualizer segments: ${s.visualizerSegments}\n- Generic edit reasons: ${s.genericEditReasons}\n- Project JSON: ${humanBytes(s.projectBytes)}\n- Embedded HyperFrames text: ${humanBytes(s.hyperframeBytes)} (${s.hyperframePercent}% of project JSON)\n- Referenced media payload: ${humanBytes(s.mediaBytes)}\n- Missing referenced media: ${s.missingMedia}\n- Duplicate stem records: ${s.duplicateStemRecords}\n- Projects without unique stems: ${s.projectsWithoutStems}\n- Projects using only phrase-window lyrics: ${s.lyricVariants["phrase-window"] || 0}/${s.projects}\n\n## Truth\n\n- Project provenance: ${Object.entries(s.provenanceStatuses).map(([key, value]) => `${key}=${value}`).join(", ")}\n- Lyric timing: ${Object.entries(s.lyricTruthStatuses).map(([key, value]) => `${key}=${value}`).join(", ")}\n- Beat timing: ${Object.entries(s.beatTruthStatuses).map(([key, value]) => `${key}=${value}`).join(", ")}\n- Timing warnings: ${Object.entries(s.timingWarnings).map(([key, value]) => `${key}=${value}`).join(", ") || "none"}\n\n## Visualizer executable-field coverage\n\n${Object.entries(s.visualizerFieldCoverage).map(([field, count]) => `- ${field}: ${count}/${s.visualizerSegments}`).join("\n")}\n\n## Highest playback payloads\n\n${report.projects.slice().sort((a, b) => b.media.bytes - a.media.bytes).slice(0, 10).map((project) => `- ${project.songTitle}: ${humanBytes(project.media.bytes)} across ${project.media.unique} unique media`).join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectsDir = path.resolve(options.projects);
  const outputDir = path.resolve(options.output);
  const files = fs.readdirSync(projectsDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => path.join(projectsDir, file));
  const projects = files.map((file) => inspectProject(file, options.avatarRoot));
  const coverageFields = ["inputs", "audioMap", "stemFocus", "layerRole", "blendMode", "opacity", "controls"];
  const report = {
    schemaVersion: "hapa.echo.director-baseline.v2",
    generatedFrom: projectsDir,
    mutationMode: "read-only",
    summary: {
      projects: projects.length,
      shots: sum(projects.map((project) => project.shots)),
      visualizerSegments: sum(projects.map((project) => project.visualizerSegments)),
      genericEditReasons: sum(projects.map((project) => project.genericEditReasons)),
      projectBytes: sum(projects.map((project) => project.bytes)),
      hyperframeBytes: sum(projects.map((project) => project.hyperframeBytes)),
      hyperframePercent: Number((100 * sum(projects.map((project) => project.hyperframeBytes)) / Math.max(1, sum(projects.map((project) => project.bytes)))).toFixed(1)),
      mediaBytes: sum(projects.map((project) => project.media.bytes)),
      missingMedia: sum(projects.map((project) => project.media.missing)),
      duplicateStemRecords: sum(projects.map((project) => project.duplicateStemRecords)),
      projectsWithoutStems: projects.filter((project) => project.uniqueStemTypes === 0).length,
      lyricVariants: countBy(projects.map((project) => project.lyricVariant)),
      provenanceStatuses: countBy(projects.map((project) => project.provenanceStatus)),
      lyricTruthStatuses: countBy(projects.map((project) => project.timingTruth.lyricStatus)),
      beatTruthStatuses: countBy(projects.map((project) => project.timingTruth.beatStatus)),
      timingWarnings: countBy(projects.flatMap((project) => project.timingTruth.warnings)),
      visualizerFieldCoverage: Object.fromEntries(coverageFields.map((field) => [field, sum(projects.map((project) => project.visualizerFieldCoverage[field]))])),
    },
    projects,
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "baseline.json"), `${stableStringify(report, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "baseline.md"), markdown(report), "utf8");
  process.stdout.write(`${stableStringify({ ok: true, outputDir, summary: report.summary }, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
}
