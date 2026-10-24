---
title: Echo Score Dust — visual score and persistent particle performance
status: first-pass-prototype; all six research priorities implemented; unit- and browser-verified on synthetic data; human creative review skipped at owner request
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
| 3. Phrase readability and background contrast | Lyric hook selection, phrase rasterisation, 0.4 s lead, stiff/calm reading hold, face-camera easing, media dimming; Avatar picture motifs | Implemented |
| 4. Fixed-step export and loop boundaries | Song-clock performance; WebCodecs + WebM export with song audio and PCM-spectrum bands; seamless loop bridge; frame-addressed offline renderer | Implemented |
| 5. Stage depth, lighting and reflection contracts | Record Garden Three.js layer with stage↔dust contract and depth policy | Implemented (Record Garden); other 3D hosts not wired |
| 6. Stage budgets and shared-play protocol | Adaptive 2D draw budget, 3D detail tiers, "Listen together" sessions with room clock and drift correction | Implemented (local Builder API) |

Saved directions, a score inspector and direction editor in the Echo preview
(`EchoScoreDustPanel`), and API/CLI parity sit on top of these.

## Where everything is

| Surface | How to reach it | What it does |
| --- | --- | --- |
| Echo preview | Echos Album → Director Workbench → song → Preview → tick **Score Dust preview** | Score Dust replaces the cut's visualizers on screen (preview only) and opens the panel |
| Score Dust panel | Below *Audio visuals* in the preview | Score strip (click to seek; camera lane), validation, motif shape/picture/colours per repeating section, hue, pulse, seed, **Colour**, **Comfort**, **Instruments**, **Camera**, **Looks**, moment responses, lyric hooks, **Save direction** |
| Export | Panel → **Export video** | 15 s clip, current section, whole song or 8 s seamless loop; landscape/HD/portrait/square, 30/60 fps; over the Director cut's media or black; saved to **Recordings** + .webm download |
| Listen together | Panel → **Host session** / **Join** (or open a `?scoreDustSession=<id>` link) | Shared play/pause/seek/direction; each screen renders locally |
| Record Garden | Echo Record Garden → mode dock → **Score Dust** | 3D dust over the playing record, same score and direction |
| API | `/api/echos/audio-atlas/jobs/RUN/query?op=visual-score`, `…/visual-score`, `…/visual-score-directions`, `/api/echos/audio-atlas/visual-score-looks`, `/api/echos/score-dust/sessions` | See parity doc |
| CLI | `node cli/audio-atlas.mjs visual-score | visual-score-directions | save-visual-score-direction | visual-score-looks | save-visual-score-look` | Compose, validate, list and save directions and looks |


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
`images` (atlas cell refs), `phrases`, `lyricPhrases` (`auto`/`off`),
`eventResponses`, `cameraMoves` and `playSettings`. `validateEchoScoreDirection`
checks it strictly (unknown keys, families, responses, sizes). Authored camera
moves override the cue camera during their span; a `push` closes in over it.

**Lyric hooks.** With no explicit phrases, `selectEchoScorePhrases` picks a
few words from the Song's measured `timed_lyrics`, the way the research
describes sparse, selected phrases rather than a full transcript:

- repeated lines first (hooks), one-off lines capped at a quarter of the
  picks and only in energetic sections;
- at most 8 phrases, about 12% of the song, 8 s apart, never overlapping;
- never inside a lift's run-up or hit (2.5 s before to 1 s after), because
  that moment belongs to the shapes;
- long lines use their own word timings for a 3–5 word window or are skipped;
  timing is never invented;
- refused (`audio-mismatch`) when the lyric timing names different master
  audio bytes than the Atlas run.

Each phrase records its source line, repeat count and reason.

The validator rejects, before playback: wrong schema or timeline fingerprint,
**absent image assets**, **cues shorter than 0.5 s**, overlapping/out-of-song
cues, **missing motif/palette references**, unknown families or camera modes,
zero-length or overlapping phrases and **overlapping camera moves with
different instructions**. Gaps, short phrases and unchecked assets are warnings.

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

### Song-clock performance (`createScoreDustPerformance`)

The dust is simulated on a fixed 1/60 s grid of **song time**, never wall time:

- Live preview at 24, 30 or 60 fps evaluates the same steps, so frame rate
  does not change the result.
- A backward seek or a jump of more than 2 s restarts from the seeded state
  with the play settings' preroll (default 1.5 s), with the formation snapped
  into place. A seek to *t*, a second seek to *t* and an export that starts at
  *t* therefore land on identical state.
- Pausing holds the exact frame; trails fade to it.
- Formation spin and camera yaw are closed-form, piecewise functions of song
  time (`buildScoreDustMotion`), so a seek lands on the same view that
  continuous playback reaches. Readable phrases stop spinning and ease to face
  the viewer, and the camera levels its pitch.
- Scheduled beats kick on the exact step that crosses them, and shocks launch
  at the exact lift step.
- Words start forming 0.4 s before the phrase, because the score knows they
  are coming. While words are read they are held stiff (they resolve in about
  half a second), every particle participates, and kicks and flow are calmed.
- Band input is a host hook. The live preview passes the analyser's 32 bands
  (or prepared/replayed signals). Offline export defaults to
  `scoreDerivedBands`, a deterministic envelope from intensity and beat phase.
  It is a stand-in, not a spectrum.

### Offline export (`createEchoScoreDustOfflineRenderer`)

This follows Living Light's frame-addressed contract (`director-offline.js`):
`frameCount`, `frameTime(i)`, `prepareFrame(i, {signal})`, `paintFrame(i,
target)`, `dispose`, `diagnostics`. Every picture is evaluated at an exact
integer song time with a fixed simulation step, however long a frame takes to
draw. Atlas-cell images are preloaded before frame 0 so every frame sees the
same targets. Trail fade is computed from elapsed song time, so trail length
does not depend on frame rate. Packaging and encoding stay with the existing
HyperFrames/Living Light owners; this renderer only supplies frames.

### Video export (`exportScoreDustVideo`, panel **Export video**)

Frames render at exact song times through the song-clock performance, are
encoded with WebCodecs (VP9, VP8 fallback) and muxed with Opus song audio by an
in-memory WebM writer (`src/domain/webm-muxer.js`: SeekHead, Info with
Duration, Tracks, keyframe Clusters, Cues). Timestamps come from the frame
index, never wall time, so a slow machine makes the same file. Deformation in
exports follows the song's own spectrum: `createPcmBandSampler` computes the
same 32 log bands from decoded PCM (Hann/FFT, fixed dB window). Bitrate scales
with pixel count and is capped so long exports fit the Preview Recordings
store (≤ 120 MiB). The result is uploaded to **Recordings** (existing
`/api/echo/preview-recordings`) and offered as a .webm download.

**Background: Director cut media** (P2 item 6, the default when the cut has
media; **Black** is the alternative). `createCutMediaCompositor`
(`src/components/echo-score-dust-composite.js`) draws the shot under each
frame's song time before the dust: images cover-fit, videos seeked to the
exact source time (source-in offset + time into the shot, looping clips that
are shorter than the shot), with a 25% dim so the dust stays readable. A
server without Range requests leaves a clip unseekable, so the clip is then
loaded whole as a blob. Media that cannot be decoded is drawn as black and
listed in the receipt (`background`, `media.drawn`, `media.unavailable`).
Loop bridges crossfade the footage as well. Limits: hard cuts only. The
preview's time-remap automation, transition blends and ISF shader passes are
not reproduced, so the composite is a dust-over-footage export, not a final
render of the cut.

**Seamless loops.** An 8 s loop renders a lead-in before its first frame and
records that trajectory. Over the last 1.5 s the particles, visibility, bands
and camera blend (smoothstep) into the state just before frame 0, and the audio
crossfades with equal-power sine/cosine gains into the audio before the loop
start, so the last frame flows into the first.

### Picture motifs (cast Avatars)

Each repeating section can show **Picture: _Avatar_** instead of a shape. The
choices are the Song's cast: explicit song bindings first, then the evergreen
cast from `ECHO_AVATAR_CAST_REGISTRY`. Each uses the registered seed image, else
a backgroundless image, else any image asset (`src/domain/echo-score-dust-pictures.js`).
Transparent (backgroundless) pictures are sampled by their alpha silhouette,
so dark clothing still forms; opaque pictures use luminance. Picture sections
face the viewer instead of spinning. The validator checks picture assets
against the cast that loaded.

### Listen together (shared play)

The packet (`hapa.echo.score-dust.session.v1`) carries the Song, Atlas run,
master audio identity, score fingerprint, direction, seed/pulse and the play
schedule. Peers never receive video; each screen renders its own dust from the
same score. The local Builder API (`/api/echos/score-dust/sessions`) is the
room clock: every response carries its receive and send times. Clients
estimate the offset as ((serverReceive − clientSend) + (serverSend −
clientReceive)) / 2, keep the lowest-delay sample and refresh after ten
minutes. Peers poll each second and check drift every 2 s. They seek only when
more than 250 ms off, follow play/pause, and adopt the host's direction only
when it changes the score. Updates are revisioned, so a stale write cannot
replace newer state. Sessions live in the Builder process; they are not saved
and reach only clients that can authenticate to that Builder (loopback today).

### 3D stage host (Record Garden)

`src/components/echo-score-dust-three.js` hosts the same performance as
Three.js points over the playing record (**Score Dust** in the Record Garden
mode dock). The stage contract (`ECHO_SCORE_DUST_STAGE_CONTRACT`):
- the stage provides an anchor, a radius, its scene fog (applied to the dust)
  and a background luminance for contrast;
- the dust reports its centroid, mean colour and energy, and the existing
  visualizer ring takes the dust's colour.

Depth policy for the research's black-dot lead: dust is depth-tested (solid
set pieces hide it), never writes depth, and blends additively, so luminous
moving dots cannot stamp dark holes. The reduced detail tier draws 40% of the
particles.

### How to open it

**Echos Album → Director Workbench → pick a song blueprint → Preview tab →
tick _Score Dust preview_** (next to *Audio visuals*, under the player). The
Score Dust panel appears below that row. The toggle is preview-only: it
replaces the cut's visualizers on screen and does not edit the Director cut.

A cue whose visualizer is `builtin:score-dust` also opens it. The cue picker
lists Score Dust but greys it out, because the picker only accepts *Final
render ready* shaders, so today the toggle is the working way in.
For full structure the Song needs a completed Audio Atlas run with *Detect
beats* (Echos Album → *Open audio workspace*). Without one it falls back to
prepared timing or live reflex only, and the panel says which.

### Echo preview host

`builtin:score-dust` (**Score Dust**) is a new built-in visualizer in the
Song visualizer catalog, the Echo preview list and the renderer table. It does
not replace **Particle Storm**, so existing Director projects look the same.

When the preview toggle is on (or a cue uses Score Dust), `useEchoScoreDust` loads
the newest completed Atlas run for the selected Song with its saved direction.
It falls back to the prepared performance, then to live-reflex-only, and labels
which one is active. It composes locally with the same pure composer the API
and CLI use, with the project's measured lyrics as the phrase source.

`src/components/echo-score-dust-renderer.js` hosts the performance:
- `anticipation` tightens the formation and pushes the camera in before a lift;
- phrases become camera-facing particle words with the underlying media dimmed;
- trails are a decaying history of light on a transparent layer, so video
  beneath stays visible;
- a quarter-size glow copy gives cheap bloom, nearer dots are brighter (depth
  fade), and exposure is normalised by particle count.

Live hosting is capped at 4,000 particles on the CPU 2D canvas. An adaptive
budget steps the drawn share down to 75% and then 50% (dropping the glow) when
frame cost stays above 14 ms, and back up when it relaxes. The simulation
itself is never thinned, so state stays deterministic.

**Score Dust panel** (below *Audio visuals* in the preview). Edits preview
immediately; **Save direction rN** appends a revision.
- A score strip shows each section in its motif colour and family, the repeat
  group, downbeat bars, lifts/falls, phrase bars and the playhead. Click it to
  seek.
- Validation errors and notes are listed.
- Per-repeat-group formation pins with palette swatches.
- Base hue, beat pulse (`half`/`normal`/`double`, with BPM, and a hint when
  tempo is ambiguous), and a seed with **Vary**.
- Event responses per moment kind.
- Lyric hooks on/off, with the chosen phrases listed; click one to seek to it.

### P2 batch 1: colour, comfort, instruments, camera and looks

All of these are direction fields, so they save with the Song's direction,
travel to Listen together peers and render identically in preview, export and
the Record Garden.

**Colour** (`src/domain/echo-score-dust-colour.js`, direction `colour`).
- Motif swatches are colour pickers; an edited palette is pinned to that repeat
  group (`palettes`).
- Presets: Neon, Monochrome, Sunset, Ice, Ember, Red, Green, Blue. Each section
  gets a related palette; pinned palettes still win, and **Apply preset to
  edited sections** clears the pins.
- Modes: palette, by frequency (bass end → treble end), by speed, along the
  shape, by depth, and from the picture (particles keep the sampled pixel
  colours of a picture motif).
- Dynamics switches: crossfade between sections, flash on lifts, drain colour
  in breaks, brighter returns.

**Comfort** (`playSettings.reducedMotion`, `playSettings.flashLimitPerSecond`).
- Bright flashes pass a gate that allows at most 3 per second in any 1 s
  window; the limit can be lowered to 2, 1 or none, never raised.
- Reduced motion stops spin and camera orbit, softens kicks to 20%, replaces
  travelling shocks with a soft kick and suppresses flashes. It follows the
  OS `prefers-reduced-motion` setting until the direction sets it.

**Instruments** (`src/domain/echo-score-dust-stems.js`, direction
`stemResponses`). When the prepared performance has separated stems (one stem
set per Song), drum onsets kick, cymbals (drum high band) sparkle, bass swells
the shape, vocals bring more dust in, and keys/synth/guitar/strings stir the
flow. Each instrument has a 0–1 weight; 0 turns it off. Master-only Songs keep
the spectrum response.

**Camera** (direction `cameraMoves`). The panel adds a move (hold still, slow
drift, orbit, push in) from the playhead to the end of the current section;
start, end and mode stay editable and the strip shows a camera lane.
`placeCameraMove` gives the new move its whole span, trimming or splitting
overlapping moves, so authored moves never conflict. Words and pictures still
face the viewer during a move.

**Looks** (`src/domain/echo-score-dust-looks.js`). A look is the
song-independent part of a direction: colour, instrument and moment responses,
base hue, density, and comfort/particle settings. Repeat-group shapes,
palettes, pictures, words, camera moves, seed and pulse belong to one Song and
are never part of a look. **Apply** replaces those look fields and keeps the
rest, then the change is saved like any other direction edit. Built-ins: Club,
Calm, Film, Ember. Saved looks live in one append-only ledger shared by every
Song (`data/echo-visual-score-looks/looks.ndjson`, ignored by Git, own lock).
The latest revision per name wins, a saved look replaces a built-in of the
same name, and a removal is a tombstone, so history is kept.

### Saved directions

Directions, not composed scores, are saved. A direction is the compact human
or agent intent; the score is recomposed from timeline + direction + lyrics.
The ledger is append-only NDJSON per Song
(`data/echo-visual-score-directions/`, ignored by Git, owned by Builder). Each
revision records `revision`, `baseRevision`, author, note, `runId`,
`timelineFingerprint`, `scoreFingerprint`, validation and the direction.
- A save must name the latest revision it edited (`baseRevision`); a stale
  base is refused with 409.
- A save is refused if the direction or the score composed from it is invalid.
- Earlier revisions are never rewritten. A torn final line is reported as
  `ignoredLines`, never repaired.
- Without a request direction, every surface uses the Song's latest saved
  direction. If that revision no longer validates, it is skipped (reported as
  `default (saved rN is invalid)`) and never breaks a read.
- Repeat-group names belong to one analysis. When the latest direction was
  saved against a different timeline fingerprint, the API reports
  `direction_timeline_matches: false` and the panel says so.
- The ledger has its own lock, because an Atlas analysis holds the Atlas writer
  lock for minutes; saving still works while a run is in progress.

The renderer-truth table routes it as a built-in canvas renderer, so the
picker lists it as a preview visualizer, not **Final render ready**; fixed-step
export (priority 4) is the gate for that.

Tarot Draw's 2D Echo overlay treats `score-dust` like its existing particle
approximation; the 3D Tarot cockpit is otherwise unchanged.

## API / CLI parity

See `docs/API_CLI_UI_PARITY.md` → *Echo Score Dust visual-score parity*.

```bash
node cli/audio-atlas.mjs visual-score RUN                       # latest saved direction (or default)
node cli/audio-atlas.mjs visual-score RUN --saved=false         # ignore saved direction
node cli/audio-atlas.mjs visual-score RUN --direction=direction.json --lyrics=timed-lyrics.json --pulse=half
node cli/audio-atlas.mjs visual-score RUN --score=edited-score.json --assets=atlas-cell-1
node cli/audio-atlas.mjs visual-score-directions RUN
node cli/audio-atlas.mjs save-visual-score-direction RUN --file=direction.json --base-revision=0 --note="group B as jellyfish"
node cli/audio-atlas.mjs visual-score-looks                     # saved looks, then unclaimed built-ins
node cli/audio-atlas.mjs save-visual-score-look "Sunset club" --file=look.json --note="for slow songs"
node cli/audio-atlas.mjs save-visual-score-look "Sunset club" --delete
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
- **Black-dot lead:** the Score Dust 3D layer applies the policy (depth test
  on, depth write off, additive). Other existing Three.js surfaces (Tarot Draw,
  other Record Garden effects) were not audited for that defect.
- Shared play matches cues, formations and transitions, not floating-point
  trajectories. Live band input still differs per machine.

## Verification

```bash
node --test tests/echo-visual-score.test.mjs tests/echo-dust-swarm.test.mjs \
  tests/echo-score-dust-*.test.mjs tests/echo-visual-score-directions.test.mjs
npm run build
```

Third pass adds `tests/echo-score-dust-export.test.mjs`,
`echo-score-dust-pictures.test.mjs`, `echo-score-dust-shared-play.test.mjs` and
`echo-score-dust-three.test.mjs` (48 Score Dust tests in all) for:
- WebM structure (seek head, cues, ordered blocks, OpusHead) and PCM bands;
- export bitrate caps, cast/picture selection and alpha-silhouette sampling;
- the room-clock formula and minimum-delay choice, and the 250 ms drift policy;
- session revisions and routes, and the 3D layer's depth/fog/additive flags,
  buffers, centroid and tiers.

Third-pass browser proofs (headless Chromium):
- Exports probed by ffprobe were VP9 + Opus with exact frame counts and
  durations, and repeat exports matched.
- The loop seam difference (1.33) is inside the normal frame-to-frame range
  (median 1.09, max 1.68).
- A transparent figure formed in dust.
- Two pages with real audio against the real API stayed within ~0.1 s
  through join, host seek, pause and resume.
- Panel export saved into Recordings.
- A WebGL scene with fog and an occluder hid dust behind the box with no dark
  holes.
- The real Echos Album view (with a planted project, Atlas run and a stub
  Music Viz manifest) showed the toggle, the panel and dust on the preview
  canvas; strip seeking moved the real player.
- The Record Garden toggle switched on without errors.

Second pass (32 tests in total across the five files) adds:
- frame-rate independence (24/30/60 fps) and identical state after seeks or an
  export start;
- pause holding the exact frame, continuity of the closed-form spin/yaw, and
  phrases facing the camera;
- shocks and word formations inside the performance, and bounded, deterministic
  score-derived bands;
- sparse lyric hook selection that never invents timing and refuses mismatched
  audio, plus strict direction validation;
- authored camera moves and the phrase-overlap check;
- the offline frame contract and identical state across two renders;
- the saved-direction ledger: append, conflict, invalid-save refusal, saved
  default, torn-line reporting, an invalid or foreign saved revision, saving
  under an Atlas lock, and the HTTP routes.

Browser proofs (headless Chromium, not committed):
- The real API server in static mode hosted the real hook, panel and renderer
  against a planted synthetic Atlas run. Default load → edit motif and pulse
  ("unsaved edits") → **Save direction r1** → reload all worked, with r1 then
  the default. (The final tweak that skips an invalid saved revision in the
  hook was verified by build and unit tests, not re-run in the browser.)
- Two independent offline renders of 70 frames across a lift and a phrase were
  byte-identical (about 26 ms per frame for 6,000 particles at 640×360 in
  software rendering, slower than real time, which is why export must not
  depend on live frame rate).

First pass: 17 tests cover timeline projection without mutation, repeat grouping,
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
- **Second pass (same day):** the first live host used wall-clock steps, so
  preview could never equal export, and a seek kept stale momentum. The fix
  was not a faster encoder. It was making the picture a function of song
  time and reusing Living Light's frame-addressed offline contract instead of
  inventing one. Reading the UI also showed three things: one-off lines
  crowded out hooks, a phrase stole a lift's run-up, and words were still
  forming 1.6 s in. Phrase selection now avoids lift windows and caps one-offs,
  and words lead by 0.4 s with a stiff hold. `cameraMoves` were validated but
  ignored by playback until this pass; check that every validated field is
  also consumed.
- **Third pass (same day, owner asked to finish everything without review
  stops):**
  - The cue picker only accepts final-render-ready shaders, so Score Dust had
    no way in; the preview toggle is now the entry point.
  - Export reuses the Preview Recordings store instead of a new one, and an
    in-browser WebM writer instead of a server encoder (no process-spawning
    path to guard).
  - The harness first proved shared play "broken" because the test static
    server could not range-seek. Blob URLs, as the app uses, fixed the harness,
    not the product.
  - The real Echo view crashed on a fixture project without `section_label`.
    That is a pre-existing assumption in the preview, recorded here and left
    unchanged.
  - New guardrail: verify a feature through its real entry point, not only a
    harness, before calling it accessible.
- **P2 batch 1 (same day):**
  - Reused: Echo prepared-performance stem buses and `normalizeHyperFramesStemRole`
    for instruments, the Director cut's own `media_contract` for composite
    exports, and the direction ledger pattern (append-only NDJSON, own lock)
    for looks. Nothing new owns song or media truth.
  - What was noise: a flash-gate test assumed some flashes must be blocked at
    double pulse. The gate's job is the bound, not a blocked count.
  - Misunderstood, then fixed: composite video frames were frozen on frame 0
    in the harness. The cause was again a static server without Range
    support, but this time it is a real product risk, because media servers
    vary. The compositor now loads an unseekable clip whole instead of
    trusting it.
  - Camera move ids collided when two moves started at the same time, so a
    trimmed remainder was dropped. Ids are now made unique after placement.
  - New guardrail: a look must never carry repeat-group keys, because group
    names belong to one analysis. `validateDustLook` refuses them.
- **Candidates:** Decision Card — *keep the reusable score separate from play
  seed/settings*; Decision Card — *looks hold only song-independent fields*; Lesson Card — *readable particle material must face the
  camera*; Skill candidate — *Atlas run → musical timeline → directed score*;
  Flow explainer — *three time scales of a music visual*.

## P2 backlog (defined 2026-10-24)

Sizes: S ≈ a day, M ≈ a few days, L ≈ a week or more. **Batch 1** (★) is done (2026-10-24); see *P2 batch 1* above.

| # | Item | Size |
| --- | --- | --- |
| 1 ★ | Palette editor: three colour pickers per section; presets (Neon, Monochrome, Sunset, Ice, Ember, Red, Green, Blue) | S |
| 2 ★ | Colour modes: palette, by frequency, by speed, along the shape, by depth, from the picture | M |
| 3 ★ | Colour dynamics: palette crossfades at section changes, lift flash, break desaturation, brighter returns | S |
| 4 | Background and export colour: solid, gradient or transparent | S |
| 5 | Album colour language as default palettes (`album-visual-language.js`) | S |
| 6 ★ | Composite exports with the Director cut's media (hard cuts) | L |
| 7 | Certify the fixed-step renderer as Final render ready; per-cue scheduling and mixing with ISF shaders | M |
| 8 | Loops attached to Song Card / Tarot card loops | S |
| 9 ★ | Stem-aware responses: drums kick, bass swells, vocals bring more dust in, cymbals sparkle. Vocal onsets triggering words is not built | M |
| 10 | Per-section editing: edit one occurrence, drag/split/merge sections, busy/density curves | M |
| 11 ★ | Camera moves authored on the score strip | S |
| 12 | Lyric control: line choice, font, word-by-word mode | M |
| 13 | Avatar 3D models sampled into shapes | M |
| 14 | SVG and text logos as shapes | S |
| 15 | Agent-written direction from lyrics, mood and Atlas sound tags; natural-language cues | M |
| 16 | GPU simulation for 20k–80k particles | L |
| 17 | Listen together across devices via the phone bridge, with sign-in, host hand-off, reactions | M |
| 18 | More 3D stages (Tarot Draw visualizer modes, floor reflections) | M |
| 19 ★ | Reusable named looks applied across songs | S |
| 20 ★ | Comfort and safety: reduced motion; at most 3 bright flashes per second | S |

## Next steps

1. Composite exports reproduce hard cuts only; transition blends and time-remap
   automation remain with the Director preview and final render.
2. Shared play beyond loopback: authenticate LAN peers (for example through the
   phone bridge) before exposing sessions to other devices.
3. Make the cue picker accept Score Dust once its fixed-step export is
   certified as a final renderer; today it stays a preview visualizer.
4. Tune family pools, exposure and phrase limits on real Echo Songs.
5. P2 batch 2 candidates: background colour and transparent exports (4),
   album colour language defaults (5), Song/Tarot loop attachment (8),
   per-section editing (10), and vocal onsets triggering words (rest of 9).
