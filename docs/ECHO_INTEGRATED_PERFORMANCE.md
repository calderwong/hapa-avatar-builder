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
| L4 Score Dust | Particle visual score composed from the Atlas timeline and the verified lyrics | Atlas visual score ([ECHO_SCORE_DUST.md](ECHO_SCORE_DUST.md)); reaches a cut only as a published render that replaces whole shots |

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
  - It is never composited over the other layers in export.
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
| IP-6 | Score Dust as a composited layer: a show-graph track bound to a score fingerprint, rendered over media and shaders in HyperFrames and native export, with preview parity. The existing whole-shot render placement stays for dust-led sections. | Compiled graph carries a `scoreDust` track; an export frame matches the preview within tolerance. | **open** (largest gap); dust-led sections can use the existing render placement today |
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
- Score Dust is always `compositeExportSupported: false` until IP-6 lands.
  Where dust leads, `renderPlacement` lists the exact shots that a published
  Score Dust render would replace. That route works today, after a browser
  render.
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

1. IP-6: make Score Dust a composited Director layer. Of the five layers, it
   is the only one that cannot sit over the others in export. Until then,
   render and place dust for the Dust Chorus dust-led shots through the
   existing render-media route.
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
  - Decision Card: "until IP-6, Score Dust enters a cut only as whole-shot render media".
  - Flow-explainer: the transition grammar table.
