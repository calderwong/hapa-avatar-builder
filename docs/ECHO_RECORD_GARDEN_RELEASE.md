# Echo State Record Garden Release Evidence

Status: canonical First Pass / Prototype Stage implemented; manual visual
acceptance pending  
Evidence date: 2026-07-30 / 2026-07-31  
Program ID: `echo-record-garden-2026-07-30`  
Implementation revision:
`71e2f31d24e9d5b4cb130c98b2ca82fd9ec783db`

## Delivered

The canonical Hapa Avatar Builder now serves Echo Record Garden at
`/?view=echo-records` with:

- stable song records, six-record crate pages, search, perspective filters,
  keyboard/touch controls, drag placement, table arrangement, and return/reset
  recovery;
- a procedural warm outdoor table, record player, garden lighting, three media
  surfaces, and full/reduced power profiles;
- a calm 8⅓ RPM moving-disc presentation derived from the canonical audio
  clock, while preserving 33⅓ RPM as the explicit physical reference;
- exact newest non-Legacy Director selection, exact `variantId` detail loading,
  cache identity `(songId, variantId, cut revision)`, fail-visible mismatch
  handling, immutable projection, and separate canonical versus
  source-declared cut fingerprints;
- a three-screen/twelve-surface constellation backed by seven bounded media
  resources: three visible, three forward-warm, and one dedicated current-cut
  resource for the record face;
- dedicated video/image GPU textures, immediate promotion of an already
  decoded frame, audio-clock frame validation within 0.12 seconds, a
  0.1-second hard-seek threshold, a 0.25-second seek cooldown, completed-shot
  no-rewind behavior, and truthful media-error fallbacks;
- one current Director cue projected across the default display triptych and
  record face, with clock-bound animated Director visualizers for declared
  visualizer intervals rather than blank screens;
- an explicit empty-media standby state that makes initial load, project clear,
  and resource teardown null-safe;
- a twelve-packet browser LRU plus service-side 128 MiB/64-entry parsed JSON
  and 96 MiB/32-entry parsed show-graph LRUs, with eviction and byte telemetry;
- active-record video texture, while inactive crate records remain bounded;
- authoritative timed Song Card printing, exact embedded/attached Card
  resolution, cancellation and out-of-order guards, and honest local/unminted
  fallback;
- snapshot v2 migration and recovery for paused playback, camera, surface page,
  crate state, transforms, and interrupted Card work;
- isolated lazy loading, a component error boundary, WebGL recovery, and
  deterministic resource cleanup;
- a stable Echo board guard that preserves blocked/external states, serializes
  whole-board writes, and exposes save outcomes to assistive technology.
- a guided, human-operated acceptance panel at
  `/?view=echo-records&recordGardenReview=1` that hashes the browser-loaded
  Record Garden chunk at review start and finish, collects run-scoped playback,
  surface, Card, responsive-input, WebGL, and frame-budget evidence, and saves
  an integrity-sealed append-only receipt without mutating the Kanban;
- a signed server acceptance context that fails closed when the production
  bundle, service boot, verification ledger, implementation revision, or
  browser-loaded chunk is stale or mismatched.

## Canonical Verification

### Feature gate

`npm run test:echo-record-garden`

- 139 tests passed
- 0 failed
- 0 skipped
- observed duration: 2,574.17 ms

Coverage includes source truth, newest-cut selection, immutable duration
projection, future/active/past/ambient video phases, calm RPM, surface paging,
Card resolution, active-vs-selected identity, audio preflight, snapshot
migration, accessibility, responsive contracts, media lifecycle, delivery
receipts, the offline fixture, and board-status integrity.

### Summary and exact-cut API

The compact-index and live payload suites passed 3/3. The live canonical API
then reported:

- 157 Director projects;
- 157 projects with a non-Legacy selection;
- nine selections with explicit ready metadata;
- the remaining legacy index rows using the labeled nonfailed compatibility
  path rather than pretending readiness.

For `dear-papa-song-wish-her-well`, the live selection was:

- cut `vibes-reference-transitions-33beff74b1ea`;
- title `Vibes Reference Transitions · 3 Links`;
- effective timestamp `2026-07-29T03:06:30.125Z`;
- exact delivered selection and 51 timeline rows.

Its certified execution graph was still preparing
(`exact_cut_execution_graph_not_ready`), so Record Garden truthfully uses the
exact playable timeline without claiming render or mint readiness.

### Production build

`npm run build` and `npm run build:check` passed.

- Record Garden chunk:
  `dist/assets/EchoRecordGarden3DView-D-d220Pc.js`
- size: 157,092 bytes; Vite 157.09 kB / 49.18 kB gzip
- chunk digest:
  `904cc55628dc93c997ad82ede82acdb75cc3b41cce6e895310d08eb5c0983148`
- delivery semantic digest:
  `sha256:a492e63b521a11022132722b6c7e311c9c72b091dce3a7b5974140825102adfb`
- build receipt file digest:
  `adee7c3ce040db1e6f5bf59477d68bca71b397485e750a1cefb1f47d983656e2`

The existing application still emits a warning for unrelated chunks over
500 kB. Record Garden remains independently lazy loaded.

### Offline acceptance

The pure-Node verifier passed 9/9 checks and binds to implementation revision
`71e2f31d24e9d5b4cb130c98b2ca82fd9ec783db`.

- receipt:
  `artifacts/echo-record-garden/e2e/offline-contract-receipt.json`
- receipt digest:
  `eb6489988fd05edf79e535f017000f5f39d0d7389ae4bdb674c489050ee2588f`
- fixture-manifest digest:
  `7adefdbb80adf3b357d0f35513fd91718f6840f229c6b29e53793db990d5c111`

It proves deterministic audio/video/image fixtures, broken-media fallbacks,
catalog and project retry, twelve-surface paging, authoritative and embedded
Card paths, recovery contracts, and built-asset presence. It is not browser,
WebGL, audio-device, touch, layout, or screenshot evidence.

### Broader Builder regression

The current exact revision passed the full repository suite: 1,398 of 1,398
tests, with zero failures, skips, or cancellations. The earlier implementation
baseline's isolated loopback `ECONNRESET` remains historical evidence; it is
not attributed to this clean current-revision run.

### Cache soak and live service

The explicit-GC, two-pass album soak parsed 157 base projects, 157
representative current variants, and 157 native show graphs per pass. Raw JSON
ended at 64 entries / 55,024,126 source bytes and graphs at 32 entries /
77,655,736 source bytes. Heap after collection was 129,250,704 bytes after
pass one and 129,280,672 after pass two. Every byte/count, eviction, and heap
plateau assertion passed. Receipt digest:
`7a3789a916d21b473671b3b604b59eec91709d8658e26c43768ab10980dbdefe`.

The launchd-owned service was then restarted on port 8797 with current source
freshness and cache ceilings visible in `/api/health`. A live 32-song exact-cut
pass filled 64 raw entries and 32 graph entries without exceeding either byte
limit; a repeated pass caused no additional raw reads or retained cache growth.

## Tarot Reuse And Boundaries

Tarot Draw remains the owner of the original spatial/Card interaction language.
Record Garden adapts:

- perspective camera and OrbitControls;
- pointer projection and table-plane drag;
- stable-identity object reconciliation;
- absolute media-clock synchronization;
- pooled media texture and fallback patterns;
- attached Card resolution and immutable Song Card print;
- versioned scene recovery and complete lifecycle disposal.

It deliberately does not inherit Tarot subscriber synchronization, remote
camera state, global input interception, multiple audio players, Stargate,
Forge, Council, or mint workflows.

The outdoor scene is procedural Three.js authored in the Record Garden
component. No new downloaded model, texture, font, or third-party scene asset
was introduced.

## Rights And Card Truth

Runtime visuals remain projections from existing Echo Director, Reference,
Avatar, Scene, Song Registry, and Card sources. Presence in Hapa does not
transfer copyright, likeness, authorship, publication rights, or mint
authority.

- Existing Cards retain their exact IDs and receipts.
- Timed Director Cards require an edition-pinned authoritative print.
- Service or identity mismatch fails closed.
- `LOCAL · UNMINTED` is a deterministic preview, never a persisted or minted
  Card.
- Public release still requires source-by-source rights and consent review.

`createEchoRecordVisualCardResolver` owns this decision path. It deduplicates
pending requests, caches completed resolutions, supports cancellation, validates
authoritative edition-print receipts, preserves embedded and attached source
Cards, and permits a local projection only after a confirmed missing source
attachment.

## Recovery And Rollback

- Detail and reference requests abort on rapid song changes.
- Platter identity changes only after project and audio preflight.
- Future clips pre-cue; completed clips never seek backward.
- Hidden-page, blur, pointer-cancel, and reduced-motion paths stop unsafe work.
- Media failure retains a source-labeled fallback.
- Snapshot recovery removes stale IDs and restores paused state only.
- Unmount cancels frames and callbacks, removes listeners, stops media, and
  disposes renderer resources.
- Navigation to `/?view=echos` or `/?view=tarot` leaves source records unchanged.
- Empty Director media enters a safe standby state and releases any previous
  pooled record-face resource once.
- Code rollback is the inverse of focused revisions `71e2f31`, `fbf547c`,
  `24ebb94`, `4535188`, `c0e6ede`, `b5ed112`, `44e1833`, and `b946fec`.

## Current Manual Acceptance

Saved browser permissions prohibit automated DOM, console, network, screenshot,
or alternate-browser execution for the current revision. Older screenshots are
art-direction references only.

The durable checklist and guided-receipt instructions are in
`docs/ECHO_RECORD_GARDEN_OPERATOR_ACCEPTANCE.md`. Open
`http://127.0.0.1:8797/?view=echo-records&recordGardenReview=1`, choose
**Verify experience**, and start the current-build-bound review. In short, the
remaining operator check is:

1. hard-reload the guided route and choose **Start review**;
2. place a record and confirm the disc feels calm rather than fast;
3. confirm the displayed cut is a recent non-Legacy cut;
4. play and seek across several cuts, watching for black surfaces, backward
   rewinds, or twitching;
5. page all surface groups and confirm fallbacks remain labeled;
6. click a Director, Reference, character, or scene visual and confirm the
   attached Card result remains source-accurate and explicitly unminted when
   local;
7. exercise keyboard placement, pause/resume, reduced motion, and the visible
   recovery action;
8. repeat at a compact window size and confirm controls remain reachable;
9. keep one record playing for two minutes, capture three separated checkpoints,
   and change records repeatedly while checking that audio, screens, and old
   media stop cleanly;
10. save a passing receipt only when every human row and automated supporting
    signal is green; otherwise save an issue receipt with exact reproduction
    steps.

Until that check is recorded, current-revision live WebGL pixels, audio-device
behavior, touch geometry, and screenshots remain not proven.

## Board And Release Boundary

Board history is append-only. Historical done events that referred to an older
prototype are preserved, then corrected with new events. Tasks 1–12 have
current source/automated evidence. Task 13 remains open for the manual visual
acceptance above; task 14 closes only after task 13 and the final append-only
ledger receipt.

This release does not claim public deployment, full media coverage for every
song, production readiness, rights clearance, durable Card creation, mint
authority, or third-party endorsement.
