# Echo shader media prefetch and song retention — September 8, 2026

Status: verified implementation checkpoint; A1 remains unaccepted. Source: Codex task `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Requirement scope ECHO-04/07/08/15/17/18, with no closures. Evidence: `$ECHO_REVIEW_WORKSPACE/prefetch-retention-proof/`.

## Reuse and implementation

Extend the pool-owned proxy cache and decoder verification path, existing approved preview projection, album navigation state and Song Card snapshots. No replacement service, analysis, generation or source/cut mutation. Prefetch uses the historical shader's clock with a binary-indexed three-second schedule and at most two unique upcoming URLs. Each owner serializes its speculative fetches and aborts abandoned windows. Foreground leases can preempt pending speculative work; joining a speculative fetch protects it as foreground. Verified bytes release into the existing 64 MiB/eight-entry cache; decoding still retains at most four frames per owner.

The complete roster keeps compact catalog summaries. Hydrated detail uses a three-song recent working set; selected/saving songs remain pinned. Plan snapshots follow retained detail, preserving pending restoration objects for pinned songs. Revisiting evicted detail uses the existing fresh API path. This bounds retained entries, not total process memory or the size of an individual graph.

## Verification and practical limits

Six exact saved cuts pass 11 visits/10 switches with maximum 3 retained details and 3 plans; evicted-song revisits restore the same cut identities and admitted layers. Each visit plays two seconds. This is navigation/retention evidence, not another 3/5/9 comparison. The previous matched capacity comparison remains reusable within its original scope.

Full Dear Papa playback reaches 258.439979 s with two temporary Feedback Loop layers, 3 video players and shader ceiling 6. 128 samples record peak checkpoint bytes 131,706,432, shared encoded bytes 58,218,925 and decoded-frame bytes 19,660,800; peak renderer working set is 1,132.0 MiB. These counters exclude allocations the owners cannot measure. The working cut is cancelled afterward.

76 requests start more than one second before an upcoming matching cue and outside an active use of that source. This proves upcoming request delivery; request completion and an isolated reduction in stalls are not established. Final estimated media/audio session p95 upper bound is 44 ms across 6,921 samples, above 33.3 ms. Maximum observed rolling shader-window p95 is 31.93 ms; it does not measure the full compositor or physical audio/video output. Different player counts and runtime conditions preclude attributing differences from the previous full-song run to prefetch alone. Cold near-end persistent reconstruction remains unresolved; it was not repeated.

66 affected cases passed before final queue serialization; 15 decoder cases pass after that change, while the other 51 cases are unaffected. Current delivery build passes. 55 protected/12 authoring hashes remain unchanged. Existing pixel/seek evidence is reused for unchanged frame selection/rendering semantics; no fresh broad suite, encoded export or human acceptance is claimed. Task-owned native/test groups are absent at checkpoint.

## Learning and next action

The first cancellation rerun had 14 passes and one failure: serializing the queue let the test cancel before its simulated fetch began, so zero upstream aborts were observed. Waiting for actual request start repairs the fixture; final 15/15 pass. Preserve both receipts. An early task-root-relative read from the canonical cwd also failed harmlessly; all subsequent artifact access uses absolute paths where needed.

Lesson Card candidate: speculate through the same validation and budget owner, promote shared work when a foreground consumer joins, and measure retention through eviction/revisit behavior. Do not equate prefetch requests with faster playback or entry limits with process-memory guarantees.

Complete decoded-video presentation phase correction and integrated stem/timing acceptance through the existing playback owner. Investigate element-clock versus decoded-frame age from the final cue-level residuals, preserve fallback truth, and reuse completed prefetch/retention and source-integrity evidence. Cold persistent seek latency and physical/composite timing remain open.

The next timing hypothesis is source-grounded: correction follows `video.currentTime`, but acceptance measures decoded `mediaTime` at expected presentation. Inspect signed residuals and frame age before changing the controller; do not shift authored cues or add an arbitrary global offset to manufacture a pass. Protocol status stays active-pilot, effectiveness unproven. No Conviction inference ran during GPU measurements.
