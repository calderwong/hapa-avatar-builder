---
title: Audio Atlas source activity
status: implemented-candidates; instrument-family-and-role-qualification-open
owner: hapa-avatar-builder
source_task: 01a0e4d5-31d6-74f0-ab17-f838cf3f0992
---

# Source activity

In Audio Atlas choose a source, open **Source activity**, and choose a30-second
window. Cue an entrance in the existing source player. The table retains whole
spans even when their ends extend beyond the window. Energy, spectral centroid
and available pYIN register remain evidence, not instrument identity.

The existing immutable result, technical/pitch validation, query, export and
source player remain owners. `server/audio-atlas-activity.mjs` is a read-only
Hapa-owned derivation. It adds no model, decode, process, network or source write.
`src/components/AtlasActivity.jsx` exposes it through the existing workspace.

## Methods and uncertainty

- Use existing100ms non-centered, non-overlapping original-source technical
  frames. Activity level is the maximum channel RMS dBFS, not arithmetic-mono
  energy. Digital silence is null in JSON, negative infinity in ranking.
- Entry threshold is max(−60dBFS, source-frame p95−35dB). Percentile uses sorted
  frame values including silence, nearest integer index round((N−1)*.95).
  Exit threshold is entry−6dB. These are fixed operational choices, not noise
  calibration, audibility or musical accuracy thresholds.
- Three successive frames at/above entry confirm an entrance, backdated to the
  first crossing. Three successive frames below exit confirm an exit, backdated
  to the first below-exit frame. One/two short below-exit frames within a span
  are retained and counted. One/two entry frames are rejected and retained as
  short candidates. A final partial source frame counts as one frame; do not
  interpret three frames as an exact300ms minimum.
- A span still active at source end retains that boundary, including trailing
  subthreshold frames insufficient to confirm an exit. Source end is not a
  measured acoustic offset. Crossing-frame support is retained; acoustic
  uncertainty is null, not a100ms accuracy claim.
- Median strongest-channel dBFS describes each span. Spectral centroid is the
  median of finite matching-grid existing mono Hann magnitude-spectrum centroids.
  Missing/mismatched frames remain unmeasured and count is explicit. Phase
  cancellation can make a strong stereo signal lack a centroid. Spectral center
  of mass alone is not perceptual timbre or an instrument classifier.
- When the exact source has validated pYIN, report its selected channel and
  voiced-frame p10/median/p90 Hz with the same nearest-index quantile rule.
  Otherwise register is unknown, never zero or borrowed from a different stem.
  Reverb, bleed, noise, octave errors and overlaps are not removed by this view.
- Declared role is imported metadata; acoustic instrument family and arrangement
  role remain unknown. Timelines remain independent per source; no Master
  synchronization or stem-to-person/identity assertion is made.

Each source retains source byte hash, decoded timeline, sample rate/count,
implementation digest, technical/feature/pitch evidence digests and references.
Segments have source/frame coordinates, original support and stable within-method
IDs. If the derivation method changes, implementation digest distinguishes it.
No saved result or original execution coverage is rewritten.

## Interfaces

Authenticated GET `/api/echos/audio-atlas/jobs/:run/query?op=activity&asset=ID&start=S&end=E`
returns every overlapping span and frame for a source window of at most30seconds.
`window_complete:true` is explicit. Older runs lacking technical evidence return
`not_available`. Invalid technical/pitch provenance fails validation.

```sh
node cli/audio-atlas.mjs query RUN --op=activity --asset=stem-1 --start=1248000 --end=2688000
node cli/audio-atlas.mjs export RUN
```

API/CLI exports contain full `derived.activity`; contract projection contains
summaries at `derived_views.activity`. This does not implement generic typed
source-activity observations/corrections; that contract remains unsupported.
Queries and exports never start inference. UI shows loading/error/retry, empty
threshold results, keyboard entrance controls, exact time labels and raw evidence.

## Verification — September28,2026

55 focused JS checks pass across activity, owner, contract, existing review UI
helpers and notes. Seven new tests cover backdated hysteresis, short/noise/silence
cases, partial source ends, strongest-channel selection with missing mono evidence,
half-open window boundaries, stale identities and owner/API/export/reopen parity.
The final13 activity/UI checks pass after the cue repair. Build passes, receipt
`3ee9d321862e68dfa3cd7cba57282f373f689a77a050e0baf4cb6d5b5c313c1c`.

Real Brave Tongues run `8018fabb-8514-45e3-bc11-a42ea8ee3ab2` supplies13sources.
Original and preserved source hashes remain unchanged. Result hash remains
`45dc37d2aacb67c8e12783e8e0b0c2d44eb6ae4604118eff66191f6cdf73eb9a`.
No new inference/job or temporary PCM was created. Query/API/CLI agree exactly;
contract/export counts agree. Pitch register was independently recomputed from
qualifying original pYIN frames. One all-source derivation observed roughly0.25s;
this is not a cold/warm benchmark or resource guarantee.

Vocals has19spans covering188.9seconds under this policy. The26–56s window has
four spans and all300frames. First entrance27.1s, end30.6s, p10–p90 pitch195.4–247.7Hz.
Keyboard/Percussion/Strings/Brass/Woodwinds have no qualifying spans; this is
below-threshold evidence, not proof those instruments are absent. Real browser
source switching, quiet Keyboard state, table/chart, keyboard cue and raw-view
availability were inspected. No human acoustic labels were created.

## Learning delta and remaining work

Reused the existing source player and evidence rather than adding another analysis
job. First browser capture exposed cramped default table styling; reused existing
Atlas table styles and added time labels. A second capture exposed an early-cue
race: selecting27.1s while audio loaded was overwritten to26s by metadata load.
The existing player now remembers the last requested cue by run+source and honors
it at metadata load. Actual browser evidence: readyState0 before cue,27.1s while
loading, readyState4 still27.1s after loading. This fixes cue persistence without
starting playback. Retain the failed observation as evidence, not a clean history.
Reusable lesson candidate: verify source transport again after asynchronous media
readiness; an immediate currentTime read alone can miss a later reset.

The initial correction-lineage board start was rejected by automatic approval
review. Authoritative readback confirmed correction-query is Review pending broad
acceptance/commit. No lineage mutation or implementation was performed. This
independent source-activity card had its contracts dependency Done and eligible
before start. Foundation acceptance remains valid; no repeated approval requested.

`atlas-gap-source-activity` stays In Progress: acoustic family/arrangement-role
hypotheses, perceptual timbre qualification and human examples remain open.
Broad/native release verification and a focused completion commit are also open.
Evidence is in the source task's `work/audio-atlas-2026-09-27/activity/` directory.
