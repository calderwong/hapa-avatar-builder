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

Do not rename or promote this interpolation as measured timing. A later vocal-stem/Whisper alignment must pass the existing Echo timing promotion checks before it replaces the provisional source.

## Data boundaries

- Durable runtime manifests and copied media live under `~/Library/Application Support/hapa-avatar-builder/Echo Song Ingest Runs/` by default.
- Source media and generated outputs stay out of Git.
- `data/hapa-songs-store.json` and `data/dear-papa-songbook.json` remain the authoring stores; registration creates backups first.
- Reference reasoning is a reviewable agent proposal. External names, works, places, and URLs remain attributable references owned by their respective rights holders.
- Image credentials remain in the existing encrypted Electron credential store.
- H3 outputs remain generated candidates with technical/motion receipts and human review required.

## Verification

```bash
node --test tests/echo-song-ingest.test.mjs tests/echo-reference-image-generation.test.mjs tests/echo-reference-loop-director.test.mjs
npm run build
```

For a live pilot, inspect the song-scoped image manifest and the H3 queue manifest, confirm the Builder media library resolves the exact source-image/loop joins, and visually review at least one card and one loop. Queue state is not visual acceptance.
