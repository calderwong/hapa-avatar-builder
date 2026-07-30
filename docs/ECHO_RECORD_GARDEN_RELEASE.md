# Echo Record Garden — First Pass Release Record

Date: 2026-07-30  
Program: `echo-record-garden-2026-07-30`  
Stage: First Pass / Prototype Stage  
Canonical Builder base revision inspected: `227a741062e040fdcfa83a1663e1f49765817a0e`

## Delivered Experience

Hapa Avatar Builder now has an independent, lazy-loaded **Echo Record Garden**
host at `?view=echo-records`. It projects the 157 live Echo Director summaries
into stable circular record objects, places six records at a time on a warm
outdoor listening table, and provides equivalent semantic crate controls for
search, perspective filtering, selection, placement, playback, seeking, visual
inspection, and attached-Card generation.

A selected record can be dragged to the turntable or placed with the accessible
control. The canonical audio element is the only playback clock. Vinyl rotation
is derived from absolute media time at 33⅓ RPM, and the three bounded visual
surfaces follow that same live clock for timed Director shots. Reference,
character, and scene surfaces retain their source role and truth label.

Clicking a visual first attempts to resolve its source Card. If no source Card
is available, the feature creates a deterministic local preview projection with
`persistence.minted: false`, an explicit save requirement, and visible
`LOCAL · UNMINTED` labeling. No Card is silently persisted or minted.

## Tarot Reuse Decision

The running Tarot Draw surface and
`src/components/TarotDraw3DView.jsx` were inspected at the base revision above.
The Record Garden adapts its interaction grammar:

| Tarot behavior | Record Garden treatment |
| --- | --- |
| Three.js scene owned by a thin React host | Reused as an isolated imperative game with idempotent disposal |
| Orbit camera, raycast selection, lift/drag/table-plane projection | Adapted for circular records and a magnetized platter |
| Bounded image/video surfaces | Adapted to three Echo visual surfaces plus the platter label |
| Current visual → Card action | Adapted to source Card resolution with a truth-safe local projection |
| Audio/master-time choreography | Adapted so the audio element is the sole record and surface clock |
| Tarot deck, Phone, Camera, Stargate, custody sync, and Tarot storage | Deliberately left in Tarot; not copied or coupled |

Tarot Draw remains a separate route and component. The new component does not
import Tarot private state or copy its 26,000-line implementation.

## Data And Truth Boundary

- Catalog: `GET /api/echos/director-projects?summary=1`
- Selected detail: `GET /api/echos/director-project?songId=…`
- Selected references: `GET /api/echos/references/tarot-cards?songId=…`
- Source Card attempt: `GET /api/tarot/card/:mediaId`
- Characters and scenes: existing hydrated Builder Avatar and World projections

The full multi-megabyte reference dump is never fetched. Selected detail and
references are lazy, cached, generation-token checked, and aborted when another
record wins the selection race. Stable song IDs are the join key. Missing media
remains missing, timeline gaps remain gaps, and name-matched character/scene
relationships remain visibly inferred.

## Persistence And Recovery

`hapa.echo-record-garden.snapshot.v1` stores only user arrangement state:
selected/placed song IDs, selected visual, perspective, mute state, playhead,
and camera position/target. It never duplicates audio, video, Card, Avatar,
Scene, or Reference blobs. Malformed camera and playback values normalize to
safe defaults, stale song IDs are discarded against the live catalog, and a
restored record is always paused until the user explicitly plays it.

The renderer handles pointer cancellation, visibility changes, WebGL loss and
restoration, reduced motion, and StrictMode-style repeated construction and
disposal. The canvas publishes bounded smoke diagnostics for record angle,
audio time, active videos, renderer memory, and renderer state.

## Resource Budget

- Six record objects in the active crate page.
- Three visual surfaces.
- At most three active visual video elements in the verified live state.
- One audio element and one animation loop.
- Cover/detail requests are bounded to the selected record and cached.
- Every video, texture, geometry, material, listener, observer, control, RAF,
  and renderer is explicitly stopped or disposed on replacement/unmount.

## Art And Asset Lineage

The outdoor table, picnic cloth, turntable, records, frames, particles, lights,
and labels are procedural Three.js/Canvas constructions authored in this
change. They require no new external model, texture, font, or runtime asset
license. Album, Director, reference, character, scene, audio, and Card media
continue to use their existing Hapa source records and truth labels.

## Verification

Focused automated coverage passed **28/28** across the Record Garden domain/UI,
Overcard host/docs/menu/adapter parity, and the Echos hydration guard. The
production build passed with Echo delivery receipt
`sha256:42fe91748f724c8fe8f7dcbc4217150cf50fdfe0df842e6700a084560ae5accc`.

The complete repository gate passed **1,306/1,306** with bounded process
concurrency (`node --test --test-concurrency=4 tests/*.test.mjs`). Two earlier
default-concurrency probes each passed 1,305/1,306 while surfacing a different
unrelated resource-contention flake: one Gate Pass child cleanup `EPIPE`, then
one Avatar service startup timeout. Both exact tests passed immediately in
isolation (3/3 and 1/1), and both passed in the bounded full run. No Record
Garden, Echo, Tarot structure/lifecycle, or Overcard parity test failed.

`npm run smoke:tarot` mounted the Tarot renderer and canvas without console
errors, but the current smoke environment contained no eligible Song Card, so
the Music Zone lock branch could not execute. This is retained as a degraded
fixture condition rather than reported as a false pass.

Live acceptance proved:

- 157 records and six accessible crate items loaded.
- Three surfaces projected (`now-playing`, `up-next`, `character`).
- Audio played from the selected record and paused correctly.
- A source Card and a deterministic local/unminted character Card both printed.
- Canvas was nonblank at desktop and compact widths.
- Compact width had no horizontal overflow.
- Canvas diagnostics reported renderer available, three active videos, and
  bounded geometry/texture counts.

Captured evidence:

- `/Users/calderwong/Documents/Codex/2026-07-28/can/artifacts/echo-record-garden/record-garden-desktop.png`
- `/Users/calderwong/Documents/Codex/2026-07-28/can/artifacts/echo-record-garden/record-garden-mobile.png`
- `docs/echo-record-garden-verification.json`

## Operator Controls

- Click a record or use the crate to select it.
- Drag a record onto the glowing platter, double-click it, or choose
  **Place on player**.
- Use **Play/Pause**, **Sound**, and the seek bar for playback.
- Choose a visible surface, then **Generate attached Hapa Card**.
- Use **Reset view** to restore the default camera.
- Search and Perspective controls page through the complete album.

## Rollback And Limitations

Rollback is local and isolated: remove the `echo-records` HostTarget/adapter,
lazy route, component, domain projector, and associated styles/tests. Existing
Echo and Tarot data is not migrated or rewritten.

This release proves a local First Pass, not publication or production
readiness. It does not mint Cards, assert third-party rights, or guarantee that
every album source currently has a Director shot, reference, character, scene,
or source Card. Canvas drag is pointer/touch based; equivalent DOM controls are
the keyboard and screen-reader path. Human art-direction review can further
tune camera framing and materials without changing the source-truth boundary.

## Turn-To-Lore Reflection

- Objective: turn the Echo album into a tactile record-listening exploration
  space while retaining the Tarot interaction language.
- What worked: a separate game boundary, stable domain projector, audio-clock
  rotation, bounded surfaces, and equivalent DOM controls kept the feature
  understandable and testable.
- Noise avoided: copying Tarot’s private monolith, fetching the complete
  reference corpus, and creating a new mint/forge authority.
- Correction made: the initial view adapter expected a flatter record shape;
  the final implementation consumes the normalized source-truth contract and
  keeps a small view projection at the component boundary.
- Reusable guardrail: any future 3D media room should use one canonical media
  clock, hard-cap active decoders, expose lifecycle diagnostics, and label local
  projections as non-persisted.
- Reusable candidate: extract the bounded visual-surface media resource and
  lifecycle diagnostic pattern only after a second independent consumer proves
  the common contract.
