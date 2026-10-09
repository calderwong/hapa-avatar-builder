# Whole-song lyric timing with the Audio Atlas

Status: active protocol (2026-10-09, Calder). The Audio Atlas is the owner of Echo song
understanding and measured lyric timing. It runs local MLX models on Apple Silicon. Do not
regress to the older Hapa Music Viz `enrich_suno_playlist_lyrics.py` / whisper.cpp / ggml path
because it looks simpler; that path is **legacy** and is only kept so previously accepted
timing remains readable.

## Models (local, already configured; nothing is downloaded at run time)

| Purpose | Model | Config |
| --- | --- | --- |
| Transcription with word timestamps | `mlx-community/whisper-large-v3-mlx-4bit` (MLX Whisper) | `data/audio-atlas/local-model.json` |
| Forced alignment of the supplied lyrics | `mlx-community/Qwen3-ForcedAligner-0.6B-8bit` (MLX Audio) | `data/audio-atlas/alignment-model.json` |

Both run against the song's **isolated Lead Vocals / Vocals stem** from its single current
stem set (`src/domain/echo-stem-set.js`); never against every stem file or both formats.

## Procedure (one song)

```sh
# 1. Atlas analysis with transcription (structure, harmony, beats, CLAP, pitch, MLX Whisper words)
node cli/audio-atlas.mjs analyze SONG_ID --transcribe --beats --acoustic --pitch-source=stem-N

# 2. Window the canonical lyrics with the Atlas transcript, then forced-align every window
node scripts/atlas-lyric-timing.mjs plan --song=SONG_ID --out=WORK_DIR
node scripts/atlas-lyric-timing.mjs align --plan=WORK_DIR/plan.json      # resumable; one Atlas job per ≤30 s window
node scripts/atlas-lyric-timing.mjs assemble --plan=WORK_DIR/plan.json --candidates=WORK_DIR/candidates

# 3. Promote through the shared gate (dry run first), then sync Song Card + Director project
HAPA_ECHO_LYRIC_CANDIDATE_DIR=WORK_DIR/candidates \
HAPA_ECHO_LYRIC_TIMING_DESTINATION=$PWD/data/echo-lyric-sources/lyric_timings \
HAPA_ECHO_LYRIC_CANDIDATE_REPORT=WORK_DIR/promotion-report.json \
node scripts/promote-echo-lyric-timing-candidates.mjs            # then repeat with --apply
node scripts/sync-dear-papa-lyric-timings.mjs --registry-track-ids=SUNO_ID   # then repeat with --apply
```

For an album batch, run step 1 through the Atlas album coordinator
(`work/atlas-album-pass-*/batch/atlas-batch.mjs`) and steps 2–3 per song.

## What each step guarantees

- **plan** maps every canonical lyric line (exact Song Card lyric bytes, so `lyricsSha256`
  equals `lyrics.sha256`) onto MLX Whisper word candidates by longest common subsequence,
  interpolates the few unmatched lines between anchored neighbours, and groups lines into
  windows of at most 30 s (the Atlas aligner's excerpt limit) with 1 s padding.
- **align** submits each window to the canonical Atlas owner (`createAudioAtlas().start`) with
  `alignment: {sourceId, startSeconds, endSeconds, text}`, waits, and records the run ID.
  Each window is an ordinary Atlas job: same cache identity, provenance, cancellation and
  review surfaces. Re-running resumes from the first incomplete window.
- **assemble** maps every Qwen3 word interval back to its lyric line by character offset,
  interpolates zero-duration / unsupported words inside their line (`matched: false`), clamps
  any line overlap, and writes a `hapa.suno_playlist_lyric_timing.v1` file plus `.stt.json`
  sidecar with engine `audio-atlas-mlx`.
- **confidence** = aligned-word ratio × agreement ratio, where agreement is the share of aligned
  words whose start lies within ±1 s of the same word from MLX Whisper. It is cross-model machine
  evidence, not human review. `low_match_ratio` (< 0.6) and `many_unmatched_lines` (> 20 %)
  warnings block promotion exactly as before.

## Promotion and supersession

`src/domain/echo-lyric-promotion.js` accepts `audio-atlas-mlx` as a measured engine alongside the
legacy whisper.cpp engines; every other gate (≥ 0.60 confidence, interval validity, sidecars,
audio/lyric hashes) is unchanged. An accepted Atlas candidate supersedes accepted legacy
whisper.cpp timing for the same lyrics (`audio-atlas-supersedes-legacy-engine`), because the two
engines' confidence scales are not comparable. Promotion backs up the replaced files.

`scripts/sync-dear-papa-lyric-timings.mjs` reads `data/echo-lyric-sources/lyric_timings/` first, so
promoted Atlas timing reaches the Song Card and Director project even for songs that are not yet
in the Suno playlist snapshot.

## Limits

English only (Atlas aligner contract). A forced aligner can place supplied words on silence; the
Atlas RMS abstention and the MLX Whisper agreement term are the guards, not proof of performance.
No syllable or phoneme timing. Human review of boundaries remains open.
