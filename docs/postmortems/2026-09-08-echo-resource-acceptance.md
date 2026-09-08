# Echo resource acceptance and regression repair

Status: ECHO-08 technically accepted; A2 remains in progress for ECHO-05/06. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`. September 8, 2026 UTC.

## Objective and reuse

Complete shader/decoder/compositor resource acceptance using the existing owners. Reuse the accepted song-time compositor, shared proxy leases, bounded detail/plan retention, independent quality controls, and source-preserving preview preparation. No replacement renderer or scheduler was added. The preceding status turn yielded terminal regression evidence and changed the next action; it was progress, not a completed requirement.

## Evidence and correction

At source checkpoint `5a3816f`, a cold 258.4-second seek with a temporary Feedback Loop reconstructs 7,751 history frames. Baseline history preparation took 77.15 seconds, wall completion 77.45 seconds; reverse seek wall completion was 188 ms. The profile attributes 51.22 seconds of sampled time to framebuffer completeness checks, but those calls are GPU synchronization points. Replacing CPU snapshots with GPU textures moved waits to `getError` and took 79.27 seconds. Reusing textures reduced reported preparation to 57.81 seconds but deferred work into a 14.09-second wall reverse seek. Both candidates were rejected and production files restored byte-for-byte. These single observations are not a repeated benchmark or a speedup claim. Float/byte pixel restoration checks alone did not establish interaction performance.

The first candidate failed because its test API still held the earlier module. That process was stopped and its group verified absent before restarting with the candidate. Preserve that preflight failure. The next guardrail is to measure completion and the next interaction, not only the call where a GPU wait currently appears. Cold history remains expensive; instant arbitrary cold seeking was not part of ECHO-08's original resource criterion and must not become an invented closure gate.

The original default-capacity workload passed exact-cut/capacity checks over 11 visits and ten switches, but normal renderer working set rose from 802.20 to 1,375.47 MiB. A separate explicit collection reduced it to 889.92 MiB. Owned caches and JS heap were bounded, but this alone did not prove ordinary-playback no-growth. A third-round matched workload was justified to distinguish warming from continued retention; forced collection is excluded from the normal-playback conclusion.

The broad repository run completed 2,284 tests: 2,281 passed and three failed. Two were stale source-text assertions for image routing and quality-aware preparation. The third conflated authenticated access with acceptance of a mutable Record Garden delivery ledger. Repair checks the current image presenter/video guard and selected-cut quality argument; local cookie and Bearer credentials must reach the same acceptance owner. Only its explicit stale-ledger rejection is permitted alongside a valid context. Other errors remain failures, and the real verification ledger is not rewritten or bypassed. Removed pointless retries against an unchanged stale ledger. Existing unauthorized/cross-origin checks remain.

## Batch outcome

ECHO-08 is technically accepted against the four original criteria in [the acceptance map](../ECHO_RESOURCE_ACCEPTANCE_MAP.md). The final 18-visit/17-switch normal-default run completed in371.05 seconds. Third-round endpoint working set ranged 1325.56–1336.80 MiB; round endpoints were 1172.41,1324.50,1325.56 MiB. This is a warming curve followed by an observed plateau, not an unlimited-runtime guarantee. Forced collection occurs only after those observations. All 108 resource samples respect owned caps. The reused full 258.439979-second song with two Feedback Loop slots has constant final 30-sample checkpoint/context totals and oscillating lookahead buffers; cancelling releases checkpoints and lookahead to zero. Last 30 renderer samples span 1103.36–1132.00 MiB and end slightly below their first value.

Four checks in the two repaired regression files pass. Combined with the unchanged 2281 earlier passes, all 2284 distinct repository checks have passing evidence; no fresh all-suite pass is claimed. The previous production delivery build and native/export proofs remain valid because this checkpoint changes tests/documentation only.55 protected / 12 authoring hashes remain unchanged;20 owned process receipts are terminal/absent and8 temporary proof profiles removed. The audio-element unload concern was a source-inspection hypothesis, not an established cause of growth; no lifecycle change is claimed.

Board becomes9 done / 9 in progress. A2 remains active for ECHO-05/06, supporting17/18; one complete pilot batch remains accepted. The performance requirement is separably accepted within A2, not a redefinition or completion of that larger batch. Next: finish lyric-template and word-alignment work as a coherent vocal presentation path; cold cache latency remains ECHO-17 work. Human acceptance remains pending.

## Learning and handoff

The workflow remains an active pilot with one previously accepted batch, not an ecosystem-wide efficiency claim. Broad verification was run once at this resource acceptance checkpoint. Repair only the invalidated tests and reuse valid production build/native/export evidence; do not repeat every playback run because tests or documentation changed. Avoid full JSON/source assertion dumps and guessed canonical-relative task paths; both created avoidable output noise during triage.

Lesson Card candidate: GPU profiler wait locations are not independently removable work; compare completed presentation and the next interaction. Lesson Card candidate: auth acceptance and delivery acceptance have different owners and must not be conflated. Raw evidence remains in `$ECHO_REVIEW_WORKSPACE/cold-history-budget-proof/`; previous resource and compositor proofs remain source-linked there.
