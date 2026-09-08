# Echo decoded video presentation correction — September 8, 2026

Status: verified browser timing checkpoint, not A1 or requirement acceptance. Source: Codex task `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Evidence: `$ECHO_REVIEW_WORKSPACE/decoded-phase-proof/`. Scope: ECHO-04/07/08/18; no closures.

## Reuse and change

The previous full-song browser estimate was 44 ms p95. Source inspection found that correction used `video.currentTime`, while acceptance measured the timestamp of a decoded frame scheduled for display. Extend the existing correction function and presentation observer; do not add a second callback loop, shift authored cues, or invent a global offset. Match observations to the active element and cue, reject stale/wrong-rate/discontinuous observations, and require a frame observed while advancing. Unsupported feedback retains the element-clock path.

The decoded branch uses a narrower phase deadband and faster proportional convergence within the existing ±4% rate bound. An acquisition seek applies the measured phase displacement to the current element position, clamped to the authored source window. The fallback branch preserves its previous exact target. Because both feedback and convergence changed, this is not an isolated causal comparison of either change alone.

## Evidence and limits

The 40-second actual-song diagnostic measures 24 ms p95. The full Dear Papa run reaches 258.439979 s using the normal three-video/six-shader defaults and two temporary Feedback Loop layers. The unchanged whole-session histogram records **23 ms p95 upper bound across 6,959 decoded/audio-estimated observations**, below the 33.3 ms target. Median signed residual is -1.285 ms. There are **103 observations over one frame (1.48%)**, and the worst residual is **124.65 ms**; do not hide them or confuse this residual rate with compositor dropped-frame statistics. All 6,959 eligible samples were recovered from the bounded recent-ring snapshots for diagnostic analysis.

Maximum observed rolling shader-window p95 is 32.0003 ms. Peak owned checkpoint bytes are 131,706,432 and encoded bytes 58,218,925, within the existing 128 MiB/64 MiB limits. Forty current-video recovery seeking events match controller receipts, with at most one per source cue; no repeated recovery within a cue was observed. Direct seek to 10 s, reverse to 5 s, and resume to 10.018476 s pass. The temporary cut is cancelled. The screenshot visibly contains media and shader output, but the preview is clipped and dense overlays remain a readability concern; no lyric readability or human preference acceptance is inferred.

The corrected unsupported-callback proof disables RVFC through a verified main-world preload before app code runs. Six seconds of actual playback produce 462 explicit fallback samples, zero decoded samples, and the element-clock correction route. This is fallback behavior, not timing-quality acceptance. Full-song and fallback processes are separate; no inference workload ran alongside GPU measurement.

Initial affected checks were 32/36. The extracted-component lifecycle harness did not supply the new domain helper or shared observer input; updating it to use the actual presentation observer repaired that gap and exposed the need to retain the advancing-frame guard. The next run was 21/22, with a sub-ULP mismatch in the fallback seek target; preserving the original exact fallback target resolves it. Final affected subset is 22/22, with 14 unchanged checks reused. Delivery build and 55 protected/12 authoring source hashes pass. Prior rendering evidence remains scoped to its original revisions; no broad suite, new encoded export, physical calibration, whole-composite event proof or human acceptance is claimed.

## Learning and next action

The first native fallback attempt failed because CDP document injection had not disabled the capability; actual decoded samples correctly rejected the purported fallback result. Keep that receipt. A main-world preload with an explicit precondition repaired the test; only that diagnostic was repeated. Task process groups are terminal and absent.

The diagnostic report embeds overlapping recent rings in resource snapshots, producing roughly 54 MiB of observations. Lesson Card candidate: retain each frame observation once in future proofs, while preserving whole-session outliers and coverage. This instrumentation cost is another reason not to call this an isolated performance benchmark.

Lesson Card candidate: use decoded presentation evidence when correcting video phase, preserve acquisition and stale-frame guards, and keep fallback measurements honest. A p95 pass does not prove every transition is on time.

Complete actual-compositor event and handoff timing, remaining cue-entry outliers and six-song source-rate coverage; consolidate ECHO-04/07 acceptance against the original criteria. Reuse the passing full-song browser residual, transport, fallback and resource evidence. Cold persistent replay latency and human review remain separate open work.
