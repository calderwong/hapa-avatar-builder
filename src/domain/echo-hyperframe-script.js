function shotMediaType(shot = {}) {
  if (shot?.media_contract?.type) return shot.media_contract.type;
  if (!shot?.media_uri || shot.media_id === "none") return "generated-visualizer";
  return /\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i.test(shot.media_uri) ? "image" : "video";
}

function shotRuntimeUri(shot = {}) {
  return shot?.media_contract?.runtimeUri || shot?.runtime_media_uri || shot?.media_uri || "";
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

import { echoProjectAudioRoute } from "./echo-audio-route.js";
import { resolveEchoOutputProfile } from "./echo-output-profile.js";

/**
 * Generate the portable HyperFrames representation used by Echo previews and
 * append-only direction-script revisions. The input project is not mutated.
 */
export function generateEchoHyperframeScript(project = {}) {
  const songId = project.song_id || "unknown-song";
  const songTitle = project.song_title || songId;
  const duration = finite(project.duration, 0);
  const timeline = Array.isArray(project.timeline) ? project.timeline : [];
  const visualizerTimeline = Array.isArray(project.visualizer_timeline) ? project.visualizer_timeline : [];
  const timedLyrics = Array.isArray(project.timed_lyrics) ? project.timed_lyrics : [];
  const lyricVariant = project.lyric_variant || "phrase-window";
  const audioRoute = echoProjectAudioRoute(project);
  const lyricPosition = project.lyric_position || "bottom-center";
  const lyricStyle = project.lyric_style || "neon-cyan";
  const outputProfile = resolveEchoOutputProfile(project);
  const lyricBottom = Math.round(outputProfile.height * outputProfile.safeArea.lyricBottom);

  let html = `<!-- Hapa x HyperFrames Video Project Script -->\n`;
  html += `<!-- Song: ${songTitle} (${songId}) -->\n`;
  html += `<!-- Duration: ${duration} seconds -->\n`;
  html += `<!-- Output Profile: ${outputProfile.label} (${outputProfile.id}, ${outputProfile.aspectRatio}, ${outputProfile.width}x${outputProfile.height} @ ${outputProfile.fps}fps) -->\n\n`;
  html += `<div class="hyperframe-video-composition"\n`;
  html += `     data-output-profile="${outputProfile.id}"\n`;
  html += `     data-output-profile-schema="${outputProfile.schemaVersion}"\n`;
  html += `     data-orientation="${outputProfile.orientation}"\n`;
  html += `     data-aspect-ratio="${outputProfile.aspectRatio}"\n`;
  html += `     data-width="${outputProfile.width}"\n`;
  html += `     data-height="${outputProfile.height}"\n`;
  html += `     data-fps="${outputProfile.fps}"\n`;
  html += `     data-duration="${duration}"\n`;
  html += `     style="width: ${outputProfile.width}px; height: ${outputProfile.height}px; position: relative; background: #020617; overflow: hidden;">\n\n`;

  html += `  <!-- Canonical Output Metadata -->\n`;
  html += `  <script>\n`;
  html += `    window.HAPA_OUTPUT_PROFILE = ${JSON.stringify(outputProfile, null, 2).split("\n").join("\n    ")};\n`;
  html += `  </script>\n\n`;

  html += `  <!-- Canonical Audio Track -->\n`;
  html += `  <audio src="${audioRoute.uri || ""}"\n`;
  html += `         data-start="0"\n`;
  html += `         data-volume="1.0"></audio>\n\n`;

  html += `  <!-- Embed Lyric Timings -->\n`;
  html += `  <script>\n`;
  html += `    window.HAPA_LYRIC_TIMING = ${JSON.stringify({ lines: timedLyrics }, null, 2).split("\n").join("\n    ")};\n`;
  html += `  </script>\n\n`;

  html += `  <!-- Directed Shot Timeline -->\n`;
  timeline.forEach((shot, idx) => {
    const mediaType = shotMediaType(shot);
    const start = finite(shot.start_sec, 0);
    const end = finite(shot.end_sec, start);
    const shotDuration = Math.max(0, end - start).toFixed(1);
    html += `  <!-- Section: ${shot.section_label || shot.section_id || "Unlabeled"} (Shot ${finite(shot.shot_index, idx) + 1}) -->\n`;
    if (mediaType === "video") {
      html += `  <video id="shot-${idx + 1}"\n`;
      html += `         src="${shotRuntimeUri(shot)}"\n`;
      html += `         data-start="${start}"\n`;
      html += `         data-duration="${shotDuration}"\n`;
      html += `         data-transition="${shot.transition || "cut"}"\n`;
      html += `         data-stems="${(shot.active_stems || []).join(",")}"\n`;
      html += `         data-camera-motion="${shot.camera_motion || "auto"}"\n`;
      html += `         data-camera-intensity="${finite(shot.camera_intensity, 1).toFixed(1)}"\n`;
      html += `         data-camera-speed="${finite(shot.camera_speed, 1.35).toFixed(2)}"\n`;
      html += `         muted playsinline style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;"></video>\n`;
    } else if (mediaType === "image") {
      html += `  <img id="shot-${idx + 1}"\n`;
      html += `       src="${shotRuntimeUri(shot)}"\n`;
      html += `       data-start="${start}"\n`;
      html += `       data-duration="${shotDuration}"\n`;
      html += `       data-transition="${shot.transition || "cut"}"\n`;
      html += `       style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;" />\n`;
    } else {
      html += `  <div id="shot-${idx + 1}"\n`;
      html += `       data-composition-id="hapa-empty-shot"\n`;
      html += `       data-start="${start}"\n`;
      html += `       data-duration="${shotDuration}"\n`;
      html += `       data-transition="${shot.transition || "cut"}"\n`;
      html += `       data-stems="${(shot.active_stems || []).join(",")}"\n`;
      html += `       style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; background: #000;"></div>\n`;
    }
  });

  html += `\n  <!-- Parallel Visualizer Shader Timeline -->\n`;
  visualizerTimeline.forEach((vis, idx) => {
    const start = finite(vis.start_sec, 0);
    const end = finite(vis.end_sec, start);
    html += `  <div id="vis-${idx + 1}"\n`;
    html += `       data-composition-id="hapa-visualizer"\n`;
    html += `       data-start="${start}"\n`;
    html += `       data-duration="${Math.max(0, end - start).toFixed(1)}"\n`;
    html += `       data-transition="${vis.transition || "cut"}"\n`;
    html += `       data-shader-id="${vis.visualizer_id || "none"}"\n`;
    html += `       style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; pointer-events: none; z-index: 2;"></div>\n`;
  });

  html += `\n  <!-- Lyric Typography Layer -->\n`;
  html += `  <div class="hapa-lyric-layer"\n`;
  html += `       data-composition-id="hapa-lyric-layer"\n`;
  html += `       data-start="0"\n`;
  html += `       data-duration="${duration}"\n`;
  html += `       data-variant="${lyricVariant}"\n`;
  html += `       data-position="${lyricPosition}"\n`;
  html += `       data-style="${lyricStyle}"\n`;
  html += `       data-safe-bottom="${lyricBottom}"\n`;
  html += `       style="position: absolute; bottom: ${lyricBottom}px; width: 100%; text-align: center; z-index: 10;"></div>\n`;
  html += `</div>\n`;
  return html;
}
