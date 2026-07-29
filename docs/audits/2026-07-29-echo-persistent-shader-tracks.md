# Echo Persistent Shader Tracks — 2026-07-29

## Objective

Extend the existing Echo Album Director Workbench and HyperFrames scene compiler with three stable, per-song shader lanes that remain active for the full song when selected:

1. UltimateFlame tracking the master mix.
2. Waveform 2 (the verified Audio Wave Forms implementation) tracking Lead Vocals with a direct master-mix fallback.
3. An open operator-selectable lane.

Raw request lineage: Codex task on 2026-07-29, “add Three additional Shader tracks/slots … intended to stay always on.”

## Canonical surface reused

The implementation extends the existing Director Workbench Shader Track, native show graph, browser ISF playback pool, and HyperFrames compiler. It does not introduce a parallel scene-editor or rendering surface.

## Evidence

- Contract: `src/domain/echo-persistent-shader-slots.js`
- Director compilation: `src/domain/echo-director-v2.js`
- Runtime layering: `src/domain/echo-isf-browser-runtime.js` and `src/components/HapaEchosView.jsx`
- HyperFrames export: `src/domain/hyperframes-show-compiler.js`
- Repeatable migration: `scripts/backfill-echo-persistent-shader-slots.mjs`
- Album compile: `artifacts/echo-director-v2/album/album-hydration-report.json`
- Release gate: `artifacts/echo-director-v2/album/shader-repair-release-gate.json`

The final gate covered 157 projects, 1,971 shader cues, 7,884 renderer receipts, zero unsupported routes, and zero violations.

## Learning delta

### What worked

- Keeping each persistent slot on a stable track ID made save/fork, timeline projection, runtime selection, and final compilation share one identity.
- Reusing the exact-proxy registry allowed UltimateFlame and Waveform 2 to remain exact across browser, native, and HyperFrames renderers.
- A direct Lead Vocals-to-master policy prevented a missing vocal stem from silently selecting an unrelated isolated stem.

### Noise or rework

- The first migration normalized a missing display title to the shader ID. The fresh album gate caught the mismatch; normalization now restores the canonical manifest title.
- The legacy shader-repair receipt covers only the changing timeline. The gate initially treated the two new persistent cues as repair-timeline entries; the audit now keeps repair scope narrow while auditing all shader lanes for identity and render truth.

### Reusable guardrail

Any future persistent shader lane must be included in all visualizer-track scans, exact renderer receipts, stem-binding repair, and cue-duration accounting. A check that only reads `track-b` is incomplete once persistent lanes are declared.

## Promotion candidate

This is a reusable Flow/Decision Card candidate: “Persistent Full-Song Shader Lanes with Exact Renderer and Stem-Fallback Truth.”
