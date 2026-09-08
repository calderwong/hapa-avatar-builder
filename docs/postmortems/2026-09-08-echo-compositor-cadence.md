# Echo compositor cadence and synchronous lyrics — September 8, 2026

Status: verified implementation progress for ECHO-06/08/18; A2 remains in progress. No requirement closure. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`.

## Objective and reuse

Reduce redundant canvas work without degrading the approved song-time, lyric and stem behavior. Extend HapaEchosView's existing compositor, EchoLyricOverlay's existing DOM painter, and echo-presentation-timing's bounded diagnostics. No replacement renderer, worker service, lyric template or timing source was introduced. Existing source audio, saved cuts, prepared curves and HyperFrames package are retained.

## What changed

Prepared/replayed rendering admits one paint per absolute song output frame, with immediate seek/resize/remount handling. Paused surfaces refresh at output cadence so completed media/shader preparation appears; a stalled playing clock refreshes at 250 ms. Hidden surfaces retain the existing lifecycle policy. Live-jam and legacy rendering keep their original callback cadence, preserving recording behavior.

The lyric surface now accepts the compositor's synchronous song-frame callback and updates its existing DOM before the canvas paint. It no longer schedules a React state update for every lyric frame. Standalone use retains its audio-clock observer. Empty intervals hide the mounted surface; disabled/hidden lyrics release it and the callback. Interval lookup, output-safe layout, reduced motion and template evaluation retain their existing owners.

The compositor records synchronous work using a fixed 16,016-byte histogram, reporting at most four times a second. Duplicate and paused callbacks are separate from work-over-budget samples. None is mislabeled as a decoded-video drop, GPU completion time or physical presentation measurement.

## Evidence and outcome

- 68 distinct affected checks have passing evidence:32 cadence/transport checks and36 lyric/contract/preview checks after one fixture repair. Delivery build passes. Unchanged wider suite evidence is reused; no fresh full-suite claim.
- Final same-cut Dear Papa playback:258.43 seconds,7,770 canvas paints, all 75 lyric entries and 80 accents. Lyric p95=21.876ms, max22.831ms; accent p95=21.870ms, max24.511ms. Zero sampled lyric/accent onsets exceed one 1080p30 output frame.
- Synchronous compositor work, including lyric painting: p95 upper bound4ms, maximum18ms, mean3.10ms; zero samples over 33.3 ms in this mounted session. It excludes GPU completion, decoding and acceptance-observer overhead. This is one local run, not a machine-wide performance guarantee.
- 26 actual generated-adapter comparisons pass for loop/recovery media, lyrics and shader time within one frame.37 decoded post-loop samples: p95=20.073ms, max23.536ms. Cut/song/show graph/performance data exactly match the previously accepted package, which was re-evaluated without another movie render.
- 55 protected files and12 authoring files match their frozen hashes. Production source/build stayed fixed within each native run. The original run had 19,579 paints; the final run had 7,770, approximately 60% fewer observed paints. Different runs do not establish a controlled CPU/GPU speedup.

Task evidence: `$ECHO_REVIEW_WORKSPACE/compositor-budget-proof/`; final receipts are `compositor-report-final.json`, `transport-comparison.json`, `source-integrity.json` and the stage/process receipts. The first failed timing report remains `compositor-report.json`.

## Failure, correction and learning

The first canvas-only gate reduced painting but the compositor observer saw lyric p95=53.337ms, failing acceptance. The lyric layer had a separate RAF -> React state -> layout-effect path; sampling only at the first canvas paint of a song frame could observe the previous lyric state. The record alone does not distinguish physical display delay from late observation. The repair removes that scheduling split, synchronously paints the real lyric surface, and passes the same actual-onset measurement. The failed run is never relabeled successful.

One disabled-lyrics unit fixture passed `{enabled:false}` to a normalizer expecting project-shaped `{lyrics_enabled:false}`; its correction passed without production changes. Several shell reads also used the wrong workspace relative path or returned overly broad logs; these were noise, not product failures. Always use absolute evidence paths when the command runs in the canonical checkout and select only needed receipt keys.

Reusable Lesson Card candidate: treat canvas and DOM lyric scheduling as one presentation path before changing cadence; frame gates must preserve paused readiness and the live-recording contract. Measure the actual composed layers, not just the scheduler helper. Reuse valid package/data evidence and rerun only gates invalidated by the repair. The pilot remains active and its overall effectiveness unproven.

## Remaining work

ECHO-08/17 still need the remaining cold-history/cache, broader memory and scheduling acceptance; ECHO-06 needs all-template readability/output-profile proof; ECHO-05 word alignment and ECHO-18 full release/human preference remain separate. Historical direct-proxy reconstruction recorded 89.88 seconds in a run that failed a separate progress assertion; do not attribute that cost solely to the older HTML-video decoder or claim this compositor change fixes cold seeking without measurement.
