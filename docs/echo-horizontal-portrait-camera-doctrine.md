# Echo horizontal portrait camera doctrine

## Operator correction

Landscape Echo cuts frequently use portrait video. A centered `object-fit: cover`
frame hides the source top and bottom, and the former directional pan did not
guarantee that either edge was ever shown. The requested correction is to scan
more of the portrait source during every landscape cue and provide two
append-only alternatives per video.

## Failure mode

Three behaviors compounded:

1. Recent portrait shots could declare a pan without a crop-path contract, so
   playback remained centered.
2. Non-atomic `hapa.echo.asset-camera-framing.v2` paths were rebuilt by the
   editor instead of being preserved.
3. Crop coordinates were converted to CSS `object-position` as source-space
   centers and received the legacy portrait zoom again. CSS percentages address
   the remaining cover overflow, so `y: 0` did not actually display the top.

## Doctrine V1

Variation set: `echo-horizontal-portrait-full-height-scan-v1`

- `top-first-fast-scan-v1` starts at the exact source top and traverses to the
  bottom over the cue.
- `top-arrival-fast-scan-v1` starts at the bottom and reaches within 1.5% of the
  available vertical crop range from the source top by cue end.
- Both cuts declare camera speed `2.4`. Their crop corridors traverse the full
  available height in the same cue duration, increasing spatial velocity
  without adding a second zoom that would hide the endpoints.
- Only video sources with measured portrait dimensions in landscape projects
  are reframed. Media selection, cue timing, audio, visualizers, shaders, and
  certified atomic transition framing remain unchanged.

## Append and certify

Dry-run before writing:

```sh
node scripts/append-horizontal-portrait-camera-doctrine-cuts.mjs
```

Append two cuts per landscape project, back up the index, and rebuild exact
index parity:

```sh
node scripts/append-horizontal-portrait-camera-doctrine-cuts.mjs --apply
```

The readiness certifier can select this family without auditing unrelated
historical variants:

```sh
node scripts/preflight-echo-render-readiness.mjs \
  --variation-set=echo-horizontal-portrait-full-height-scan-v1 \
  --apply-stem-repairs=true \
  --skip-mint-plans=true
```

## 2026-08-23 rollout receipt

- 196 landscape projects received 392 append-only cuts.
- Each doctrine reframed 5,999 portrait video shots across 195 projects.
- `dear-papa-song-appa-checkin-in` had no portrait video shots, so its two cuts
  preserve the source camera state.
- Base-project and existing-variant mutation counts remained zero; the rebuilt
  index matched disk exactly.
- 336 cuts published certified execution graphs.
- 56 cuts across 28 songs remain truthfully blocked by inherited lyric-safety
  defects (`word-outside-line`, or enabled lyrics without measured lines). The
  camera-only rollout does not bypass those gates or silently change lyrics.

## Doctrine V2 (2026-10-09): every Director path scans tall clips

### Why V1 did not hold

- V1 only existed as a one-off append script. The Director passes that followed
  (Audio Atlas album v4–v7, balanced recast, narrative recut) never applied it.
  The Atlas adapter picks push-in/pull-out/left-right pans before media is chosen.
  The enrichment reframe only fired when orientation *changed*, so a portrait
  clip replacing a portrait clip kept a locked or zooming camera. Across 6,776
  landscape cuts, 207,748 shots came from portrait sources, and about 40,000 of
  them had no vertical travel at all.
- The V1 cuts set `camera_intensity: 0`. The motion renderer ignores the
  contract's crop path, so in Preview and export those shots were a
  centered, 1.34×-zoomed lock. That is exactly the head-cutting the doctrine was
  meant to prevent.

### V2 rule

Owner: `src/domain/echo-horizontal-portrait-camera-doctrine.js`.

- A shot scans when the landscape cover crop would hide ≥ 35% of the source
  height (`visible = sourceAspect / outputAspect < 0.65`). That covers portrait
  and square clips, both video and stills. Skipped: certified atomic
  transitions, shots with an operator `camera` lock, and protected crop paths.
- Motions `scan-down` (start at the exact top, end at the exact bottom) and
  `scan-up` (the reverse) are first-class in `echoCameraMotionPresentation`. They
  use scale 1 (no zoom), ignore intensity and speed, and use smootherstep travel.
  Consecutive tall shots alternate down, up, down… so each hands off from the
  edge the last one ended on.
- `applyEchoPortraitScanCamera` runs after media selection in
  `recastEchoDirectorProject` / `recastBalancedEchoDirectorProject` (the album
  pipeline's cut builder), the intentional-enrichment Director (full validated
  contract), and `createEchoNarrativeRecut` (unless camera is locked).
  `cameraReframeRequirement` treats a tall clip in a landscape output as
  requiring a reframe.
- Compact mode (the default) drops stale framing contracts. Playback is driven by
  `camera_motion`, and evidence lives in `decision_evidence.cameraFraming`.

### Append for existing songs

```sh
node scripts/append-horizontal-portrait-camera-doctrine-cuts.mjs --expected-project-count 199
node scripts/append-horizontal-portrait-camera-doctrine-cuts.mjs --expected-project-count 199 --apply
```

The default doctrine is `alternating-full-height-scan-v2`, with one cut per
landscape song derived from its latest cut. Use `--doctrines=` to choose others.

### 2026-10-09 rollout receipt

- 199 landscape projects received 199 append-only cuts (variation set
  `echo-horizontal-portrait-full-height-scan-v2`). Each is now its song's latest
  cut.
- 9,612 of 9,612 tall shots in those cuts scan. Base-project and existing-variant
  mutation counts were zero, and the index matches disk.
- Index rows now stub any source-policy value over 4 KB (size + sha256). Some
  album cuts embedded a 460 KB human-quality policy, which pushed the bounded
  editor catalog past its 3 MB budget. The cut files keep the full policy.
