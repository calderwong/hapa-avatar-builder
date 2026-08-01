# Echo Record Garden Phase 2 Program

Status: planned from direct operator feedback; implementation pending  
Program ID: `echo-record-garden-v2-2026-08-01`  
Board project: `hapa-echo-music-video-direction`  
Baseline implementation: `71e2f31d24e9d5b4cb130c98b2ca82fd9ec783db`  
Claim boundary: First Pass / Prototype Stage

## Objective

Turn the Record Garden from a media control surface placed in a 3D scene into
a coherent physical listening world. A Record remains one persistent object
through browsing, pickup, placement, playback, removal, and restore. Every
visible Record with usable media presents a looping video label and readable
song title. The turntable drives one large cinematic Echo Album display whose
output matches the selected Director Preview, including shaders, camera motion,
visualizers, and transitions. The world supports direct visual-to-Hapa-Card
printing, idle hover listening, spatial collection browsing, and a richer
lazy-Sunday garden atmosphere without sacrificing bounded media resources,
accessibility, or source truth.

The existing first-pass cards and their evidence remain append-only history.
This phase does not rewrite tasks 1–14. Its final acceptance provides the new
current-revision evidence needed to resolve the deferred first-pass visual QA
and closeout cards.

## Feedback Traceability

| Feedback | Phase 2 cards |
| --- | --- |
| 1. One Record remains real through pickup, placement, playback, and removal | 01, 03, 12, 13 |
| 2. Record-face video loops and includes the song title | 02, 13 |
| 3. Placement buffering must become fast | 03, 13 |
| 4. One large screen must match Echo Album Preview, including Director effects | 04, 05, 13 |
| 5. Click the preview to print the exact attached movable Hapa Card | 06, 07, 12, 13 |
| 6. All visible Records with videos start in their looping state | 02, 09, 13 |
| 7. Hover previews a song only while the turntable is idle | 08, 12, 13 |
| 8. Browse and sort the full collection inside 3D | 09, 12, 13 |
| 9. Invest in atmosphere, lighting, scenery, texture, animation, and larger previews | 05, 10, 11, 13 |

## Experience Contracts

### Persistent Record reality

- One stable Record entity owns identity, transform, face media, sleeve state,
  platter state, and interaction state.
- Pickup, drag, platter placement, play, pause, removal, and return move or
  reparent that entity; they never replace it with a visually similar clone.
- Removing the Record is the physical stop gesture. Audio, Director playback,
  and platter rotation stop from the same transition while the lifted object
  remains under the user's control.
- Snapshot restore rehydrates the same stable entity identity and never creates
  a duplicate sleeve, platter proxy, or orphaned playing object.

### Living Record faces

- Every currently rendered Record with a valid video starts as a muted,
  plays-inline, looping video label without requiring platter placement.
- The title remains legible on the Record itself in motion, reduced motion, a
  poster fallback, and a media failure state.
- Offscreen collection entries are virtualized rather than allocating one
  decoder per song. Re-entering the visible set restores the looping state
  without changing the Record identity.

### Fast placement

- Platter seating is visually immediate and never waits for a whole Director
  project download.
- Current audio, current Director cue, the large-screen poster, and the next
  likely Record are prewarmed through separately bounded caches.
- The measured target is warmed audio start at or below 500 ms p95 and cold
  local start at or below 1.5 seconds p95 after placement. A source-labeled
  poster or retained valid frame appears immediately; black is never the
  loading state.
- The instrumentation distinguishes placement, audio unlock, fetch, metadata,
  decode, first frame, and Director-graph preparation time.

### Echo Preview parity

- Record Garden consumes the same normalized Director show graph and render
  semantics as Echo Album Preview instead of maintaining a simplified visual
  approximation.
- The reusable boundary is a renderer-only `EchoDirectorPreviewRuntime` with an
  external audio clock. It is extracted from the Preview path in
  `HapaEchosView.jsx`; the Garden does not embed the Workbench, its authoring
  menus, or a second audio/render loop.
- The large display honors shot timing, source in/out/loop, shaders, Always-On
  layers, camera movement, visualizers, lyrics when enabled, transitions,
  orientation, and deterministic audio-clock timing.
- Exact song, cut ID, cut revision, shot ID, layer IDs, visual source IDs, and
  effect parameters are observable. A mismatch fails visibly and never falls
  back to Legacy Baseline.
- One large horizontal display replaces the three duplicated small displays.
  Reference, character, scene, and Card interactions become contextual
  surfaces or printed physical objects rather than duplicate screens.

### Direct Hapa Card printing

- No persistent "Generating Attached Hapa Card" menu is shown.
- Clicking or activating the large preview captures the exact current visual
  context and resolves its attached Card through authoritative edition,
  embedded Card, or exact attachment identity.
- The environment visibly prints one movable Hapa Card containing its looping
  media, title, source/cut/shot details, lineage, and honest mint state.
- Printing is idempotent for the same visual identity. Failure, ambiguity,
  rights blocks, and confirmed missing attachments remain truthfully distinct.

### Spatial collection and idle listening

- Hover or keyboard focus may preview a song only when no platter song is
  playing. A dwell threshold prevents fly-by audio; one preview fades out
  before another begins.
- Platter playback always has priority and cancels hover audio immediately.
  Touch receives an explicit equivalent preview action rather than relying on
  hover.
- The full collection can be browsed, sorted, filtered, paged, and focused
  through in-world crates, shelves, or carousels. The 2D controls remain an
  equivalent accessibility and recovery path, not the only catalog surface.

### Garden atmosphere

- The scene receives an authored lazy-Sunday visual bible covering palette,
  sun and fill direction, time-of-day behavior, material language, foliage,
  table dressing, ambient motion, environmental audio, and performance tiers.
- At least one high-value environment or signature-prop surface follows the
  Three.js external asset sourcing gate. Credentials and generated/imported
  asset lineage are recorded; procedural-only hero treatment is not assumed.
- Lighting, shadows, materials, texture density, foliage motion, particles,
  depth layers, sky/horizon, and ambient life improve together. Glow alone is
  not considered an environment pass.
- The cinematic display and Record/Card media remain the visual hierarchy;
  scenery supports rather than obscures interaction and legibility.

## Source Ownership Map

- `src/components/EchoRecordGarden3DView.jsx` owns the Three scene, persistent
  Record/Card object registry, raycasting, reparenting, spatial catalog,
  turntable, large screen, environment kit, and lifecycle cleanup.
- `src/components/HapaEchosView.jsx` is the current Echo Preview behavior owner;
  its renderer-only show-graph/compositor boundary should be extracted for
  reuse instead of copied into Record Garden.
- `src/domain/echo-record-garden.js` owns stable Record identity, catalog sort
  and layout, preview manifests, playback state transitions, timing, and
  snapshot migration.
- `src/domain/echo-record-card-resolution.js` remains the authoritative exact
  Card resolution boundary.
- Existing Record Garden playback, lifecycle, Card, controls, and mobile
  accessibility tests remain owners for regression. Add
  `echo-record-garden-preview-parity.test.mjs` for fixed-time Workbench/Garden
  frame-state equivalence.

## Phase 2 Board

### 01 — Persistent Record entity and physical lifecycle

Create one stable Record entity/state machine across crate, hand, platter,
playing, lifted, returned, and restored states. Replace clone/proxy swaps with
transform/reparent operations and make removal the physical stop gesture.

Dependencies: first-pass tasks 02, 04, 07, and 10.  
Initial column: Ready.

Acceptance:

- Stable entity and media identity survive every state transition.
- Pickup/placement/removal never duplicates, teleports, or visually replaces
  the Record; removal stops audio and Director time exactly once.
- Reload, cancellation, pointer loss, and WebGL recovery cannot leave an
  invisible playing proxy or two copies of one song.

### 02 — Living looping Record faces and title labels

Give every visible Record with usable media a looping video face and readable
song title from its first appearance, with poster, reduced-motion, and failure
fallbacks plus viewport virtualization.

Dependencies: 01 and first-pass task 08.  
Initial column: Backlog.

Acceptance:

- All visible video-capable Records loop without platter placement.
- Video and title use separate composed surfaces so texture promotion cannot
  erase the label; title text remains legible at rest, while spinning, and
  under fallback.
- Decoder/texture counts follow the visible virtualization window rather than
  total album size.

### 03 — Placement prewarm and latency budget

Separate lightweight audio/first-frame readiness from full Director graph
loading, prewarm likely selections, retain a valid poster/frame, and expose a
placement latency trace.

Dependencies: 01, 02, and first-pass task 12.  
Initial column: Backlog.

Acceptance:

- Platter seating responds in the same interaction frame.
- Warm audio start is at most 500 ms p95; cold local start is at most 1.5 s p95
  in the recorded benchmark environment.
- Warm placement promotes the already prepared audio/video resources and does
  not issue the disposable metadata probe plus second fetch used by the old
  path.
- No black loading state, unbounded preload, duplicate audio element, or whole
  project fetch blocks playback intent.

### 04 — Shared Echo Preview parity adapter

Extract or reuse the canonical Echo Album Preview show-graph evaluation and
compose contract so Record Garden consumes exact shots, shaders, camera motion,
visualizers, transitions, lyrics state, and Always-On layers.

Dependencies: first-pass task 08 and the current Echo Album preview/compiler
contract.  
Initial column: Ready.

Acceptance:

- Fixed song/cut/time fixtures produce the same normalized frame recipe in
  Echo Album Preview and Record Garden.
- The extracted `EchoDirectorPreviewRuntime` owns no authoring UI, accepts one
  external audio clock, renders one offscreen output canvas, and exposes the
  current primary media cue and Card identity.
- Exact cut, shot, layer, source, effect, transition, and timing identity are
  retained; Legacy fallback is prohibited.
- Unsupported or preparing operations are labeled and bounded instead of
  silently disappearing.

### 05 — One large cinematic Director display

Replace the three small duplicate displays with one substantially larger 16:9
horizontal surface driven by the parity adapter. Recompose the garden camera
and interaction hit areas around that screen.

Dependencies: 04.  
Initial column: Backlog.

Acceptance:

- Only one primary Director display is present and it occupies at least the
  combined readable area of the prior three displays.
- The display frame, pixels, shader layers, camera motion, visualizers, and
  transitions match the Echo Preview fixture at sampled timestamps.
- Desktop, compact, touch, and reduced-motion layouts retain readable media,
  controls, and scene depth without clipping.

### 06 — Click-to-print exact visual Card

Remove the persistent Card-generation menu and turn large-screen activation
into an exact current-visual Card print request with explicit pending, printed,
unminted, blocked, and failed states.

Dependencies: 04, 05, and first-pass task 09.  
Initial column: Backlog.

Acceptance:

- Screen activation binds song, cut revision, shot, layer, source, time, and
  attachment identity at click time.
- The same exact visual request deduplicates while pending and after success.
- No menu is needed for the normal flow; keyboard and touch activation remain
  available and truth-safe failures never impersonate a minted Card.

### 07 — Physical movable looping Hapa Cards

Materialize printed results as persistent, movable 3D Hapa Card objects with
looping media, readable details, lineage, and saved transforms.

Dependencies: 01 and 06.  
Initial column: Backlog.

Acceptance:

- A printed Card visibly emerges in-world, keeps its exact media/details, and
  can be picked up, moved, placed, inspected, and restored.
- Card video loops while visible under the same bounded media policy as Records.
- Moving or removing a Card cannot change the source Record, Director clock,
  attachment identity, or mint truth.

### 08 — Idle hover/focus audio preview arbiter

Add dwell-based Record preview audio when the platter is idle, with one shared
preview authority, crossfade/cancel behavior, keyboard parity, and an explicit
touch equivalent.

Dependencies: 01 and 03.  
Initial column: Backlog.

Acceptance:

- Hover/focus previews never interrupt or mix with platter playback.
- A dwell threshold prevents fly-by audio and rapid focus changes leave no
  leaked preview source.
- Platter placement cancels preview audio immediately; mute, visibility,
  reduced-motion, and unmount policies remain coherent.

### 09 — In-world full collection browser

Create spatial crates, shelves, carousels, or related diegetic controls for the
full song collection with sort, filter, search, paging, focus, and placement.

Dependencies: 01 and 02.  
Initial column: Backlog.

Acceptance:

- Every registered song is reachable in-world by stable ID without rendering
  or decoding the full collection simultaneously.
- Title, recency, album/order, readiness, and available-video sorting/filtering
  agree with the 2D form controls.
- Pointer, keyboard, touch, and screen-reader equivalents maintain selection,
  focus, and Record identity across pages and camera changes.

### 10 — Environment asset sourcing and visual/audio bible

Define the premium lazy-Sunday garden art direction, run the credential probe,
inventory reusable local assets, and choose procedural, generated, imported, or
hybrid sources for hero environment pieces, textures, sky, props, UI art, and
ambient sound.

Dependencies: first-pass tasks 06 and 12.  
Initial column: Ready.

Acceptance:

- The visual bible specifies palette, lighting, materials, texture scale,
  foliage, motion, sky/depth, table dressing, display hierarchy, and performance
  tiers with desktop/compact reference frames.
- The asset ledger records `TRIPO_API_KEY`, `GEMINI_API_KEY`, and
  `ELEVENLABS_API_KEY` as SET/MISSING only, never secrets, plus every chosen
  asset's source, license/custody, budget, and output path.
- At least one high-value visual surface has external or hybrid evidence unless
  a permitted credential/API blocker is recorded; ambient audio has an explicit
  generated, existing, or blocked disposition.

### 11 — Premium garden environment and cinematic composition

Implement the visual bible: authored scenery and prop kit, layered materials,
sun/fill/rim lighting, shadows, foliage and cloth motion, particles/ambient life,
sky/horizon depth, environmental audio, and larger media composition.

Dependencies: 05, 07, 09, and 10.  
Initial column: Backlog.

Acceptance:

- All ten Three.js visual scorecard categories reach at least 2/3 with no
  automatic failure for sparse primitives, glow-only detail, or unreadable UI.
- Renderer diagnostics, imported asset budgets, draw calls, triangles,
  textures, shadow cost, DPR tiers, and reduced-motion fallbacks are recorded.
- The target ceiling is 140 draw calls / 350k visible triangles on desktop and
  100 / 220k on compact, with a 1024px-or-smaller primary shadow map, a 12 MiB
  first-interaction 3D/texture payload, and no context losses. Any justified
  change becomes an explicit Decision Card rather than an invisible regression.
- The large screen, Records, and Cards remain visually dominant and actionable
  across desktop and compact captures.

### 12 — Responsive, accessible, and persistent integration

Integrate the new physical lifecycle, large display, printing, Cards, hover
preview, spatial catalog, and environment with snapshot migration, keyboard,
screen reader, touch, coarse pointer, reduced motion, safe areas, and recovery.

Dependencies: 01–09 and 11.  
Initial column: Backlog.

Acceptance:

- Complete desktop pointer/keyboard and compact touch journeys cover browse,
  preview, place, play, remove, print, move Card, save, reload, and recover.
- Snapshot migration preserves stable Record/Card IDs and transforms without
  auto-playing, duplicating, or losing source lineage.
- Focus, names, states, errors, touch targets, text fit, safe areas, contrast,
  and reduced-motion behavior pass the recorded accessibility matrix.

### 13 — Performance, preview-parity, and regression QA

Run automated and live verification across object reality, media readiness,
Director Preview parity, Card printing, hover arbitration, spatial browsing,
environment budgets, lifecycle cleanup, Tarot regression, and renderer health.

Dependencies: 03–12.  
Initial column: Backlog.

Acceptance:

- Fixed timestamp captures and frame recipes prove Echo Preview/Record Garden
  parity for video, shader, camera, visualizer, transition, lyrics state, and
  timing.
- Placement latency, frame pacing, audio/video drift, decoder/texture pool,
  memory plateau, GPU/renderer counts, and teardown meet declared budgets over
  repeated record and Card interactions.
- At 1440×900, DPR at most 1.65, the warmed frame target is p50 at most 18 ms,
  p95 at most 33 ms, p99 at most 50 ms, and at most 5% long frames. At 390×844,
  DPR at most 1.25, targets are 25/50/80 ms and at most 10% long frames. After
  ten Record swaps, cleanup heap growth is at most 25 MiB and renderer resources
  return within two geometries and two textures of baseline.
- Focused/full tests, production build, nonblank canvas pixels, console/network
  audit, desktop/mobile screenshots, playtest paths, and Tarot regression pass
  on the exact build.

### 14 — Human acceptance, release, and learning closeout

Run the current-build guided operator review, record the nine feedback outcomes,
close the deferred first-pass acceptance cards only when supported, and publish
the append-only release, lineage, rollback, and reusable-learning checkpoint.

Dependencies: 13.  
Initial column: Backlog.

Acceptance:

- A human verifies all nine feedback points on the exact desktop and
  compact/touch build and saves a passing receipt or an exact issue receipt.
- The board closes only after every Phase 2 task has evidence and the deferred
  first-pass task 13/14 acceptance requirements are truly satisfied.
- Release notes name verified, degraded, blocked, and future work; asset/source
  lineage, rollback, privacy, rights, and First Pass boundaries remain explicit.

## Initial Dependency Projection

- Ready in parallel: 01 persistent Record reality, 04 Echo Preview parity
  adapter, and 10 environment asset/visual bible.
- Backlog: 02, 03, 05–09, and 11–14.
- No Phase 2 card is marked complete at creation.
- Existing first-pass tasks 13 and 14 remain blocked until Phase 2's exact-build
  human acceptance provides the missing evidence.

## Verification And Evidence Gates

Implementation must load and apply the Three.js gameplay, graphics, UI,
debug/profile, and QA/release reference gates at phase entry. Premium environment
work must also record the 3D/image/audio sourcing ledgers before choosing a
procedural-only path. Completion requires:

- focused and full repository tests;
- production build and exact served-bundle identity;
- nonblank live canvas evidence at desktop and compact/touch sizes;
- fixed-time Echo Preview parity fixtures;
- placement and first-frame latency distributions;
- renderer, decoder, texture, memory, and lifecycle diagnostics;
- visual scorecard and active playtest checklist;
- current-build human acceptance for all nine feedback points;
- append-only task updates, blockers, handoffs, and final checkpoint.

## Authority Boundary

This plan authorizes local implementation and verification inside Hapa Avatar
Builder. It does not authorize GitHub publication, public deployment, minting,
canon promotion, rights transfer, third-party asset reuse beyond documented
terms, or any claim of general production readiness.
