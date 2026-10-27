# Echo integrated performances

Status: **First Pass / Prototype.** This document reviews how the Echo Album
Director combines its visual families today. It sets numbered requirements for
performances that use all of them together, and it describes the first
generator for those performances. Generated scripts are artifacts. They are not
saved cuts, renders or Song Cards. Generating a script does not make a song
Healthy: use [Song Health Topview](ECHO_SONG_HEALTH.md) for that judgement.

## The five layers

| Layer | What it is | Owner today |
|---|---|---|
| L0 Always-on | Up to three persistent Echo shader slots under the whole song; the glue between everything else | `persistent_shader_slots` → Director V2 persistent visualizer segments |
| L1 Hapa Media | The song's cast media shots (video loops, stills, generated media) | cut `timeline` → Director V2 track A, media preflight |
| L2 Echo shaders | Changing ISF shaders per section | cut `visualizer_timeline` → Director V2 visualizer cards, gated ISF manifest |
| L3 Living Light | Native 3D tunnels and surfaces from a saved Journey | `living_light_cues` → `livingLight` track ([LIVING_LIGHT_INTEGRATION.md](LIVING_LIGHT_INTEGRATION.md)) |
| L4 Score Dust | Particle visual score composed from the Atlas timeline and the verified lyrics | `score_dust_layer` → `scoreDust` track, executed from one bound transparent render (IP-6, [ECHO_SCORE_DUST.md](ECHO_SCORE_DUST.md)); the whole-shot render placement remains for dust-led shots |

## Review: what exists (measured 2026-10-26)

- **Saved cuts:** 8,099 across 209 songs, with a median of 42 per song. Each is
  append-only, with a timeline, a visualizer timeline, optional persistent
  slots, optional Living Light cues and a HyperFrames script.
- **Always-on:** 3,919 cuts use persistent slots, with a median of 2 enabled.
  Each slot has one opacity for the whole song. It cannot breathe with the
  sections except through its own audio-mapped uniforms.
- **Echo shaders:** saved cuts use 183 distinct shaders. The gated manifest
  holds 182. On the compile path (pixel gate plus hydrated exact proxies), 113
  generators are final-render ready. Of those, 81 have an audio map and 6 are
  "Waveforms Always On". The asset catalog's own count is higher (160), so two
  readiness answers exist (IP-10).
- **Living Light:** 461 cuts carry cues. The album pass places 6 cues per song
  on one song-length Journey. The compiled track declares
  `finalEncoding: unsupported`.
- **Score Dust:**
  - It plays live in the Score Dust preview and Listen-together.
  - It reaches a Director cut only one way: a browser export (WebM) is
    published as video media and replaces the media shots it fully covers
    (`echo-score-dust-cut.js`).
  - It is never composited over the other layers in export (true at review time; IP-6 below adds the composited layer).
  - No saved cut uses a Score Dust render yet.
  - It is the only layer that already writes the sung words as performance.
- **Transitions:**
  - Cuts use only `cut`, `crossfade` and `scanline-dissolve` (plus fades), chosen per shot.
  - Nothing ties a transition to the Atlas event at the boundary.
  - Nothing coordinates transitions across layers.
- **Telemetry:**
  - All 1,392 saved show graphs have an empty `modulationBindings` list.
  - The runtime executes only `visualizer_uniform` and `visual_time` targets. Camera and edit-permission bindings are emitted but not executed.
  - Recompiling the same songs with audio-mapped shaders produces 35–228 executable bindings per script, so the gap is in how cuts are saved, not in the compiler.
- **Lyrics:** Director projects carry the written lyric lines. Score Dust and
  this generator place words only when their timing is verified against the
  master ([LYRIC_TIMING.md](audio-atlas/LYRIC_TIMING.md)).

The gap is integration, not capability. Each layer works, but no surface plans
all five against one clock. No cut uses Score Dust, and when one does, dust replaces the picture rather than joining it. Transitions belong to one
layer at a time, and the always-on layer cannot follow the song's shape.

## Requirements

Status: **done** means met by the generator in this pass, with tests.
**Open** means it needs owner work beyond a plan.

| # | Requirement | Acceptance | Status |
|---|---|---|---|
| IP-1 | One plan, five layers. For each section, a performance plan names what every layer does and which layer leads. | `hapa.echo.integrated-performance.v1`; `checks.layersUsed` reports 0–5; scripts list per-section layer use. | done |
| IP-2 | The song's telemetry is the clock: Atlas sections, downbeat-snapped boundaries (≤ 0.4 s, else beats ≤ 0.2 s), shots on bar multiples, energy tiers relative to the song. | Boundaries equal Atlas downbeats where one is near; no shot under 1.5 s; tests. | done |
| IP-3 | One transition grammar keyed to the Atlas event at each boundary (lift, build, fall, break, change, return, plain boundary). It covers media, shader, always-on, Living Light and dust together. | Every boundary records kind, snap, the grammar for all layers, and why. | done in plan; dust/always-on reactions **open** at render (IP-6, IP-7) |
| IP-4 | Visual memory. A repeated motif keeps its media family and shader. A return match-cuts to the media first shown with it, and the shot before it gives way. | Test: return opens on the first-shown media; no two adjacent shots repeat. | done |
| IP-5 | Only written lyrics. Words are placed only when timing is verified against this master. Lines flagged for review are labelled and never become dust words. | Tests for verified, unverified and flagged lines. | done |
| IP-6 | Score Dust as a composited layer: a show-graph track bound to a score fingerprint, rendered over media and shaders in HyperFrames and native export, with preview parity. The existing whole-shot render placement stays for dust-led sections. | Compiled graph carries a `scoreDust` track; an export frame matches the preview within tolerance. | **done 2026-10-26** — `scoreDust` track, bound-render export through prepared capture, preview overlay with shared frame clock; results below. Native (`music-viz-native`) export reports a visible loss. |
| IP-7 | Always-on breathes: per-section opacity/intensity keyframes, or a binding target for persistent-slot opacity. | A slot's opacity follows section energy in the rendered output. | **open** |
| IP-8 | Living Light answers the song: an intensity or rate response to telemetry, and final encoding. | A cue's surface intensity follows master intensity; export no longer reports `finalEncoding: unsupported`. | **open** |
| IP-9 | Saved cuts carry executable telemetry. Bindings are compiled from shader audio maps when a cut is saved, and the runtime executes the camera and edit-permission targets it already emits. | New saved graphs have non-empty `modulationBindings`; runtime tests for camera and accent targets. | **open**; generated graphs carry bindings today |
| IP-10 | One shader-readiness answer shared by the catalog, the picker and the compile gate. | Catalog, picker and compile path report the same ready set. | **open** |
| IP-11 | Integrated plans become saved cuts only through the append-only cut owner, with operator approval and `planId` lineage. | A saved integrated cut reopens identically and names its plan. | **open** (no cut was written in this pass) |
| IP-12 | Integrated cuts report into Song Health Topview. Generator success never establishes Healthy. | Song Health lists the integrated cut's evidence and gaps. | **open** |
| IP-13 | A review surface that compares treatments side by side: a five-lane section map with transitions and the script text. | Operator can open a song's treatments and pick one to save. | **open** |
| IP-14 | Determinism and provenance. The plan ID derives from its inputs, and the same inputs give the same plan. It records the Atlas run, master hash, Journey revision, shader manifest hash and media pool. | Test: identical plans for identical inputs. | done |
| IP-15 | Composite safety: flash and luminance limits apply to the layers combined, not just to each layer alone. | A composite check across dust bursts, shader flashes and cuts within 3 Hz. | **open** |

## The generator

```bash
node scripts/compile-echo-integrated-performances.mjs [--output=DIR] [--songs=a,b] [--treatments=story-arc,tunnel-journey,dust-chorus,telemetry-pulse] [--seed=S] [--limit=N]
```

The generator runs in the foreground, in one process. It starts no workers,
models, renders or analysis jobs. For each Director project
(`data/music-video-projects/*-video-project.json`) it reads:

- **Telemetry:** the newest Atlas run with beats and sections
  (`visualScoreRun`), as a musical timeline.
- **Lyrics:** the written lines, used only when the Atlas lyric verifier
  accepts their timing for this master.
- **Media:** the union of media the song's saved cuts already cast, ranked by
  use. Media the preflight cannot resolve is dropped and counted.
- **Living Light:** the newest saved Journey that the song's cuts reference,
  checked in the Living Light store. A song-length Journey plays on song time.
  A shorter one is entered as late as each cue allows, still at 1x.
- **Shaders:** final-render-ready generators from the gated, proxy-hydrated
  manifest.

The domain module `src/domain/echo-integrated-performance.js` plans each
treatment and projects it into a saved-cut-shaped project. The script then
checks that project with the media preflight. It compiles it through Director
V2, with the media cast locked so the compiler keeps the plan's shots, and
attaches the Living Light track. It generates the HyperFrames script and writes:

```
<output>/<song>/<treatment>/
  DIRECTOR_SCRIPT.md      the readable script: per-section story beat, written lyrics, every layer, transitions, bindings
  plan.json               the integrated plan (+ compile evidence: tracks, bindings, Living Light attached, cast preserved, preflight)
  project.json            saved-cut-shaped project (timeline, visualizer_timeline, persistent slots, Living Light cues)
  native-show-graph.json  Director V2 compiled graph with the Living Light track
  variant-receipt.json    Director V2 receipt
  hyperframe.html         HyperFrames composition
  score-dust.json         the composed Score Dust visual score (preview input)
<output>/index.json, REPORT.md
```

### Treatments

| Treatment | Leads | Shape |
|---|---|---|
| Story Arc | media | Media tells the story; Living Light opens the climax, breaks and release; dust writes a few hooks. |
| Tunnel Journey | Living Light | Living Light scenes through most sections, with transitions at every event; media appears as remembered windows; sparse dust motes. |
| Dust Chorus | Score Dust | Dust leads every return and the climax, word by word; media carries the verses; Living Light at the climax. |
| Telemetry Pulse | shaders | Audio-mapped shaders lead; cuts on every downbeat or two; dust on events; Living Light only in transitions. |

### Honesty rules built in

- Section roles are relative energy and repetition (arrival, statement,
  passage, return, climax, break, release). They are not established
  verse/chorus labels.
- An intent the runtime cannot execute is listed as **not executable yet**:
  always-on opacity by energy, Living Light rate, and dust density outside
  the preview. A shader without an audio map is shown as moving on its own clock.
- Every dust plan carries a `score_dust_layer` with `render: null`. Its
  binding matches the score the Builder's **Render layer** composes, and each
  script records this as `scoreDustBinding`. The compiled track is
  `render-required`, and final export refuses the cut until a render is bound.
  `renderPlacement` still lists the dust-led shots the whole-shot route could
  replace.
- The written lyric text is kept exactly, spacing included.

## Results — 2026-10-26 album pass

Results are filled from `data/echo-integrated-performances/2026-10-26/REPORT.md`.

Command: `node scripts/compile-echo-integrated-performances.mjs --output=data/echo-integrated-performances/2026-10-26`
(local, ignored by Git; `REPORT.md` and `index.json` there list every song).

- **Coverage:**
  - 209 of 209 Director projects produced **836 director scripts**, 4 per
    song; none were skipped.
  - Every song had an Atlas run with beats and sections, and a song-length
    Living Light Journey.
  - The preflight dropped no media.
- **Layers:**
  - 824 scripts use all five layers.
  - 12 Story Arc scripts use four. Those songs have no verified lyric timing
    and no lift events, so Story Arc's dust, which shows only hooks and lift
    bursts, has nothing truthful to show.
- **Compile evidence for every script:**
  - The media preflight passed.
  - The compiled picture track equals the plan's cast (`castPreserved`).
  - The Living Light track is attached.
  - The shared shader repair replaced nothing, because the plan casts only
    ready shaders.
- **Lyrics:**
  - 154 songs have written-lyric timing verified against their master.
  - 40 have timing for different master bytes (`audio-mismatch`).
  - 15 have none.
  - Only the 154 place words.
- **Per treatment:**

  | Treatment | Five-layer scripts | Living Light cues | Dust lyric phrases | Executable bindings (min / median / max) |
  |---|---|---|---|---|
  | Story Arc | 197 / 209 | 840 | 596 | 35 / 91 / 228 |
  | Tunnel Journey | 209 / 209 | 5,079 | 0 (motes, no words) | 39 / 87 / 161 |
  | Dust Chorus | 209 / 209 | 523 | 4,804 | 50 / 92 / 184 |
  | Telemetry Pulse | 209 / 209 | 2,294 | 0 (event bursts) | 42 / 101 / 227 |

  Saved cuts carry 0 executable bindings. Every generated script carries
  35–228, compiled from the audio maps of its chosen shaders.
- **Not verified:**
  - Nothing was rendered to video.
  - The HyperFrames compositions and Living Light tracks were generated but
    not played.
  - No script has been reviewed by eye.
  - Song Health was not re-audited, so no song's health changes.

## Next actions, in order

1. Done 2026-10-26: IP-6, Score Dust as a composited Director layer. Its
   follow-ups:
   - ~~Let the Builder add or adjust a layer on an existing cut~~ (done).
   - Prove Living Light and Score Dust together in one prepared take.
   - Refresh the stale media contract found below.
2. IP-9 and IP-7: compile bindings when cuts are saved, and give persistent
   slots an executable opacity target. Those two make "always on" actually
   follow the song.
3. IP-11 and IP-13: review the generated treatments in the Director and save
   chosen ones through the cut owner, with lineage.
4. IP-8, IP-10, IP-12 and IP-15: Living Light response and encoding, one
   readiness gate, Song Health reporting and composite safety.

## Turn-to-Lore reflection (2026-10-26)

- **Objective:** move from separate visual layers to integrated, telemetry-led
  performances, with several director scripts per song as evidence.
- **Reused:**
  - The Director V2 compiler and recipes.
  - The saved-cut projection shape.
  - The gated ISF manifest and proxy hydration.
  - Media preflight.
  - The Living Light cue contract, validator and track attach.
  - The Score Dust composer and lyric verifier.
  - The Atlas run selector.
  - The HyperFrames script generator.
- **Not replaced:** the generator does not change any of those owners.
- **New:** one pure planner. No existing surface planned all five layers
  against one clock, and extending one layer's planner would have made it own
  the others.
- **What worked:**
  - Recompiling with audio-mapped shaders showed that the empty saved
    bindings come from the save path.
  - Locking the media cast kept the compiled picture equal to the plan, and
    each script checks this as `castPreserved`.
- **Misunderstood at first:**
  - Score Dust was first read as preview-only. A whole-shot render placement
    route already exists (P2 item 7), so the plan now lists the shots that
    route would replace.
  - Director project files wrap their body in `music_video_project`. The first
    trial compiled the original timeline until the projection unwrapped it.
  - The compiler measures the song to the millisecond, so a Living Light cue
    ending at the exact microsecond end was refused. Cues now use whole
    milliseconds.
- **Guardrails:**
  - Always project the body, never the wrapper.
  - Check that the compiled track A equals the plan's cast.
  - Never present a declared intent as executed.
- **Candidates:**
  - Lesson Card: "project file bodies are wrapped".
  - Decision Card: "until IP-6, Score Dust enters a cut only as whole-shot render media" (superseded by IP-6 below).
  - Flow-explainer: the transition grammar table.

## IP-6 — Score Dust as a composited Director layer (2026-10-26)

How it works is described in [ECHO_SCORE_DUST.md](ECHO_SCORE_DUST.md)
(*Score Dust as a composited Director layer*). The code is in
`src/domain/echo-score-dust-layer.js`. In short:

1. A cut declares `score_dust_layer`, bound to an exact score: run,
   direction, lyric source, fingerprint and seed.
2. Director V2 turns it into a `scoreDust` show-graph track.
3. One transparent render is bound to the track.
4. Final export paints that render over media, shaders and Living Light,
   under lyrics, through the prepared capture route.
5. The preview overlay paints the same render frame with the same functions.

### Evidence (real song, real render)

The proof used *11:23 Meant to Meet?*: the generator's Dust Chorus cut and a
12 s layer (3.465–15.465 s) on the same binding (`fnv1a:43672718`, seed
2219433332).

- **Render and bind (UI):** the real `EchoScoreDustLayerOverlay` was mounted
  and **Render layer** clicked.
  - The layer's score was recomposed, and the fingerprint matched.
  - The window was rendered as 360 transparent VP9 frames at 1920×1080
    (`alpha_mode=1`), saved to Recordings and published.
  - The render was bound in the working copy with its sha256, which matched
    the published bytes.
- **Bind (CLI):** `bind-layer` with the same recording and receipt produced
  the identical render record.
- **Preview parity:** the overlay canvas and the export page's paint path were
  compared on 44 frames, 40 inside the window, including both window edges.
  The difference was 0 on every channel.
- **Export:**
  - The cut was compiled from its real Director V2 graph (media and three
    shader cues in the window) into a bounded 16 s HyperFrames package. Every
    gate passed: lint, inspect, media, visualizer and shader fidelity, with
    prepared capture required.
  - The prepared Electron capture encoded all 480 frames. Every frame receipt
    was checked, and all 360 in-window frames report `painted` for source
    frames 0–359.
  - A control take used the same package with layer opacity 0.
  - Export frame vs. control composited "over" with the decoded alpha frame:
    mean error 3.5–4.6 on dust pixels, against 11–56 if no dust had been
    painted. Over the whole frame the error is 1.4–1.8, the H.264 noise floor.
    Out-of-window frames in the same GOP differ from the control by 1.3–1.5,
    and frame 60 by 0.0.
- **Album pass with layers** (`data/echo-integrated-performances/2026-10-26-ip6`):
  - 209 songs, 836 scripts, none skipped.
  - 824 carry a `render-required` layer. Each binding was checked against
    `atlas.visualScore` with the layer's own direction and lyric source, and
    all 824 report `matches-builder-score`.
  - The other 12 are the Story Arc scripts with no dust windows, the same 12
    as before.
  - All 836 still have their cast preserved, media preflight OK, a Living
    Light track and 0 shader repairs.

### Found while proving it

- **Seek landing:** Chromium landed one seek 2 µs short (4.168334 →
  4.168332 s). The shared media runtime's 1 µs landing check then waited until
  its timeout. The layer now chooses its source frame by index and seeks to the
  middle of that frame, in both preview and export.
- **Lint:** the HyperFrames linter treats any static `<video>` as a clip or as
  the root composition. The export page now creates the alpha video at
  runtime.
- **Page setup order:** the page setup must read `window.HAPA_EXECUTABLE_SHOW`
  because it runs before the page's `S` is declared. A test guards this.
- **Stale media contract:** the media
  `folder-video-0e470451f48076ac` is a symlink in `data/media` to a source
  file outside the repository. That file now hashes `bd4613…` against the
  declared `0e4704…`. The prepared route refuses
  it, so any Living Light or Score Dust export of a cut that uses it fails
  until the contract is refreshed. The proof recast that one shot with the
  first shot's verified clip.

### Not proven

- Living Light and Score Dust together in one prepared take. Both use the
  same route, and the receipt checks combine, but there is no pixel proof yet.
- A full-length Song Card render with a layer.
- Done the same day: the Director's **Score Dust layer** panel adds, adjusts
  (window, opacity, blend) and removes a cut's layer, bound to the song's
  current score.
  - Verified in the running Builder on *11:23 Meant to Meet?*: current score
    `fnv1a:1d115606` with saved direction r1 and verified lyrics; add; window
    edit; playhead start; opacity; blend; refusal of an end before the start;
    removal. The preview overlay followed each change.
  - Nothing was saved.
- The dust in this direction is subtle over busy footage: the brightest alpha
  is 107/255. That is a creative tuning question, not a compositing one.

### Turn-to-Lore reflection (IP-6)

- **Objective:** Score Dust joins the picture instead of replacing it, with
  the same frames in preview and export.
- **Reused:**
  - The deterministic transparent export and the Recordings and publish-render
    routes.
  - The Living Light track pattern (attach, validator, export refusal).
  - The prepared Electron capture owner, frame receipts and pixel proof.
  - The Atlas visual-score query.
  - The cut save path.
- **New:** one import-free layer module, shared by the Builder, the compilers
  and the export page, plus one preview overlay. A live Score Dust simulation
  in the export page was rejected: it would need the audio decode, motif
  images and fonts packaged under the page's `connect-src 'none'` policy.
- **What worked:**
  - Proving on real data. The page-order bug, the lint conflict and the seek
    landing never showed in unit tests.
  - Comparing against a control with zero opacity isolated the compositing
    math from codec noise.
- **Misunderstood at first:**
  - The layer's lyric source matters. Atlas adds verified lyrics only when
    asked (`lyricLines=project`), so the layer records it.
  - Seconds-based seeks are not exact on millisecond WebM timestamps.
- **Guardrails:**
  - Bind to the score the Builder will actually compose.
  - Seek fixed-rate renders by frame index.
  - Never drop a declared layer from export.
- **Candidates:**
  - Lesson Card: "seek fixed-rate renders mid-frame".
  - Decision Card: "Score Dust composites from one bound alpha render".
  - Flow-explainer: the five-layer stacking order.
