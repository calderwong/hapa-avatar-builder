# Echo A1 export frame correction and integration checkpoint

Status: implementation checkpoint; requirement acceptance pending. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Method: active requirement-completion batch pilot.

## Objective and reuse

Finish the existing A1 path from music events to bounded native/export gestures, camera movement and layers. Extend the canonical compiler, media frame adapter and ISF renderer integration; reuse the existing HyperFrames CLI and its decoded-frame injection hook. Keep authored songs/cuts, upstream shader sources and unrelated shader-opacity/UI work intact.

## What changed

HyperFrames injects decoded video images after the composition draw. The Hapa shader previously sampled the original paused video. The adapter now recognizes the exact decoded sibling, retains the original camera geometry and redraws after the upstream injection hook. The upstream hook's receiver, arguments and return value remain intact.

A duplicate draw must not advance a persistent shader twice. The adapter restores the frame-start ping-pong buffer selection and time delta for same-time redraws. Image inputs bind after the vendor resets its texture-unit allocator, with named pass buffers sized first. This preserves the prior frame without extra GPU copies. Nonsequential persistent evaluation remains explicitly unsupported; this is not an arbitrary-seek implementation.

Native reference capture then exposed a decoded-frame callback arriving before `seeked`. Discarding it left paused video waiting for a callback that never came. The adapter retains the observation while still waiting for the seek to settle. A native event trace reproduces the ordering, and a focused regression checks delayed completion and listener cleanup.

This checkpoint also consolidates the previously verified A1 gesture painter, section layer/camera budgets, range-recut event preservation, deferred real-media loading and Variation Lab session preservation. Source/cut authority remains unchanged. Budget admission limits painted layers; it is not evidence of bounded shader compilation or retained GPU memory.

## Evidence and limits

Task artifacts live under `work/echo-album-review-2026-09-05/shader-frame-proof/` in the source task workspace.

- Existing affected compiler/runtime run: 30/30. Seek repair: 7/7. Renderer build-identity checks pass. Prior A1 domain integration passed 2208/2208; subsequent UI changes passed 32 affected checks and native navigation. No unrelated broad suite was rerun for this adapter repair.
- Real GPU persistent fixture: eight sequential frames with duplicate corrected-input draws are byte-identical to one final-input draw per frame. A real catalog Test-Sampler filter consumes the injected footage.
- Catalog shader readback differs by at most two premultiplied 8-bit levels, mean 0.0000314. The original one-level limit failed and is retained; the separate assessment permits two conversion/readback rounding levels. This is not exact full-composite equality.
- Existing four-second 1080p30 MP4: 120 frames, video duration 4.000s, AAC duration 4.011s, one-worker render 11.11s. Three decoded samples at 1/2.5/3.9s are closer to correct-time references than stale-source controls (mean RGB errors 3.239/3.061/3.513 versus 4.243/4.393/4.038). The 2.5s encoded frame was visually inspected. This is sampled source-sensitive evidence, not a frame-residual bound or full-song acceptance.
- Reference capture after the seek correction completes in 2.43s. The reference package differs from the rendered package only in the standalone seek helper; the existing MP4 was reused because exported frame injection did not change. The earlier helper is retained as `media-runtime-before-seek-fix.js`.
- Source integrity verification covers the established 55 protected and 12 authoring files. All owned proof process groups are terminal; no user service was restarted.

## What failed, what was noise, and the guardrail

The first persistent fix restored buffers but bound images before the vendor reset; actual GPU comparison exposed incorrect inputs. Binding inside the renderer clock hook resolved all eight cases. A passing process exit alone was insufficient: the first harness ignored its failed report. Both report acceptance and process termination must be checked.

The first callback-trace attempt returned a function through Electron IPC and failed cloning; the corrected diagnostic returns a primitive. Native tracing confirmed the presentation-before-seeked race. The original missing reference images invalidated the encoded comparison; no acceptance was claimed until all references existed.

Scoped staging review caught misplaced insertions from selecting zero-context hunks while omitting unrelated earlier hunks. Nothing was committed or changed in the worktree by that staging error. Rebuilding each staged file from matched original/revised line blocks and reviewing the contextual diff corrected it; all five mixed staged files pass the installed Rolldown parser. An initial parser attempt used an unavailable Babel package; no dependency was installed. Guardrail: partial-stage insertion positions must be checked against the resulting indexed source, not just patch exit status.

Retain failed artifacts and exact scope. Do not widen a pixel tolerance silently, use occupancy as footage identity, treat successful encoding as synchronization proof, or equate same-frame persistent replay with arbitrary seeking. Reuse unchanged MP4s and broad evidence when the affected boundary permits it.

## Remaining work and reusable outcome

No requirement closes: 6 done / 12 in progress. ECHO-07 still depends on full ECHO-04 acceptance. Next resolve deterministic persistent seeking/checkpoint behavior and whole-composite timing, then resource/performance acceptance; vocal alignment and human taste gates remain separate. A1 integration can be committed without representing it as completed requirement acceptance.

Lesson Card / Flow-explainer candidate: decoded-image injection → camera-framed shader input → same-time persistent redraw, with browser callback ordering evidence. Keep this linked to the attributed source task. The batching method remains active-pilot, effectiveness unevaluated, with zero accepted pilot batches.
