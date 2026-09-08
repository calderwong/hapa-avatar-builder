# Persistent shader seeking — compiled package checkpoint

Source: Codex task `01a072d3-d593-74f2-8c89-2470c2ee1a40`, Echo A1, September 7, 2026. ECHO-04/07/08/18 remain in progress; six requirements done, twelve open. No human acceptance.

## Reuse and implementation

Extend the existing HyperFrames ISF frame owner and decoded-media adapter. Versioned in-memory checkpoints retain both ping-pong textures, native byte/float precision, buffer direction and predecessor clock for one immutable compiled layer. Async preparation restores prior history and simulates every missing song frame before the requested draw. Song frame identity is separate from slowed/frozen visual time; correcting the input at the same song frame restores the original predecessor before drawing again. Concurrent preparation is rejected and cancellation/yield points are explicit.

Checkpoint memory defaults to 128 MiB per surface with eviction; simulation yields every eight frames. These bound memory and uninterrupted work, not total cold-seek latency. A cold or evicted seek can replay from cue start. A global resource budget and interactive preview integration remain unfinished. Callers must await the existing HAPA_PREPARE_MEDIA_AT hook before nonsequential package rendering; synchronous draw alone does not reconstruct missing history.

## Evidence and limits

Task artifacts: `work/echo-album-review-2026-09-05/persistent-seek-proof/`. The final native Feedback Loop catalog shader on actual Dear Papa footage passes seven byte-identical shader-canvas comparisons against uninterrupted playback, including warm reverse/out-of-order seeks and cold direct entry. Three 1080p checkpoints retain 49,766,400 bytes. Four native float-buffer cases pass through checkpoint eviction/restoration; clearing releases retained checkpoint bytes. This is shader-canvas equality, not interactive preview or encoded-composite equality.

The strict four-second 1080p30 MP4 renders 120 frames in 10.66 seconds. Independent decoding verifies frame coverage and 4.000s video / 4.010667s audio duration; the extracted image is visually nonblank. No encoded pixel-parity claim. The compiler and 22 affected checks passed before the final concurrency guard; 14 runtime/media checks passed afterward. Native/render evidence predates only that guard. Earlier broad A1 validation is reused within its scope; no full-suite rerun for this isolated runtime checkpoint. All 55 protected and 12 authoring hashes remain unchanged. Owned process groups terminated.

## Corrections and learning

The initial Feedback Trace source was quarantined and correctly rejected. Launching its dependent native probe before inspecting the compiler exit produced only a missing-package timeout; require an accepted compiler receipt first. Feedback Loop's ineffective hue/saturation maps were rejected; the derived diagnostic uses static values without changing song sources or registry gates.

A video seek at 1/30s timed out because Chromium reported 0.033333s. A two-animation-frame fallback for repeated source frames did not fix the actual boundary defect. Diagnostic currentTime/readiness evidence established microsecond rounding as the cause; the adapter now rounds into the requested frame at native clock precision and preserves nominal versus observed times in its receipt. Reused-frame fallback is explicitly labeled without inventing presentation timestamps. A native float fixture initially lacked required INPUTS metadata; the corrected fixture verifies actual FLOAT buffers. One earlier report mislabeled Feedback Loop as Feedback Trace; the final report corrects the label while retaining prior artifacts.

Lesson Card candidate: verify native clock precision and image/texture identity at the adapter boundary. Persistent history belongs to a cue, source, controls and output size, not merely a shader program. Bound checkpoint memory and replay batches, and report total reconstruction latency separately.

## Next completion work

Reuse this checkpoint owner in the existing interactive ISF surface/pool. Supply real historical decoded media and prepared song-time inputs; do not seek the operator's audible master or feed the current image into every historical frame. Separate cue/control identity from reusable source/program identity. Then evaluate preview/export timing, full-song resource behavior and the remaining requirement acceptance criteria. No requirement closes at this checkpoint.
