# Exact Living Light asset signals and resident cache

Status: source library checkpoint, 2026-10-07. LL-006 and LL-007 remain in progress.
Owner: canonical Hapa Avatar Builder. Source: Codex chat `01a1146f-fe68-76b3-a736-473042c3818c`, Calder's authorized board drain. No creative acceptance is inferred.

## Reuse and interfaces

Extend the existing Echo analyzer, preparation queue, source inspector and prepared publication store. Do not create a second analysis service or consume the prototype's Dear Papa feature file. The new policy is `living-light-assets-v1`; the default Echo role policy remains available.

`server/living-light-performance-inputs.mjs` resolves one exact canonical Song, preserves declaration indexes, excludes archive lineage, and assigns each of at most 32 declarations its exact asset ID and a namespaced resource ID. Same-role peers and unknown roles remain independent. Duplicate Song/registry/Songbook identities fail in exact mode. Missing declared audio remains unresolved; a readable peer cannot certify it. A stem whose declared role is Master remains a stem.

The existing Python producer decodes current local audio, retaining source hashes and the digest/rate/count/domain of mono float32 analysis PCM. These analysis samples are downmixed; they are not the audible source-equivalent playback PCM. Preparation does not infer alignment or perform isolated reconstruction in exact mode. Partial publications retain empty missing resources. Warm preparation reuses unchanged resource analysis; publication reads revalidate current source bytes without running an analyzer. New declaration identities, changed paths/bytes, newly available missing files, or another Song's same master require a matching preparation.

Prepared exact publications use a separate Song/master/policy pointer from legacy Echo. Resource checks join by asset ID. The existing bounds remain: 32 MiB publication, two internal JSON records, 2 GiB/512 disk entries, one active preparation job and at most eight queued jobs. Analysis and playback/job roots can be supplied by the owner so tests stay isolated. Public exact-job output omits analyzer output; public playback results omit paths/stamps/leases, while the private owner getter retains them.

## Feature semantics and admission

`createLivingLightFeatureBank` accepts the exact Song, performance, audible playback receipt and validated source binding. It verifies master source/PCM identity and playback coordinates, known v6 extractor, complete regular source samples, normalization, explicit measured-feature availability and stem byte identity. It copies bounded private arrays. Master response currently exposes basic normalized RMS only.

| Stem feature | Supported meaning |
| --- | --- |
| energy / peak | Per-input p99 normalized measured RMS / peak |
| low / mid / high | P99 normalized mean FFT magnitude; 20–250 / 250–2000 / 2000 Hz–analysis Nyquist |
| onset | Positive display RMS delta; transformed response, no beat certification |
| brightness / width / pan / beat | Unavailable |

These are transformed Echo features, not equivalence to the prototype's 24 kHz/30 Hz extractor. Default preparation is 8 kHz/10 Hz. Absent feature fields cannot become measured zeros through normalization defaults. Explicit silence must agree with the producer's -60 dBFS raw activity threshold, allowing its documented rounding tolerance.

Sampling is deterministic at absolute microsecond source coordinates. A stem needs an explicit validated owner map with equal-length source/song intervals; no stretch, guessed zero offset or duration correction is allowed. Mapped intervals are half-open. Unverified alignment and uncovered gaps return unknown. Missing sources return missing. Only measured silence or explicitly evidenced padding returns silent zero. This pure library consumes a binding receipt; it does not review or apply Audio Atlas proposals. No actual album alignment map is newly approved by this checkpoint.

Aggregation requires exact unique asset IDs and explicit max, mean or weighted sum. Weighted contributions must total at most one; a positive-weight unavailable contribution makes the aggregate unknown. Disabled zero-weight contributions may remain unavailable. There is no automatic master substitution.

## Cache ownership

`createLivingLightFeatureCache` bounds owned feature arrays at 128 MiB, retains at most four inactive LRU banks, and pins one active source bank. Multiple leases may share that one bank without copying arrays. Release is idempotent; disposal zeros owned arrays and invalidates leases. Admission reclaims idle arrays before construction, validates actual bytes and rejects oversize/cancelled work. The caller must build an exact source/binding/configuration key and release the old source before switching. Its synchronous factory receives the reserved byte budget; supplying the default full budget evicts idle banks on a cold admission. A caller can supply a valid smaller reservation to retain warm inactive banks.

This is an array ownership limit, not a whole-process RSS promise. Decoder buffers, already loaded JSON, FFT temporary memory, native graphics and serialized metadata are separate. The library is not yet connected to the interactive Workspace; full articulation/cache/runtime qualification remains open.

## Evidence and remaining gates

Current targeted suite: 52/52, zero failures/skips, 4.494 seconds. It covers twelve-asset aggregation, twenty synthetic cache switches, warm LRU reuse, cancellation, corrupted/absent signals, explicit synthetic maps/padding, exact same-role publication, duplicate identities and a Master-named stem. Actual synthetic WAV decoding runs through FFprobe/FFmpeg, the existing producer/publisher/store and audible-master preparation. An isolated API fixture verifies authenticated exact-policy preparation/read, unauthenticated rejection, independent stem IDs and no private paths in public responses. Source fixture bytes and input graph are retained unchanged.

Private workspace receipts: `execution/living-light/exact-assets-identity-hardening.log` and its `.receipt.json`; output SHA-256 `1fb44da214d758c1180ce3e2b082f9ce77c977d51b9d1f8c5d7883b5cc84be54`. The current production build passes (1.358 seconds); build output SHA-256 `0998fa0e5849666971984a5cbd38a4fa36cf5ad9528311c0c7cc5b824dfa1e15`. Both owned process baselines returned, without residual descendants. Build output and runtime receipts remain uncommitted.

Shared `server/api.mjs` integration and its full Desktop API fixture are working-tree verified and remain outside the focused library commit because the shared API also contains other owners' changes. The exact policy uses existing music-performance GET / prepare POST routes and requires admin authorization. This is not a newly certified Desktop/UI session flow. No actual user Desktop reload, native per-stem modulation, twenty audible source switches, full album analysis, complete UI/API/CLI parity or new broad-suite acceptance is claimed. Earlier broad-suite and native render evidence belongs to its recorded earlier revisions.

## Correction and reusable lesson

The initial suite passed 28/29: a rejection fixture changed decoded count by one sample while the documented duration tolerance permits that difference. The fixture was corrected to truncate a complete analysis frame; production tolerance was retained. The failed run remains available in `exact-assets-initial.log`. Subsequent review tightened ambiguous exact fallback mappings, Master-role stem handling and measured silence validity; all affected checks passed afterward.

Useful result: exact declaration identity and explicit measured availability can extend the existing pipeline without merging role peers or certifying alignment. Noise: treating a one-sample tolerance boundary as source corruption. Guardrail: identity, source-local measurement, alignment, native visual response and human approval each need their own evidence. Candidate: Decision/Flow explainer for adapting measured signals to authored scenes; attributed to the source chat, not an independently adopted ecosystem protocol.

## Process boundary review

No new worker type or autonomous loop is introduced. Bounded outer Python launches one file-based Node test runner; test files run serially. Synthetic analysis uses one Python owner and serial FFprobe/FFmpeg. Queue preparation runs one Python analyzer stage followed by one Node publisher and serial FFprobe. Isolated API fixtures own their two sequential server instances and ports. Maximum measured harness depth is four; the outer owner enforces at most 32 observed simultaneous descendants, timeout 300 seconds, zero retries, explicit child arguments, stripped NODE_OPTIONS and a child role guard. Stage processes retain the existing owned process groups and bounded TERM/KILL escalation. The final receipts show empty matching pre/post baselines and no residual process groups. Changed paths remain read-only with respect to source Songs/audio; only isolated/disposable prepared artifacts are written.
