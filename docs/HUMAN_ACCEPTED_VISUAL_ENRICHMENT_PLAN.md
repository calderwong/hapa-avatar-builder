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

## Gap closure (Phase 5)

After Phase 2 two gaps remained: **1,611 readable** accepted videos with no
description (none in the Echo catalog, no agent review) and **134
unreadable** accepted videos (source file gone) with no palette. Phase 5
closes both locally:

- **Description via local Ollama vision.** For every accepted video that
  has no stored description and no agent review, the script extracts up to
  3 frames (0.1 s / 50% / duration−0.3 s; first frame when no duration),
  scales each to a 768 px JPEG, and asks a local vision model (`qwen3.5:27b`
  by default) for one short paragraph. `think: false` is load-bearing:
  qwen3.5 is a thinking model and returns empty `content` otherwise. The
  result is stored with a new `sourceClass: "local-vision"` and provenance
  `{ provider: "ollama", model, promptVersion: "local-vision-v1",
  frameSource: "video-frames" | "thumbnail", frameCount }`.
  Authority ladder: `agent-optical` > `local-vision` > `echo-enrichment` —
  a future agent optical review of the same clip replaces the local-vision
  text on the next run, so the local pass is a floor, not a ceiling. Existing
  agent/echo descriptions are never re-derived. For the 134 file-gone
  videos the single surviving dashboard thumbnail is described instead
  (`frameSource: "thumbnail"`, one frame).
- **Palette via thumbnail surrogate.** When the source file is gone but a
  dashboard thumbnail survives, the palette is sampled from the thumbnail
  (single 32×32 area-averaged frame) with
  `frameSource: "thumbnail"` / `sampleTimesBasis: "thumbnail"` provenance so
  consumers can tell a surrogate palette apart from a file-derived one.

Self-healing rules (domain module; `HUMAN_VIDEO_PALETTE_FRAME_SOURCES` and
two stability predicates):

- `paletteStillCurrent(storedSource, currentIdentity, { realFileReadable })`
  — a stored palette is current when its `sourceIdentity` matches the
  current file identity and it has no `sampleFailures`; a surrogate
  (`frameSource` ≠ `video-file`, e.g. `thumbnail`) palette is superseded the
  moment the real file returns and is re-derived from the file.
- `localVisionDescriptionStable(stored, { model, promptVersion },
  { realFileReadable })` — a stored `local-vision` description is current
  when its provenance matches the run's model + prompt version (config-based
  idempotency for non-deterministic LLM text); a thumbnail-derived
  description is re-derived from real frames when the file returns, and a
  description from an older model config is re-derived under the newer one.

Targets are now **all** accepted videos whose media is either locally
readable or backed by a surviving thumbnail: 3,133 readable + 134 thumbnail
surrogates = 3,267 (every accepted video).

## CLI

```
node scripts/enrich-human-accepted-visuals.mjs [--stage palette|description|all]
                                               [--apply] [--limit N]
                                               [--concurrency N]
                                               [--no-vision] [--vision-model NAME]
                                               [--vision-url URL] [--vision-concurrency N]
                                               [--repo-root DIR] [--output DIR]
```

- Without `--apply` the run is a dry run: it derives targets, reports what
  would change, and never writes the store or the event journal (the run
  report under `work/` is still written and is gitignored).
- Targets are the Human Enricher accepted videos whose media is locally
  readable **or** backed by a surviving thumbnail (file-gone surrogates),
  derived with the same dashboard join as
  `scripts/append-human-accepted-echo-direction-variants.mjs`, in stable
  key-sorted order (`--limit` takes the first N).
- `--no-vision` disables the local-vision description fallback (agent/echo
  sources only). `--vision-model` (default `qwen3.5:27b`), `--vision-url`
  (default `http://127.0.0.1:11434`), and `--vision-concurrency` (default 8)
  configure the Ollama call. The model is probed at start and asked to
  unload (`keep_alive: 0`) after the description stage. Ollama serializes
  per model, so `--vision-concurrency` feeds its internal queue.
- Resume safety: a stored palette whose source identity still matches the
  current file is skipped without re-extracting (a thumbnail-surrogate
  palette is re-derived from the file the moment the file returns); stored
  local-vision descriptions are skipped when their provenance matches the
  run's model + prompt version; descriptions only write on change. A rerun
  over unchanged media leaves the store bytes identical and appends no
  events.
- Run reports land in `work/human-visual-enrichment/` (gitignored):
  per-stage processed/skipped/kept/failed, failures, store hash, and
  coverage counts.

## Director integration (Phase 3)

The Echo album director (Human Enricher accepted path) consumes the machine
derived telemetry:

- **Candidate join** —
  `scripts/append-human-accepted-echo-direction-variants.mjs` loads
  `data/human-video-visual-enrichments.json` and builds a one-time
  `buildVisualEnrichmentAliasIndex` (key/videoId/aliases, lowercased).
  `buildHumanAcceptedDirectorCandidates` attaches `visualPalette` (color
  profile + swatches, no extraction provenance) and `visualDescription`
  (`text` + `sourceClass`) to every accepted candidate it can resolve.
- **Soft selection signal** — in `recastBalancedEchoDirectorProject`, the
  combined score is `0.55·descriptionAffinity + 0.45·paletteContrast`,
  quantized to 4%. Description affinity = fraction of the shot's
  musical/camera context tokens (section, stems, camera motion, transition)
  present in the candidate's description; palette contrast = warmth +
  luminance + hue-histogram distance from the previously selected clip.
  The signal is a **tie-breaker after** the coverage ledger, card fairness,
  and motion-role fit: it only reorders candidates that are otherwise
  equivalent, so it can never break coverage, no-immediate-repeat, or the
  density contract. When candidates carry no telemetry the signal is
  exactly zero and selection is byte-identical to the pre-telemetry
  behavior (tested).
- **Evidence + telemetry** — every media shot records
  `decision_evidence.visualContext` (top-3 swatches, warmth/luminance,
  description excerpt + sourceClass, the two scores, and an explicit
  "no semantic claim" basis), `selectionEvidence` carries
  `visualAffinity`/`paletteContrast`/`visualContextAvailable`, the variant
  `telemetry` counts enriched candidates and visual selections, and
  `sourcePolicy.visualEnrichment` records the store + pool coverage at run
  time.
- **New cut** — the pass
  `human-accepted-visual-director-v1` ("Human Enricher Accepted · Visual
  Palette + Description Director Pass") appends a visual-aware variant for
  every current playlist song; the earlier
  `human-accepted-diversity-dense-v1` cuts are untouched (append-only
  index). The v6 full enrichment compiler
  (`echo-enrichment-director-variant.js`) is a separate path and was left
  alone here.

## Phases and status log

- **Phase 1 — Palette extraction.** Status: *complete* — see below.
- **Phase 2a/b — Description joins** (agent optical + Echo catalog reuse).
  Status: *complete* — see below.
- **Phase 3 — Director integration.** Candidate join + soft
  palette/description selection signal + `human-accepted-visual-director-v1`
  pass. Status: *complete* — see below.
- **Phase 4 — Verification.** Double-run determinism, 10-sample spot check,
  coverage report, focused tests, full suite, build. Status: *complete*.
- **Phase 5 — Gap closure.** Thumbnail-surrogate palettes for the 134
  file-gone accepted videos + local Ollama vision (`qwen3.5:27b`,
  `sourceClass: "local-vision"`) for the 1,611 readable + 134 surrogate
  description gap, with self-healing re-derivation when source files
  return. Status: *complete* — see status log.

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
- 2026-08-21 — Phase 5 gap profile: 134 file-gone accepted videos (all with
  surviving thumbnails) + 1,611 readable videos with no description (0 in
  the Echo catalog, no agent reviews) → 1,745 local-vision descriptions
  expected; the 1,522 stored agent/echo descriptions were left untouched.
- 2026-08-21 — Phase 5 gap-closure run
  (`human-visual-enrichment-2026-08-22T00-39-30-551Z`): palette stage wrote
  134 thumbnail-surrogate palettes and skipped all 3,133 current
  file-derived ones (0 failures); description stage processed 1,743
  `local-vision` descriptions (1,610 readable + 133 surrogate) and kept the
  1,522 stored agent/echo texts untouched — 1,745 qwen3.5:27b vision calls,
  2 transient failures (one HTTP 400, one abort) out of ~3 h 51 min wall
  (Ollama serializes per model; ~30.7 min of vision work per 8-request
  queue slot). Store grew 3,133 → 3,267 records with a
  backup-before-write under `data/backups/`.
- 2026-08-21 — Retry run (`…13-43-02-320Z`): the 2 failed records were
  re-described in 21 s (0 failures) and all 1,743 stable local-vision
  descriptions were skipped without any vision call — config-based
  idempotency verified at full scale. Final coverage: **3,267/3,267
  (100%) palettes** (3,133 video-file + 134 thumbnail) and **3,267/3,267
  (100%) descriptions** (1,339 agent-optical + 1,745 local-vision + 183
  echo-enrichment). Five-paragraph spot check of random local-vision
  descriptions shows coherent content + palette + mood prose at the Echo
  director's synopsis quality bar or better.
- 2026-08-22 — Phase 3 landed: alias index, candidate `visualPalette`/
  `visualDescription` join, the 4%-quantized soft selection signal in the
  balanced recast, per-shot `visualContext` evidence, and telemetry.
  Focused tests 34/34 (5 new); full `npm test` 1753/1761 with the same 8
  documented pre-existing failures; `npm run build` receipt sha256:112e48ef
  unchanged (the recast domain is server-side, not in the app bundle).
- 2026-08-22 — `human-accepted-visual-director-v1` run (apply): 175/175
  current playlist songs received a new visual-aware cut — 9,677 replacement
  shots over 3,133 readable accepted candidates (100% with palette +
  description), every candidate used 3–4 times (std 0.28), 0 immediate
  media repeats, original projects unmutated, index append-only (175 dense
  rows preserved, 175 visual rows added) with backup-before-write. Spot
  check of the first 10 songs: 548/548 media shots carry `visualContext`,
  538 with positive palette contrast (the color zigzag is working), 174
  with positive description affinity.

## Follow-ups (not in this task)

- **Quality upgrade on the Phase 5 local-vision set.** The ~1,745
  `local-vision` descriptions are a floor (qwen3.5:27b, 3 frames). A future
  gpt-5.6-terra agent optical review of the same clips is the quality
  ceiling and replaces the local text on the next run (agent-optical wins
  the join); retargeting the optical campaign to prioritize these clips is
  owned by the Human Enricher optical session.
- **UI parity**: surfacing palettes/descriptions in `HumanEnricherView`
  (that file is dirty in the other session and was deliberately left
  untouched here).
- **Phase 3 remainder** — the v6 full enrichment compiler
  (`echo-enrichment-director-variant.js`; a different path from the
  human-accepted balanced recast) does not yet consume palette/description
  telemetry. Extending its `sourceScore` with the same soft signals belongs
  with the in-flight album-diversity work in the Human Enricher session.
- Images: 0 accepted today; the extractor's single-frame image path is
  ready for when images are accepted, but the dashboard video list is
  video-only, so image acceptance needs a dashboard change first.
