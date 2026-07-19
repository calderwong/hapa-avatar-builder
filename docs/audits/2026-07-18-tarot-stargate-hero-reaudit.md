# Tarot Stargate Hero Visual Re-audit

Date: 2026-07-18  
Scope: Build Week `UI3D-001`, inside the canonical Hapa Avatar Builder `Tarot Draw` surface  
Truth state: verified local implementation, isolated Electron smoke, scoped capture, and source audit  
Record owner: `hapa-avatar-builder`

## Outcome

The Stargate is now the scene's authored hero object. Four face-readable Hapa Cards occupy visibly ordered magnetic sockets, route color-coded energy into separate chevrons, and wake a mechanical aperture whose iris, rings, event horizon, constellation, lighting, camera, HUD, and synthesized cues change with the gate state. This pass extends the existing Tarot Draw renderer, Cards, table, scene custody, Save Scene, Invite Cam, Phone Card, Camera Card, audio preference, and diagnostics; it does not create a parallel application, renderer, Hand, or bridge.

The scoped Stargate hero passes the premium and showcase visual thresholds below. This is not a claim that unfinished P2P arrival, Gate Card mint, Catalog round trip, or the whole Build Week submission is complete.

## Evidence

- Desktop active state: `artifacts/smoke/tarot-stargate-active.png`
- Narrow active state: `artifacts/smoke/tarot-stargate-active-mobile.png`
- Reduced-motion active state: `artifacts/smoke/tarot-stargate-active-reduced.png`
- Ready and Dialing states: `artifacts/smoke/tarot-stargate-ready.png`, `artifacts/smoke/tarot-stargate-dialing.png`
- Scoped 10.8-second progression clip: `artifacts/demos/UI3D-001/tarot-stargate-hero-progression.mp4`
- Capture poster and machine-readable receipt: `artifacts/demos/UI3D-001/tarot-stargate-hero-poster.png`, `artifacts/demos/UI3D-001/tarot-stargate-hero-progression.json`
- Protocol derivation: `src/domain/tarot-stargate-derivation.js`
- 3D rig and state grammar: `src/domain/tarot-stargate-visual.js`
- Canonical integration: `src/components/TarotDraw3DView.jsx`
- Responsive HUD/dock treatment: `src/index.css`
- Contract and runtime verification: `tests/tarot-stargate-hero.test.mjs`, `scripts/tarot-stargate-smoke.cjs`

## Skill and reference ledger

| Entry | Loaded | Use in this pass |
| --- | --- | --- |
| `hapa-neoblade-design` | yes | Existing visual language, hierarchy, semantic state color, immutable before/after audit |
| `threejs-game-director` | yes | Phase boundary, evidence ledger, visual quality gate |
| `threejs-aaa-graphics-builder` | yes | Hero construction, materials, lighting, VFX, active-state scorecard |
| Three.js UI, profiling, and QA sibling guidance | yes | Responsive controls, renderer diagnostics, desktop/narrow smoke, console gate |
| Three.js 3D, image, and audio generator guidance | yes | External asset decision, procedural fallback boundary, synthesized cue decision |
| `references/visual-scorecard.md` | yes | Exact 10-category score below |
| `references/checklists/aaa-game-quality-gate.md` | yes | Active interaction, responsive framing, feedback, diagnostics |
| `references/checklists/aaa-visual-scorecard.md` | yes | Screenshot, score, threshold, and automatic-failure gate |

## External asset and audio sourcing ledger

Credential probe output, recorded verbatim:

```text
TRIPO_API_KEY=
GEMINI_API_KEY=
ELEVENLABS_API_KEY=
```

| Surface | Decision | Evidence and boundary |
| --- | --- | --- |
| Signature Stargate machine | Procedural authored geometry and shader | External 3D generation was blocked by the empty Tripo credential. The gate is also an abstract protocol instrument whose exact eight-slot/chevron state behavior benefits from deterministic geometry. It uses nested torus assemblies, twelve iris segments, eight chevrons, pylons, a table seal, particles, constellation, and a custom event-horizon shader rather than a primitive-plus-glow placeholder. |
| Formation Card faces | Existing canonical Card renderer plus authored public-vector SVG faces | The Cards remain the real shared Tarot Card objects. The four public test-vector faces are local deterministic fixtures, clearly disclosed as non-production invitations. |
| Concept/texture generation | Existing authored Tarot assets plus procedural canvas textures | External image generation was unavailable through the probed Gemini credential. No generated screenshot or invented peer was substituted. |
| Gate audio | Existing in-app Web Audio synthesizer | External voice/SFX generation was blocked by the empty ElevenLabs credential. Four nonverbal cues were authored inside the existing sound preference: arm, dial, open, close. The evidence movie is intentionally silent for later HyperFrames editing. |

## NeonBlade re-score

| Dimension | Before | After | Evidence-based finding |
| --- | ---: | ---: | --- |
| A. Tokens and identity | 2/2 | 2/2 | Gunmetal, verification gold, semantic cyan, active mint, adverse coral, and violet accents follow the canonical operator language. |
| B. Cards and components | 2/2 | 2/2 | The implementation reuses the real Cards, table, dock, Save Scene, Invite Cam, Phone Card, Camera Card, HUD, audio, and diagnostics. |
| C. Motion and feedback | 1/2 | 2/2 | Ordered Card arrival, energy transfer, chevron sequencing, iris opening, ring motion, event horizon, particles, camera direction, table response, burst response, and sound cues are state-driven; reduced motion is runtime-proven. |
| D. Operator functionality | 1/2 | 2/2 | Stargate is beside Save Scene and Invite Cam. Dialing/Active collapse the dock to five essential actions while preserving bridge access and keeping the Cards visible. |
| E. Protocol gates and truth | 1/2 | 2/2 | Ready, Dialing, Active, Stale, Expired, and Disconnected are accessible and visually distinct. Missing Card identity fails closed. The HUD exposes only redacted address/fingerprint state, and the public vector is explicitly disclosed. |

Total: **10/10 — Grade A for the scoped hero experience**, up from 7/10.

## Exact Three.js visual scorecard

The source rubric is game-oriented. For this spatial application, `Hero/player` maps to the operator-controlled Stargate machine; `Obstacles/enemies` maps to adverse gate states and their recovery telegraphs; `Rewards/interactables` maps to the ordered Hapa Cards and sockets.

Visual scorecard:

- Art direction: before 2 / after 3 — NeonBlade cockpit identity now affects the machine silhouette, Card faces, materials, lighting, state color, HUD, sound, and motion rather than only the palette.
- Hero/player: before 0 / after 3 — the absent hero was replaced by a memorable layered mechanical aperture with nested construction, chevrons, iris, supports, event horizon, and expressive state response.
- Obstacles/enemies: before 0 / after 2 — Needs Identity, Stale, Expired, and Disconnected have distinct accessible state and material/light grammar, with close/redial recovery hooks.
- Rewards/interactables: before 2 / after 3 — four desirable, face-readable Card types retain real Card behavior, visible order, socket feedback, energy transfer, and operator provenance roles.
- World/environment: before 2 / after 3 — foreground Card formation, midground machine/table, background cockpit/constellation, and preserved table zones produce legible depth and scale.
- Materials/textures: before 2 / after 3 — shared gunmetal, gold, cyan, coral, mint, and violet roles combine physical materials, emissive trim, procedural labels/glyphs, Card art, and a custom horizon shader.
- Lighting/render: before 2 / after 3 — ACES tone mapping, tuned exposure, state-colored table/portal/rim lights, cockpit fill, depth, and disciplined emissive levels keep the Cards readable.
- VFX/motion: before 1 / after 3 — event-driven Card ribbons, traveling sparks, sequential chevrons, iris/ring motion, event-horizon opening, constellation, particles, camera move, bursts, and reduced-motion timing clarify activation.
- UI/HUD: before 1 / after 2 — the compact state plate shows formation, sealed identity, redacted destination, disclosure, progress, and state; the active dock preserves only five essential actions and adapts to the narrow viewport.
- Performance evidence: before 1 / after 2 — production build, complete unit suite, desktop/narrow/reduced-motion smoke, console error gate, renderer counts, screenshots, and a scoped encoded capture are recorded. A strict baseline/post GPU timing trace remains future profiling work.

Average: **2.7 / 3.0** after, up from **1.3 / 3.0** for the missing hero interaction.  
Showcase threshold: **passes for this scoped Stargate surface** — seven categories score 3, no category is below 2, average is 2.7.  
Automatic failures remaining: **none in the reviewed active desktop or narrow screenshots**.

## Renderer and capture diagnostics

- Desktop active renderer: 173 calls, 28,614 triangles, 114 geometries, 32 textures.
- Narrow active renderer: 171 calls, 28,326 triangles, 114 geometries, 32 textures.
- Active visual rig: 8 chevrons, 8 beams, 8 sockets; four occupied in the public fixture; event-horizon open blend and energy both reached 1.0.
- Desktop canvas: 1,256 × 860 CSS/device pixels in the 1,600 × 1,000 smoke window.
- Narrow canvas: 723 × 758 in the 768 × 1,024 smoke window.
- Demo movie: 1,600 × 868 scoped application surface, 12 fps H.264, 10.833 seconds, silent; source capture cadence and frame-duplication normalization are disclosed in its receipt.
- The smoke and capture receipts report no full private address, cohort secret, or private rendezvous topic in the UI/diagnostic serialization.

## Verification result

- Stargate protocol/visual contract test: 4/4 passing.
- Full repository test suite: 959/959 passing in the final sequential rerun. An earlier parallel build/test attempt was invalid because the build replaced `dist` while Echo tests read it; one later Echo compact-index result was transient while concurrent Echo work was active. The isolated Echo test and the final untouched-data full suite both passed. The mistake, diagnosis, and sequential correction remain part of the Build Week execution record.
- Production build: passing.
- Desktop and narrow Electron smoke: Ready → Dialing → Active plus Stale → Expired → Disconnected passing.
- Reduced-motion Electron smoke: passing with `reducedMotion: true`.
- Scoped progression capture: passing with an Active four-Card sealed formation and machine-readable privacy receipt.

## Remaining boundaries

- The constellation beyond the event horizon is destination visualization, not an observed remote peer. P2P arrival must stay unclaimed until `NAV-002`, `NAV-003`, and `UI3D-003` pass.
- Save Scene still owns scene persistence; minting this exact context as one portable Stargate Card is the next task, `NAV-001`.
- Human mint authority and `.hapaCatalog` convergence/return are not part of this task and remain `CAT-GATE-001` through `CAT-GATE-003`.
- No external 3D/image/audio asset was generated in this pass because the required provider credentials were unavailable. The procedural and existing-asset fallback is recorded rather than hidden.

## Execution learnings preserved for Lore and Skill mining

- `Tarot Draw` means the existing canonical `TarotDraw3DView.jsx` implementation inside Hapa Avatar Builder. New Build Week interaction must extend that surface and inherit its Card renderer, Hand/table behavior, bridges, cameras, audio, and Save Scene custody before introducing a new shell.
- A Card participating in a 3D protocol demonstration must remain face-readable. The first formation pitch made the Cards read edge-on; lifting and pitching the existing meshes toward the operator restored Card identity without creating duplicate display props.
- The event horizon is a destination visualization until another peer is observed. Visual spectacle must not promote a constellation, socket, or local simulation into a network claim.
- Evidence capture needs a retained Electron window reference and an explicit keep-alive through poster and receipt writes. The first isolated capture exited after frames but before its final custody artifacts; the harness now keeps ownership until every declared output exists.
- Build and tests that share `dist` must run sequentially. Parallel execution produced an invalid red result by replacing the exact assets an Echo API test was reading; the final verification was rerun sequentially and passed 959/959.
- Runtime append-only Echo edits were diagnosed but not deleted, rewritten, or absorbed to force a green result. The isolated test and later full run passed without mutating those user records.
- Candidate reusable lesson: **Cards Become Coordinates** — preserve ordered Card identity, make energy flow legible, reveal only a redacted destination, and bind every visual state to protocol truth before representing arrival.
