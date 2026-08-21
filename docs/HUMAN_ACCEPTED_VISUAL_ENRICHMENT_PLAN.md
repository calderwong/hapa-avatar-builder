# Human-Accepted Visual Enrichment — Plan

Machine-derived **palette + description** enrichment for every Human Enricher
"accepted" video, produced for the Echo album director. Approved by Calder
2026-08-21 ("Yeah write it up and start").

## Why

The Echo album director currently scores and recasts clips from technical
identity, orientation, duration, and human triage state only. It has no color
or content signal, so a dark purple clip and a bright amber clip are
interchangeable to it. Two machine-derived, cheaply computed fields fix that:

- **Palette** — 8 median-cut swatches plus luminance, saturation, a 12-bin
  hue histogram, warmth, and chroma share, extracted locally from sampled
  frames. Deterministic and fully offline.
- **Description** — one paragraph of what the clip shows, joined from the
  cheapest trustworthy source (agent optical review first, Echo enrichment
  catalog synopsis second).

These are **telemetry, not direction**. Human-authored direction (grades,
notes, mentions, references) stays in `data/human-video-enrichments.json`
(schema `hapa.human-video-enrichment-store.v1`, truth boundary
"Human-authored direction overlay"). Mixing machine data into that store would
blur its authority, so this work writes a **separate** machine-derived store.

## Scope and verified baselines (2026-08-21)

- Accepted (quick-sort state `accepted`): **3,267**, all `mediaType: video`
  (0 images accepted today; the image extraction path exists for when
  images flow through).
- Locally readable: **3,133** (134 have moved or vanished).
- Readable with a content fingerprint: **1,660**; without (identity =
  path/size/mtime): **1,473**.
- Accepted with an agent optical `proposal.description`: **1,339**
  (prompt `human-enricher-optical-minimal-v3`, model `gpt-5.6-terra`;
  provenance is read from each review record, never assumed).
- Accepted overlapping the Echo enrichment catalog with a `ready` synopsis:
  **186** (small overlap; agent description wins on conflict).
- Description gap (readable, neither source): **1,611** — a known gap, not
  in scope here (see Follow-ups).
- Palette coverage before this work: **0** — no palette extraction existed
  anywhere in the repo (Echo uses dhash/ahash perceptual hashes; the album
  "visual language" palette is design-phase naming; the vision pipeline
  emits labels only).

## Store contract

File: `data/human-video-visual-enrichments.json`
(gitignored; backup-before-write under `data/backups/` per AGENTS.md).

```
{
  schemaVersion: "hapa.human-video-visual-enrichment-store.v1",
  records: [ ... ],
  updatedAt,
  truthBoundary: "Machine-derived visual telemetry. ..."
}
```

Record (`hapa.human-video-visual-enrichment.v1`), keyed by `humanVideoKey`
with the full alias set (`fingerprint:`, `uri:`, `path:`, `asset:`,
`record:` — same identity helpers the dashboard uses):

```
{
  key, aliases, videoId, videoName, mediaType,
  videoIdentity: { recordId, assetId, contentFingerprint, uri, sourcePath },
  palette: {                      // Phase 1
    methodVersion: "local-median-cut-v1",
    swatches: [ { hex, share } x <=8 ],   // descending share, median RGB per box
    luminance, saturation, hueHistogram[12], warmth, chromaShare,
    pixelCount, frameCount,
    source: { sourceIdentity, sampleTimes, sampleTimesBasis,
              sampleFailures, duration, ffmpegVersion }
  } | null,
  description: { text, sourceClass, provenance } | null,   // Phase 2
  createdAt, updatedAt
}
```

`sourceIdentity` is `{ basis: "content-fingerprint" | "file" | "none",
fingerprint, sourcePath, sizeBytes, mtimeMs }`. Content fingerprints win;
path + size + mtime is the fallback for the 1,473 unfingerprinted files.
`sampleFailures` is `0` or an array of `{ at, error }`; a record with any
sample failure is never treated as final and is re-derived on the next run
so a transiently stalled file heals.

Event journal: `data/human-video-visual-enrichment-events.ndjson`
(`hapa.human-video-visual-enrichment-event.v1`), one append-only row per
changed record/stage with `action`, `videoKey`, `stage`, and
`descriptionSourceClass`.

Domain module: `src/domain/human-video-visual-enrichment.js` (pure: store
normalize/upsert, alias resolution, palette math, description joins, source
identity). Tests: `tests/human-video-visual-enrichment.test.mjs`.

## Palette method (Phase 1)

Fully local, deterministic, no network:

1. ffmpeg samples up to **5 evenly-spaced frames** at `duration * (i + 0.5) / 5`
   (single first frame for images; single first frame for videos missing a
   duration). Each frame is scaled to **32×32 area-averaged rgb24 raw**
   (`-ss <t> -i <file> -frames:v 1 -vf scale=32:32:flags=area,format=rgb24
   -f rawvideo -`), 3,072 bytes each.
2. Pixels from all frames are pooled (every frame weighs equally) and
   **median-cut** to 8 swatches. Splitting is fully ordered (most pixels →
   widest channel range → lowest id; split at the median on the widest
   channel), so identical pixels always produce identical boxes. Swatch hex is
   the per-channel median of its box; `share` is box size / total pixels.
3. Color profile over all pooled pixels: mean luminance
   (0.2126R + 0.7152G + 0.0722B, 0–1), mean HSL saturation, 12×30° hue
   histogram over chromatic pixels (sat > 0.15), warmth in −1..1
   (warm hues 330–360 + 0–90 vs cool hues 150–270, balanced → 0), and
   chroma share. All floats rounded to 4 decimals.

Per-frame robustness: each extraction has a 60 s timeout; individual frame
failures are tolerated (the palette is built from the frames that succeeded
and records `sampleFailures`), and a target fails only when zero frames
extract. `stat` lookups during target derivation are bounded at 10 s so a
wedged volume cannot wedge the worker pool.

## Description sources (Phase 2)

Cheapest trustworthy source first, recorded with provenance:

1. **`agent-optical`** — the review's `proposal.description` from
   `data/human-video-agent-reviews.json`, joined through the dashboard's
   alias join (same path as the Human Enricher UI). Provenance: review id,
   model, promptVersion, review status — all read from the record.
2. **`echo-enrichment`** — `synopsis` from
   `artifacts/echo-video-enrichment-v1/catalog.sqlite3`
   (`enrichments.status = 'ready'` joined to `videos.sha256`), used only
   where no agent description exists.

Upserts are idempotent: a description only writes when its text or source
class actually changed, so reruns and source refreshes are safe.

## CLI

```
node scripts/enrich-human-accepted-visuals.mjs [--stage palette|description|all]
                                               [--apply] [--limit N]
                                               [--concurrency N]
                                               [--repo-root DIR] [--output DIR]
```

- Without `--apply` the run is a dry run: it derives targets, reports what
  would change, and never writes the store or the event journal (the run
  report under `work/` is still written and is gitignored).
- Targets are exactly the Human Enricher accepted videos that are locally
  readable, derived with the same dashboard join as
  `scripts/append-human-accepted-echo-direction-variants.mjs`, in stable
  key-sorted order (`--limit` takes the first N).
- Resume safety: a stored palette whose source identity still matches the
  current file is skipped without re-extracting; descriptions re-derive but
  only write on change. A rerun over unchanged media leaves the store bytes
  identical and appends no events.
- Run reports land in `work/human-visual-enrichment/` (gitignored):
  per-stage processed/skipped/kept/failed, failures, store hash, and
  coverage counts.

## Phases and status log

- **Phase 1 — Palette extraction.** Status: *complete* — see below.
- **Phase 2a/b — Description joins** (agent optical + Echo catalog reuse).
  Status: *complete* — see below.
- **Phase 3 — Director candidate extension.** Later, separate change:
  extend `buildHumanAcceptedDirectorCandidates` with palette/description
  fields and optional palette-aware recast scoring. Not in this commit.
- **Phase 4 — Verification.** Double-run determinism, 10-sample spot check,
  coverage report, focused tests, full suite, build. Status: *complete*.

### Status log

- 2026-08-21 — Plan approved and written. Domain module, tests, and script
  landed. Focused tests: 16/16 pass.
- 2026-08-21 — Determinism verified: `--stage palette --limit 10 --apply`
  run twice; the second run skipped all 10 and the store file is byte-identical
  (sha256 `20c03cdc…` both times); 10-sample spot check of stored palettes
  shows coherent swatches/luminance/warmth for each clip.
- 2026-08-21 — Full palette run: 3,123 processed + 10 skipped (the
  determinism-verified set) + 0 failures; 15,615 ffmpeg extractions at
  concurrency 8 finished in about 2.5 minutes. A transiently stalled volume
  (Downloads) never wedged the run: bounded stat and per-frame timeouts kept
  every target readable.
- 2026-08-21 — Description run: 1,522 processed (1,339 `agent-optical` +
  183 `echo-enrichment`) + 1,611 skipped (the known description gap) + 0
  failures; the echo catalog held 11,561 ready synopses and contributed where
  no agent description existed. Idempotency re-run: 3,133 skipped, store
  bytes identical, no events.
- 2026-08-21 — Coverage: 3,133/3,133 readable accepted have a palette
  (100%); 1,522/3,133 (48.6%) have a description; 1,611 remain the
  documented gap.
- 2026-08-21 — Verification: focused suite 16/16; full `npm test` 1745/1753
  with the same 8 documented pre-existing data-state failures as the
  pre-change baseline (1737 total then, +16 for this module); `npm run
  build` passes with the same delivery receipt as the baseline
  (sha256:112e48ef).

## Follow-ups (not in this task)

- The **~1,611 readable** accepted clips with no description from either
  source need the optical campaign retargeted to prioritize accepted (owned
  by the Human Enricher optical session) or a local Ollama vision pass.
- **UI parity**: surfacing palettes/descriptions in `HumanEnricherView`
  (that file is dirty in the other session and was deliberately left
  untouched here).
- **Phase 3**: feed palette/description into director candidates and recast
  scoring (e.g., prefer palette-contrast across consecutive shots).
- Images: 0 accepted today; the extractor's single-frame image path is
  ready for when images are accepted, but the dashboard video list is
  video-only, so image acceptance needs a dashboard change first.
