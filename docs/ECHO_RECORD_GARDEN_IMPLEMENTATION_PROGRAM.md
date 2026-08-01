# Echo State Record Garden Implementation Program

Status: canonical First Pass / Prototype Stage implemented; current-revision
visual acceptance remains operator-pending  
Program ID: `echo-record-garden-2026-07-30`  
Board project: `hapa-echo-music-video-direction`  
Canonical implementation revision:
`c0e6ede51e541f012077d74843b18ea6152fc245`

## Objective

Echo Record Garden is a net-new Hapa Avatar Builder experience at
`/?view=echo-records`. It adapts the spatial interaction language of Tarot Draw
into a lazy-Sunday outdoor listening table:

- Echo songs are stable circular record objects.
- Records can be browsed, searched, focused, arranged, and placed on a
  turntable.
- Placing a record plays its canonical song and shows the selected Director
  cut, references, characters, and scenes across three physical surfaces.
- Clicking a visual resolves the attached Hapa Card through the existing
  authoritative Card paths, with an explicitly local and unminted projection
  only after a confirmed missing source attachment.
- Saved state restores the listening-table arrangement without copying media,
  replaying a side effect, or auto-resuming playback.

Tarot Draw remains the inheritance owner. Record Garden reuses its proven
camera, raycasting, drag/place, media-clock, Card-resolution, snapshot, and
lifecycle concepts without copying the Tarot game closure or changing Tarot
behavior.

## Playback Contract

One HTML audio element is authoritative for the placed song. Play, pause, seek,
Director surface selection, and record angle are derived from its absolute
media time.

The domain retains the physical reference:

`ECHO_RECORD_RPM = 33⅓`

The moving video-label disc is intentionally presented at:

`ECHO_RECORD_DISPLAY_RPM = 8⅓`

A full-disc moving image reads much faster than a mostly symmetric vinyl
surface. The calmer display rate is still deterministic and audio-clock
derived, but gives the record the perceived weight requested for this
experience. Reduced motion can freeze the visible spin without changing audio
or Director timing.

`angleRadians = mediaTimeSeconds × 2π × ((25/3) / 60)`

One visible revolution therefore takes 7.2 seconds.

Director videos use explicit future, active, past, and ambient phases:

- future clips pause and pre-cue their exact source start;
- active clips follow the audio clock with bounded drift correction;
- completed clips hold their current frame and never seek backward;
- ambient context loops from unclamped elapsed time and stops under reduced
  motion.

## Director Cut Contract

Record Garden never opens Legacy Baseline when a non-Legacy Director cut is
available.

1. Album summaries expose effective `updatedAt`, declared status when present,
   and a source-derived fingerprint when available.
2. Selection prefers the newest declared-ready non-Legacy cut.
3. Older summary rows without readiness metadata use a clearly labeled
   `latest-nonfailed-non-legacy` compatibility path.
4. Detail loading requests the exact `variantId`; the cache key includes cut
   identity and revision.
5. A mismatched response fails visibly instead of falling back to Legacy.
6. Projection reuses `deriveEchoDirectionVariantProject`, preserving project
   patches, duration clipping/tail extension, graph validation, and immutable
   source data.
7. Canonical computed and source-declared fingerprints remain separate lineage
   fields.

An exact cut may expose a playable timeline while its certified execution graph
is still preparing. The UI uses that exact timeline for listening-table video;
it does not claim render or mint readiness from a preparing graph.

## Media And Buffering Contract

- Three physical screens page through at most twelve source-labeled surfaces.
- A seven-resource media pool covers the visible three, a three-video forward
  buffer, and one dedicated current-Director resource for the spinning record.
- Media identity includes URI, revision, source clip identity, timeline start,
  source start, duration, and clock mode. Adjacent clips that share a file do
  not share one mutable playback element.
- Videos and images use dedicated GPU textures; a fallback canvas is never
  mutated into a differently sized media source after allocation.
- Video elements use eager preload, metadata/source-start cueing,
  `loadeddata`/`canplay`/`waiting` state, bounded play retries, and
  `requestVideoFrameCallback` texture refresh where supported. An already
  decoded `HAVE_CURRENT_DATA` frame is promoted immediately.
- Decoded frames are accepted only when they match the audio-clock target
  within 0.12 seconds. Hard seeks use a 0.1-second drift threshold and a
  0.25-second cooldown; ordinary drift uses bounded playback-rate correction.
- The current Director cue drives all three default Director displays and the
  record face from the same frame clock. Declared generated-visualizer cues
  render a clock-bound animated texture instead of a blank surface.
- `null` media is an explicit standby/clear command. Startup, project clearing,
  and pre-cue gaps cannot dereference a missing `videoUri`, and clearing a
  previous pooled resource releases it exactly once.
- A failed decoder retains its source-labeled fallback texture.
- Pool trimming, page changes, visibility changes, WebGL loss, and unmount
  pause and dispose resources deterministically.
- The active surface texture is also shown on the placed record face; inactive
  crate records retain bounded static labels.

## Memory And Cache Contract

- The browser retains at most twelve recent `(song, cut revision)` project
  packets, refreshes their LRU order on use, exposes entries/evictions in the
  Record Garden diagnostics, and clears them on unmount.
- The local service retains direct parsed Director JSON under both a 128 MiB
  source-byte ceiling and a 64-entry ceiling; any single source above 8 MiB is
  used for its request but not retained.
- Parsed native Director show graphs use the same LRU discipline under a
  96 MiB, 32-entry, 16 MiB-per-entry budget.
- `/api/health` exposes entries, source bytes, limits, evictions, oversized
  skips, in-flight reads, and normalized-store source bytes so future audits do
  not infer safety from file-descriptor counts alone.
- The reproducible cache soak parses 157 projects, 157 representative current
  variants, and 157 show graphs twice under explicit garbage collection. Its
  final two measured heaps were 129,250,808 and 129,280,760 bytes, with every
  byte/count bound and second-pass plateau assertion passing.

## Interaction, Card, And Recovery Contract

- Selected sleeve and placed/playing record are separate identities.
- Placement validates project identity and detached audio before changing the
  active player.
- Search, filters, roving keyboard controls, touch targets, drag cancellation,
  collision-safe table placement, and reset/return actions share stable song
  IDs.
- Timed Director visuals use the immutable Song Card print flow.
- Embedded or attached source Cards retain their exact identity.
- Source failures fail closed. Only a confirmed missing attachment can produce
  a deterministic `LOCAL · UNMINTED` projection.
- Manual board changes preserve blocked and externally managed states, serialize
  whole-board saves, and announce saved or rejected outcomes accessibly.
- Snapshot schema v2 restores selection, placed record paused, visual/page,
  filters, crate order, mute/playhead, camera, deliberate record transforms,
  and an interrupted Card request as retryable state.
- Stale IDs, malformed transforms, audio failure, media failure, WebGL loss,
  and component exceptions remain visible and recoverable.

## Quality Gates

The repeatable gate at revision `c0e6ede` is:

`npm run verify:echo-record-garden`

It currently passes 111 focused domain/UI/lifecycle/accessibility/Card/cache checks,
a production build, delivery-receipt validation, and a deterministic 9/9
offline acceptance fixture. The exact revision also passes the three compact
summary/detail API checks and all 1,371 repository tests. The release record
still requires:

- source and rights boundaries;
- append-only board receipts;
- current-revision desktop and compact visual acceptance.

The current in-app browser connection was explicitly denied access to
`http://127.0.0.1:8797` by the saved user permission setting. The denial also
forbids alternate-browser or indirect workarounds. Browser, Electron, WebGL,
audio-device, touch-layout, and screenshot evidence therefore remains a short
operator acceptance step and must not be inferred from source tests or older
screenshots.

## Board Program

The program remains the original dependency-ordered fourteen-card plan:

1. audit Tarot reuse seams;
2. freeze the Record Garden data contract;
3. add host navigation and error boundary;
4. build circular records and truthful labels;
5. build crate browsing and manipulation;
6. compose the lazy-Sunday outdoor table;
7. bind audio and calm clock-derived spin;
8. project Director/reference/character/scene surfaces;
9. connect visuals to attached Cards;
10. persist and recover the scene;
11. complete accessibility, reduced-motion, and touch contracts;
12. prove lifecycle and resource budgets;
13. run automated, regression, and current-revision visual acceptance;
14. close release, lineage, and reusable learning evidence.

Board history is append-only. Earlier completion events are not rewritten.
Where evidence was stale or overstated, correction events reopen the exact task;
recompletion is appended only after its acceptance evidence exists.

## Current Closeout Checkpoint

- Implementation revision: `c0e6ede51e541f012077d74843b18ea6152fc245`
- Focused gate: 111/111
- Full Builder suite: 1,371/1,371
- Compact summary/detail API: 3/3
- Offline contract: 9/9, bound to `c0e6ede`
- Two-pass all-song cache soak: passed, receipt digest
  `7a3789a916d21b473671b3b604b59eec91709d8658e26c43768ab10980dbdefe`
- Delivery semantic digest:
  `sha256:a8f9b94f794533feae43e9f20e99bb9ef093e9a9a8ccdadf3c99714f3c6f9c83`
- Board projection: 12 done / 2 blocked
- Resume condition: complete and record the current-revision operator journey
  in `ECHO_RECORD_GARDEN_OPERATOR_ACCEPTANCE.md`, then append task 13 and task
  14 closeout events without rewriting earlier history.

## Claim Boundary

This is a local First Pass / Prototype Stage capability. It does not certify
public deployment, complete media coverage for every song, rights clearance,
durable Card creation, mint authority, third-party endorsement, or general
production readiness.
