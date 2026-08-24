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
