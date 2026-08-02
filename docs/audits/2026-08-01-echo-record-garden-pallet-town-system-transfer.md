# Echo Record Garden: Franchise-Neutral Diorama System Transfer

Date: 2026-08-01  
Stage: First Pass / Prototype Stage  
Implemented profile: `echo-record-garden-sunwashed-diorama-v2`  
Visual acceptance: live desktop and compact fixed-shot review pending  

## Objective

Study the local `pallet-town-3d` reference application, extract reusable
real-time environment design and engineering methods, package those methods as
skills, and apply them to Echo Record Garden without importing franchise
content or weakening Record identity, exact Director media, interaction,
accessibility, performance, provenance, or cleanup contracts.

The nearest owned surface remains
`src/components/EchoRecordGarden3DView.jsx`. The destination work extends that
experience through `src/components/echo-record-garden-visual-system.js` and an
isolated procedural-noise helper rather than replacing the Record Garden or
changing Tarot Draw ownership.

## Evidence Inspected

- The reference application's `ART_DIRECTION.md`, `LICENSE`, rendered arrival
  and close-world views, plus its atmosphere, texture, material, building,
  props, and vegetation systems.
- Upstream revision `d49e0c0de836892133b3b21f50c9d29749879db5`,
  licensed under MIT with copyright 2026 Paulius.
- The destination's visual bible, asset ledger, Three.js owner, exact media
  plane, reduced-motion path, renderer settings, lifecycle contract, and
  lazy-chunk budget.
- The implemented v2 visual profile, including the noise helper, related
  surface baker, material kit, clustered layout, scene dressing, wind states,
  lighting, metrics, and disposal path.
- `THIRD_PARTY_NOTICES.md`, which records the exact upstream revision, files
  consulted or adapted, local adaptations, copyright, and MIT License text.
- A non-secret credential-presence probe for Tripo, Gemini, and ElevenLabs. All
  three results were blank/unset. No provider task, download, or output exists.

## What Worked

- Treating the reference as both a system study and a licensed-code lineage
  produced one coherent destination contract: role-based palette, atmosphere
  owner, cached material bakery, deterministic scatter, environmental clock,
  and performance profile.
- Ten deterministic tileable surface families now produce related albedo,
  wrapped-derivative normal, and roughness maps from the same height field:
  grass, soil, wood, bark, stone, textile, plaster, red roof tile, blue roof
  tile, and leaf.
- The compact lighting principle transferred well: one warm key, one
  cool-sky/green-ground hemisphere fill, one restrained warm bounce, one shadow
  caster, a visible sky-derived PMREM response, and horizon-matched fog.
- Authored density is clustered around landmarks and away from the interaction
  quiet zone. That gives visual rhythm without uniform scatter or a blocked
  browse/place/watch path.
- The Director Preview gained a physical timber, shade, light, fastener, vine,
  planter, and bird-bath setting without changing the exact `7.08 × 3.98`
  media plane or its unlit, tone-map-free, fog-free source-pixel contract.
- The two far landmarks are now compositionally distinct: an open trellis with
  a daybed, and a roofed listening canopy with a bench and record shelf.
- Shared wind uniforms animate screen vines, planter leaves, tree crowns,
  grass, flower heads, and flower stems from one elapsed-time sample. Reduced
  motion zeros both wind time and strength.
- Instancing preserves density for hills, trees, crowns, contact shadows,
  hedges, grass, flowers/stems, clover, pebbles, fallen leaves, fence posts,
  screen vines, and planter leaves while keeping resource growth bounded.

## What Was Noise

- Franchise-specific characters, names, dialogue, symbols, recognizable town
  layout, creatures, and signature motifs were irrelevant to this destination.
- The reference's larger post-processing stack and game-scale traversal,
  combat, water, interiors, and audio systems were outside this media-first
  environment pass.
- More visual richness did not require more Director screens, more active
  lights, or bloom. One dominant horizontal program output remains the hero.
- A live Record Garden fixed-shot capture could not be obtained through the
  available in-app browser because its saved permission blocked the local
  route. This is not acceptance evidence and was not worked around.

## What Was Corrected

- The initial “abstract methods only; no reference code” statement became
  inaccurate once a general-purpose procedural-noise helper and destination
  systems were adapted under MIT. The v2 record now names the adapted local
  files and retains the exact license and upstream revision in
  `THIRD_PARTY_NOTICES.md`.
- The initial five-family, albedo/normal-only description no longer matched the
  implementation. V2 uses ten cached power-of-two families—five hero/large-area
  families at `256 × 256` and five secondary families at `128 × 128`—and emits
  all three related PBR channels. Roughness is no longer documented as
  scalar-only.
- The earlier 12-texture/12-material-role/420-instance profile no longer
  described the scene. V2 owns 33 shared textures, exposes 19 base material
  roles, and reports 1,140 instanced details.
- The two distant pavilions were not left as mirrored duplicates. Their
  silhouettes, furnishing, roof/open structure, and listening functions differ.
- A passing manifest or focused test is implementation evidence, not proof of
  beauty, runtime performance, accessibility, public rights, or current-build
  visual acceptance.

## Implemented V2 Inventory

- Material families: five hero/large-area families at `256 × 256` plus five
  secondary families at `128 × 128`; 10 cached families ×
  albedo/normal/roughness = 30 shared surface textures.
- Additional owned textures: one `512 × 256` sky, one `128 × 128` cloud
  silhouette, and one `64 × 64` contact shadow; 33 owned shared textures total.
- Clustered ground layout: 360 grass tufts, 160 flower heads with 160 stems,
  144 clover patches, 54 pebbles, and 72 fallen leaves.
- Supporting authored structures: timber/vine/shade Director screen surround,
  paired planters, bird bath, open-trellis daybed, roofed listening canopy and
  record shelf, parasol, wind chime, tea setting, crates, fence, trees, hedges,
  clouds, drifting leaves, and sun motes.
- Lighting: three active lights, one shadow caster, zero post-processing passes,
  and a `1024 × 1024` hero shadow map tightly fitted to a `19 × 19` frustum.
- Runtime construction metrics: 19 material roles, 1,140 instanced details, 15
  authored set-piece groups, shared wind state, and adaptive reduced/full tiers.
- Exact media parity: one unchanged horizontal Director media plane using
  `MeshBasicMaterial` with `toneMapped: false` and `fog: false`.

These are deterministic construction facts, not warmed frame-time, draw-call,
interaction, or visual-quality acceptance results.

## Reusable Skills

- `stylized-diorama-environment-design`: art-direction contract, system
  ownership, layered composition, landmark differentiation, compact light rig,
  shared motion, deterministic review, accessibility, and performance
  discipline.
- `threejs-procedural-material-lab`: periodic surface fields, shared-height map
  lineage, wrapped normals, emitted causal roughness, color-space/finalization
  rules, cache identity, lifecycle ownership, and manifest validation.

The skills preserve source attribution and destination truth rather than
replacing the attributed source turn or claiming ownership of the reference.

## Guardrails

1. Retain `THIRD_PARTY_NOTICES.md` whenever the MIT-adapted noise or visual
   system ships, and keep its revision/file/license record synchronized with
   material changes.
2. Do not import upstream binary textures, models, characters, names, icons,
   recognizable layouts, audio, dialogue, or other franchise content.
3. Preserve stable Record identity, exact Director cut/cue lineage, attached
   Card receipts, the authoritative audio clock, and truthful loading/failure
   states.
4. Keep the Director media plane separate, unlit, tone-map-free, and fog-free.
   Any future post pass requires measured cost and media-parity evidence.
5. Keep at most three active scene lights and one shadow caster unless a new
   measured contract is approved. Keep the primary shadow frustum
   fitted to the hero region.
6. Use deterministic placement and related surface fields; do not introduce
   `Math.random()` into scene construction.
7. Keep repeated detail instanced and cleanup idempotent. Async media and
   texture callbacks must not mutate disposed entries.
8. Reduced motion must preserve all non-motion state cues and exact Director
   time while stabilizing decorative motion and shared wind.
9. Do not label the result premium or complete until current desktop and
   compact fixed shots, renderer diagnostics, real interaction journeys, and
   the visual scorecard meet the documented gate.
10. The blank/unset credential probe authorizes no provider activity. Any
    future external asset route requires a fresh readiness check plus task,
    download, hash, custody, terms, and public-rights evidence.
