# Tarot Stargate Hero Baseline Design Audit

Date: 2026-07-18  
Scope: Canonical Hapa Avatar Builder `Tarot Draw` surface before the Build Week Stargate hero pass  
Truth state: verified local runtime and source audit  
Record owner: `hapa-avatar-builder`  
Build Week task: `UI3D-001`

## Scope boundary

This is an additive audit of the mature Tarot Draw cockpit in `src/components/TarotDraw3DView.jsx`. The existing scene, renderer, Card collection, Hand/placement behavior, Phone Card, Camera Card, scene save, invitation, Echo visualization, camera, lighting, synthesized sound, and diagnostics are donor capabilities to preserve. The implementation target is the missing Stargate choreography inside this scene; it is not authorization to build another Tarot renderer or restyle the application shell.

## Evidence reviewed

- Runtime capture: `artifacts/smoke/avatar-builder-tarot-draw-3d.png`
- Canonical 3D surface root and canvas: `src/components/TarotDraw3DView.jsx:3292`
- Existing scene save and invitation controls: `src/components/TarotDraw3DView.jsx:3783`
- Existing Three.js render/update loop: `src/components/TarotDraw3DView.jsx:13450`
- Existing HUD and renderer diagnostics: `src/components/TarotDraw3DView.jsx:14100`
- Existing Tarot shell and HUD styling: `src/index.css:11313`
- Existing control dock styling: `src/index.css:12257`
- Existing responsive rules: `src/index.css:12784`

## NeonBlade score

| Dimension | Score | Evidence-based finding |
| --- | ---: | --- |
| A. Tokens and identity | 2/2 | The surface consistently uses the NeonBlade dark field, cyan signals, gold authored accents, bevels, and condensed operator labels. |
| B. Cards and components | 2/2 | Cards, deck, rails, zones, dock controls, state plates, and 3D media surfaces are already a coherent mature component system. |
| C. Motion and feedback | 1/2 | The scene has card easing, bursts, camera motion, shaders, visualizers, and synthesized cues, but no Stargate-specific semantic motion sequence or proven reduced-motion path yet. |
| D. Operator functionality | 1/2 | The table is highly capable, but the dense dock gives every action similar visual weight and has no single legible Stargate hero action or gate-state summary. |
| E. Protocol gates and truth | 1/2 | Existing diagnostics and scene custody are strong, but no visible gate state machine, safe fingerprint display, ordered formation evidence, or stale/disconnected truth state exists in the canonical surface. |

Total: **7/10 — Grade B baseline**

## Findings

### P0 — The hero interaction is absent, not the 3D foundation

The current Tarot Draw already supplies the authored environment that the Build Week experience needs. The missing product moment is an explicit transformation from ordered Cards into a deterministic destination. Adding another renderer, Hand, bridge, or shell would duplicate mature capability and weaken the demo.

Acceptance direction: extend `TarotDraw3DView.jsx` with one stateful `Stargate` action and an in-world rig that consumes the canonical placed Card identities without creating a parallel collection.

### P1 — Gate states need an authored visual grammar

`Ready`, `Dialing`, `Active`, `Stale`, `Expired`, and `Disconnected` must be recognizable through geometry, material response, lighting, motion, sound, and accessible text. A glow-only treatment would be visually generic and would not teach what is happening.

Acceptance direction: ordered magnetic slots, sequential Card-to-ring energy transfer, mechanical aperture motion, a layered event horizon, table light response, safe redacted destination fingerprint, and arrival/peer feedback.

### P1 — Stargate mode must own the center without erasing other truths

The baseline smoke capture shows the existing center preview can dominate the stage. Stargate mode needs to deliberately suppress or subordinate incompatible center presentation while active, then restore it when the mode closes. Unsupported or unavailable media must remain honestly labeled outside Stargate mode.

### P2 — The control dock needs a hierarchy, not another equal-weight toggle

The Stargate trigger should sit beside `Save Scene` and `Invite Cam` as requested, but its active/dialing treatment must read as the primary action. A compact state plate should communicate slot count and truth status without turning the 3D scene into a dashboard.

### P2 — Motion, performance, privacy, and recovery need proof

The visual pass must respect reduced motion, retain the bounded render cadence, expose renderer counts and gate state through the existing diagnostics handle, and avoid emitting raw pass material, secrets, topics, private keys, full addresses, paths, or credentials. An incomplete Card identity must fail visibly instead of inventing a destination.

## Implementation decision

Reuse the existing renderer, world, table, Cards, camera, lighting, bursts, control dock, audio unlock, scene snapshot, and diagnostics. Add a procedural architectural Stargate rig because no external asset-generation credentials are available in this runtime and the gate is a signature abstract machine rather than a representational object. The rig will use authored geometry, custom shader material, material/lighting response, and synthesized cues inside the existing sound preference.

## Verification plan

1. Contract-test the action, truth states, diagnostics, reduced-motion branch, and safe labels.
2. Capture the sequence in an isolated smoke window without restarting or navigating the operator's running app.
3. Record renderer diagnostics and desktop/mobile screenshots.
4. Re-score the same five design dimensions in a separate immutable follow-up audit.
