# Echo State Record Garden Release Evidence

Status: canonical First Pass / Prototype Stage implemented; manual visual
acceptance pending  
Evidence date: 2026-07-30 / 2026-07-31  
Program ID: `echo-record-garden-2026-07-30`  
Implementation revision:
`f5d4f14e911c0e541f286f6f3c75e32017227c66`

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
- a three-screen/twelve-surface constellation backed by a six-resource warm
  media pool, eager buffering, frame callbacks, a 0.8-second hard-seek
  cooldown, completed-shot no-rewind behavior, disposal guards, and truthful
  media-error fallbacks;
- active-record video texture, while inactive crate records remain bounded;
- authoritative timed Song Card printing, exact embedded/attached Card
  resolution, cancellation and out-of-order guards, and honest local/unminted
  fallback;
- snapshot v2 migration and recovery for paused playback, camera, surface page,
  crate state, transforms, and interrupted Card work;
- isolated lazy loading, a component error boundary, WebGL recovery, and
  deterministic resource cleanup.

## Canonical Verification

### Feature gate

`npm run test:echo-record-garden`

- 83 tests passed
- 0 failed
- 0 skipped
- observed duration: 131.57 ms

Coverage includes source truth, newest-cut selection, immutable duration
projection, future/active/past/ambient video phases, calm RPM, surface paging,
Card resolution, active-vs-selected identity, audio preflight, snapshot
migration, accessibility, responsive contracts, media lifecycle, delivery
receipts, and the offline fixture.

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
  `dist/assets/EchoRecordGarden3DView-B6rXq2a4.js`
- size: 99,585 bytes; Vite 99.58 kB / 31.64 kB gzip
- delivery semantic digest:
  `sha256:9120534e740464a0df9a9e2c61473e2ee603f38d55516f2346fd6c9a43ce6923`
- build receipt file digest:
  `f97539b93dd8d2a0772186b1c3cf5db31986134715e24d2a385faff057e4d2cd`

The existing application still emits a warning for unrelated chunks over
500 kB. Record Garden remains independently lazy loaded.

### Offline acceptance

The pure-Node verifier passed 9/9 checks and binds to implementation revision
`f5d4f14e911c0e541f286f6f3c75e32017227c66`.

- receipt:
  `artifacts/echo-record-garden/e2e/offline-contract-receipt.json`
- receipt digest:
  `4baafbb900659ba4e108006325cf140e3d23617d37dc2d08d9072ef13a94a635`
- fixture-manifest digest:
  `ff2f1a2a576ba1d1a559fd4b66d9b2d64a85190573da709b3c4f16fc679146f0`

It proves deterministic audio/video/image fixtures, broken-media fallbacks,
catalog and project retry, twelve-surface paging, authoritative and embedded
Card paths, recovery contracts, and built-asset presence. It is not browser,
WebGL, audio-device, touch, layout, or screenshot evidence.

### Broader Builder regression

The parallel full repository run passed 1,349 of 1,350 tests. One Stargate
parity test encountered a transient loopback `ECONNRESET`; the exact failed
test then passed 1/1 in isolation. No Record Garden test failed.

This is recorded as a passing isolated retry with a parallel-run transport
flake, not rewritten as a pristine 1,350/1,350 first run.

### Live service

The canonical launchd-owned API was restarted after the build. The observed
health response reported a current source signature, a fresh Echo delivery
identity, and process owner `launchd-canonical` on port 8797.

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
- Code rollback is the inverse of focused revision `f5d4f14`.

## Current Manual Acceptance

Saved browser permissions prohibit automated DOM, console, network, screenshot,
or alternate-browser execution for the current revision. Older screenshots are
art-direction references only.

The remaining operator check is:

1. reload `http://127.0.0.1:8797/?view=echo-records`;
2. place a record and confirm the disc feels calm rather than fast;
3. confirm the displayed cut is a recent non-Legacy cut;
4. play and seek across several cuts, watching for black surfaces, backward
   rewinds, or twitching;
5. page all surface groups and confirm fallbacks remain labeled;
6. repeat at a compact window size and confirm controls remain reachable.

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
