# Echo matched presentation and shader-clock receipts — September 8, 2026

Status: verified implementation checkpoint; ECHO-04/07/08/18 remain open. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Evidence: `$ECHO_REVIEW_WORKSPACE/complete-event-proof/`.

## Objective and reuse

Observe the existing Preview painter, shared lyric DOM and actual HyperFrames package using the same selected Dear Papa cut, graph and prepared music bundle. Extend the existing browser-safe frame runtime and ISF surface; preserve the operator's existing shader visibility, layer-opacity and knockout work. No new editor, saved cut, analysis or model call was introduced.

## Findings and changes

An optional Preview paint callback now exposes the frame actually composed, its rendered shader clocks/composition and the contemporaneous audible-clock estimate. The lyric DOM retains its currently rendered frame/line. Ordinary use does not allocate observer layer receipts or invoke an observer.

The baseline exposed two real differences. Preview ignored the recipe's visualizer mix, while export multiplied it and added a separate proxy-opacity/audio envelope even when running the original ISF shader. The shared frame runtime now owns the existing audio envelope and layer presentation: authored visibility, layer opacity, per-layer mix, recipe mix and transition apply once; exact ISF uses the same brightness, saturation, contrast, scale and composite as Preview. Sampled proxy behavior retains its explicitly different route. Compiler composition uses the existing ISF normalizer, including current operator settings, and renderer identity includes that newly consumed owner.

A cached shader frame at song time24.3/local time1.3 incorrectly reported24.3 in its receipt. Cached receipts now preserve the rendered clock, visual-only time edits invalidate reuse, and transport discontinuity detection compares successive song times. This fixes both misleading observation and the stale-frame risk when visual time changes at a paused song time.

## Verification and limits

The final native/editor and actual generated30-second package use identical graph, cut, song and prepared performance. Across24 times in forward and reverse order:48 lyric states,48 accent states,138 painted shader-layer observations (clock, opacity, filter, blend, scale), and55 media opacity/source-time observations agree. All declared drawable layers were painted. Eighty-three affected runtime/compiler/signal/UI/foundation checks and the delivery build pass. The subsequent renderer-identity gate is recorded separately. No broad-suite repeat or new MP4 was needed for this correction.

Before the presentation correction, the normal current cut completed258.439979seconds, a pause/resume, a120ms induced stall and the real loop boundary. Of observed first onsets,75 lyric entries had29.721ms p95 absolute residual against the browser audible-clock estimate, and71 painted accents had25.550ms. Three lyric entries exceeded33.3ms; maximum162.716ms. These are first-observed onset measurements, not word alignment, physical calibration, proof that every scheduled event painted, or a new full-song measurement of the final revision. The observer's maximum measured work was0.3ms; total3078.6ms includes paused sampling as well as playback. The loop capture was taken after a subsequent seek to0.6s, so it does not independently establish continuous loop state parity.

The full run performed19,737 canvas paints over258seconds. Repeated same-output-frame composition is a concrete ECHO-08 optimization candidate; do not infer dropped-frame rate from callback cadence or decoded-video residual. Media child CSS differs between protected framing implementations; compare actual normalized geometry/pixels before declaring a camera defect or camera parity.

All55 protected and12 authoring hashes remain unchanged. No human preference, vocal annotation, full-album export or requirement closure is claimed.

## Noise, correction and next work

The first harness requested a1/30-second position through the real0.1-second scrub control and timed out. Preserve that failure; corrected observations use its supported resolution. Play/Pause uses the actual UI so React playback state and audio-context initialization participate. Export readiness resolves a serializable boolean. Every retired process group was verified absent before retry; native playback and export GPU runs were serialized. Source/build remained frozen during each native/package comparison.

Lesson Card candidate: read the actual presented frame; a newly reconstructed request clock is not evidence of the cached pixels. Pin identical creative inputs across adapters and compare the complete composition contract, including recipe mix and proxy-vs-exact treatment. Reuse unchanged evidence after repairs instead of rerunning a full song for an unrelated cache-identity addition.

Next: normalize actual camera geometry and consolidate continuous-loop, dropped-frame recovery and non-unit-rate acceptance against the original ECHO-04 scope. Reuse the now-matched layer/lyric/accent presentation and earlier six-song stem/history proofs. Keep cold89.9second history reconstruction and repeated canvas composition under08/17. The larger-batch method remains an active pilot with zero accepted batches; this checkpoint does not establish a productivity improvement.
