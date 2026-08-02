# Echo Record Garden Operator Acceptance

Status: awaiting current-build human observation  
Programs: `echo-record-garden-2026-07-30` and
`echo-record-garden-v2-2026-08-01`  
Implementation revision: use the exact focused commit reported by the current
guided review; do not reuse an earlier revision  
Guided route: `http://127.0.0.1:8797/?view=echo-records&recordGardenReview=1`

This is the human-observed gate for the current Echo Record Garden First Pass /
Prototype Stage. It covers the deferred first-pass visual review and the Phase
2 exact-build acceptance. Do not pass a row from source code, automated tests,
an older screenshot, or a different build.

The saved Codex in-app-browser policy currently blocks control of this loopback
route. That restriction has not been bypassed, so this checklist remains
operator work and its result is explicitly pending.

## Guided Review

The guided route provides **Verify experience**. It does not automate human
judgment or close the Kanban. It binds the run to the production Record Garden
chunk loaded by the browser, collects bounded runtime signals, and saves an
append-only passing or issue receipt only when the operator chooses that result.

1. Open the guided route and hard-reload once.
2. Choose **Verify experience**, then **Start review**. If the service, ledger,
   browser chunk, or tab is stale, stop and start again from the current build.
3. Complete every journey below on that same exact-build review. Capture at
   least three checkpoints on one song and one current Director cut, spanning
   at least 60 seconds of increasing audio time.
4. Include desktop mouse or pen, keyboard, a genuine touch/coarse-pointer path,
   compact layout, and reduced motion. A narrow desktop window alone is not the
   touch proof.
5. Record screenshot or screen-recording paths and any console, page, media,
   or network error. Use `none observed` only when that is true.
6. Choose **Save passing receipt** only after every required row passes.
   Otherwise mark the affected rows **Problem**, include exact song/cut/time and
   reproduction steps, and choose **Save issue receipt**.

## Preflight And Source Truth

- [ ] Use **Reload Builder** or `Cmd+Shift+R` and confirm the guided review says
  the current production bundle is ready for observation.
- [ ] Confirm the Record Garden opens without the fresh-start/recovery screen or
  a blank WebGL canvas.
- [ ] Confirm the compact catalog reports **157 Director projects** and **1,905
  variants**. Treat these as index facts, not proof that every variant has been
  watched or rights-cleared.
- [ ] Confirm the default world contains a record crate/catalog, outdoor table,
  turntable, the enlarged single horizontal **Director Preview**, and listening
  controls. The obsolete three-small-screen triptych must not appear.
- [ ] Confirm **Cinematic Mode** and **Record Mode** are present and the current
  weather state is announced.

## 1. Persistent Record Reality And Living Faces

- [ ] Choose one visible Record with video. Before placement, confirm its face
  loops, its title remains readable, and the loop does not require the player.
- [ ] Pick up that Record and place it on the turntable. Confirm it is visibly
  the same object—same title, face, identity, orientation history, and held
  object—not a sleeve disappearing while a clone appears.
- [ ] Confirm platter seating occurs immediately in the placement interaction.
  A labeled poster/retained frame may cover preparation; a black Preview may
  not.
- [ ] Confirm only the placed Record owns full-song playback and that the same
  object rotates with a normal vinyl feel derived from the audio clock. Pause,
  resume, and seek; its accumulated angle must not jump backward.
- [ ] Lift the playing Record. Confirm audio, Director playback, and platter
  rotation stop exactly once while that same Record remains attached to the
  pointer/hand. Place it again, then return that same object to the crate.
- [ ] While holding or pointing at an unplaced Record, use the mouse wheel.
  Confirm its authored face turns toward the camera instead of spinning around
  the Record's current local axis. The wheel must not lift or teleport it.
- [ ] Reset the arrangement and reload. Confirm one stable instance returns,
  paused, without a duplicate platter proxy, autoplay, or a replayed Card job.

## 2. Large Director Preview And Echo Album Parity

- [ ] Confirm the placed song selects its most recent usable non-Legacy
  Director cut by exact cut ID/revision. A silent fallback to **Legacy
  Baseline** is a failure.
- [ ] Play continuously for at least two minutes. At the three guided
  checkpoints, confirm the large Preview and placed Record face show the
  correct current cue for the same song/cut/time.
- [ ] Open the same song and exact cut in Echo Album Preview. At sampled fixed
  times, compare shot/source bounds, orientation, crop, camera motion, shader
  and Always-On layers, visualizer, transition, enabled lyrics, and automation.
  The Garden output should be the same program presentation, not a simplified
  media-only substitute.
- [ ] Include at least one portrait/vertical source inside a landscape output.
  Confirm the declared pan/reveal motion is visible rather than a static crop.
- [ ] Seek across at least four Director boundaries. Confirm there is no
  persistent black frame, top-left-only quadrant, stale prior-song frame,
  completed-shot rewind, rapid play/pause twitch, or shader timing drift.
- [ ] A source-labeled **Director Visualizer**, preparing state, retained last
  complete frame, or truthful failure is acceptable when declared by the cut.
  Borrowed unrelated media or a partially published composite is not.

## 3. Spatial Catalog And Idle Preview

- [ ] Browse every in-world catalog page and use the diegetic next, previous,
  and sort controls. Confirm the full registered collection is reachable by
  stable song identity without creating all 157 Three.js Records at once.
- [ ] Compare title, album/order, perspective, newest-cut, and available-video
  results with the equivalent 2D search/filter/sort controls.
- [ ] With the platter idle, dwell over or keyboard-focus a Record. Confirm one
  preview starts, its 3D visualizer appears above that Record, and leaving it
  stops the preview.
- [ ] Move directly between two Records. Confirm the old preview stops/fades
  before the next one becomes authoritative; two songs must never mix.
- [ ] Place a Record while an idle preview is active. Confirm platter playback
  cancels the preview immediately and remains the sole authority.
- [ ] Repeat idle preview through the explicit touch-equivalent action. No
  required catalog or preview operation may depend only on hover or right-click.

## 4. Exact Visual Card Printing And Manipulation

- [ ] Activate the large Preview at a noted song/cut/shot/time with pointer,
  then repeat by keyboard. Confirm no persistent "Generating Attached Hapa
  Card" menu is required.
- [ ] Confirm the printed Card preserves the exact current attachment identity,
  full-bleed looping video, readable title/details, song/cut/shot lineage, and
  honest custody/mint label.
- [ ] If the source attachment is confirmed missing, the fallback must say
  `LOCAL · UNMINTED`. It must never claim a mint, publication, or source Card
  identity that does not exist.
- [ ] Pick up, move, and place the printed Card. Use the mouse wheel to
  reorient it and confirm the Card turns to face the camera rather than rolling
  around its already tilted local axis. Confirm OrbitControls do not zoom during
  the Card rotation gesture.
- [ ] Reload and confirm the Card keeps its exact media/details and saved 3D
  transform without changing the source Record or Director clock.

## 5. Cinematic Mode

- [ ] Enter **Cinematic Mode**. Confirm the Builder top bar, sidebar, and normal
  Garden chrome leave the view without unmounting, clearing, or restarting the
  playing Three.js scene.
- [ ] Confirm only the small exit/recording dock remains and the enlarged
  Preview has a clear sightline: no stage, table, plant, prop, or environment
  mesh pokes through or obscures it.
- [ ] Exit with Escape. Confirm the normal interface and previous keyboard focus
  return. Re-enter and exit with the visible control as well.
- [ ] Trigger any available recoverable scene error path. Confirm Cinematic Mode
  does not strand the operator without a visible exit or recovery action.

## 6. Record Mode And Durable Local Card Truth

- [ ] Place and play a Record, note its exact song, cut, weather, and rights
  state, then start **Record Mode**.
- [ ] Record enough motion, Director media, camera movement, visualizer, and
  mastered song audio to inspect the result. Confirm the source Record cannot be
  changed or lifted while capture/finalization is active.
- [ ] Choose **Stop + create Card**. Confirm one Card appears after validation
  and that its video includes the live Garden canvas while its audio includes
  the mastered song branch.
- [ ] Confirm the Card is full-bleed, looping, right-sized, movable, and bound to
  the exact source Record, song, cut, weather, session, and rights lineage pinned
  when recording began.
- [ ] Confirm the result says **durable local Hapa Card with verified custody**
  (or an equally explicit local custody state). It must remain unminted and
  unpublished unless a separate authorized mint/publication action exists.
- [ ] If saving is interrupted, choose retry once. Confirm it resumes the same
  idempotent transaction and does not produce a second Card or silently alter
  lineage. A changed replay must fail visibly.

## 7. Visualizer, Weather, And Atmosphere

- [ ] Confirm the 3D audio visualizer follows the currently previewed or placed
  Record, responds to the mastered audio, and disappears when no Record owns
  playback.
- [ ] Change placed Records enough to observe high noon, sunset, night, and
  sunrise. Confirm the same environment eases between phases rather than
  replacing the world or snapping through unrelated scenes.
- [ ] Confirm the single large Preview remains the brightest visual priority at
  every phase and that foliage, particles, lights, shadows, and props do not
  obscure Records, Cards, controls, or media.
- [ ] Enable reduced motion. Confirm the complete target weather state appears
  without decorative easing while the exact audio/Director clock, labels, and
  controls remain correct.

## 8. Lifecycle, Performance, And Recovery

- [ ] Change Records at least ten times and perform at least four seeks on the
  same exact build. Confirm old audio/video stop, and the Preview and Record face
  never show a previous song as current. Opening/placing must not get
  progressively slower.
- [ ] Page the full catalog repeatedly. Confirm resident Three.js Record,
  decoder, geometry, material, and texture counts plateau with the visible
  window rather than the 157-project collection size.
- [ ] Keep one song playing for two minutes and inspect runtime diagnostics.
  Confirm media hard seeks occur only at declared source/loop boundaries, not as
  continuous correction churn, and that renderer/resource metrics remain under
  the current acceptance ceilings.
- [ ] Pause, hide/refocus the tab, and resume. Confirm only one song plays and
  the current visual remains aligned.
- [ ] Exercise a recoverable media error and WebGL loss/retry if available.
  Confirm a labeled fallback or retained complete frame appears and the Garden
  returns without a full Builder reset.
- [ ] Leave and re-enter Record Garden. Confirm audio, media elements, frame
  callbacks, scene resources, recording tracks, and listeners from the prior
  scene have been released.

## 9. Keyboard, Touch, Responsive Layout, And Accessibility

- [ ] With keyboard only, browse/sort/page the collection, select and place a
  Record, play/pause/seek, preview when idle, focus the large Preview, print and
  move a Card, enter/exit Cinematic Mode, and reach every recovery action.
- [ ] Repeat the core journey with a coarse pointer/touch device. Confirm Record,
  Preview, Card, catalog, and mode targets are at least 44 × 44 CSS pixels and
  that no action requires hover, wheel, or right-click without an equivalent.
- [ ] Repeat at `390 × 844`, `844 × 390`, and `768 × 1024`. Confirm the Preview,
  player, catalog, notices, and mode controls remain reachable without clipping
  or horizontal page overflow.
- [ ] At 200% text zoom, confirm titles, truth labels, mode status, notices, and
  buttons do not overlap or become unreachable.
- [ ] With reduced motion and a screen reader, confirm selection, placement,
  current song/cut, weather, recording state, Card result, errors, and recovery
  actions are announced. Focus must remain visible and return after modal/mode
  changes.

## Acceptance Record

The guided panel saves the canonical machine-readable receipt. Complete this
companion record as well; it does not replace the exact-build guided receipt.

- Operator:
- Observed at:
- Exact implementation revision:
- Browser/device and window sizes:
- Touch/coarse-pointer device or emulation:
- Songs tested:
- Exact Director cut IDs/revisions:
- Director timecodes sampled:
- Echo Album parity result: `pending`
- Same-object Record lifecycle result: `pending`
- Full catalog and idle-preview result: `pending`
- Card print/move/rotate/restore result: `pending`
- Cinematic Mode result: `pending`
- Record Mode/local custody result: `pending`
- Visualizer/weather result: `pending`
- Desktop result: `pending`
- Compact/touch result: `pending`
- Keyboard/reduced-motion/screen-reader result: `pending`
- Two-minute playback, ten swaps, and four seeks result: `pending`
- Renderer/media/cache/heap diagnostics:
- Screenshots or recording paths:
- Console/page/media/network errors, if any:
- Overall result: `pending`
- Notes or exact reproduction steps:

## Board Closeout Rule

If every required row passes, append current-build evidence to the deferred
first-pass visual acceptance and release-closeout cards, then append the Phase 2
exact-build acceptance event. If any row fails, append an issue/review event
with the exact receipt and reproduction evidence instead.

Preserve all earlier done, blocked, and correction events. Never rewrite the
append-only Kanban/Overwatch history, and never convert automated evidence into
a human acceptance decision.
