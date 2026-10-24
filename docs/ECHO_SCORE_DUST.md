---
title: Echo Score Dust — visual score and persistent particle performance
status: first-pass-prototype; implemented and unit-verified; human creative review pending
date: 2026-10-24
owner: hapa-avatar-builder
---

# Echo Score Dust

Score Dust brings the architecture from the research brief **"How Nanodot makes
dust dance — a technical deconstruction of the music visualizer"** (source
inspection dated 2026-10-23, prepared for CJ) into the Echo Album. It is a Hapa
reimplementation of architectural ideas only. No Nanodot source, shader text,
WebAssembly, scene manifest or artwork was copied, and nothing here implies a
Nanodot partnership, endorsement, license or compatibility.

The core idea from the research: **one song is directed on three time scales.**

| Time scale | Responsibility | Hapa owner |
| --- | --- | --- |
| Whole song | Beats, tempo alternatives, sections, repeats, lifts/breaks, intensity — known *before* they sound | Audio Atlas run → `hapa.echo.musical-timeline.v1` |
| Visual score | Meaning: motif family per range, palettes, busy range, density, camera, phrases, event responses | `hapa.echo.visual-score.v1` (composed, directed or authored) |
| Live reflex | What the audio is doing this frame (32 bands, beat flash) | Existing Echo preview analyser / prepared signals |

## What was built

| Research recommendation (priority) | Implementation | State |
| --- | --- | --- |
| 1. Versioned musical timeline and explicit visual score | `src/domain/echo-visual-score.js` | Implemented |
| 2. Shared particle targets and immediate beat response | `src/domain/echo-dust-swarm.js` | Implemented |
| 3. Phrase readability and background contrast | Phrase rasterisation, calm control, face-camera easing, media dimming | Implemented (2D host) |
| 4. Fixed-step export and loop boundaries | `advanceTo()` fixed 1/60 s stepping, seeded determinism, 1.5 s preroll setting | Kernel ready; not yet wired into Echo recording/export |
| 5. Stage depth, lighting and reflection contracts | — | Not started |
| 6. Stage budgets and shared-play protocol | — | Not started |

### Musical timeline (`buildEchoMusicalTimelineFromAtlas`)

A read-time projection over one saved Atlas result; Atlas bytes are never
changed. It carries the run id, Song id, master source SHA-256, decoded
timeline id and sample rate, then:

- **beats / downbeats** from `hapa.audio.beat_candidate` / `downbeat_candidate`
  observations (falling back to `beat_analysis` seconds);
- **tempo** with `alternativesBpm {half, normal, double}` and `ambiguous` when
  more than one interpretation lies in 60–180 BPM. Tempo is allowed to be
  ambiguous rather than forced to one scalar;
- **sections** from `musical_structure.regions`, with **repeat groups** joined
  from structure repeat pairs (union-find) and an ordered `occurrence` index;
- **events** from structure transitions: `lift` (energy rise), `fall`,
  `break`, `build`, `change`;
- **intensity** — frame RMS normalised between this recording's 10th and 95th
  percentile. It is relative, not integrated loudness.

Missing capabilities stay explicit (`coverage`), and
`qualification.qualityQualified` is always `false`: these are Atlas candidates,
not reviewed musical function. `buildEchoMusicalTimelineFromPerformance` is the
fallback for Songs with only a prepared performance (no repeats/events), and
`reflexOnlyEchoTimeline` is the honest no-structure case.

### Visual score (`composeEchoVisualScore`, `validateEchoVisualScore`)

The default composer is deterministic for a timeline + direction and records a
`reason` for every choice:

- each repeat group gets **one motif and one palette**, so returns are
  recognisable; later occurrences get a higher **busy** range (+0.06 per
  return, capped), so they grow in intensity;
- motif families come from energy-tier pools (calm / middle / high) over 14
  formation families; `allowedFamilies` keeps alternates for the director;
- camera mode/distance, density (≤ `limits.maxDensity`) and event responses
  (`lift → shock`, `fall/break → calm`, `build → gather`, `change → kick`).

`direction` lets a human or agent pin `families`, `palettes`, `baseHue`,
`images` (atlas cell refs), `phrases`, `eventResponses` and `cameraMoves`.

The validator rejects, before playback: wrong schema or timeline fingerprint,
**absent image assets**, **cues shorter than 0.5 s**, overlapping/out-of-song
cues, **missing motif/palette references**, unknown families or camera modes,
zero-length phrases and **overlapping camera moves with different
instructions**. Gaps, short phrases and unchecked assets are warnings.

Play settings (`hapa.echo.dust-play-settings.v1`: seed, particle count, pulse
`half|normal|double`, preroll) are kept outside the score. The default seed is
derived from the master audio hash, so a song replays the same way unless the
operator varies it.

`prepareEchoScorePlayback(score, timeline, {pulse})` gives the renderer
constant-time answers to *what is now* (cue, motif, palette, intensity, busy,
beat phase) and *what is next* (next event and seconds until it,
`anticipation` ramping over the 2.5 s before a shock). `crossings(from, to)`
reports scheduled beats/events crossed by a frame and reports nothing for a
seek, so jumping never fires every drop.

### Particle kernel (`createDustSwarm`)

- Persistent position/velocity per particle, separate target position, normal,
  band coordinate and flexibility. Changing formation never teleports; springs
  carry particles from where they are, with per-particle staggered switching.
- Reactive target = base + normal × band energy × reach × flexibility, with
  32 interpolated bands — so a ring swells, a sheet ripples, a helix breathes,
  with one kernel.
- Damped spring whose stiffness scales with the square of a per-particle
  angular frequency (hashed 0.7–1.3×); a released formation (low `hold`) is
  softer and less damped.
- Two-scale analytic flow field whose components each depend only on the other
  two coordinates (divergence-free circulation), plus formation spin.
- **Beat kick is immediate** (next step) and mixes the outward normal with each
  particle's own direction; a **shock** is a travelling radial front at 2.6
  units/s for larger events such as a lift.
- Semi-implicit Euler with the step capped at 1/30 s, so a stalled frame cannot
  inject a huge move. `advanceTo()` steps at a fixed 1/60 s for reproducible
  output; `fingerprint()` is a determinism receipt.
- Participation threshold by hashed rank; inactive points park in a halo near
  their own target, and visibility eases with a 0.35 s time constant.
- `sampleDustTargetsFromPixels` turns any RGBA pixels (rasterised words or an
  atlas image cell) into targets; outline points get low flexibility so strokes
  stay legible.
- `face` control eases spin back to a whole turn so readable material faces the
  viewer.

Formation families: ring, helix, sheet, sphere, gem, attractor, spiral,
fountain, dandelion, sunflower, mobius, shell, jellyfish, snowflake.

### Echo preview host

`builtin:score-dust` (**Score Dust**) is a new built-in visualizer in the
Song visualizer catalog, the Echo preview list and the renderer table. It does
not replace **Particle Storm**, so existing Director projects look the same.

When a project's visualizer timeline uses Score Dust, the view loads the newest
completed Atlas run for the selected Song (`op=visual-score`), falls back to the
prepared performance, then to live-reflex-only, and labels which one is active.
`src/components/echo-score-dust-renderer.js` joins score state with the live
FFT: scheduled beats kick, `shock` events launch fronts, `anticipation`
tightens the formation and pushes the camera in before a lift, phrases become
camera-facing particle words with the underlying media dimmed, and trails are a
decaying history of light on a transparent layer so video beneath stays
visible. Live hosting is capped at 4,000 particles on the CPU 2D canvas.

The renderer-truth table routes it as a built-in canvas renderer, so the
picker lists it as a preview visualizer, not **Final render ready**; fixed-step
export (priority 4) is the gate for that.

Tarot Draw's 2D Echo overlay treats `score-dust` like its existing particle
approximation; the 3D Tarot cockpit is otherwise unchanged.

## API / CLI parity

See `docs/API_CLI_UI_PARITY.md` → *Echo Score Dust visual-score parity*.

```bash
node cli/audio-atlas.mjs visual-score RUN
node cli/audio-atlas.mjs visual-score RUN --direction=direction.json --pulse=half
node cli/audio-atlas.mjs visual-score RUN --score=edited-score.json --assets=atlas-cell-1
```

```json
{"families": {"group-B": "jellyfish"}, "baseHue": 200,
 "phrases": [{"text": "to the edge", "start": 124, "end": 128}],
 "eventResponses": {"lift": "shock"},
 "cameraMoves": [{"id": "push-1", "start": 92, "end": 97.7, "mode": "push"}]}
```

## Evidence boundaries

- Values the research reports as **observed** and reused here: 32 shader
  bands, 0.35 s visibility time constant, 1/30 s step cap, 0.7–1.3× spring
  frequency spread, 2.6 units/s shock example, 1.5 s export preroll,
  half/normal tempo ambiguity. Everything else (band edges, thresholds, family
  pools, busy curve, palette rule, anticipation window) is a **Hapa choice**.
  The research itself states that Nanodot's band mapping, beat estimator,
  section thresholds and selection policy were not recovered.
- Repeat groups, events and tempo come from unreviewed Atlas candidates;
  "lift" is an acoustic energy rise, not a verified drop.
- Rendering is a CPU kernel on the existing 2D preview canvas, not WebGPU.
  No frame-rate or particle-count claim is made for any hardware.
- **Black-dot lead (not diagnosed):** the research points to depth-only
  occluders and depth writes from airborne particles. The 2D host has no depth
  buffer, so it cannot show that defect. Check depth writes, blending and depth
  bias in Three.js surfaces (Record Garden, Tarot Draw) before applying the
  lead there.

## Verification

```bash
node --test tests/echo-visual-score.test.mjs tests/echo-dust-swarm.test.mjs
npm run build
```

17 new tests cover timeline projection without mutation, repeat grouping,
tempo alternatives, composer determinism and pinning, every validator
rejection class, now/next queries and seek-safe crossings, pulse grids, play
settings, fallbacks, the read-only API/CLI projection, formation geometry,
no-teleport spring transitions, seeded determinism, step capping, kick vs.
shock timing, band deformation, participation easing, pixel sampling and
projection bounds. A headless Chromium render of a synthetic 204.92 s, ~129.8
BPM, seven-range score confirmed the returning motif, pre-lift anticipation,
lift shockwave and a legible camera-facing phrase. Human creative review on a
real Echo Song is still open.

## Reuse decision and learning delta (Turn 2026-10-24)

- **Objective:** carry the research's transferable contracts into the Echo
  Album without forking owners.
- **Reused:** Audio Atlas as the only timing/structure owner (beats, rhythm
  tempo intervals, structure regions/repeats/transitions); the Echo preview
  canvas loop, legacy built-in catalog and renderer-truth table as the host;
  the prepared-performance path as a fallback; the Atlas client for auth.
- **Deliberately left alone:** Living Light's director and native visuals
  (separate host with its own acceptance board), Record Garden's Three.js
  visualizer, Particle Storm's appearance, the 3D Tarot cockpit.
- **Why a new component:** no persistent-target particle kernel existed.
  Particle Storm spawns and expires random points each frame; changing it would
  silently change existing Director cuts, so Score Dust is a new built-in id.
- **What worked:** keeping score and play settings apart made determinism and
  testing simple; Atlas already carried tempo alternatives and repeat pairs.
- **Noise:** `npm ci` refused a pre-existing lockfile drift (`@emnapi/runtime`);
  82 suite failures and 9 Atlas worker tests depend on private album stores or
  the macOS offline sandbox and fail identically on the untouched tree.
- **Misread, then fixed:** the first render was oversized and overexposed, and
  the phrase turned edge-on because formation spin kept rotating it. Dot radius
  now scales with pixels per scene unit, and readable material eases to face
  the camera (`face` control). Keep this as a lesson.
- **New guardrail:** text and other high-information formations must face the
  viewer and suppress kick/flow while they are read.
- **Candidates:** Decision Card — *keep the reusable score separate from play
  seed/settings*; Lesson Card — *readable particle material must face the
  camera*; Skill candidate — *Atlas run → musical timeline → directed score*;
  Flow explainer — *three time scales of a music visual*.

## Next steps

1. Drive Echo preview recording from `advanceTo()` with fixed timestamps and
   preroll so exports do not depend on live frame rate (research priority 4).
2. Let a director save authored scores as Atlas-adjacent, append-only records
   with revisions (today scores are composed on read or supplied per request).
3. Stage depth/light contracts for Three.js hosts, then stage budgets and a
   shared-play payload (audio identity, score fingerprint, seed, start time).
