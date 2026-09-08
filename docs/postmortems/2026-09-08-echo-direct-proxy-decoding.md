# Echo direct proxy decoding and held seek progress — September 8, 2026 UTC

Status: technical improvement verified; A1 and ECHO-04/07/08 remain unaccepted. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Six of eighteen requirements remain complete.

## Objective and reuse

Reduce persistent shader seek/playback latency while retaining exact source-time selection and native feedback history. Extended the existing preview proxy owner and historical media adapter. The new read-only packet endpoint uses existing bounded FFprobe supervision; it creates no new service or transcode. Existing camera framing accepts a VideoFrame directly. Original media remains the export source. Hapa standards, process-boundary safety and the requirement-batch pilot were reviewed before execution.

## Implementation and evidence

Verified all-intra H.264 proxies expose a byte/hash-bound packet index. The client validates and hashes at most32MiB of encoded data and retains only one source plus a maximum of four decoded/queued frames. It submits the current packet and three following packets, reuses them on sequential playback, and discards old decoder generations on jumps, abort or disposal. Unsupported routes use the existing video-element adapter with an explicit reason. Server indices are bounded to8MiB/32entries and two concurrent probe processes. These limits do not establish a global GPU/process memory ceiling.

The native actual-video Feedback Loop fixture passes six direct/reverse seek pixel comparisons and twelve playback target comparisons, plus cue isolation, held-frame isolation and visible active replay progress. The inspected PNG is nonblank; its deliberate feedback trails are not a human taste assessment.82 affected tests pass. Final source-integrity readback preserves55 protected files and12 authoring files. All owned API/Electron process groups reached terminal state and were observed absent.

A real-editor prepared-route run starts with a verified decoded-proxy receipt, reconstructs7735frames near the end of Dear Papa in89.880s, reverses to257.5s in85.7ms, seeks to240s in127.3ms and plays through the exact258.439979s PCM endpoint. The final900-sample rolling window records shader/playhead lag p95=32.000ms, maximum33.333ms and zero samples over one frame. This18.44s resumed segment excludes physical audio/output and full-composite latency. It is not a whole-song or final-export acceptance run.

The full editor harness returned failure because it detected stale numeric seek-progress reporting while an earlier frame was held. Timing/source-route/terminal assertions had already passed. The subsequent repair preserves held pixels/clock and publishes active replay progress; it is verified in the shorter native fixture. Do not relabel the earlier failed report as a passing end-to-end run. The final build and selected-cut certificate are separate receipts.

## Failed approaches and learning

- Serial direct decoding with an intermediate Canvas introduced native pixel differences. Returning the owned VideoFrame into the existing framing Canvas restored parity; the extra copy was removed.
- Forced software decoding failed native persistent pixel parity and remains unqualified. Default decoder configuration retains no-preference.
- Serial direct decoding measured109.628s near-end reconstruction. Throttling identical paused composites to10Hz measured107.626s and134ms resumed p95, so the throttle was removed. These are separate runs, not controlled attribution experiments.
- The first queued-decoder editor attempt used original media because the new isolated API had no prepared job. It measured177.609s, then failed the route assertion. It is not a decoder benchmark. The corrected harness explicitly prepares through the existing UI and checks the actual historical route before expensive replay.
- The prepared near-end run had16frames already evaluated during startup. Do not turn89.880s versus the serial109.628s receipt into a precise percentage speedup claim. Asynchronous GPU work also shifts cost between measured preparation and draw spans; total elapsed time is the useful comparison.
- Holding old pixels must not hold old progress. The previous completed seek receipt concealed live replay frame counts; presentation now separates those states.

## Workflow status and next action

This is progress inside the existing A1 requirement batch, not a new accepted batch. Broad repository suites were not repeated; the prior2226-test result remains scoped to its earlier commit. Targeted checks addressed decoder ownership, native pixels and a demonstrated progress defect. The long editor replay was reused after the reporting-only correction. Conviction was not called: no suitable independent literal-extraction task justified packaging another packet.

Next complete the planned independent preview quality controls and global shader/decoder/compositor budgets. Current preview shaders still use full compositor dimensions; the128MiB history cap is per surface. Then consolidate ECHO-04/07 acceptance with integrated/composite timing, remaining stems/resource evidence and the original requirement criteria. No human preference, fleet replication or requirement closure is claimed.

Reusable Lesson Card candidate: prove the selected runtime route before starting an expensive benchmark; separately bind held content identity and active-work progress. Raw receipts remain under the source task's `work/echo-album-review-2026-09-05/direct-frame-proof/`, including both failures. The board and Second Brain registration use their existing owners.
