# Echo Reference Codex FAL Loop Budget Run — 2026-09-14

## Outcome

The existing Echo Reference Atlas motion owner animated **233 of 303** completed Codex-built reference images with FAL `minimax/h3-max-turbo/image-to-video`. The run completed with **233 successes, 0 failures, and 70 budget-held jobs**. It used the fixed five-second 768p profile at the promotional estimate of **$0.05 per loop**, reserving **$11.65** beneath the operator's **$11.68 hard ceiling**. The FAL account invoice remains authoritative.

Run receipt:

- source image run: `echo-reference-codex-images-2026-09-13-remainder`
- loop run: `echo-reference-loops-2026-09-14T16-02-30-317Z-3dcc3ae8`
- model: `minimax/h3-max-turbo/image-to-video`
- local concurrency: 24
- wall time: 273.741 seconds
- throughput: 51.07 completed loops per minute
- retained output: 1,362,152,774 bytes
- remaining headroom against the declared ceiling: $0.03 estimated

## Verification

All 233 completed manifest jobs resolve to unique local MP4 paths. A complete file audit found zero missing outputs and zero SHA-256 mismatches. FFprobe found every clip at exactly 5.000 seconds and 768 × 1152, with no audio stream.

The live consolidated media endpoint automatically joined the new motion by `sourceImageRunId + sourceJobId`. Its observed counts moved from 1,189 to **1,422 loop-ready visuals**, with 1,782 total visual versions, 1,309 unique reference connections, 199 songs, three image runs, and two reference-loop runs. No manual UI import or renderer change was required.

A distributed visual sample inspected the first, middle, and last completed jobs at frame 0, 2.5 seconds, and 4.95 seconds. The samples showed visible low-amplitude environmental or lighting motion at midpoint while returning to the original composition, subject identity, symbols, crop, and lighting baseline at the end. This is a bounded spot-check, not human approval of all 233 creative results.

## Turn-to-Lore reflection

- **Objective:** Spend no more than $11.68 of FAL credit to animate as many of the 303 latest reference images as possible and make them available in the Hapa Avatar Builder gallery.
- **Evidence inspected:** canonical Builder guidance; the source image manifest and current pointer; the proven reference-loop runner; the prior 336-loop production receipt; the live FAL model price; encrypted credential status; every new output hash and media stream; and the live consolidated media index.
- **What worked:** Reusing the current loop owner preserved local encrypted-key custody, exact first/last-frame anchoring, silent conformance, durable request IDs, run-level budget accounting, and automatic gallery joins. Concurrency 24 completed the batch without a retry wave.
- **What was noise:** The ambient browser tab was not needed for execution. The app's local API server could remain running because it only reads these manifests; no second Builder Electron writer was active.
- **What was misunderstood:** An initial sandboxed Electron status invocation aborted. The same read-only status worked under the approved desktop execution boundary; this was an execution-context issue, not a key or pipeline failure.
- **What changed:** Only local generated runtime state and this documentation snapshot changed. The production pipeline and UI needed no source modification.
- **What remains reusable:** The budget mode, 24-worker reference profile, exact manifest join contract, conformance receipt, and complete hash/FFprobe audit form a repeatable bounded-spend flow.
- **New guardrail:** Resolve the current source image run and current official per-second price immediately before queue creation. Compute `floor(hard limit / unit cost)`, persist the held remainder before any submission, and report provider billing as authoritative rather than claiming an exact charge from an estimate.

Candidate classification: **Lesson Card / Flow-explainer** — budget-bounded reference animation with durable local provenance and automatic gallery ingress.
