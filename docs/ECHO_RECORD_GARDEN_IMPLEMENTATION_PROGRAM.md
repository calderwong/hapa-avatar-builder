# Echo State Record Garden Implementation Program

Status: board-ready First Pass / Prototype Stage implementation program  
Created: 2026-07-30  
Program ID / review pass: `echo-record-garden-2026-07-30`  
Board project: `hapa-echo-music-video-direction`

Implementation checkpoint: completed locally on 2026-07-30 against canonical
Builder base revision `227a741062e040fdcfa83a1663e1f49765817a0e`. Release,
lineage, resource-budget, operator, rollback, verification, and Turn-to-Lore
evidence is recorded in `docs/ECHO_RECORD_GARDEN_RELEASE.md`.

## Objective

Create a net-new Hapa Avatar Builder experience for exploring the Echo State
album as a tactile 3D record garden. Songs become circular record objects that
can be browsed, inspected, moved, and placed on a record player. A placed record
plays the canonical song, spins from the same media clock at 33⅓ RPM, and
activates multiple visual surfaces for the selected Director video, references,
characters, and scenes. Selecting a visual resolves or generates its attached
Hapa Card through the existing Tarot Draw Card path without inventing ownership,
availability, or completed media.

The experience should feel like a lazy Sunday afternoon around an outdoor table:
warm daylight, a calm garden, tactile wood and vinyl, restrained ambient motion,
and an inviting record-crate browsing rhythm. That identity is an adaptation of
the existing Tarot Draw cockpit, not a replacement for it.

## Canonical Reuse Decision

The canonical inheritance owner is
`src/components/TarotDraw3DView.jsx` in Hapa Avatar Builder. The implementation
begins by auditing its running behavior and exact source revision, then reuses
or extracts the smallest stable seams for:

- room/table composition, camera, raycasting, focus, drag/place, and touch
  interaction;
- HUD, control dock, Card-family browsing, truth labels, and loading/error
  states;
- pooled image/video textures, media surfaces, playback power policy, and
  lifecycle cleanup;
- scene snapshot persistence and recovery;
- visual selection, attached Card resolution, Card creation/forge status, and
  custody/lineage receipts.

The Record Garden gets its own route, scene composition, circular record
geometry, crate, turntable, media constellation, and outdoor art direction.
Tarot Draw remains intact. Shared behavior should be extracted only after the
reuse audit proves the boundary; copying the 26,000-line owner component into a
second divergent surface is not an acceptable implementation.

The data jump-off points are the current Echo Director project, Song Card/song
registry, reference atlas, avatar, scene/world, and media projections. Presence
in Hapa does not transfer rights or authorship. Missing or uncertain links stay
explicitly unavailable or proposed.

## Experience Contract

### Record object

Each record has a stable song identity, circular vinyl geometry, readable label,
selection/focus state, and an optional pooled video-label surface. It carries
source-labeled pointers to the canonical audio, active Director project/video,
references, characters, scenes, and attached Card identities. A missing preview
uses a truthful static label; it never borrows unrelated media.

### Crate and table

The user can browse, search, filter, focus, drag, and place records without
losing their order or selection. Mouse, keyboard, and touch share one semantic
interaction model. Layout and persistence use stable IDs rather than array
positions or titles.

### Record player

Dropping a record on the platter selects that song and gives one canonical media
clock authority over audio, visuals, play/pause, and seek. The platter angle is
derived from absolute media time:

`angleRadians = mediaTimeSeconds × 2π × (33⅓ / 60)`

One revolution therefore takes 1.8 seconds. Rotation is recomputed after seek,
pause, resume, visibility changes, and recovery; it is not accumulated per
rendered frame. Reduced-motion mode may stop or soften the visible spin while
leaving audio timing and visual selection correct.

### Visual constellation

Multiple bounded surfaces show the selected song's active Director video and
source-linked references, characters, and scenes. Surface timing follows the
canonical media clock where timing exists. Untimed material is labeled as
context, not presented as beat-synchronized truth. Decoder and texture pools
stay bounded.

### Visual-to-Card action

Selecting a visual first resolves a canonical attached Hapa Card. When the
source projection authorizes creation, the action uses the existing Tarot
Draw/Builder Card creation path and returns its real pending, generated,
complete, failed, or unavailable state. The action must be idempotent for the
same request, preserve origin custody and source attribution, and never label a
proposal or placeholder as a completed Card.

## Persistence And Recovery Boundary

The saved Record Garden snapshot may retain stable record IDs, crate order,
placed record, transforms, selected visual, camera framing, surface layout, and
user settings. It does not duplicate audio/video blobs or rewrite canonical
Echo, Avatar, Scene, Reference, or Card records. Restored media remains paused
until user intent permits playback.

Snapshots are versioned and migratable. Missing sources, stale IDs, malformed
snapshots, interrupted Card generation, decoder failures, and WebGL loss all
have visible recovery states that preserve the last valid user arrangement.

## Quality Gates

- Tarot Draw has a regression gate and remains visually and behaviorally
  available.
- Record rotation, audio, Director video, and timed surfaces share one
  deterministic clock and recover after seek or throttling.
- The UI does not imply that context-only media is synchronized.
- Active decoder, texture, animation-loop, and listener counts stay inside
  declared budgets and return to baseline after leaving the feature.
- Keyboard, screen-reader, reduced-motion, and touch paths cover the complete
  browse → place → play → inspect → Card action journey.
- Automated fixtures cover complete songs plus missing audio, video, reference,
  character, scene, attachment, and corrupted snapshot states.
- Visual acceptance captures the intended lazy-Sunday outdoor scene at desktop
  and compact/touch layouts.
- Release evidence preserves the Tarot source revision, adapted boundaries,
  licenses, source lineage, board receipts, and a concise learning delta.

## Dependency-Ordered Board Program

| # | Lane | Task | Depends on |
|---:|---|---|---|
| 1 | Intake & Planning | Audit canonical Tarot Draw reuse seams | — |
| 2 | Intake & Planning | Freeze the Record Garden data contract | 1 |
| 3 | App Scaffolding & UI | Add the lazy-loaded host and navigation entry | 1, 2 |
| 4 | Media Affordance Enrichment | Build circular records with truthful video labels | 2, 3 |
| 5 | App Scaffolding & UI | Build crate browsing, search, focus, and manipulation | 4 |
| 6 | App Scaffolding & UI | Compose the lazy-Sunday outdoor table | 3, 5 |
| 7 | Music Enrichment | Bind the record player to the audio clock and 33⅓ RPM | 4, 5 |
| 8 | Media Affordance Enrichment | Project Director/reference/character/scene visuals | 2, 6, 7 |
| 9 | App Scaffolding & UI | Connect visual selection to attached Hapa Cards | 8 |
| 10 | App Scaffolding & UI | Persist and recover the Record Garden scene | 5, 7, 8, 9 |
| 11 | QA & Validation | Complete accessibility, reduced-motion, and touch paths | 5, 7, 8, 9 |
| 12 | QA & Validation | Prove lifecycle, decoder, texture, and frame budgets | 6, 7, 8, 9, 10, 11 |
| 13 | QA & Validation | Run automated, regression, and visual acceptance | 10, 11, 12 |
| 14 | QA & Validation | Close release, lineage, and reusable learning evidence | 13 |

The machine-readable cards, acceptance checks, proof requirements, and append
events live in `scripts/seed-echo-record-garden-board.mjs`. Progress is recorded
with `scripts/update-echo-record-garden-board-progress.mjs`; completion updates
are dependency-gated and require evidence.

## Closeout Reflection Template

At each meaningful checkpoint, preserve:

- objective and source revision inspected;
- running interaction and data evidence;
- what was reused, adapted, and deliberately left alone;
- what worked;
- what was noise or initially misunderstood;
- what changed;
- remaining reusable seams and limitations;
- the new guardrail, plus any Skill, Lore, Lesson Card, Decision Card, or
  Flow-explainer candidate derived from the attributed turn.

## Claim Boundary

This program defines and drains a First Pass / Prototype Stage capability. Board
completion proves only the acceptance evidence recorded for this implementation;
it does not imply general production readiness, third-party rights, publication,
minting, endorsement, or compatibility beyond the verified local Builder
surface.
