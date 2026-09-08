# Echo deferred-media export correction — 2026-09-07

Status: implemented and verified on a 12-second pilot; A1 and all broader acceptance remain open. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Local changes remain part of the uncommitted A1 batch. No GitHub mutation.

## Objective and reuse

Finish the current stem/accent, camera and layer integration through the actual HyperFrames export path. Extended the canonical compiler, existing rolling preload window and Song Card MP4 renderer. Reused cached song analysis, the existing pixel/lyric/spatial/audio verifiers and bounded one-worker process harnesses. No source-cut regeneration, new analysis, new service or replacement renderer.

## Evidence and correction

The initial 12-second render completed 360 frames in 69.74 seconds but reported a 45-second `(no src)` media-readiness timeout. A future clip starting at 11.1 seconds sat between the eight-second preload and twelve-second release thresholds and therefore remained mounted without a source.

First correction: initialize inactive elements with the existing tiny bootstrap. It removed the timeout and rendered in 23.79 seconds. Existing spatial occupancy, lyric and decoded-stream checks all passed, but inspection of the encoded 11.3-second frame showed the wrong background. That attempt is rejected as footage acceptance. The retained automated `ok` report is evidence only for its limited checks.

A diagnostic render exposed a 16-pixel injected image for `m3`, while its declared footage was 704 pixels wide. Installed HyperFrames 0.7.66 browser discovery overwrites static video URLs with the live element's URL. The inactive bootstrap was therefore extracted as footage. This invalidates the bootstrap approach even when media-readiness checks pass.

Final correction: keep inactive video elements detached. A registry retains the elements independently of the DOM. Mount the real source when it enters the preload window; on release remove the associated extracted-frame sibling, detach the video, and release its decoder. No placeholder is packaged or substituted for footage. This preserves bounded decoder loading and static source identity. The final MP4 invocation also adds `--no-best-effort`: `--strict` controls linting and does not enforce capture readiness.

## Verification and limits

- Fresh actual 12-second 1080p30 export: 360 frames, 22.96 seconds, no capture-readiness warning. The HTML-size lint advisory remains. This is a single-run correction of a fixed timeout, not a general throughput benchmark.
- Seven browser and seven encoded spatial samples, two lyric samples, reverse-seek repeated PNG, and complete decoded-stream/audio-source checks pass. The encoded 11.3-second frame visibly contains the intended city source. Human taste acceptance is not claimed.
- Startup browser inventory contains only the two real sources in the preload window; the future clip remains detached. No external network requests or browser errors in the pixel capture.
- Twelve affected compiler/output-profile/foundation tests pass. Existing 2208 domain checks and 32 UI checks are reused only for unaffected scope; no new broad suite/build/UI smoke was needed for this compiler/server-only correction.
- 55 protected and 12 authoring source hashes remain unchanged. All task-owned process groups terminated. One sandbox Electron abort was inspected, retained, and retried through approved native execution.

Evidence lives under `section-budget-proof/{encoded,readiness-repair,capture-media-diagnostic,detached-media-proof}` in the originating task workspace. Failed and rejected attempts are retained independently. The final pilot is `detached-media-proof/pilot.mp4`.

## What remains and the guardrail

A1 still needs the remaining native gesture/surface and quiet/peak boundary acceptance, complete ECHO-07 criteria, and a focused commit. ECHO-04/08/18 retain broader synchronization, resource and full-song gates. Native screenshots, shader-input timing, measured vocals and human taste are not established by this export.

The spatial verifier checks occupancy, not correct footage or exact composite pixels. The standalone package pixel sampler also does not currently seek every ordinary video to its expected source-frame time; it must not be used to claim exact moving-footage parity. Strengthen source-frame/appearance acceptance in the owning capture/export path; preserve this concrete false-positive example for regression coverage. Do not silently reinterpret prior green occupancy reports as footage acceptance.

Lesson Card candidate: **Deferred media must preserve extraction identity.** Treat the live DOM as an input to the renderer's source discovery. Never substitute placeholder URLs into authored video identities. Review actual encoded content before acceptance, and inspect the installed CLI semantics before calling a render strict.

Workflow learning: the targeted diagnostic changed the implementation and prevented a false acceptance. Four bounded render attempts addressed one concrete failure chain (initial timeout, bootstrap rejection, DOM diagnostic, detached correction); no unrelated broad tests were repeated. Batch effectiveness remains unproven.
