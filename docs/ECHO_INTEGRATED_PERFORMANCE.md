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
  - All 1,392 editing graphs stored in saved cuts have an empty `modulationBindings` list. (Corrected 2026-10-27: the per-cut execution graphs that preview and export use do carry bindings, but those are inherited from the song's base compile and almost never name the cut's own shaders. See IP-9 and IP-7 below.)
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
| IP-7 | Always-on breathes: per-section opacity/intensity keyframes, or a binding target for persistent-slot opacity. | A slot's opacity follows section energy in the rendered output. | **done 2026-10-27**: a `visualizer_opacity` binding driven by song-relative section energy, executed in preview and export; results below |
| IP-8 | Living Light answers the song: an intensity or rate response to telemetry, and final encoding. | A cue's surface intensity follows master intensity; export no longer reports `finalEncoding: unsupported`. | **open** |
| IP-9 | Saved cuts carry executable telemetry. Bindings are compiled from shader audio maps when a cut is saved, and the runtime executes the camera and edit-permission targets it already emits. | New saved graphs have non-empty `modulationBindings`; runtime tests for camera and accent targets. | **bindings done 2026-10-27**: every cut graph compiles its shader bindings from its own cards (results below). Executing the camera and edit-permission targets is still **open** |
| IP-10 | One shader-readiness answer shared by the catalog, the picker and the compile gate. | Catalog, picker and compile path report the same ready set. | **open** |
| IP-11 | Integrated plans become saved cuts only through the append-only cut owner, with operator approval and `planId` lineage. | A saved integrated cut reopens identically and names its plan. | **save path done 2026-10-27** (one Dust Chorus cut saved for 194 of 209 songs; below). Certification is blocked by each layer's missing Score Dust render and by song-level data gaps |
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
2. Done 2026-10-27: IP-9 bindings and IP-7 (below). Still open from IP-9:
   execute the camera and edit-permission targets. Album-wide re-certification
   of every historical cut is **not** a goal (Calder, 2026-10-27): certify only
   the one current cut per song.
3. IP-11 save path done 2026-10-27 (below). Open: render each saved cut's
   Score Dust layer, fix the song-level gaps that block certification, then
   IP-13 (side-by-side review of treatments).
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
  - Verified in the running Builder on *11:23 Meant to Meet, Thu?*: current
    score `fnv1a:1d115606` with saved direction r1 and verified lyrics; add; window
    edit; playhead start; opacity; blend; refusal of an end before the start;
    removal. The preview overlay followed each change.
  - Nothing was saved.
- The dust in this direction is subtle over busy footage: the brightest alpha
  is 107/255. That is a creative tuning question, not a compositing one.

### First saved cut with a layer (2026-10-27)

- *11:23 Meant to Meet?* now has a saved cut with a Score Dust layer, made
  entirely in the Builder UI: add, Render layer, Save as new cut.
  - Cut `living-light-music-response-v1-edit-2b4bfd2ae308d9fe-edit-4ad62b1ed032fcc4`.
  - Score `fnv1a:95390f13`, seed 2219433332, saved direction r1, verified
    lyrics.
  - Whole song (0–202.16 s) at 85%, Over.
  - Render `f9b22bd3…`: 6,065 transparent frames at 1920×1080, 127 MB. The
    file's sha256 matches the binding.
- **Compiles:**
  - The saved cut, read the way the server reads it, compiles to a `bound`
    track in both graphs: the editor graph and the Director V2 show graph.
  - The two tracks are identical.
  - The export gate accepts it.
  - The compiled-graph validator passes.
  - A copy with a stale fingerprint is refused (`score_dust_track_mismatch`).
  - The cut also carries Living Light, so its export is the combined prepared
    take, which is still unproven.
  - The HyperFrames package compile (stem telemetry, packaging) was not run.
- **Found:** the first save dropped the layer without any error. The Builder
  API process had been running since before the `score_dust_layer` field
  existed. Its cut save keeps only the patch fields it knows, so it wrote the
  cut without the layer, and the UI still reported "Cut saved".
  - Restarting the launch agent fixed it.
  - The layerless cut (`…-edit-2b4bfd2ae308d9fe`) stays, because cuts are
    append-only.
  - **Guardrail:** after adding a cut field, restart the Builder API before
    saving through it. Check the saved file, not only the UI message.
  - **Fixed the same day.** The fork save route now refuses any patch field
    it does not keep (`409 fork_patch_field_unsupported`) and writes nothing.
    When the Builder reopens a saved cut that lacks a field it sent (an older
    server without that check), it keeps the edit open and unsaved, names the
    missing fields, and renews the save request ID so a retry cannot collide
    with the incomplete cut.

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

## IP-9 and IP-7 — cut telemetry and breathing always-on slots (2026-10-27)

### What was actually wrong

The 2026-10-26 review read the empty lists in saved cut files as the gap. Those
are editing copies. Preview and export use each cut's execution graph, which is
derived from the song's base Director V2 compile. That graph keeps the base
compile's `modulationBindings`, and a shader binding only executes when its
`visualizerId` names a card in the cut (`id` or `cueId`). Across the 1,586
published cut execution graphs:

- 83,919 shader bindings named no card in their cut, so they never executed.
- Only 1,150 of 19,000 shader cards had a binding that applied.
- No always-on slot had any opacity binding.

Every shader still reacted to audio through its own card audio map. What was
missing was the prepared, envelope-shaped telemetry (attack, release, beat
quantize, safety bounds) that base cuts get.

### What changed

`compileEchoCutModulationBindings` (`src/domain/echo-recipe-execution.js`), run
beside the existing generated-binding upgrade wherever a cut's graph is built:
the editor graph (`projectToEditorGraph`), the cut derivation that readiness
certification and cut detail use (`deriveEchoDirectionVariantProject`), and the
export compile (`compileHyperFramesShow`).

- **IP-9:** it keeps every binding that still names a card, every non-shader
  binding and every operator lock, and drops inherited shader bindings that
  name nothing. Each shader card left without bindings gets them from its own
  audio map, read exactly as export reads it (portable card map plus the cut's
  `visualizerMappings`; the normalizer is now shared:
  `normalizeEchoVisualizerCardAudioMap`).
- **IP-7:** each always-on slot card gets a `visualizer_opacity` binding. Its
  source is `section_energy`: the song's section energies made relative
  (quietest 0, loudest 1), carried in the binding itself, so preview and export
  need no new signal plumbing. Sections come from the visual budget policy, the
  cue graph (older compiles), or the song edit map (a cut not yet certified).
  Section maps leave gaps (often instrumental passages); a gap holds the level
  of the last section that started.
  The scale runs from 0.5× to 1.3× the slot's authored opacity, with a 0.6 s
  rise, a 1.2 s fall and at most 0.8×/s change. It scales the shader's
  visibility only; the slot's underlay dimming is unchanged.
- The modulation runtime evaluates `section_energy` at each instant; stem solo
  leaves it alone. Preview applies the scale in the frame intent, export in the
  HyperFrames runtime; both report `opacityScale`.
- Locks are respected: a `shader-treatment` lock leaves the graph alone; a
  locked card, binding or slot row (`shader`, `opacity` or `treatment`) keeps
  what it had. A song whose sections have no energy contrast keeps fixed slot
  opacity (`sectionEnergy: "unavailable"`).
- The result is deterministic and idempotent, and the graph records a
  `cutModulation` receipt.

### Results

Compiling all 1,586 published cut execution graphs:

| | Before | After |
|---|---|---|
| Shader cards with bindings that apply | 1,150 of 19,000 | 12,506 of 19,000 |
| Shader bindings naming no card | 83,919 | 0 |
| Always-on slot cards that follow section energy | 0 of 1,823 | 1,817 of 1,823 (906 graphs) |

The other 6,494 shader cards have no audio map in their card or cut, so export
has nothing to bind them to; they keep their own clock. Three graphs have no
section energy contrast.

On the saved Score Dust cut of *11:23 Meant to Meet?*:

- **Certification:** the Builder's own readiness run republished all 41
  certifiable cut execution graphs of the song through the new compile. Every
  shader binding names the cut's own cards (54 of 54), and each graph has both
  slot opacity bindings and a `cutModulation` receipt. The base cut's graph is
  published as the album compile itself and gets slot opacity when the editor
  graph or export show is built. Six other cuts of the song stay blocked by a
  `variant-parent-source-hash-mismatch` that the committed code reports too.
- **Live preview** (prepared song timing), always-on slot 1, authored alpha
  0.0864:

  | Time | Section | Opacity scale | Painted alpha |
  |---|---|---|---|
  | 5 s | intro (quiet) | 0.52 | 0.045 |
  | 30 s | energy 0.53 | 0.94 | 0.081 |
  | 47 s | loudest | 1.27 | 0.110 |
  | 55 s, 58.3 s | gap after the loudest section | 1.30 | 0.112 |
  | 66 s | energy 0.54 | 0.97 | 0.084 |
  | 150.5 s | outro (quiet) | 0.52 | 0.045 |

  The first preview pass found the gap: 55 s fell between sections and played
  at authored opacity. The gap rule above fixed it.

Tests: `tests/echo-cut-modulation.test.mjs` (9), including an end-to-end export
through `compileHyperFramesShow` and `evaluateHyperFramesVisualizers`.
`tests/echo-modulation-target-projection.test.mjs` now states the new contract:
a replaced shader never inherits the former shader's envelope, and gets its own
binding compiled from its own audio map.

### Not done

- Published execution graphs change only when readiness re-certifies each cut.
  Any change to these renderer files already requires that. So far one song's
  cuts were re-certified.
- Preview telemetry needs the song's prepared performance (**Prepare song
  timing**); without it the preview runs no graph telemetry, as before.
- A cut whose execution graph is still preparing previews without any graph
  telemetry at all (no active show graph), as before.
- Camera and edit-permission targets are emitted but still not executed.
- No full render was made, and no one has looked at a breathing slot by eye.

### Turn-to-Lore reflection (IP-9 and IP-7)

- **Objective:** saved cuts execute telemetry for their own shaders, and
  always-on slots follow the song's shape, in preview and export alike.
- **Reused:** the recipe binding builder, the generated-binding upgrade
  pattern and its lock rules, the prepared modulation timeline, the frame
  intent and HyperFrames runtime opacity paths, the cue-graph sections and the
  Builder's own readiness certification.
- **New:** one compile step and one binding target (`visualizer_opacity` with
  a `section_energy` source). No new signal sampler, store or worker.
- **Misunderstood at first:** the empty lists in saved cut files were the
  editing copy, not what plays. The real defect was inherited bindings naming
  other cuts' shaders.
- **Found by running it:** a card set limited to portable cards dropped valid
  bindings (caught by the recut parity test); 1,440 older graphs keep sections
  only in the cue graph; uncertified cuts preview from the song edit map; and
  section maps have gaps that the first preview pass exposed.
- **Guardrails:** a binding is only evidence when it names a card in the
  graph that plays; measure the album, not one graph; verify preview with
  prepared timing on.
- **Candidates:** Lesson Card "inherited telemetry must name the cut's own
  cards"; Decision Card "always-on opacity follows song-relative section
  energy, 0.5×–1.3×".

## IP-11 — one saved integrated cut per song (2026-10-27)

Goal (Calder): every song has **one** saved Director cut that uses all five
layers, with song-driven transitions and telemetry, certified so the Builder
can play and export it. Only that cut is certified; historical cuts are not.

### What was built

- `buildEchoIntegratedPerformanceCut` (`src/domain/echo-integrated-performance.js`)
  shapes one append-only cut from an approved plan:
  - ID `integrated-<treatment>-<plan digest>`, stable for the same plan inputs;
  - the song project is the immutable parent (`parent.projectSha256`);
  - lineage `append-only-integrated-performance` names the plan, its sources
    and the operator approval;
  - the patch carries only the layer fields (always-on slots, Living Light
    cues, Score Dust layer). Lyrics stay with the song project;
  - no graph is stored: the Director derives it like any generated cut.
- `scripts/save-echo-integrated-cuts.mjs` saves one treatment per song:
  - refuses a plan whose song project changed since it was compiled, or whose
    Living Light cues were not resolved against the saved Journey;
  - derives each cut the way certification does (album base graph, runtime
    shader repair) and refuses it if any layer, binding or slot-opacity
    binding is missing;
  - writes with no overwrite, records the existing cut files under
    `data/backups/`, and logs one line per song. Dry run unless `--apply`
    with `--approved-by` and `--request`.
- The generator (`compile-echo-integrated-performances.mjs`) now:
  - compiles each graph the way a saved cut is derived (Living Light, Score
    Dust track, the cut's own bindings and slot opacity);
  - resolves every Living Light cue against the saved Journey revision;
  - plans transitions as exactly one authored Journey passage and trims scenes
    so no passage is cut in half (the planner had ignored the schedule);
  - ignores integrated cuts as source material, so a rerun gives the same plan.

### Results

- Dust Chorus regenerated for 209 of 209 songs (about 6 s per song).
- **194 cuts saved**, one per song. Each is now its song's latest cut.
- 15 refused, nothing written:
  - 14 songs: the song project is 0.2 s longer than the album graph stored on
    disk (compiled 2026-09-28 to 10-07). Every recent cut of these songs fails
    the same check; the album graph needs recompiling by its owner
    (`scripts/compile-echo-director-v2.mjs`).
  - 1 song (*Gangsta in the Broadlight*): no section-energy contrast, so its
    always-on slots have no opacity target.
- Sample certification (4 cuts): 3 are blocked only by the missing Score Dust
  render; *American Kings* by a stale album graph (`source_project_hash_mismatch`).
- Song-level gaps seen while certifying:
  - 57 songs play a master that differs from the external song registry row
    (56 are Builder WAV uploads where the registry lists the Suno MP3), which
    blocks stem telemetry. The registry is owned by `hapa-song-registry`.

### Mistakes, kept as evidence

- An album-wide certification of all 8,101 historical cuts was started with no
  per-cut progress output, and stopped after 69 minutes on request. Guardrail:
  state scope and duration first, scope to the target cut per song, log each
  item.
- 194 cuts were saved with Living Light cues that could never certify
  (`sourceBindingRef: null`, and windows that cut authored passages). The
  generator had never resolved cues against the Journey store. They remain on
  disk (append-only) under their own IDs; the corrected cuts superseded them as
  each song's latest. Guardrail: run one song end to end through
  certification before any batch save.
- The corrected batch was planned while the broken cuts were still read as
  source material, which skewed media reuse counts and gave *90s Nerd* a third
  cut. The generator now ignores integrated cuts as inputs.

### Not done

- No Score Dust layer is rendered, so no integrated cut certifies yet.
  Rendering runs in the browser (Render layer) for the whole song and is then
  bound into a child cut.
- No video was rendered and no cut was reviewed by eye.

### Turn-to-Lore reflection (IP-11)

- **Objective:** one saved, certifiable five-layer cut per song.
- **Reused:** the generator, the append-only generated-cut pattern (Vibes
  transitions), the readiness preflight's derive and shader repair, the
  Living Light cue resolver.
- **Noise:** certifying historical cuts; dry-running all songs separately from
  the checked save.
- **Guardrails:** a generator's output must pass the certifier's own checks on
  one song before a batch writes; a planner fed from saved cuts must not read
  its own output.
- **Candidates:** Lesson Card "canary one song through certification before
  saving a batch"; Decision Card "integrated cuts carry only layer fields;
  lyrics stay with the song project".

## Score Dust follows the plan (2026-10-27)

Calder rendered the 11:23 integrated cut's dust and found it "super lazy and
not well integrated": it touched a Living Light moment or two, never the media
or shaders. The cause was in the plan, not the renderer. The plan knew where
dust should lead, the transition grammar, each section's media and shaders and
each shot's camera, but sent the score composer only the lyric hooks and a
density cap. The dust was composed from the song's analysis alone, on its own
section boundaries, in colours from a seeded random hue. The Living Light
overlap was a shared clock (both answer lift events), not coupling.

`echoIntegratedDustDirection` now builds the direction from the plan, using
fields the composer already had:

- `sections`: merge and move the analysis boundaries onto the plan's
  downbeat-snapped sections, then split at every media cut, so there is one
  dust piece per shot.
- Each piece takes its density from the section's role (the treatment's lead
  roles at 0.95; the rest 0.18–0.58 by energy; breaks 0.12) and its palette from
  that shot's poster or first frame (`echoIntegratedPaletteFromHistogram` over
  the media visual signature histogram, hues lifted to read over the picture).
- `eventResponses`: the plan's grammar per transition kind.
- `stemResponses`: weighted by how long the plan's shaders follow each signal;
  vocals stay at least 0.8 when the dust writes words.
- `cameraMoves`: each shot's camera motion (push, orbit, hold, drift).

The generator plans twice: the first pass casts the shots, their pictures give
the palettes (one bounded ffmpeg decode each), and the second pass adds them
without changing the cast. Palettes are part of the plan's identity.

Two more levers, added the same day for every song rather than one at a time
(Calder: "DO YOUR BEST FIRST", and apply it to more than one song):

- **The dust forms each shot's picture.** Each dust piece's motif takes the
  shot's poster (`{assetId: "media:<id>", url}`); the live and offline dust
  renderers already sample an image into particle targets. Sung phrases still
  take the dust while they are sung. Shots without a poster image keep their
  shape family.
- **The layer has a look per section.** `score_dust_layer.segments` (optional,
  `{startUs, endUs, opacity, blend}`): segment opacity multiplies the layer's
  opacity, so the editor's opacity stays the master, and ramps from the
  previous section over 250 ms; the blend switches at the boundary. Preview and
  export both read it through `echoScoreDustLayerFrame`, and the preview's
  canvas now follows the blend frame by frame. It is applied when compositing,
  so a bound render stays bound when looks change.
  - The planner sets lead roles to full opacity, breaks to 0.4 and the rest to
    0.55–0.9 by energy. Blend comes from how bright the section's pictures are
    (`echoIntegratedLumaFromHistogram`): "lighter" (lead) or "screen" over dark
    pictures, "over" over bright ones, where added light would wash out.

On 11:23 Meant to Meet, Thu?: 17 shots → 17 dust pieces (13 forming their
poster, all 13 posters served), 10 section looks, 29 section edits applied and
none skipped, and the Builder's score matches the plan. Cut
`integrated-dust-chorus-54eecb4016ea2cd9`. Not yet rendered or judged by eye.

## The 0.2 s songs: cause, deadlock and fix (2026-10-27)

**Cause.** On 2026-10-09 a one-off master duration sync (backup
`data/backups/master-duration-sync-20261009T221759/`, no committed script) set
`duration` in 19 song projects to their new WAV masters' measured length. It
was 0.2 s longer than the MP3-era value (for example 394.08 → 394.28 s). Only the
projects changed. The album graphs (compiled 2026-09-28 to 10-07) and the graph
copies stored inside cuts saved before then kept the old length.

**Why it blocked everything for those songs.** Three gates compare a graph's
length with the song's, within 50 ms, and all three were right to refuse:

1. Deriving a cut (projection validation) refused every new cut, because the
   album graph it derives against was 0.2 s short.
2. The compiled-graph validator refused the album graph itself
   (`source_project_hash_mismatch`).
3. Rebuilding the album graph was impossible. The album compiler's media
   preflight derives *every* saved cut of the song first. Older cuts that store
   a graph copy of the old length threw during that derive, outside the
   preflight's per-cut error handling, so the whole song was reported as an
   invalid project and the compile stopped. The stale graph could not be
   replaced, so nothing for the song could ever pass again.

**Fix.**

- `deriveEchoDirectionVariantProject` treats a stored graph copy whose length
  no longer matches the song as stale. It rebuilds the cut's graph from the
  cut's own timeline and patches on the current song, as for cuts that store no
  graph, and records `durationProjection.declaredGraph: stale-song-duration-reprojected`.
  The saved cut file is unchanged. A stored graph of the right length is used
  as before.
- With that, `compile-echo-director-v2-album.mjs --song` rebuilt all 19 stale
  album graphs (backup `data/backups/album-graph-recompile-2026-10-27/`): 14
  from the 0.2 s sync, *American Kings* and four more stale by project hash. All
  19 media preflights passed with 0 unresolved cues, and every one of the 209
  album graphs now validates against its song project.
- *Gangsta in the Broadlight*'s song map is one section, so its always-on slots
  had nothing to follow. Integrated cuts now carry the Atlas-measured section
  energy their plan used (`section_energy`, a kept patch field), and the
  telemetry compiler takes the first section map that has contrast.

**Result:** all 209 songs have an integrated Dust Chorus cut with plan-driven
dust and per-section looks. None is rendered yet.

**Guardrail:** a change to a song's length must recompile its album graph in
the same step. A preflight must report one bad historical cut as that cut's
failure, never abort the song.
