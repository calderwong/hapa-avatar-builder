# Echo shared proxy resources and song revisits

Status: implementation and bounded resource evidence; A1 acceptance remains open. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Evidence directory: `$ECHO_REVIEW_WORKSPACE/shared-proxy-resource-proof/`. No human acceptance or remote publication.

Verification uses the canonical working tree, including preserved pre-existing shader/UI edits. The focused commit excludes those unrelated hunks. Runtime receipts identify the tested build; this is not a claim that an otherwise clean checkout of the focused commit was tested.

## Objective and reuse

Complete the resource portion of ECHO-08 alongside ECHO-04/07. Extend the existing proxy decoder, detached shader media owner, playback pool and song-selection effects. Preserve exact source verification, independent shader histories, original songs and saved cuts. No replacement renderer, service or production subprocess boundary was added.

## Implementation

The shader pool leases one verified encoded payload per proxy URL, sharing in-flight loading and retained bytes among independent decoders. The pool reserves bytes before reading a response body and caps retained/reserved payloads at 64 MiB and eight entries. Idle entries can be evicted; active leases cannot. Aborting one consumer does not cancel another consumer's fetch. Verification failures do not enter the successful cache. Shutdown keeps live leased bytes accounted until their final release.

Each decoder retains its own current frame and at most three future frames. Diagnostics distinguish shared encoded bytes, decoded allocation sizes and frames whose size is unavailable. Inactive shader surfaces release detached media/decoder ownership while preserving reconstructible checkpoints and the last presentation. The separate shared shader-history cap remains 128 MiB. Browser/driver and HTML-video allocations are outside these owned caps.

Real song revisits exposed an unrelated acceptance-path defect: cached auto-latest cut hydration could cancel while retaining its selection key and pending lock. The replacement effect then skipped the request and left the cut selector disabled. Cancellation now releases only its own automatic selection state; obsolete failures cannot clear newer requests. Song changes clear obsolete pending state. Manual selection remains independently owned.

## Evidence and limits

- 56 targeted checks and the current delivery build pass. Two decoders share one payload while retaining independent frames; abort, budget pressure, corrupt payloads and cache shutdown have explicit coverage.
- Native shader comparisons pass six seeks and twelve playback samples with unchanged pixels. A shared-source fixture loads one 5,569,335-byte payload for multiple consumers. The screenshot was inspected; it shows the intentionally history-dependent Feedback Loop output, not a human-approved album composition.
- The actual Dear Papa → BongBongBoink → Dear Papa revisit passes after reproducing the locked selector. Exact saved-cut identity and playback were checked on all three visits.
- Full Dear Papa playback with two temporary Feedback Loop layers reaches the natural 258.439979-second end. Across 128 observations, checkpoint bytes peak at 131,706,432 of 134,217,728; shared encoded bytes peak at 58,218,925 of 67,108,864; decoded frame bytes peak at 19,660,800. Two simultaneous consumers reuse payloads. Temporary edits are cancelled. The harness reports a resource pass, not overall feature acceptance.
- Browser heap ranges from 79,666,784 to 110,093,108 bytes and DOM nodes from 12,323 to 12,378. Renderer working set rises from 711,088 to 1,075,392 KiB. Most growth occurs in the first third; the middle third ranges from 1,030,944 to 1,052,656 KiB and the final third from 1,046,048 to 1,085,328 KiB. This is a warmup followed by an observed plateau with fluctuations, not strictly monotonic growth. GPU memory likewise drops during the middle third before rising again. The bounded run does not establish a general browser/driver retention guarantee. Disappearance of the pool diagnostic after cancellation is not a precise memory-release measurement.
- Whole-session browser-estimated media/audio residual p95 upper bound is 47 ms across 6,742 eligible decoded samples, above the 33.3 ms target. The final two persistent-layer windows have p95 playhead lag around 249 and 264 ms with late bursts. These are distinct metrics; neither is physical AV calibration. Cold near-end reconstruction remains unresolved.

## Failures and corrections

The first capacity harness waited for CDP Performance enablement before creating a renderer by loading a URL. After inspecting the idle owned process, the task terminated that process group, retained the failed attempt, and moved instrumentation after page load. An externally terminated process returning zero was not counted as a pass. A subsequent six-cut run reached the real revisit lock and failed before completing ten switches. The smaller three-visit reproduction isolated the defect; its repaired native run passed. Original reports remain intact.

The first completed ten-switch run (`pool3-final`) passed its cut-selector and capacity assertions, but inspection found legacy graph IDs on the first Til the Light/Miss Medusa visits and certified graph IDs on revisits. The source explicitly permits editable fallback graphs while final-render certification runs in the background. The benchmark had failed to freeze delivery readiness; this was not evidence of a second song-selection bug. That run is rejected for capacity-policy comparison. The corrected harness requires ready execution receipts with identical graph and renderer hashes before each visit and equal admitted-layer IDs at each matched revisit endpoint. This checks the projection as well as the selected ID. Keep both reports and do not promote the earlier pass flag into an exact-graph claim.

The full-song resource run and its task API exited with process groups confirmed absent. Capacity comparisons use the same build and cut order, separate output directories, a fresh isolated API and sequential Electron runs. The operator's existing app remains running; these are local workstation observations, not an exclusive-hardware laboratory benchmark.

Two independent capacities must remain distinct: `echoShaderBudget` limits shader surfaces; `echoPlayerBudget` limits preloaded HTML video players. Shader runs use video capacity nine throughout. Video runs use shader capacity nine throughout; the nine/nine run is their common baseline. No inference job is run alongside the GPU measurements. Conviction's existing literal-extraction qualification remains unchanged; no delegation or new capability qualification is claimed in this checkpoint.

## Matched capacity comparison and decision

Five sequential runs each complete eleven visits/twelve seconds per visit, covering six exact saved cuts and ten song/cut switches. All execution graph hashes, cut fingerprints, renderer/delivery identities and endpoint admitted layers match across runs. Each process group exits and is confirmed absent. The source build is held fixed for this matrix; only the later default-selection change follows it.

| Shader / video ceiling | Peak observed contexts | Peak renderer working set (MiB) | Peak GPU working set (MiB) | Peak JS heap (MiB) | Endpoint pool-work p95 range (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 / 9 | 3 | 1440.8 | 215.0 | 232.8 | 0.50–0.70 |
| 5 / 9 | 3 | 1454.4 | 218.5 | 235.2 | 0.50–0.70 |
| 9 / 9 | 3 | 1534.5 | 213.8 | 237.0 | 0.50–0.60 |
| 9 / 3 | 3 | 1276.3 | 213.8 | 233.0 | 0.50–0.70 |
| 9 / 5 | 3 | 1328.0 | 212.8 | 234.0 | 0.50–0.70 |

Pool work is synchronous pool-side CPU work, not total compositor/GPU frame time. These excerpts use at most three shader contexts even with a ceiling of nine, so the shader default stays six. With shader ceiling fixed at nine, three video players reduce peak renderer working set by about 258 MiB (16.8%) versus nine; five players reduce it by about 207 MiB (13.5%). This supports a **three-player Echo preview default**, with explicit five/nine URL overrides retained. The shared/Tarot default remains unchanged. The measured explicit-three path and the new default use the same existing allocator and lookahead logic.

Estimated media/audio p95 still misses the 33.3 ms target in several excerpts. Resource and matching-layer checks do not establish moving-footage pixel parity, every handoff, physical calibration, whole-preview work or a sub-1% late-frame rate. The full-song two-Feedback resource run uses the previous nine-video default; do not relabel it as a full-song three-player acceptance run.

An explicit GC diagnostic ran **after** the five-player measurements. Heap fell from 210,531,268 to 191,120,716 bytes and renderer working set to 1,099,472 KiB. GC-assisted figures are excluded from the comparison table. Source inspection shows loaded song details retained in the album list; this is a follow-up retention opportunity, not a proven leak diagnosis. Forced collection is not added to the product.

The final default-only verification passes 31 existing playback/pool checks and the delivery build. A normal-URL native Dear Papa/BongBongBoink/Dear Papa round trip confirms three video players, shader ceiling six, exact selected cuts and matching revisited layers. This verifies default wiring after the matrix; it does not repeat or broaden the performance measurement. The earlier 56 targeted cache/runtime checks remain applicable to unchanged cache code. Protected-source checks cover 55 source/cut files and 12 authoring records. All owned native/API groups are confirmed absent.

A documentation helper initially used an evidence path relative to the application checkout and failed before updating the writeback summary. It was corrected to an absolute task path, and the staged diff was checked to preserve historical paragraphs. No application verification was repeated for that documentation correction.

## Learning and next action

What worked: reuse existing owners, measure actual saved-cut transitions, and keep allocation limits distinct from observed process memory. Noise: early CDP instrumentation and oversized diagnostic snapshots obscured progress; summaries now omit raw frame-sample arrays. Misunderstanding corrected: a cache cap does not prove stable process memory, and an effect's cancellation must release its request ownership rather than leaving a permanent UI lock.

**Lesson Card candidate:** shared resource leases require both honest live-byte accounting and consumer-local cancellation. **Decision Card candidate:** preserve identical build/cuts/settings during pool comparisons, record background workload, and choose a default only from the relevant renderer workload. Future agents should reuse the completed full-song run and selection reproduction; rerun them only if changed code invalidates their scope.

The workflow pilot remains active and unevaluated, with zero accepted batches. Six requirements are done and twelve remain in progress. Complete remaining integrated stem acceptance, timing corrections and broader resource evidence; do not replace original acceptance criteria with this resource harness's narrower pass flag.
