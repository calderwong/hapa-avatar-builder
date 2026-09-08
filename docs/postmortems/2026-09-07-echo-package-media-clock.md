# Echo package media clock correction

Status: standalone source-frame capture verified; ECHO-04/07/08/18 remain open. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`. This is a separable capture-adapter correction within the active requirement batch pilot, not requirement acceptance.

## Objective and reuse

Make the existing package capture prepare the actual video frame at the requested song time. Extend the canonical HyperFrames compiler and reuse `mapEchoSourceWindowTime` from the existing playback owner. No new renderer, analysis, service or source cut. Include the new packaged adapter and its mapping dependency in renderer build identity so warmed certificates cannot survive a timing change.

## Evidence and implementation

The old package's `HAPA_PREPARE_MEDIA_AT` loaded videos but did not seek ordinary clips. A native Electron diagnostic on actual Dear Papa footage observed source time zero at song times 11.3 and 3.9 seconds, where the extraction contract required 0.2 and 3.9 seconds. Merely having nonblank footage or matching lyric state missed this defect.

The compiler now separates asset loading from frame preparation. Visible videos pause, map the existing extraction attributes (presentation origin, source window and playback rate), and await seek completion plus a decoded-frame callback where available. Older browsers retain an explicit seeked/loadeddata fallback. Full-source transition mapping retains its exact endpoints and applies rate only once. Preparation returns source-time receipts. Preloaded invisible videos are not sought on every sample.

Initial independent pixel comparison used browser downscaling versus FFmpeg bilinear downscaling. Both old and corrected samples differed by roughly six RGB levels; this failed the diagnostic. The initial hypothesis that seek completion left stale pixels was not established. Adding a decoded-frame callback did not change those comparison results. Comparing at original source dimensions removed the downscaler confound: corrected mean RGB error is 0.686 and 0.918 out of 255 versus independently selected FFmpeg frames 6 and 117; the repeated 3.9-second sample is byte-identical. The old package fails the source clock check and has larger source-pixel errors. Retain both failed comparisons rather than treating them as media timing evidence.

## Verification and limits

- The renderer identity regression passes, including detection of changes to either new packaged timing dependency.
- 25 targeted mapping, adapter, output-profile and foundation checks pass, including reverse seeking, explicit trim/rate, mapped endpoints, stalled decode cleanup and decoded-frame callback gating.
- Native old/corrected packages use the same saved inputs. Three actual video observations cover two clips and a repeated reverse-seek sample. Times 8.7 and 10.9 fall on generated visualizer content and provide no video-frame evidence.
- Independent FFmpeg comparison selects source frames at native dimensions, avoiding shared browser mapping code and scaling differences. This is source-frame evidence, not exact final-composite parity.
- 55 protected and 12 authoring hashes remain unchanged. Bounded supervisors own all test/compiler/Electron/decode process groups; no user service was restarted. No broad suite, build, full-song render, analysis or model call was repeated for this adapter correction.
- The latest A1 native acceptance also passes six gestures across media/visualizer/lyric surfaces and quiet/steady/peak budget boundaries on a whole-song UI recut. These observations do not establish measured vocal alignment or full-song performance.

Task evidence: `work/echo-album-review-2026-09-05/media-clock-proof/`, especially `source-pixel-native-report.json`, `before-native/report.json`, `after-native/report.json`, regression logs, source integrity and process receipts. Prior A1 native evidence: `section-budget-proof/native-multitarget/` and `section-budget-proof/native-section-boundaries/`.

## Remaining work and guardrail

Installed HyperFrames inserts extracted images after composition seek, then invokes `__hfReseekGpu`. Hapa's shader input still reads the original video element. The standalone preparation fix does not correct that encoded shader-input path. Next, integrate the existing post-injection redraw boundary with the selected decoded source and verify actual exported shader pixels; preserve persistent shader state semantics. Do not call an occupancy check or a successful `currentTime` assignment proof of correct captured footage.

Lesson Card candidate: **Verify media time with pixels and control the comparison pipeline.** Keep source selection, seek completion, decoded-frame presentation, scaling and final composition as separate evidence boundaries. Failed comparisons can expose verifier assumptions as well as product defects. The larger-batch workflow remains active-pilot with effectiveness unproven.
