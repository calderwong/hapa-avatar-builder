# Paused composition and six-song transport — September 8, 2026

Status: verified scoped repair, not A1 or requirement acceptance. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Evidence: `$ECHO_REVIEW_WORKSPACE/cohort-transport-proof/`. Reuse the existing persistent player, source-time mapper, native editor and owner board/memory writers.

## Objective, evidence and repair

The six-song actual-browser composition pass found two defects hidden by internal timing receipts. Wish Her Well brightened after a paused seek: a wall-clock video/fallback CSS fade still ran. Disabling those fades while paused made its held frame pixel-identical, then exposed a second problem in Wish Her Well and Til the Light. A permitted subframe positioning error selected adjacent decoded frames: one source was 2 s after a direct seek but 2.030992 s after reverse seek. A rate nudge cannot correct a paused element.

The existing controller now seeks paused sources to the exact requested bounded position, ignores decoded playing-phase feedback while paused, preserves seeking and near-equality guards, and resynchronizes when the prepared slot becomes ready. Playing corrections remain on their existing route. No source audio, saved cut, shader art parameters or lyric intervals are edited.

## Acceptance and scope

All six source-bound cuts pass 12 actual browser composition comparisons: eight-second direct vs held frames and eight-second direct vs reverse frames after visiting 12 s. The canvas is 1920×1080; captured CSS composition is 2063×1160, including media, shader canvas and any visible DOM lyrics/HUD. These are genuine mixed browser pixels, not two calls to the same frame-state helper. Eleven comparisons are pixel-identical. The remaining comparison has maximum channel difference 1/255 and mean 0.0002523/255; all pass the predeclared mean ≤1.5/255 and fraction-over16≤1% thresholds. This does not prove all-time or export parity.

| Song | Excerpt video/audio p95 ms | Playback evidence | Eligible retained samples |
| --- | --- | --- | --- |
| Dear Papa | 9.64 | fresh | 477 |
| Wish Her Well | 9.24 | reused | 449 |
| ‘Til the Light Walks Inn.wandering(), | 8.58 | reused | 479 |
| Miss Medusa | 12.12 | reused | 185 |
| R.G.B. Nice Whale | 8.37 | reused | 461 |
| BongBongBoink | 10.37 | reused | 479 |

Five unaffected playing-path excerpts from this pass are reused; Dear Papa has a fresh twelve-second forward/four-second resumed regression. All observed proxy source rates are 1: no native non-unit-rate claim. Two over-one-frame observations remain in the reused Wish Her Well sample. These are browser-estimated video/audio residuals, not whole-compositor late-frame counts. Existing Dear Papa full-song 23 ms p95 evidence stays separate and source-scoped.

Seventeen affected source-time/lifecycle tests, current delivery build and 55 protected/12 authoring hashes pass. No broad suite or new encoded render was repeated. Screenshot inspection confirms nonblank composition; dense overlays and unverified-word notices remain and are not human preference acceptance.

## What was noise and what changes next

Two initial harness attempts missed the Preview label and expanded portal. They were stopped with their failed outputs retained; use the existing case-insensitive, portal-aware control helper. Two cold full-cut preparations exceeded the 60 s observation deadline and subsequently completed on their original jobs; no duplicate job was launched just because observation expired. A source edit before the baseline's last certification invalidated that build receipt; certification correctly rejected it. Keep source/build frozen for an entire native run.

A later attempt waited at navigation without producing a renderer, and its API reached the 900 s supervisory deadline. The exact cause of the initial navigation wait is not established. The isolated retry establishes Electron's unique profile before readiness, uses the known process-only macOS persistence argument, and bounds navigation explicitly. The prior group's immediate cleanup check reported false; subsequent process inspection and killpg probe prove it absent, retained in a separate follow-up receipt. Do not replace that failure with a clean-history claim. Final native and API receipts confirm exit 0 and process-group absence; the earlier stopped-attempt receipts remain separate. After exit, all six exact task-created temporary profile roots were removed; the final prefix count is zero. Cleanup did not remove global Electron state.

Lesson Card candidates: a paused frame needs exact position, not a rate correction; freeze the source/build boundary during acceptance; isolate Electron before readiness; and keep proof navigation deadlines inside service deadlines. Retain frame samples once instead of copying overlapping rings into every observation. This remains the existing requirement-batch pilot, with zero accepted batches. No new Conviction inference was run during GPU measurements.

Finish shared song-time media handoffs and a complete Preview/HyperFrames event-boundary comparison for ECHO-04, then consolidate ECHO-07 acceptance with its dependencies. Reuse the six-song paused composition, stem isolation, live capture and section-budget evidence. Track cold history latency under ECHO-08/17; retain lyric, direction, recut, UI and human-review scope.
