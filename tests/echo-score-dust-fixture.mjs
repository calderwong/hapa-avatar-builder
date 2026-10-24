// Shared synthetic Audio Atlas result for Score Dust tests (not a test file).
// Shaped after the public example in the Nanodot report: 204.92 s, ~129.8 BPM,
// seven ranges where label-1 style ranges repeat, lifts near 97.8 s and 171.6 s.
export function atlasFixture() {
  const rate = 48000, duration = 204.92, count = Math.round(duration * rate), source = "a".repeat(64);
  const beatPeriod = 60 / 129.805, beats = [];
  for (let t = 0.12; t < duration; t += beatPeriod) beats.push(t);
  const edges = [0, 9.161, 40.2, 70.5, 97.773, 149.474, 171.615, 197.455, duration];
  const quiet = new Set([0, 5, 7]);
  const regions = edges.slice(0, -1).map((start, i) => ({ id: `master:region:${i}`, start_sample: Math.round(start * rate), end_sample: i === edges.length - 2 ? count : Math.round(edges[i + 1] * rate), label: `Region ${i + 1}`, mean_rms_dbfs: quiet.has(i) ? -30 : -14 }));
  const frames = [];
  for (let t = 0; t < duration; t += 0.25) {
    const region = edges.findIndex((edge, i) => t >= edge && t < edges[i + 1]);
    frames.push({ sample: Math.round(t * rate), novelty: 0, rms_dbfs: quiet.has(region) ? -32 + Math.sin(t) : -14 + Math.sin(t) });
  }
  const observations = [
    ...beats.map((t, i) => ({ id: `master:beat:${i}`, kind: "hapa.audio.beat_candidate", subject_id: "master", start_sample: Math.round(t * rate), end_sample: Math.round(t * rate), shape: "instant" })),
    ...beats.filter((_, i) => i % 4 === 0).map((t, i) => ({ id: `master:downbeat:${i}`, kind: "hapa.audio.downbeat_candidate", subject_id: "master", start_sample: Math.round(t * rate), end_sample: Math.round(t * rate), shape: "instant" })),
  ];
  return {
    run_id: "run-trip", song_id: "song-trip", schema_version: "hapa.audio-atlas.measurements.v1",
    assets: [{ id: "master", status: "ready", source_sha256: source, timeline_id: `pcm:${"b".repeat(64)}:48000:2`, sample_rate_hz: rate, sample_count: count, channels: 2 }],
    observations,
    musical_structure: {
      regions, frames,
      repeats: [{ left_id: "master:region:1", right_id: "master:region:3", similarity: 0.95 }, { left_id: "master:region:3", right_id: "master:region:6", similarity: 0.94 }],
      transitions: [
        { start_sample: Math.round(95.7 * rate), end_sample: Math.round(99.7 * rate), boundary_sample: Math.round(97.773 * rate), kind: "energy_rise_candidate", delta_db: 16 },
        { start_sample: Math.round(147 * rate), end_sample: Math.round(151 * rate), boundary_sample: Math.round(149.474 * rate), kind: "energy_drop_candidate", delta_db: -15 },
        { start_sample: Math.round(169.6 * rate), end_sample: Math.round(173.6 * rate), boundary_sample: Math.round(171.615 * rate), kind: "energy_rise_candidate", delta_db: 15 },
      ],
    },
  };
}
