# Echo Record Garden: Franchise-Neutral Diorama System Transfer

Date: 2026-08-01  
Stage: First Pass / Prototype Stage  
Visual acceptance: pending current-build fixed-shot review  

## Objective

Study the local `pallet-town-3d` reference application, extract its reusable
real-time environment design and engineering methods, package those methods as
skills, and apply them to Echo Record Garden without copying franchise content
or weakening the existing Record, Director media, interaction, accessibility,
performance, or provenance contracts.

The nearest owned surface remained
`src/components/EchoRecordGarden3DView.jsx`; the work extended its garden scene
through a dedicated visual-system module instead of replacing the Record Garden
experience or the Tarot Draw owner.

## Evidence Inspected

- The reference application's `ART_DIRECTION.md`, `LICENSE`, rendered arrival
  and close-world views, and its environment systems in `src/world/Atmosphere.ts`,
  `src/core/TextureLab.ts`, `src/core/Engine.ts`, `src/world/Vegetation.ts`, and
  `src/fx/FoliageMaterials.ts`.
- The reference declares the MIT License and copyright 2026 Paulius.
- The current Record Garden visual bible, asset ledger, Three.js owner, media
  plane dimensions, reduced-motion path, renderer settings, lifecycle tests,
  and lazy-chunk budget.
- The implemented destination module,
  `src/components/echo-record-garden-visual-system.js`, including its palette,
  texture bakery, PMREM environment, lights, instanced scenery, shared-clock
  updates, metrics, and disposal path.
- A non-secret credential-presence probe for Tripo, Gemini, and ElevenLabs. All
  three results were blank/unset. No provider task or output was created.

## What Worked

- Treating the reference as a system study produced a coherent destination
  contract: one role-based palette, one atmosphere owner, one material bakery,
  one environmental clock, and one performance profile.
- A deterministic periodic surface field could provide related tileable
  albedo/normal pairs for five destination substances without importing or
  copying any reference texture.
- The reference's compact lighting principle translated well: one warm key,
  one cool-sky/green-ground hemisphere fill, one restrained warm bounce, one
  shadow caster, a visible sky-derived PMREM response, and horizon-matched fog.
- Softened edges, thick trim, contact rings, ground-level scatter, distant
  landmarks, and foreground/midground/background layering added authored depth
  without changing the hero interaction layout.
- Instancing preserved environmental density for hills, trees, crowns, hedges,
  grass, flowers, pebbles, and fence posts while keeping object growth bounded.
- The shared visual clock supports clouds, leaf drift, chime motion, parasol,
  cloth, and motes, while the reduced-motion branch restores stable home poses.
- The one large Director media plane remains unlit, tone-map-free, and
  fog-free. The
  environment adds no post-processing pass, so the scene treatment does not
  recolor or downgrade the source media.

## What Was Noise

- Franchise-specific characters, names, dialogue, symbols, layout cues, and
  recognizable visual motifs were irrelevant to the Record Garden objective.
- The reference's larger post-processing stack and higher quality-tier shadow
  options were not appropriate evidence for enabling post effects in a
  media-first destination with a tighter lazy-chunk and runtime budget.
- Its game-scale traversal, combat/creature systems, water, interiors, and
  audio design were outside this environment pass.
- A current Record Garden browser capture could not be obtained through the
  available in-app browser because a saved permission blocked that local route.
  This is not visual evidence and must not be worked around or rewritten as a
  passing acceptance review.

## What Was Misunderstood Or Corrected

- “Bring over the reference” was resolved as transferring abstract methods,
  ratios, ownership patterns, and review discipline—not source files, textures,
  palette values, franchise assets, or signature content.
- “Related PBR maps” does not justify claiming a generated roughness bitmap.
  The destination currently emits related albedo and wrapped-derivative normal
  maps; roughness remains a substance-specific material scalar and is labelled
  that way in the material manifest.
- More visual richness did not require more screens, more lights, or bloom. The
  interaction contract still calls for exactly one dominant 16:9 Director
  Preview, at most three active lights, one shadow caster, and zero current
  post-processing passes.
- A passing JSON manifest is workflow evidence, not proof of beauty,
  performance, accessibility, or current-build acceptance.

## What Changed

- Added a sun-washed, franchise-neutral palette spanning sky, haze, grass,
  foliage, soil, timber, stone, cream, signals, vinyl, and flowers.
- Added five deterministic `128 × 128` tileable albedo/normal surface pairs:
  grass, soil, wood, bark, and textile.
- Added a `512 × 256` gradient/halo sky, sky-derived PMREM response,
  `FogExp2(#BCD9D7, 0.0165)`, and a three-light/one-shadow rig.
- Rebuilt the supporting set with rounded table planks, screen/player/catalog
  surrounds, parasol trim, wind chime, trees with layered crowns, hedges, path,
  grass, flowers, pebbles, fence, pavilions, tea setting, crates, clouds, leaf
  drift, and sun motes.
- Exposed a deterministic visual profile with three active lights, one shadow
  caster, twelve environment-owned textures, twelve material roles, 420
  instanced details, and zero post-processing passes.
- Rebuilds the sky-derived PMREM target after WebGL context restoration and
  disposes both attached and unattached material-kit bases idempotently.
- Updated the visual bible and asset ledger, and added machine-checkable
  diorama and material manifests.

## Reusable Skills

- `stylized-diorama-environment-design`: art-direction contract, system
  ownership, layered composition, compact light rig, shared motion,
  deterministic review, accessibility, and performance discipline.
- `threejs-procedural-material-lab`: periodic surface fields, shared-height map
  lineage, wrapped normals, color-space/finalization rules, causal roughness,
  cache identity, and material-manifest validation.

These skills are derived artifacts from this turn's evidence. They preserve the
reference and destination lineage rather than replacing the attributed source
turn or claiming ownership of the reference application.

## Guardrails

1. Do not copy reference code, textures, characters, names, icons, trademarked
   designs, audio, dialogue, or signature franchise content. If compatible
   MIT-licensed source is ever copied later, record the exact files and retain
   the required notice.
2. Preserve stable Record identity, exact Director cut and cue lineage, attached
   Card receipts, the authoritative audio clock, and truthful loading/failure
   states.
3. Keep the Director media surface separate, unlit, and tone-map-free. Any
   future post pass requires measured cost and enabled/disabled media-parity
   evidence.
4. Keep at most three active scene lights and one shadow caster unless a new
   measured contract is approved.
5. Use deterministic placement and related surface fields; do not introduce
   `Math.random()` into scene construction.
6. Keep repeated detail instanced and owned cleanup idempotent. Async media and
   texture callbacks must not mutate disposed entries.
7. Reduced motion must preserve all non-motion state cues and exact Director
   time while stabilizing decorative motion.
8. Do not label the result premium or complete until current desktop and
   compact fixed shots, renderer diagnostics, real interaction journeys, and
   the visual scorecard meet the documented gate.
9. The blank/unset credential probe authorizes no provider activity. Any future
   external asset route requires a fresh readiness check plus task, download,
   hash, custody, terms, and public-rights evidence.
