# Echo final-render shader route guard — 2026-08-11

## Objective

Prevent an Echo Director cut from reaching final compilation with an unready shader, and stop rejecting an otherwise verified render merely because its shader used a valid deterministic browser-ISF route.

## Evidence

The failed `Death Ground` candidate declared eleven shader cues. Its compiler report recorded eleven deterministic browser-ISF routes, zero unsupported routes, and a successful compiler inspection. Its pixel capture also passed all 26 samples, including visible non-blank shader-canvas pixels and matching cue identities. The final truth check nevertheless required `exactProxy === requestedCueCount`, incorrectly treating the valid routes as failed.

## Guardrail

`inspectSongCardExecutedRendererTruth` now accepts the sum of verified exact-proxy and deterministic browser-ISF routes, while still requiring zero unsupported routes and successful pixel QA. `repairEchoRuntimeShaderGraph` and `repairEchoRuntimeVisualizerTimeline` now use the single `echoShaderFinalRenderReadiness` truth predicate for every catalog entry. A stale or missing catalog ID is deterministically replaced with a final-render-ready shader before compilation and recorded in the non-destructive repair receipt.

## Verification

The whole-album readiness sweep counted 11,267 visualizer cues, all exact in its static preflight. Focused tests cover both a pixel-proven deterministic browser-ISF cue and replacement of missing/unready Director references.
