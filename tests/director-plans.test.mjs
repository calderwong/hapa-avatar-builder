import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PROJECTS_DIR = "./data/music-video-projects";

test("compiled music video projects are valid and structurally sound", () => {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return;
  }
  const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith(".json"));
  assert.ok(files.length > 0, "Should have compiled at least one project blueprint");

  files.forEach(file => {
    const content = fs.readFileSync(path.join(PROJECTS_DIR, file), "utf-8");
    let payload;
    try {
      payload = JSON.parse(content);
    } catch (e) {
      assert.fail(`File ${file} is not valid JSON: ${e.message}`);
    }

    assert.ok(payload.music_video_project, `Project file ${file} must have music_video_project root`);
    const proj = payload.music_video_project;

    assert.ok(proj.song_id, `${file} missing song_id`);
    assert.ok(proj.song_title, `${file} missing song_title`);
    assert.ok(proj.audio_id || proj.registry_track_id, `${file} missing real audio identity`);
    assert.ok(
      proj.hyperframe_script.includes(encodeURIComponent(proj.audio_id || proj.registry_track_id || proj.song_id)),
      `${file} HyperFrames script must reference the resolved audio identity`
    );
    assert.ok(proj.perspective, `${file} missing perspective`);
    assert.ok(proj.duration > 0, `${file} duration must be positive`);
    assert.ok(Array.isArray(proj.timeline), `${file} timeline must be an array`);
    assert.ok(proj.hyperframe_script, `${file} missing hyperframe_script`);
    assert.ok(proj.lyric_variant, `${file} missing lyric_variant`);
    assert.ok(["phrase-window", "signal-karaoke", "stacked-echo", "orbit-caption", "scanline-ribbon"].includes(proj.lyric_variant), `${file} invalid lyric_variant: ${proj.lyric_variant}`);
    assert.ok(["bottom-center", "top-center", "center", "lower-left", "lower-right", "upper-left", "upper-right", "side-right"].includes(proj.lyric_position || "bottom-center"), `${file} invalid lyric_position: ${proj.lyric_position}`);
    assert.ok(["neon-cyan", "magenta-glow", "gold-caption", "paper-white", "minimal-subtitle"].includes(proj.lyric_style || "neon-cyan"), `${file} invalid lyric_style: ${proj.lyric_style}`);
    if (Array.isArray(proj.timed_lyrics) && proj.timed_lyrics.length > 0) {
      const finalLyric = proj.timed_lyrics[proj.timed_lyrics.length - 1];
      const exactSourceClaim = proj.lyric_timing_heal?.timingSource === "dear-papa-playlist-lyric-timing"
        || proj.song_edit_map?.provenance?.lyricTimingSource === "dear-papa-playlist-lyric-timing";
      const timingSourcePath = proj.lyric_timing_heal?.timingPath || proj.song_edit_map?.provenance?.lyricTimingPath || "";
      const isSourceTiming = exactSourceClaim && Boolean(timingSourcePath);
      if (exactSourceClaim) {
        assert.ok(timingSourcePath, `${file} exact timed lyrics must keep timing sidecar path provenance`);
      }
      if (isSourceTiming) {
        assert.ok(finalLyric.end <= proj.duration + 0.1, `${file} source timed lyrics must stay inside song duration`);
        assert.ok(proj.timed_lyrics.every((line) => Number.isFinite(Number(line.start)) && Number.isFinite(Number(line.end)) && line.end >= line.start), `${file} source timed lyrics must preserve numeric start/end timing`);
        const expectedRegistryTrackId = proj.registry_track_id || proj.audio_id || "";
        const timingRegistryTrackId = proj.lyric_timing_heal?.registryTrackId || proj.song_edit_map?.provenance?.lyricTimingRegistryTrackId || "";
        assert.equal(timingRegistryTrackId, expectedRegistryTrackId, `${file} source lyric timing must match the project registry track`);
        const sourceHash = proj.lyric_timing_truth?.timingSourceSha256 || proj.lyric_timing_heal?.timingSourceSha256 || "";
        const activeHash = proj.lyric_timing_truth?.activeTimingSha256 || proj.lyric_timing_heal?.activeTimingSha256 || "";
        assert.ok(sourceHash, `${file} source lyric timing must retain a content hash`);
        assert.equal(activeHash, sourceHash, `${file} active lyric timing bytes must match the cited source bytes`);
        const alignmentTruth = proj.lyric_timing_truth?.status || proj.lyric_timing_truth?.qualityStatus || "";
        assert.ok(
          ["verified_source_content", "source_aligned_needs_review", "source-aligned", "source-aligned-needs-review"].includes(alignmentTruth),
          `${file} source lyric timing must expose its alignment-quality truth instead of claiming full-song coverage`
        );
      } else {
        assert.ok(finalLyric.end >= proj.duration * 0.9, `${file} timed lyrics should cover the later song arc`);
        const maxWords = Math.max(...proj.timed_lyrics.map((line) => String(line.text || "").split(/\s+/).filter(Boolean).length));
        assert.ok(maxWords <= 10, `${file} lyric lines should be phrase-sized after timing heal`);
        if (proj.lyric_timing_truth) {
          assert.equal(proj.lyric_timing_truth.status, "usable_inferred_missing_path", `${file} downgraded timing must carry an explicit inferred truth status`);
          assert.ok(proj.lyric_timing_truth.warnings?.includes("do-not-label-exact"), `${file} downgraded timing must preserve its exact-claim warning`);
        }
      }
      assert.equal(proj.lyric_timing_heal?.schemaVersion, "hapa.echos.lyric-timing-heal.v1", `${file} missing lyric timing heal provenance`);
    }
    
    assert.ok(proj.media_density_telemetry, `${file} missing media_density_telemetry`);
    const telemetry = proj.media_density_telemetry;
    assert.equal(typeof telemetry.total_videos, "number", `${file} total_videos must be a number`);
    assert.equal(typeof telemetry.total_visualizers, "number", `${file} total_visualizers must be a number`);
    assert.equal(typeof telemetry.videos_per_sec, "number", `${file} videos_per_sec must be a number`);
    assert.equal(typeof telemetry.visualizers_per_sec, "number", `${file} visualizers_per_sec must be a number`);

    assert.ok(proj.song_edit_map, `${file} missing song_edit_map`);
    assert.equal(proj.song_edit_map.schemaVersion, "hapa.echos.song-edit-map.v1", `${file} invalid song_edit_map schema`);
    assert.ok(proj.song_edit_map.audioTelemetry, `${file} missing edit-map audio telemetry`);
    assert.equal(proj.song_edit_map.audioTelemetry.duration_sec, Number(proj.duration.toFixed(2)), `${file} edit-map duration must match project duration`);
    assert.equal(proj.song_edit_map.provenance.durationSource, "hapa-songs-store.audio.duration", `${file} must use registry duration metadata`);
    if ((proj.stems_available || []).length > 0) {
      assert.ok(proj.song_edit_map.audioTelemetry.stemCount > 0, `${file} must use available registry stem metadata`);
      assert.equal(proj.song_edit_map.provenance.stemSource, "hapa-songs-store.stems", `${file} must identify registry stem source`);
    } else {
      assert.equal(proj.song_edit_map.provenance.stemSource, "none", `${file} must truthfully mark missing local stems`);
    }
    const usesExactTiming = proj.song_edit_map.provenance.lyricTimingSource === "dear-papa-playlist-lyric-timing";
    assert.ok(Array.isArray(proj.song_edit_map.sections) && proj.song_edit_map.sections.length >= (usesExactTiming ? 1 : 3), `${file} must include lyric/audio-derived sections`);
    if (!usesExactTiming) {
      assert.notEqual(proj.song_edit_map.sections.length, 6, `${file} must not use the old fixed six-section template`);
    }
    assert.ok(Array.isArray(proj.song_edit_map.editPulses), `${file} missing edit pulses`);
    assert.equal(proj.song_edit_map.editPulses.length, (proj.timed_lyrics || []).length, `${file} edit pulses must be derived from healed lyric lines`);
    assert.ok(proj.song_edit_map.editPulses.every((pulse) => pulse.source === "lyric-line-start"), `${file} edit pulses must be lyric-derived`);

    assert.ok(proj.canon_affordance_graph, `${file} missing canon_affordance_graph`);
    assert.equal(proj.canon_affordance_graph.schemaVersion, "hapa.echos.song-canon-affordance-graph.v1", `${file} invalid canon graph schema`);
    assert.ok(proj.canon_affordance_graph.character?.avatarName, `${file} missing graph character`);
    assert.ok(Array.isArray(proj.canon_affordance_graph.motifs) && proj.canon_affordance_graph.motifs.length > 0, `${file} missing graph motifs`);
    assert.ok(Array.isArray(proj.canon_affordance_graph.sceneHooks) && proj.canon_affordance_graph.sceneHooks.length > 0, `${file} missing graph scene hooks`);

    // Validate timeline continuity
    let lastEnd = 0;
    proj.timeline.forEach((shot, idx) => {
      assert.equal(shot.start_sec, lastEnd, `${file} shot ${idx} start_sec must align with previous end_sec`);
      assert.ok(shot.end_sec > shot.start_sec, `${file} shot ${idx} duration must be positive`);
      assert.ok(shot.media_id, `${file} shot ${idx} missing media_id`);
      assert.ok(Array.isArray(shot.active_stems), `${file} shot ${idx} active_stems must be an array`);
      assert.ok(Array.isArray(shot.audio_bindings), `${file} shot ${idx} audio_bindings must be an array`);
      assert.ok(["cut", "crossfade", "scanline-dissolve", "fade-in", "fade-out"].includes(shot.transition), `${file} shot ${idx} invalid transition: ${shot.transition}`);
      assert.ok(["auto", "static", "slow-push-in", "slow-pull-out", "pan-up", "pan-down", "pan-up-left", "pan-up-right", "pan-down-left", "pan-down-right", "pan-left", "pan-right", "tilt-up", "tilt-down", "drift-diagonal", "handheld-float"].includes(shot.camera_motion || "auto"), `${file} shot ${idx} invalid camera motion`);
      assert.ok(Number.isFinite(Number(shot.camera_intensity ?? 1)), `${file} shot ${idx} camera intensity must be numeric`);
      assert.ok(Number.isFinite(Number(shot.camera_speed ?? 1)), `${file} shot ${idx} camera speed must be numeric`);
      if (shot.media_id !== "none") {
        assert.ok(proj.hyperframe_script.includes("data-camera-motion"), `${file} HyperFrames script must export camera motion data`);
        assert.ok(proj.hyperframe_script.includes("data-camera-speed"), `${file} HyperFrames script must export camera speed data`);
      }
      lastEnd = shot.end_sec;
    });

    assert.ok(Math.abs(lastEnd - proj.duration) < 0.1, `${file} timeline end (${lastEnd}) must match project duration (${proj.duration})`);

    // Validate visualizer timeline continuity
    assert.ok(Array.isArray(proj.visualizer_timeline), `${file} visualizer_timeline must be an array`);
    let lastVisEnd = 0;
    proj.visualizer_timeline.forEach((vis, idx) => {
      assert.equal(vis.start_sec, lastVisEnd, `${file} visualizer ${idx} start_sec must align with previous end_sec`);
      assert.ok(vis.end_sec > vis.start_sec, `${file} visualizer ${idx} duration must be positive`);
      assert.ok(vis.visualizer_id, `${file} visualizer ${idx} missing visualizer_id`);
      assert.ok(vis.visualizer_title, `${file} visualizer ${idx} missing visualizer_title`);
      assert.ok(["cut", "crossfade", "scanline-dissolve", "fade-in", "fade-out"].includes(vis.transition), `${file} visualizer ${idx} invalid transition: ${vis.transition}`);
      lastVisEnd = vis.end_sec;
    });
    assert.ok(Math.abs(lastVisEnd - proj.duration) < 0.1, `${file} visualizer timeline end (${lastVisEnd}) must match project duration (${proj.duration})`);
  });
});
