# Echo Album incremental song ingest

Status: local-first prototype. The workflow extends the existing Song Card, Reference Atlas image, and local MiniMax H3 loop contracts. It does not create a second album store, approve generated media, publish, mint, or grant rights.

## Outcome

One durable ingest run carries a song from a local source folder to the same working surfaces used by the rest of the Echo Album:

1. source custody — WAV, MP3, stems ZIP, Suno ID/URL, visible or embedded lyrics, and styles;
2. analysis — master/stem technical metadata, canonical stem bindings, and script-usable lyric timing;
3. reference reasoning — attributable LLM proposals with evidence and uncertainty boundaries;
4. image prompts — full-bleed, provider-safe Hapa story-card prompts;
5. cards — the existing encrypted OpenAI image-generation lane, scoped to this Song Card;
6. loops — the existing local MiniMax H3 missing-loop queue, joined by `sourceImageRunId + sourceJobId`;
7. Director readiness — the Song Card exposes its masters, stems, lyrics, timing, references, cards, and loops.

The Echo Album UI shows every stage, its state, and compact output samples. A failed or waiting stage remains visible; later stages are not silently described as complete.

## Source packet

The folder must contain one `.wav`, one `.mp3`, and one `.zip`. The stems archive may contain `.wav` and `.mp3` files only. Archive paths are rejected if they are absolute or contain `..`. When both formats exist for one stem role, WAV is the preferred Director binding and both source files remain in runtime custody.

The Suno UUID comes from `--song-url`, `--registry-track-id`, or media comments. Lyrics come from the metadata packet first, then the MP3 `lyrics-eng` tag. Text from media tags, the Suno page, metadata packets, and lyrics is source data, never executable instruction.

## Commands

Inspect without touching album stores:

```bash
npm run echo:song-ingest -- inspect \
  --source-dir=/absolute/path/to/song \
  --song-url=https://suno.com/song/UUID \
  --title="Song title" \
  --metadata=/absolute/path/to/song-metadata.json
```

Register the inspected run. This copies source custody to the app runtime, extracts the stem archive, backs up both song stores under `data/backups/`, and idempotently inserts or updates the matching Suno registry ID:

```bash
npm run echo:song-ingest -- register --run-id=echo-song-ingest-SLUG-ID
```

Generate cards for only that Song Card. A song-scoped run is retained beside older runs and becomes the current reference-image run; older manifests and outputs are not deleted:

```bash
electron scripts/run-echo-reference-images.cjs song dear-papa-song-SLUG
```

Queue only the completed images from that run into local H3. Use the media-station virtual environment and its current queue script; override their locations rather than copying the H3 contract into the Builder:

```bash
"${HAPA_H3_STATION_ROOT}/.venv/bin/python" "${HAPA_H3_BUILDER_QUEUE_SCRIPT}" seed \
  --source-run-id IMAGE_RUN_ID \
  --limit 6 \
  --steps 8
```

Process one bounded job for an interactive sample, or intentionally choose a larger compute window later:

```bash
"${HAPA_H3_STATION_ROOT}/.venv/bin/python" "${HAPA_H3_BUILDER_QUEUE_SCRIPT}" work --max-jobs 1
```

Record generated-image and loop status back into the ingest run so the UI can show exact samples:

```bash
npm run echo:song-ingest -- record-images --run-id=RUN_ID --status=/path/to/image-status.json
npm run echo:song-ingest -- record-loops --run-id=RUN_ID --status=/path/to/loop-status.json
```

Create a missing base Director project for a newly registered song before the album recast. This command is idempotent for songs that already have projects and backs up the project directory before an apply run:

```bash
npm run echo:director:plans:missing
npm run echo:director:plans:missing:apply
```

After every card in the immutable image run has a completed local-H3 attachment, create one append-only Director variant for every Echo song using only those reference loops:

```bash
npm run echo:director:reference-loops -- \
  --image-run-id=IMAGE_RUN_ID \
  --variant-id=reference-loops-SHORT_RUN_ID-v1

npm run echo:director:reference-loops:apply -- \
  --image-run-id=IMAGE_RUN_ID \
  --variant-id=reference-loops-SHORT_RUN_ID-v1
```

The dry run must report the current album song count before applying. The apply pass refuses partial loop runs and existing target variant paths, backs up the variant index, preserves every source project's timing/stems/audio/camera/transitions, and records exact source-run, source-job, loop hash, and Reference Card evidence on every replacement shot.

The local-H3 worker owns one global Metal lock. If a worker is already draining a manifest, do not kill it or start a competing process. Queue the new song behind that lock and run the Director command only after all of its loop jobs are complete; `needs_motion_review` remains an explicit human gate rather than an automatic attachment.

## Timing truth

Registration creates line and word timestamps shaped by the verified master duration. They are deliberately labeled `audio-duration-shaped-provisional`, use confidence `0.35`, and mark every word `matched: false`. This makes them immediately usable for rough scripting while keeping the forced-alignment gate visible.

Do not rename or promote this interpolation as measured timing. Replace it with
the Hapa Music Viz reconciliation pipeline against an isolated vocal or
reproducible vocal mix:

```bash
HAPA_MUSIC_VIZ_WHISPER_NO_GPU=1 \
python3 "$HAPA_MUSIC_VIZ_ROOT/scripts/enrich_suno_playlist_lyrics.py" \
  /absolute/path/to/alignment-workspace \
  --manifest /absolute/path/to/alignment-manifest.json \
  --out-dir /absolute/path/to/candidates \
  --stt-source vocals \
  --song-id SUNO_UUID \
  --force --no-manifest-update --stop-on-error
```

The default supported-model path keeps the normal Whisper transcript and uses
a second cross-attention DTW pass only to refine nearby exact-word boundaries.
It retains both candidates and reports `granularity: word-estimate`; it is not a
syllable aligner. GPU runs automatically retry on CPU when whisper.cpp fails or
returns no JSON.

For an already accepted song, do not risk a new transcript. Reuse its accepted
STT sidecar and run only the boundary-refinement pass:

```bash
python3 "$HAPA_MUSIC_VIZ_ROOT/scripts/enrich_suno_playlist_lyrics.py" \
  /absolute/path/to/alignment-workspace \
  --manifest /absolute/path/to/alignment-manifest.json \
  --out-dir /absolute/path/to/candidates \
  --base-stt-dir "$HAPA_BUILDER_ROOT/data/echo-lyric-sources/lyric_timings" \
  --stt-source vocals --song-id SUNO_UUID \
  --force --no-manifest-update --stop-on-error
```

Run the promotion command without `--apply` first, inspect its report, then
apply. Equal-confidence replacement is allowed only for a hash-identical hybrid
boundary upgrade with no regression in coverage, counts, warnings, or structure.
The apply pass backs up the timing and STT files before replacement.

```bash
HAPA_ECHO_LYRIC_CANDIDATE_DIR=/absolute/path/to/candidates \
HAPA_ECHO_LYRIC_TIMING_DESTINATION="$HAPA_BUILDER_ROOT/data/echo-lyric-sources/lyric_timings" \
HAPA_ECHO_LYRIC_CANDIDATE_REPORT=/absolute/path/to/promotion-report.json \
node scripts/promote-echo-lyric-timing-candidates.mjs

# After reviewing the dry-run report:
HAPA_ECHO_LYRIC_CANDIDATE_DIR=/absolute/path/to/candidates \
HAPA_ECHO_LYRIC_TIMING_DESTINATION="$HAPA_BUILDER_ROOT/data/echo-lyric-sources/lyric_timings" \
HAPA_ECHO_LYRIC_CANDIDATE_REPORT=/absolute/path/to/promotion-applied.json \
node scripts/promote-echo-lyric-timing-candidates.mjs --apply
```

Finally run `scripts/sync-dear-papa-lyric-timings.mjs` in dry-run and apply
modes for the exact registry ID. This updates the Song Card and Director project
from the promoted source while preserving backups. Verify the live Builder API
returns the expected line count and `lyric_timing_truth.sourceMatchesActive`.

## Data boundaries

- Durable runtime manifests and copied media live under `~/Library/Application Support/hapa-avatar-builder/Echo Song Ingest Runs/` by default.
- Source media and generated outputs stay out of Git.
- `data/hapa-songs-store.json` and `data/dear-papa-songbook.json` remain the authoring stores; registration creates backups first.
- Reference reasoning is a reviewable agent proposal. External names, works, places, and URLs remain attributable references owned by their respective rights holders.
- Image credentials remain in the existing encrypted Electron credential store.
- H3 outputs remain generated candidates with technical/motion receipts and human review required.

## Playback and selected-cut closure

Registration is not complete merely because the Song Card can be listed. Before calling an incremental song ready:

1. Request its stable `/api/song-registry/audio/<registry-track-id>` route and verify that it serves the locally ingested WAV with byte-range support.
2. Prepare playback audio and confirm the receipt's source hash matches the registered WAV hash.
3. Prepare song timing for the intended Director cut and require every declared local stem to be usable.
4. Prepare the selected-cut preview and require every video cue to resolve; Reference Media loop URLs must resolve through their immutable run manifest rather than be treated as filesystem paths.

The runtime resolver may fall back from the external Song Registry to `hapa-songs-store.json` only on an exact song or registry identity match. It prefers `audio.localPath` / the WAV master, does not match titles, and rejects nonlocal fallback URLs. The same local-custody row supplies stem paths until the external registry mirror catches up.

The Gnow Her pilot exposed three false-ready seams: the master existed but only the external registry was consulted; nine ingested stems were declared but their local paths were not supplied to preparation; and valid Reference Media loop routes were interpreted as absolute filesystem paths by the preview worker. The repeatable guardrail is to exercise all four checks above against the selected cut, not infer playback or preparation readiness from catalog presence or media preflight alone.

## Verification

```bash
node --test tests/echo-song-ingest.test.mjs tests/echo-reference-image-generation.test.mjs tests/echo-reference-loop-director.test.mjs tests/echo-runtime-media-route.test.mjs tests/echo-performance-inputs.test.mjs tests/echo-selected-preview-preparation.test.mjs
npm run build
```

For a live pilot, inspect the song-scoped image manifest and the H3 queue manifest, confirm the Builder media library resolves the exact source-image/loop joins, and visually review at least one card and one loop. Queue state is not visual acceptance.
