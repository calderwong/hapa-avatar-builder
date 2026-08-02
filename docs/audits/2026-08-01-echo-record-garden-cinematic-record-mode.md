# Echo Record Garden: Cinematic, Recording, Camera, Visualizer, and Weather Pass

Date: 2026-08-01  
Stage: First Pass / Prototype Stage  
Canonical owner: Hapa Avatar Builder Record Garden  
Visual acceptance: pending direct operator review of the live localhost surface

## Objective

Extend the existing Echo Record Garden rather than create a parallel 3D
experience. The requested pass adds a reversible Cinematic Mode, records the
live Garden canvas and mastered song audio into one durable local Hapa Card,
improves the physical printed Card, brings Garden camera framing into the Echo
Album Director contract, adds a bounded 3D audio visualizer, and advances the
same atmosphere through sunrise, high noon, sunset, and night as records
change.

The nearest completed surfaces reused were
`src/components/EchoRecordGarden3DView.jsx`, the existing Echo Director Preview
runtime, the Record Garden visual system, the Tarot Card custody path, and the
Builder shell in `src/App.jsx`. These were extended in place; Tarot Draw and the
existing Director authoring surface were deliberately left under their current
owners.

## Evidence inspected

- The current Record Garden scene, input lifecycle, exact Director compositor,
  shared audio clock, Card print path, snapshots, reduced-motion contract, and
  visual-system disposal boundary.
- The Echo Album camera metadata, output orientation, cue transitions,
  visualizer layers, lyric layers, and atomic single-canvas publish contract.
- Builder local UI session authentication, Avatar Card custody, Tarot
  projection, local media routing, and explicit mint/publication authority
  boundaries.
- Focused tests for Director projection, camera framing, Record Garden identity,
  scene lifecycle, Card creation, weather, visualizer budgets, and recording
  transaction behavior.
- A non-secret provider readiness probe. Literal result:

  ```text
  TRIPO_API_KEY=
  GEMINI_API_KEY=
  ELEVENLABS_API_KEY=
  ```

  No external asset-generation provider was invoked and no provider output was
  added.

## What worked

- Cinematic Mode is owned by the app shell, hides the top bar, sidebar, and
  Garden chrome without unmounting the Three canvas, retains a small exit and
  recording dock, exits with Escape, and restores keyboard focus.
- Record Mode captures the live WebGL canvas at 30 fps and taps the same Web
  Audio analyser used by the Director shaders. A monitor gain controls local
  mute without muting the capture branch. Source Record identity, song, cut,
  weather, and rights lineage are pinned when recording starts.
- Stop produces one content-addressed, idempotent local Card transaction. The
  server validates the WebM/EBML document, real video and Opus audio tracks,
  dimensions, duration, frame rate, declared hash, and exact idempotency key
  before custody and Tarot projection. A durable full-request ledger records
  accepted, media, custody, Tarot, subscriber, and completion checkpoints, so
  an exact retry resumes while any changed replay fails closed.
- The resulting Card uses a full-bleed looping video face with an owned border,
  title, custody label, and persisted 3D transform. The mouse wheel rotates a
  held or pointed Card; Shift or Alt changes the rotation axis, and capture-
  phase interception prevents simultaneous OrbitControls zoom.
- Garden framing now consumes Director motion, intensity, speed, crop,
  deterministic cue index, and the Director output orientation. Portrait media
  inside a landscape cut therefore follows the intended pan/reveal contract
  instead of guessing from decoded source dimensions. Its Canvas2D sampler now
  projects the same CSS cover overflow, transform origin, scale, and translation
  used by Echo Album, including mismatched source/output orientations.
- The Director runtime now invokes only layers active at the current frame. A
  shader-only or lyric-only media gap can publish honestly rather than calling
  a stale media adapter and freezing the previous composite.
- The 3D visualizer uses one bounded instanced bar mesh plus one line loop,
  follows the placed or hover-preview Record, samples the mastered analyser,
  participates in adaptive detail, and owns deterministic cleanup.
- Sunrise, high noon, sunset, and night share the existing sky, fog, cloud,
  material response, three-light rig, and one shadow caster. Record changes
  ease between phases; the cyclic night-to-sunrise seam interpolates directly.
  Reduced-motion mode snaps weather state while freezing decorative movement.

## What was noise

- A new recorder, shader runtime, Card schema, or second scene was unnecessary;
  the correct work was to connect existing owners with explicit adapters and
  lineage.
- The broad repository test command is not a clean-clone gate. It depends on
  ignored production album stores and telemetry fixtures, and one unrelated ISF
  asset test did not terminate in the isolated copy. Focused deterministic
  tests and the production build are the bounded implementation evidence.
- Direct browser acceptance could not be performed because the saved Codex
  browser permission blocks control of the localhost route. This was not
  worked around and is not represented as visual evidence.

## What was misunderstood and corrected

- “Mint a Card” initially risked implying public mint, canon, publication, or
  commerce authority. In Builder truth, stopping Record Mode creates one
  custody-backed durable local Hapa Card with `minted: false`; public mint and
  publication remain separate explicit actions.
- The first camera integration inferred portrait behavior from source video
  dimensions. Echo Album frames against the declared output orientation, so
  Garden now uses the same output contract and only falls back to source shape
  when no output profile exists. A second audit found that Echo's persistent
  video player still overwrote the outer style with source orientation and that
  Garden treated CSS object-position as a normalized source center. Both paths
  now share output orientation and equivalent sampled source bounds.
- The first runtime pass called all adapters even in intentional media gaps.
  Required-layer dispatch now preserves shaders and lyrics without dereferencing
  a missing video cue.
- The first night-to-sunrise target numerically eased from `1` to `0`, replaying
  the daytime palette backward. The seam now uses explicit state-to-state
  interpolation.
- Recording constructor/start/error paths initially could retain tracks. Every
  provisional or installed track is now stopped, timers are cleared, the
  session is cancelled, and the active ref is released on failure.
- React Strict Mode could synchronously dispose and recreate the one permitted
  media-element source. A reference-counted, deferred audio lease now survives
  development remounts while still closing its context and capture tracks on a
  real unmount.
- The first save route treated idempotency as process-local and recursively
  interpreted unknown-size streaming WebM Clusters. The final route persists a
  complete request fingerprint before side effects, reuses stable Card and
  subscriber identities after restart, and scans sibling Clusters with bounded
  Segment/Cluster rules instead of raw-byte or recursive guessing.
- The first failure notice always said the capture existed only in memory. It
  now preserves the server durability payload and distinguishes a safe durable
  transaction resume from a tab-local retry.
- A prior static test expected the analyser to connect directly to speakers.
  The verified topology is analyser to monitor gain for listening and analyser
  to capture destination for recording, preserving one authoritative audio
  source while allowing capture-safe mute.

## Verification

- 115 focused Director, Garden, recording, visualizer, weather, identity, and
  lifecycle tests pass.
- The broader isolated Record Garden suite passes 165 of 167 checks. Its two
  remaining checks require the ignored production `data/music-video-projects`
  store and permission to open a loopback test listener; neither is present in
  the clean sandbox clone.
- Production build and delivery-receipt validation pass with semantic receipt
  `sha256:a77d0a315aa1eff01a9c57ed5c2892a25a07f3ea7201c8f54d0b14ff217b6e51`.
- Source whitespace validation passes.
- Live service health and current-build identity are verified after canonical
  integration; direct visual interaction remains an operator acceptance step.

## Reusable outcomes

- **Flow-explainer candidate:** “Capture one WebGL session and mastered Web
  Audio branch into a custody-backed local Card without claiming mint.”
- **Decision Card candidate:** “Director Preview parity uses output orientation,
  active-layer dispatch, and one authoritative audio clock.”
- **Lesson Card candidate:** “Cyclic atmosphere seams require explicit endpoint
  interpolation; numeric phase wrap is not a linear transition.”
- The bounded visualizer, camera framing helper, atmosphere resolver, and
  content-addressed recording finalizer remain reusable owned modules.

## Guardrails

1. Keep Cinematic Mode reversible, focus-safe, and canvas-preserving; never
   strand the operator without a visible exit.
2. Record from one canvas and the existing mastered audio graph. Do not create
   a synthetic shader clock or a second audible media element.
3. Pin song, cut, weather, rights, and source Record identity at recording
   start. Retry the same immutable session; do not silently change lineage.
4. Treat Card creation, custody, public mint, publication, canon, and commerce
   as separate authority states and words.
5. Validate real WebM structure and track content before persistence; MIME and
   extension claims are insufficient.
6. Invoke only Director layers active at the current frame and publish the
   single output canvas atomically after all active layers succeed.
7. Keep Garden and Echo Album camera motion on the shared framing contract,
   including output orientation, crop, intensity, speed, and cue index.
8. Keep the visualizer inside its instancing/material/resource budget and
   dispose every owned resource exactly once.
9. Weather can ease for ordinary motion, but reduced-motion mode must present
   the complete target state immediately without decorative animation.
10. Do not call the pass visually accepted until the operator completes the
    live Cinematic, Record, Card rotate, camera-pan, hover visualizer, and full
    weather-cycle journeys.
