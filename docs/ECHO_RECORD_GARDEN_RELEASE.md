# Echo Record Garden Release Evidence

Status: canonical First Pass / Prototype Stage implementation integrated;
current-build human visual, audio-device, touch, and accessibility acceptance
pending  
Evidence date: 2026-08-01  
Programs: `echo-record-garden-2026-07-30` and
`echo-record-garden-v2-2026-08-01`  
Implementation revision: bind the exact focused commit, production chunk, and
receipt during the final evidence refresh; do not reuse an earlier revision

## Current Experience

The canonical Hapa Avatar Builder serves Echo Record Garden at
`/?view=echo-records`. The current architecture is one physical listening world,
not a collection of independent media controls.

- A Record has one stable identity and one Three.js object across crate display,
  pickup, platter placement, playback, lift, return, and snapshot recovery.
  Placing or removing it changes that object's state and transform; it does not
  swap in a platter clone. Removing the placed Record is also the physical stop
  gesture for its song and Director clock.
- Every resident crate Record with usable media presents a muted looping face
  and a separate readable song-title surface before it reaches the player.
  Nonresident collection entries remain plain catalog data and are materialized
  only inside the bounded visible window or while held/placed.
- The turntable drives one large horizontal **Director Preview** plus the face of
  the same placed Record. The older three-small-screen triptych is no longer the
  current design.
- The large Preview consumes the normalized Echo Director runtime with one
  external audio clock. It retains exact cut/revision, shot, source bounds,
  camera framing and movement, transitions, shaders, Always-On layers,
  visualizers, automation, and enabled lyric state. A preparing or unsupported
  operation remains labeled or retains the last complete frame instead of
  silently becoming Legacy Baseline or black.
- The current non-Legacy Director selection is loaded by exact variant identity.
  Source, cut, and graph cache keys retain revision identity so a recent cut
  cannot resolve to a stale package with the same song ID.
- The spatial catalog provides in-world page and sort controls while the 2D
  catalog retains search, perspective, sort, paging, recovery, keyboard, and
  touch-equivalent controls. Platter playback always has priority over idle
  Record preview audio.
- Hover or keyboard focus may preview one Record only while the turntable is
  idle. The 3D audio visualizer follows the placed or previewed Record and uses
  the same mastered analyser rather than a second music clock.
- Activating the large Preview prints the Hapa Card attached to that exact
  Director frame. Printed Cards are persistent 3D objects with a full-bleed
  looping media face, details, source/cut/shot lineage, a saved transform, and
  explicit custody/mint truth. A held or pointed Card or Record can be
  reoriented with the wheel and faces toward the camera instead of spinning
  around an already tilted local axis.
- **Cinematic Mode** hides the ordinary Builder and Garden chrome without
  unmounting the scene. A small exit/recording dock remains available; Escape
  restores the normal interface and prior focus.
- **Record Mode** captures the live Garden canvas and the existing mastered
  song-audio branch. Stopping the recording creates one content-addressed,
  idempotent, durable local Hapa Card after media validation and local custody.
  It pins the source Record, song, cut, weather, and rights lineage at start and
  does not claim public mint, canon, publication, or commerce authority.
- Sunrise, high noon, sunset, and night reuse the same authored environment,
  sky, fog, materials, and bounded light rig. New placed Records advance the
  phase gradually; reduced motion presents the target state without decorative
  easing.
- Scene scenery, the table/stage, and the enlarged Preview preserve the current
  sightline: environment meshes support the cinema rather than intersecting or
  obscuring it.

## Current Catalog Fact

A compact read of the canonical loopback Director index on 2026-08-01 reported:

- **157 Director projects**;
- **1,905 total Director variants** across those projects;
- all 157 compact rows with audio, a Preview source, and a modern/non-Legacy
  selection.

These are registry/index facts, not a claim that a human has watched every
variant or that every source is publicly cleared. Final evidence should preserve
the compact endpoint response or its digest alongside the exact focused commit.

## Echo Preview Parity Boundary

`EchoDirectorPreviewRuntime` is the renderer-only boundary shared with the Echo
Album Director semantics. Record Garden supplies one audio-clock sample and one
output canvas; it does not embed the Workbench authoring UI or create a second
audible player.

At a fixed song, cut, and time, the parity contract covers:

- exact Director variant and revision;
- current shot and source in/out/loop bounds;
- output orientation and cover/crop transform;
- camera direction, intensity, speed, transform origin, and cue index;
- active shader and Always-On layers;
- visualizer, lyric, transition, and automation state;
- exact current visual and attached-Card identity.

The Preview publishes one complete composited frame atomically. It may retain a
last valid frame or show a source-labeled fallback while media prepares, but it
must not expose a partially drawn quadrant, rewind completed shots, or downgrade
the render path relative to the Echo Album Preview.

## Verification State

Earlier release numbers and hashes belonged to older three-screen revisions and
are intentionally not carried forward. The current working tree is still being
closed out, so the final evidence refresh must bind the exact focused commit and
production assets after all implementation changes settle.

Required automated refresh:

1. run the expanded Record Garden gate, including atmosphere, visualizer,
   Cinematic/Record integration, recording Card, recording transaction,
   Preview-parity, media lifecycle, virtualization, accessibility, and delivery
   receipt suites;
2. run the full Builder test suite;
3. run the production build and build receipt check;
4. run the offline Record Garden verifier against the built assets;
5. repeat the compact 157-project/1,905-variant API census;
6. run catalog paging/swap and current-cut playback soaks, recording resource
   counts, renderer texture/geometry ceilings, media hard seeks, cache bytes,
   heap delta, and teardown state;
7. refresh the verification ledger with the exact commit, bundle path/digests,
   commands, results, and timestamps.

Passing automated checks prove deterministic contracts and resource bounds.
They do not prove live WebGL pixels, audio-device behavior, touch geometry,
perceived camera motion, screen-reader output, or the quality of the weather and
garden composition.

## Human Acceptance Is Still Pending

The saved Codex in-app-browser policy denies control of the loopback Record
Garden route. That restriction has not been bypassed with another browser,
hidden protocol, or alternate transport. Therefore no current-build human
visual, audio, touch, screenshot, or assistive-technology acceptance is claimed
here.

The operator gate is
`docs/ECHO_RECORD_GARDEN_OPERATOR_ACCEPTANCE.md` at
`http://127.0.0.1:8797/?view=echo-records&recordGardenReview=1`. It covers the
same-object Record lifecycle, two-minute Director playback, repeated placement
and seeking, Preview parity, Card printing and manipulation, Cinematic Mode,
Record Mode, catalog traversal, hover/touch preview, visualizer/weather,
responsive layout, reduced motion, and accessibility.

Older screenshots remain art-direction references only. They cannot close the
current-build operator gate.

## Tarot Reuse And Ownership

Tarot Draw remains the owner of the original spatial/Card interaction language.
Record Garden adapts its perspective camera, table-plane projection, stable
object reconciliation, drag/place language, physical Card handling, media
texture pooling, recovery, and lifecycle cleanup. It does not move Tarot,
subscriber synchronization, Stargate, Forge, Council, or public mint workflows
into the Record Garden.

Record Garden owns its turntable, stable Record registry, in-world catalog,
large Director display, garden environment, local session recording adapter,
weather presentation, and 3D audio visualizer. Echo Album remains the Director
authoring and Preview-semantics owner.

The procedural environment and adapted design methods retain their attribution
in `THIRD_PARTY_NOTICES.md`. No Hapa integration transfers ownership of upstream
methods or source media.

## Rights, Custody, And Card Truth

Runtime visuals remain projections from existing Echo Director, Reference,
Avatar, Scene, Song Registry, and Card sources. Their presence in Hapa does not
transfer copyright, likeness, authorship, consent, publication rights, or reuse
rights.

- Existing Cards retain exact source IDs, receipts, and lineage.
- An exact Director-frame print must retain song, cut, revision, shot, layer,
  visual source, time, and attachment identity.
- `LOCAL · UNMINTED` is a deterministic local projection, never a persisted or
  minted Card.
- A successful Record Mode stop may create a **durable local Card with verified
  custody**. That is still unminted and unpublished; public mint, canon,
  publication, catalog availability, and commerce require separate authority.
- Service, edition, identity, media-validation, or rights ambiguity fails
  visibly instead of being rewritten as success.
- Public distribution still requires source-by-source rights and consent
  review.

## Recovery And Rollback

- Rapid song/cut changes abort obsolete detail, reference, and Card work.
- Platter placement keeps the physical Record responsive while audio, first
  frame, and full Director preparation advance through separately bounded
  stages.
- The Preview retains a valid poster/frame through initial decode or a
  source-labeled fallback through failure; black is not the loading state.
- Removing the placed Record stops its audio and Director state exactly once
  while keeping that same object available to move or return.
- Record Mode locks its source Record and lineage until stop/finalize; an exact
  retry resumes the same idempotent transaction.
- Snapshot migration restores paused playback, camera, catalog state, stable
  Record transforms, weather, and printed Card transforms without autoplay or
  duplicate objects.
- Blur, hidden-page, pointer cancellation, lost capture, reduced motion, WebGL
  loss, and unmount have bounded recovery and deterministic cleanup paths.
- Navigation to Echo Album or Tarot leaves the source records and Cards
  unchanged.

Code rollback must name the final focused Record Garden commit and any dependent
schema/receipt revision after the evidence refresh. Do not use the obsolete
three-screen revision list as the current rollback recipe.

## Board And Release Boundary

Kanban and Overwatch history is append-only. Implementation evidence may move a
technical card only through a new evidence event; it does not manufacture a
human decision. The remaining current-build browser/visual acceptance and
release-closeout cards stay pending until an operator records an exact-build
passing or issue receipt.

This First Pass / Prototype Stage release does not claim public deployment,
production readiness, universal hardware support, rights clearance for every
source, public mint authority, publication, commerce, or third-party
endorsement.
