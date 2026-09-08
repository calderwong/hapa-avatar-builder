# Echo precise audio preparation — September 8, 2026 UTC

Status: verified audio checkpoint within unaccepted A1. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Requirements: ECHO-04/08/17, supporting07/18. Six requirements done, twelve in progress; zero accepted workflow-pilot batches.

## Objective and reused owners

Remove the observed native MP3 seek timebase discrepancy without altering songs/cuts or inventing new timing. Extend the existing preparation queue, source inspector, process/file-lock owners, local range-serving API and editor audio element. The shared PCM owner is reachable through API, UI and `scripts/prepare-echo-playback-audio.mjs --source=<master> [--cache=<derived-cache>]`. Original songs remain authoritative.

## Evidence and outcome

Exact Dear Papa source duration and decoded samples give258.439979s. Native MP3 blob and HTTP end at258.58418s after seeking257.5s. Reindexing the MP3 preserves decoded sample hashes but does not fix the drift. Float32 WAV preserves the FFmpeg-decoded PCM hash and keeps258.439979s through seek/end; browser channel hashes differ between decoders and are not claimed bit-identical.

Final real editor proof verifies selected source identity, HTTP206 with matching source/PCM headers, a nonzero running Web Audio analyser signal, seek/reverse/natural end, same audio/playhead across panels, page-exit release and removal of the cache lease. The screenshot is inspected; it is not taste acceptance. Prepared WAV is99,241,044bytes; one warm job took1,925ms. Final native process19.98s, no authored save. Original/cut checks pass55 protected and12 authoring files.

Cache retention is512MiB per entry and2GiB total derived audio. Existing owner locks serialize creation and eviction; live process-owned reader leases protect open playback. Two-reader release/eviction, source edits, tampered output, concurrent preparation and stopped-process lease recovery pass meaningful synthetic tests. Warm reuse hashes source/output and probes source metadata; it does not re-decode audio for music analysis. No automatic source offset adjustment occurs.

## Failures, waste and corrections

- A prior command created its helper at the wrong working directory and never created the intended tests. Five existing checks passed; they were insufficient. This turn created the tests at absolute paths, fixed the missing optional graph access and verified the audio path.
- The first native probe attached CDP before a renderer existed and stalled. Inspected live process tree and healthy API, stopped only the owned Electron group, confirmed absence, then loaded about:blank before installing instrumentation. A zero exit after external termination was not treated as acceptance; the required report was absent.
- Default sandbox denied loopback listening. Inspected terminal error and process cleanup, then used the authorized scoped test route. There was no automatic approval rejection.
- Existing recording failure coverage located its source block by the removed blob-loader comment. The assertion remained valid; the test now locates the actual preparation call and explicitly rejects a missing block. Loopback-dependent test failures remain distinct from application defects.
- A hard cache ceiling without reclamation would eventually prevent album navigation. Added live-reader protection and unused-entry eviction before accepting the audio integration.

## Verification scope and remaining work

Twelve focused audio/queue/routing checks pass. Delivery build and exact selected-cut readiness pass. Final native audio/cache evidence is in `$ECHO_REVIEW_WORKSPACE/audio-seek-proof/integration-final/editor/report.json`; source checks are adjacent. Affected regression initially50/53: one obsolete locator and two loopback-denied checks. Final rerun of the two affected files passes36/36 in19.65s; combined with the unchanged passing files, all53 affected cases now have passing evidence. No full repository suite was repeated;2,226 historical passes remain scoped to8fdd32e.

This does not close ECHO-04/07/08/17/18. Persistent shader cold replay93.11s, short resumed p95 lag144ms, full composite/physical timing and sustained global resources remain open. A browser crash that misses page-exit release while its API remains alive may retain a protected lease until API restart. Unknown/damaged cache entries are preserved for diagnosis; they can consume quota. No remote publication, human acceptance, fleet replication or savings claim.

Lesson Card candidate: compare the audible browser timeline with decoded source samples before changing authored cue lengths. Treat cache reader lifetime as part of playback correctness. Flow candidate: prepare one verified source derivative, share it across readers, and reclaim only after ownership ends. Next action: finish persistent shader latency using existing history/media owners and reuse this valid audio evidence.
