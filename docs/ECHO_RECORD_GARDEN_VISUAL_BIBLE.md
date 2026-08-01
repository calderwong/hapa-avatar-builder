# Echo Record Garden Visual Bible

Status: implementation contract; visual acceptance and external sourcing remain pending  
Program ID: `echo-record-garden-v2-2026-08-01`  
Experience stage: First Pass / Prototype Stage  
Primary route: `/?view=echo-records`

## Truth Boundary

This document directs implementation; it is not evidence that the finished
scene is premium, publicly cleared, or release-ready.

- The current garden environment is project-authored procedural Three.js.
- No external model, generated texture, generated backdrop, generated sound,
  provider task, or downloaded provider output is claimed by this document.
- The credential fields in `ECHO_RECORD_GARDEN_ASSET_LEDGER.json` are blank and
  unresolved because no credential probe was authorized for this documentation
  pass. Blank does not mean `SET` or `MISSING`.
- Echo songs, Director media, Reference images, Avatar/Scene images, and attached
  Cards retain their source ownership, provenance, consent, and rights state.
  Display inside Hapa does not grant Hapa publication or reuse rights.
- A source-by-source public rights and consent review is still required before
  public distribution.
- Premium visual scoring is not claimed until current desktop and compact
  active-use screenshots, renderer diagnostics, and the scorecard gate pass.

Truth labels used in-world and in evidence:

| Label | Meaning |
| --- | --- |
| `SOURCE-BACKED` | Exact source identity and revision are available. |
| `INFERRED · REVIEW PENDING` | Relationship or presentation is inferred and has not been approved as source truth. |
| `GENERATED PLACEHOLDER · REVIEW REQUIRED` | A generated stand-in exists but is not source truth or public-rights evidence. |
| `SOURCE UNAVAILABLE` | The source or attachment is explicitly missing or inaccessible. |
| `LOCAL · UNMINTED` | Deterministic local Card projection; not persisted, minted, canonized, or published. |
| `PLANNED · NO OUTPUT` | An external or hybrid asset route is proposed, but no provider task or file exists. |
| `CREDENTIAL UNRESOLVED` | Credential state was not probed; no availability claim is made. |
| `RIGHTS REVIEW REQUIRED` | Public use has not been cleared. |

## Experience Sentence

On a warm, unhurried afternoon, the listener browses tangible Echo records,
picks one up, seats the same object on a turntable, and watches its exact
Director cut fill one large outdoor cinema while source-bound Records and Hapa
Cards remain touchable on the table.

The visual language should feel intimate and handmade rather than futuristic
for its own sake: sun-warmed wood, cream ceramic, weathered cloth, soft garden
greens, black vinyl, small Hapa signal colors, and moving media as the brightest
surface.

## Visual Hierarchy

Every camera and responsive layout preserves this order:

1. **Large Director Preview** — the brightest and largest surface; one 16:9
   program output, never three competing duplicate screens.
2. **Placed Record and turntable** — the primary physical action and audio
   authority.
3. **Living Records and printed Cards** — nearby, readable, manipulable source
   objects with looping media only while resident in the visible window.
4. **In-world catalog controls** — legible but visually quieter than media.
5. **Garden environment** — depth, warmth, scale, and life without obscuring
   the interaction path.

Fog, particles, shadows, glow, and scenery must never outrank the current media,
hide empty geometry, or obscure a selectable object.

## Composition And Camera

### Desktop reference

- Reference viewport: `1440 × 900`.
- Perspective baseline: 47-degree FOV, near `0.05`, far `100`.
- Baseline camera: position `(0, 6.25, 11.4)`, target `(0, 1.05, -0.35)`.
- Foreground: table edge, one or two cropped records/Cards, flowers or cloth
  edge used as modest framing.
- Midground: turntable, current physical Record, visible catalog page, and
  movable printed Cards.
- Hero plane: the large Preview at approximately `(0, 2.72, -2.68)`, with a
  `7.08 × 3.98` media plane inside a `7.44 × 4.34` frame.
- Background: parasol canopy, trees, path, sky/fog separation, and quiet scale
  cues. Background values remain lower contrast than the Preview.

The turntable sits right of center and the in-world catalog sits left of center,
creating a browse → pick up → place → watch reading path. Orbiting may reveal
depth, but the default camera must communicate that loop without exploration.

### Compact and touch reference

- Reference viewport: `390 × 844`; also verify `844 × 390` and `768 × 1024`.
- The Preview remains readable and is not clipped behind controls or safe-area
  insets.
- The placed Record and catalog retain distinct hit targets; a touch user never
  has to rely on hover.
- The 2D catalog/recovery controls remain an equivalent accessible route, not a
  lesser fallback.
- Minimum touch target is `44 × 44` CSS pixels with visible focus and state
  text. No horizontal page overflow is permitted at 200% text zoom.

## Palette

| Role | Name | Hex | Use |
| --- | --- | --- | --- |
| atmosphere | garden sky mist | `#A8C9C3` | clear background and cool distance |
| atmosphere | fog sage | `#9AB7A9` | depth separation, never concealment |
| ground | lawn sage | `#678B5D` | matte grass base |
| foliage | leaf green | `#47794D` | tree crowns and midground foliage |
| path | sunlit sand | `#B89D74` | garden path and warm neutral scale cue |
| wood | table walnut | `#875936` | primary table surface |
| wood | deep edge | `#4B2F22` | apron, legs, frames, contact structure |
| ceramic | tea cream | `#E9E0CB` | cups, pot, paper-like highlights |
| light | late-afternoon sun | `#FFDDA1` | directional key and warm highlights |
| signal | Hapa amber | `#F6C96D` | current/important secondary signal |
| signal | Hapa cyan | `#56F0CF` | actionable, ready, focus, drop target |
| vinyl | charcoal black | `#111217` | record body and strong media surround |
| text | warm paper | `#F8F3E7` | high-priority readable type |
| accent | flower rose | `#F29AB2` | small environmental accent only |

Song perspective accents remain source-derived and may vary per Record. Color
never substitutes for title, state text, attachment identity, or truth label.

## Lighting And Render Contract

Baseline renderer intent:

- output color space: `THREE.SRGBColorSpace`;
- tone mapping: `THREE.ACESFilmicToneMapping`;
- exposure baseline: `1.08`;
- full-quality DPR cap: `1.65`;
- reduced-motion DPR cap: `1.0`;
- fog baseline: `FogExp2(#9AB7A9, 0.024)`.

Lighting stack:

- one warm directional sun, `#FFDDA1`, from `(-6, 10, 6)`;
- one cool-sky/warm-ground hemisphere fill;
- one contained amber rim/practical near the Preview and player;
- only the directional sun casts a real shadow;
- primary shadow map is at most `1024 × 1024` with bounds limited to the table
  and immediate interaction area.

Lighting must reveal authored form through value, roughness, and contact before
emissive accents are added. Whole objects do not glow. Bloom or another post
pass may be introduced only after an enabled/disabled screenshot comparison
and measured frame-cost evidence; no post-processing pass is claimed here.

Reduced-motion mode disables real-time shadows in the current power profile.
Compact quality may reduce shadow casters or use contact blobs before reducing
the readability of Records, Cards, or the Preview.

## Material Language

Physical materials use shared named roles:

| Role | Material direction |
| --- | --- |
| grass/foliage | high roughness, low saturation variation, instanced where repeated |
| path/soil | dry matte sand, subtle value breakup, no baked directional shadow |
| table/crates | warm walnut with darker end grain/edge role and readable contact |
| picnic cloth | woven matte check, stable texel scale, no moiré at camera distance |
| ceramic | cream semi-gloss with restrained highlight |
| vinyl | near-black, modest metalness, concentric groove response, non-emissive body |
| turntable metal | brushed warm metal on spindle/tonearm, darker matte chassis |
| display frame | dark wood/bronze surround that increases media contrast |
| media surfaces | `MeshBasicMaterial`, tone mapping disabled, exact source color |
| signal trim | small cyan/amber emissive or unlit elements tied to state |

`MeshStandardMaterial` is the default physical surface.
`MeshPhysicalMaterial` is reserved for a visibly valuable clearcoat, glass, or
premium hero detail and must be profiled. Canvas textures need deliberate color
space, mipmap/filter behavior, and disposal. Repeated flowers, trunks, crowns,
grass cards, fasteners, or future foliage use shared geometry/materials and
`InstancedMesh` where practical.

The Record media face and title are separate composed surfaces. Promoting a
poster to video may never erase the title, identity, or truth state.

## Motion And Reduced Motion

### Clock-bound motion

- Physical vinyl reference: `33⅓ RPM`.
- Displayed full-disc media rotation: `8⅓ RPM`, one revolution every 7.2
  seconds, derived from the authoritative audio clock.
- Director shots, shaders/visualizers, camera, transitions, automation, and
  lyrics use the same external audio-clock sample as the Preview.
- Media drift is corrected without making decorative motion or render-frame
  timing authoritative for music.

### Ambient motion

- Sun motes rotate very slowly and breathe within a narrow opacity range.
- Cloth and parasol sway by small angles; neither may read as wind-whipped.
- Foliage motion, if expanded, uses shared low-frequency phase offsets rather
  than one animation allocation per leaf.
- Living Record and Card videos are muted, looping, and plays-inline while
  visible. Offscreen entries are virtualized.

### Reduced-motion contract

- Freeze mote rotation/pulse, parasol sway, cloth sway, decorative Record spin,
  camera damping, and untimed autoplay.
- Preserve the exact audio/Director time and show a poster, retained decoded
  frame, or source-labelled fallback; never substitute black.
- Keep title, focus, selection, playback, attachment, and truth states visible.
- No flashing may exceed 3 Hz.

Page hide, blur, pointer cancellation, lost pointer capture, WebGL loss, and
unmount stop unsafe animation/media work and cannot stack a second loop.

## Procedural Asset Ownership And Disposal

Every factory owns what it creates. A future imported asset registry must obey
the same rule.

| Runtime owner | Resources | Required cleanup |
| --- | --- | --- |
| `createLazySundayScene` | grass/path/table geometry, cloth canvas texture, parasol, instanced trees/flowers, tea set, crates, lights, mote geometry/material | dispose cloth texture; traverse once and dispose geometry/materials; remove no shared resource twice |
| `createRecordPlayer` | chassis, platter, tonearm, spindle, drop ring, Record anchor | release pooled media; traverse and dispose owned geometry/materials |
| `createRecordCatalogConsole` | panel geometry, dynamic title texture, button textures/materials | dispose replaced title texture immediately; dispose button textures and owned geometry/materials on teardown |
| `createAlbumScreens` | frame, hit plane, standby canvas texture, glow | release pool-managed media; dispose standby/fallback and screen geometry/materials |
| `createRecordEntry` | disc/groove/title geometry, label/title/cover textures, optional pooled media | idempotent `disposed` guard; release pool lease; dispose late async texture loads instead of mutating a dead entry |
| `createPrintedCardEntry` | Card geometry, print texture, video plane, optional pooled media | release pool lease; dispose print texture and all owned geometry/materials |
| media pool | HTML video/image resources, video/poster/fallback textures, frame callbacks, event listeners | bounded eviction; pause; cancel callbacks; remove listeners; clear sources; dispose every texture exactly once |
| game closure | RAF, observers, pointer/WebGL/control listeners, renderer | cancel/disconnect/remove; dispose entries, screens, player, catalog, environment, pool, controls, renderer; reset diagnostics |

Rules:

- Shared resources are reference-counted or have one explicit owner.
- Replacing a texture disposes the prior texture after the material is rebound.
- Async callbacks check generation/disposed identity and dispose late results.
- Page changes cannot leak hidden video decoders or texture leases.
- WebGL recovery rebinds from source contracts; it does not duplicate objects.
- Teardown must return renderer geometries/textures to within two of baseline.

## Exact Echo Director Media Lineage

The large Preview is a runtime projection, not a copied or newly authored video.

Canonical flow:

1. Normalize the exact Echo project and stable song ID.
2. Select the requested or newest eligible non-Legacy cut. An explicitly
   requested mismatch fails visibly. Legacy fallback is only allowed when it is
   deliberately requested and visibly labelled as legacy.
3. Preserve cut ID, title, fingerprint/revision, selection basis, projection
   validation, graph schema, and duration projection.
4. Project a deterministic frame from one external audio clock.
5. Compose in fixed order: media → visualizers/shaders → transition →
   automation/camera → lyrics.
6. Stage the frame offscreen and promote it only after required layers succeed;
   a failed frame retains the last valid output.

Minimum observable identity for every presented Director frame:

- song ID and source title;
- cut ID, title, fingerprint/revision, and `legacy` boolean;
- show-graph schema/version or explicit preparation state;
- cue/shot ID, track ID, layer index, start/end, frame, and time seconds;
- media source/card ID, URI route, source hash when declared, poster, source
  in/out, loop/once mode, and transition;
- persistent/Always-On layer IDs and effect parameters;
- camera crop/motion/intensity;
- lyric enabled state, template ID, exact timed lines, and frame state;
- attached Hapa Card ID, attachment freshness, provenance, rights, and consent.

Generated visualizer output is labelled as a clock-bound renderer result, not a
source video. Missing or preparing layers remain explicit and bounded; they do
not silently disappear or fall back to Legacy Baseline.

Clicking the Preview creates an exact Card-print intent bound to song, cut,
fingerprint, cue, frame/time, media source, and attached Card ID. Exact-ID Card
resolution or a truthful failure is required. A deterministic local projection
is allowed only after a confirmed missing attachment and remains
`LOCAL · UNMINTED`.

## In-World Catalog

- One spatial page presents up to ten Record objects.
- Previous, sort, and next actions exist on the physical catalog console and
  have 2D/keyboard/touch equivalents.
- Sort modes are album order, newest Director cut, title, and perspective.
- Search/filter/page changes preserve the stable source song ID and focus.
- Every registered song remains reachable without rendering or decoding the
  entire collection.
- Only Records inside the active visible window may own living-video leases;
  offscreen Records retain domain state and restore their face without gaining
  a new identity.
- Catalog readiness and video availability are text-labelled; title duplicates
  never collapse identity.

## Large Director Preview

- Exactly one primary horizontal display is present.
- Its media plane remains approximately 16:9 and substantially larger than a
  Record or Card face.
- It consumes the shared renderer-only Echo Director Preview runtime and owns
  no second audio clock or Workbench authoring UI.
- Standby, preparing, poster, retained-frame, source failure, and exact mismatch
  states are source-labelled. Black is never the loading design.
- Screen activation prints the exact current attached Card and is available by
  pointer, keyboard, and touch.
- Environment lighting must not tone-map or recolor the media pixels.

## Living Records And Cards

### Records

- One stable Record Object3D survives crate, hand, platter, playing, lifted,
  returned, and restored states.
- Reparenting uses transform-preserving `Object3D.attach`; the platter does not
  create a duplicate vinyl proxy.
- The circular title surface remains separate from the moving media surface.
- A visible video-capable Record begins muted loop playback without platter
  placement, subject to the bounded resident window.
- Poster, reduced-motion, decoder failure, and source-unavailable states retain
  title and truth labelling.
- Removing the playing Record is the physical stop transition and fires once.

### Printed Hapa Cards

- Printed Cards are persistent, movable 3D objects with a readable physical
  frame and a separate living-media plane.
- Card identity, source cut/cue, lineage, and mint truth never change when the
  object moves.
- A Card media lease follows the same visible-window and disposal policy as a
  Record.
- Authoritative edition print, embedded source Card, attached source Card, and
  local-unminted projection remain visually and semantically distinct.

## Performance Budgets

These are implementation gates, not measured completion evidence.

| Budget | Desktop | Compact |
| --- | ---: | ---: |
| reference viewport | `1440 × 900` | `390 × 844` |
| DPR ceiling | `1.65` | `1.25` |
| draw calls | `≤ 140` | `≤ 100` |
| visible triangles | `≤ 350,000` | `≤ 220,000` |
| warmed frame p50 / p95 / p99 | `≤ 18 / 33 / 50 ms` | `≤ 25 / 50 / 80 ms` |
| long-frame ratio | `≤ 5%` | `≤ 10%` |
| primary shadow map | `≤ 1024 px` | `≤ 1024 px` or disabled |
| WebGL context losses | `0` | `0` |

Additional ceilings:

- geometries `≤ 220`, textures `≤ 48`, materials `≤ 96` at the declared
  worst-case view;
- one shadow-casting light and at most three active scene lights;
- first-interaction 3D/texture payload `≤ 12 MiB`;
- any future signature-prop GLB `≤ 4 MiB`, `≤ 120k` visible triangles, and
  textures `≤ 2K` before integration;
- combined Phase 2 media pool candidate `≤ 14` residents: ten visible Record
  faces plus at most four Preview/current/prewarm resources; the exact split
  must be exposed in diagnostics and must never scale with album size;
- valid-media blank frames `0`, media failures in the acceptance run `0`;
- displayed video drift p95 `≤ 0.12 s`, maximum `≤ 0.20 s`;
- after ten Record swaps, post-cleanup heap growth `≤ 25 MiB` and renderer
  resources return within `+2` geometries and `+2` textures of baseline;
- Record Garden lazy chunk target `≤ 210 KiB` raw / `≤ 65 KiB` gzip;
- no more than one measured post-processing pass, with an attributable frame
  cost `≤ 2.5 ms`, if a pass is introduced at all.

Measure production mode after warmup at the same camera, content, viewport, DPR,
and interaction state. Record calls, triangles, geometries, textures, materials,
video residents, decoder readiness, frame histogram, heap, and bundle size.

## Asset Sourcing Direction

The machine-readable sourcing decisions live in
`ECHO_RECORD_GARDEN_ASSET_LEDGER.json`.

- Keep repeated grass, flowers, motes, simple collision proxies, and low-value
  modular detail procedural and instanced.
- Treat the turntable and one high-value garden setting/prop family as future
  hybrid candidates: image reference → generated/imported 3D → local GLB/PBR
  validation → procedural interaction proxy and effects.
- Treat sky/background, material references, decals, and UI/world icon art as
  future image-generation candidates.
- Derive Record labels and Director/Reference/Card media only from exact
  canonical source media; external generation cannot replace source identity.
- Garden ambience and small interaction cues remain a future audio candidate;
  they must duck beneath the song master, unlock from a user gesture, respect
  mute/visibility, and stop without stacking.

All external/hybrid entries remain `PLANNED · NO OUTPUT` until the credential
probe, provider task, immediate local download, hash, source chain, import
diagnostics, and rights/custody fields are complete.

## Visual Acceptance Gate

Current visuals remain unscored until active desktop and compact screenshots
are captured from the exact build.

Premium acceptance requires:

- all ten visual scorecard categories at least `2/3`;
- average at least `2.3`;
- no primitive-dominant hero/world, sparse plane/box environment, glow-only
  detail, stat-card HUD, mobile clipping, missing active-use screenshot, or
  missing renderer diagnostics;
- nonblank canvas, real pointer/keyboard/touch journey, console/network audit,
  current-build bundle identity, and documented performance results;
- complete source and rights evidence for every asset shown in a public build.

If any category remains below threshold, the exact next pass remains open; the
experience is not labelled premium or complete.

## Ownership And Implementation Order

1. `src/domain/echo-record-garden.js` owns stable Record/source truth and
   normalized visual surfaces.
2. `src/domain/echo-record-garden-runtime.js` owns physical lifecycle, living
   face, bounded media, and placement-latency contracts.
3. `src/domain/echo-director-preview-runtime.js` owns exact frame projection and
   one-clock compositor semantics.
4. `src/components/EchoRecordGarden3DView.jsx` owns Three.js objects, transforms,
   interaction, material factories, environment, media leases, and disposal.
5. Exact Card resolution remains in `src/domain/echo-record-card-resolution.js`.

Implementation sequence: freeze this bible and ledger → baseline current
screenshots/metrics → resolve sourcing credentials and rights boundaries →
author/import the signature surfaces → integrate with named owners and disposal
→ tune materials/lighting → verify motion/reduced motion → profile → capture
desktop/compact evidence → score → human acceptance.

## Reuse And Learning Checkpoint

- **Objective:** make Record Garden feel like one coherent physical listening
  world without weakening source truth or resource bounds.
- **Reused:** Tarot Draw spatial grammar; stable Record/Card identity; existing
  Echo Director frame contracts; current procedural garden factories; pooled
  media and teardown patterns.
- **Deliberately left alone:** Tarot Draw ownership, source Song/Director/Card
  records, master audio, mint authority, and public rights decisions.
- **Guardrail:** no visual polish, external asset, or generated output can
  replace exact media lineage, hide a missing state, create a second clock, or
  bypass lifecycle disposal and measured budgets.
