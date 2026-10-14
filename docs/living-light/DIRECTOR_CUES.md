# Living Light Director cues

Status: **prototype; authoring, compiler preservation and native Director preview implemented**.
Board: `hapa-living-light-avatar-builder`, LL-911; LL-912/913/903 remain open.
Source chat: `01a137cc-de1d-7511-ab65-227c92d5bca0`.

## Intent and reuse

Use a saved Living Light Journey as a Scene or Transition inside an Echo Director
cut. The existing Journey owner keeps the recipe and its immutable revisions;
Echo keeps the placed cue and its cut history. Neither becomes a new Card store.
The existing Save as new cut, editor projection and Director compiler are extended.

## Contract

`src/domain/echo-living-light-cues.js` owns `hapa.echo.living-light-cue.v1`.
The project field is `living_light_cues`; the optional compiled graph field is
`livingLight` (`hapa.echo.living-light-track.v1`). No field is added to legacy
projects without cues. An explicit empty array removes inherited cues.

Each cue names:

- A unique cue ID and Scene or Transition role.
- The exact song, Journey ID, Journey revision and source-binding revision
  (or explicit unresolved `null`, matching the saved Journey).
- A half-open cut window and equal-duration Journey window, in integer
  microseconds. `echo-song` is the transport clock; `offset-1x` preserves native
  speed. Song time and Journey time remain distinct in the evaluated cue.
- `outputProfile: project`, resolved to the cut's real output profile in the
  compiled graph. Switching orientation does not mutate the saved Journey.
- Explicit timing and Journey locks. Their enforcement in editing commands is
  part of LL-912; storing them is not a claim that those commands exist yet.

At most 128 non-overlapping cues use one native surface. Unknown fields,
non-integer windows, duplicate IDs, song mismatches, overlap, out-of-song bounds
and implicit speed changes are rejected. There is no silent clipping.

Exact owner resolution never follows the latest head or matches a title. The
saved Journey must have the same song/source reference and contain the selected
window. A native Transition selects exactly one complete authored passage;
a Scene may include complete passages but cannot truncate one. The native
Journey owner still enforces the inherited 4–60 second passage duration. A short
transition needs a separately implemented treatment, not a compressed bridge.

## Owner path

The main Director save and append-only cut-fork paths validate all exact Journey
references through the existing lazy Living Light service before writing. Reads
create no new authoring store. Ordinary cuts do not instantiate the service.
A fork request from an older client that omits the cue field inherits it from
its parent; an explicit empty array clears it. Malformed or unavailable references
return errors while retaining the source cut.

`pickEchoDirectionVariantProjectPatch` carries the cue declaration through
working forks and saved variants. The shared editor projection refreshes the
Living Light track from authoring, so clearing a cue cannot retain a ghost from
the parent graph. The Director treatment includes cues in its input hashes and
compiled identity. Shared graph validation rejects mismatched or omitted cues.

## Readiness and next connection

Compiled readiness is derived, never accepted from a caller. Current preview
state is `requires-native-host-and-exact-resolution`; final encoding is
`unsupported`. The existing HyperFrames compiler rejects any project or graph
containing Living Light cues instead of silently omitting them, including a stale
graph that forgot the project’s cues.

The cue editor is now visible in Echo’s Living Light tab (see below). Native Director preview is connected (see the playback checkpoint below). Full
live API save/reopen proof, media resolution across cuts and
encoded execution remain open. No live album records were changed by this slice.
Next: insert/select/swap controls and native host evaluation using the same cue
contract; then explicit qualified export, with the master soundtrack owned by Echo.

## Verification

106 affected tests passed across the cue, cut-variant, persistence, compiled-graph,
Director, multitrack and HyperFrames suites; production build and API syntax checks
passed. The file-based bounded runner recorded zero remaining descendants and
restored the process baseline. Nine new cue tests exercise windows, ownership,
source/revision mismatch, complete passages, persistence/forks, output profile,
hash identity, explicit removal and export refusal. This does not establish live
Director playback, full API end-to-end acceptance or final-render parity.

Evidence is retained in the source chat under
`execution/living-light/director-cues/`. A local source checkpoint is a recovery
point within the ongoing integration batch, not closure of the goal or LL-911.

## Cue editor checkpoint — October 13

In Echo, open an editable Director cut, then **Living Light → Living Light in
this cut**. Refresh the saved Journeys, select an exact revision, choose Scene
or Transition and choose its source window. **New cue at playhead** starts a
new use at the current song position. Complete Location/passage buttons fill
source windows without inferring beats or compressing a passage. Insert updates
the existing cut draft; **Save as new cut** remains the durable append path.

Select a cue to move, trim, swap or remove it. Timing and Journey locks are
independent. A timing-locked cue can accept another Journey with the same source
window and duration. A swap that requires new timing refuses until timing is
explicitly unlocked. Undo/redo keeps up to 50 complete cue edits and changes only
the cue list, preserving unrelated song settings, lyrics and media edits.
External cue changes reset the local history rather than overwriting them.

`echo-living-light-editor.js` is the pure human/agent command spine: insert, move,
window, swap, remove and lock with optional expected-cue conflict checking. The
UI consumes these commands; a caller building a cut patch should use the same
spine. API save still independently validates exact references. A generic raw
project patch is not an authenticated action history or proof of lock intent.

36 affected domain/variant tests pass, including six new editing regressions.
The production component’s isolated browser study verifies a 0–6s scene, an
8-second complete passage, a timing-preserving swap and undo, retention of an
unrelated media change, and refusal of a truncated passage. No console errors
were observed. The phone breakpoint had matching client/scroll widths (375px);
production build and owned process cleanup passed. Fixture:
`tests/fixtures/echo-living-light-cue-ui.html`. Browser evidence is kept in the
source chat under `execution/living-light/director-editor/`.

This browser proof uses fixture Journeys and does not qualify a live album save,
Director canvas playback or encoded export. LL-912 remains in progress until
those integrated operations and agent proposal handling are verified.

## Native Director playback checkpoint — October 14

Saved Scene and Transition cues now appear in **Preview**. The existing native
renderer sits in the Director composition above ordinary media/shaders and below
lyrics. Between cues, ordinary cut media returns. The native passage runs in full
at its authored speed. Missing exact Journey/preset/audio references show a
readable unavailable state with explicit Retry; they never select a latest head
or silently show an unrelated scene in place of the requested Journey.

The host reuses the existing preview driver and Echo audio element. It creates
no audible source, audio context or independent clock. It retains current/next
recipe metadata, creates one active native renderer, and releases its graphics
and painted decoders at cue handoff, inactive gaps and leaving Preview. Hidden
view/context recovery follows the existing driver. Failed preparation/draw is
remembered for that use until an explicit retry or changed input; no retry loop.
Hold motion retains the last image within a cue and starts a new cue at its
correct source window. Clean Preview hides ready-status controls.

There are two explicit coordinates: `journeyUs` chooses the authored location,
passage and painted clip phase; `signalUs` samples prepared audio at the current
Echo song position. They advance at 1× with the saved cue offset. Native
`prepare` accepts an explicit `journeyDurationUs`; omitted values retain the
existing Workspace behavior. `evaluate` accepts `signalTimelineUs`, defaulting
to Journey time for existing callers. Frame/still receipts retain signal time.
No source duration, alignment map or saved recipe is rewritten.

Unbound recipes play authored motion. Recipes with saved audio choices require
exact prepared asset input; a missing or mismatched saved binding is unavailable,
not a neutral substitution. The Director's full prepared-asset lookup and real
album qualification remain open. Painted media currently resolves from the
active cut's declared sources; retained cross-cut lookup remains LL-914.

37 affected checks pass, including clock offsets, same-time signal changes,
whole native passages, half-open cue handoffs, stale async reads, bounded
current/next retention, failed graphics cleanup and explicit source refusal.
An actual native browser study with one silent fixture HTML audio element proved
play/pause, seek, Scene → Tunnel → Location, return to cut media, missing-revision
and retry behavior, leave/return, motion hold, and portrait output. It showed one
audio element/one native canvas, no console errors, and a 320×569 canvas at the
phone breakpoint (375px client and scroll width). Build and owned process cleanup
passed. See `tests/fixtures/echo-living-light-preview-ui.html`; local evidence is
in the source chat's `execution/living-light/director-playback/` directory.

This is native component and source-integration evidence. Live owner save/reopen,
full album-clock/painted-media acceptance, running Desktop reload, short-transition
policy and native/baked encoding are unfinished. The preview recorder now refuses
cuts containing Living Light cues, matching the existing final-export refusal,
until its composite capture path is qualified. No board requirement is closed.


## Exact painted media lookup — October 14

Saved Journey previews in both the Workspace and Director now resolve enabled
painted sources through their original Song/cut/shot/media/declaration reference.
An exact current-draft source can satisfy the reference immediately; otherwise
`POST /api/echos/living-light/media/resolve` asks the existing cut owner. The API
accepts only `{refs:[...]}`, at most two exact references and a 4 KiB body, under
the existing protected UI/API authentication. It returns
`hapa.living-light.media-resolution.v1`, `readOnly:true`, and per-reference
`resolved` or `unavailable` results. It does not edit cuts, source media, Journeys,
Card custody or publication. API/CLI parity is
`cli/living-light.mjs resolve-media --file REFS.json` with the same request body.

Each cut loads once per request. Stored variants use the existing exact-ID read
and variant projection; no latest-head or title fallback occurs. The source
reference is checked again after projection. A changed URI/content declaration,
missing cut or wrong owner identity remains unresolved. Filesystem errors are
reported without private paths. URLs are transient playback inputs and never
enter saved placements. The digest identifies the source declaration and available
content-hash claim; this lookup does not independently verify video bytes.

The Director resolves current/next metadata before creating graphics and discards
late results after a seek or disposal. The Workspace cancels obsolete selections.
Both lookups have a 30-second deadline. No new decoder, audio clock, media store,
Card type or background worker was introduced. General Media/Card library routing
and immersive navigation remain LL-914/915/916 work.

21 focused checks pass across media lookup, native media and Director handoff,
including protected route admission, CLI transport, missing/changed references,
cut grouping, current-plus-retained sources and cancellation before graphics.
The production build passes, with bounded owned process cleanup verified. Source
checks passed for API/service/routes. The existing canonical launchd API was
reloaded once through its documented owner and reported fresh source; its UI
entry redirects to the loopback companion. The old development API was not
restarted. Browser control timed out on the full app before a live save/reopen
could be verified. No live album/Journey record was changed for that attempt.
LL-914 remains in progress, and live desktop/real-song qualification stays open.
Local evidence: source chat `execution/living-light/media-resolution/` and
`execution/living-light/live-integration/reload-receipt.json`.


## Mixed native preview recording — October 14

**Record + Play** now includes Living Light in the existing Director preview
recorder. The compositor paints the ordinary shot and shader, the current native
Journey surface, then visible lyrics into a staging canvas. It commits only a
complete picture to the recording stream. Native WebGL is copied synchronously
after rendering; no later read of a cleared presentation buffer is assumed.
The same existing master element, Web Audio tap, MediaRecorder, upload owner and
recording shelf are used. No extra audible source or render service is created.

Capture takes the native frame driver’s ownership while running, then restores
normal preview scheduling. It uses Echo song time and the saved cue mapping.
Two cue uses sharing one exact Journey keep one renderer and its two-decoder
bound through the gap, pause media between uses, and reset held motion at each
new cue. Every use still validates its exact source window. Leaving that recipe,
changing source, hiding/unmounting or disposal preserves the existing cleanup.

If a Journey or painted clip needs decoding, both MediaRecorder and the master
pause. Only a fully rendered current picture resumes them; the wait is bounded
to 15 seconds, and excluded from the reported media duration. A failed source,
frame, texture, or timeout stops the take. The saved recording preserves
`captureStatus: incomplete`, its reason and cut ID, and displays that state on
the shelf after reopening. Older captures report unknown status. This is a
capture outcome, not release certification or creative acceptance.

Every new Living Light take requests the existing capture identity: selected
song and cut, source audio URI, SHA-256 of the actual playback audio bytes and
SHA-256 of the current source/cut graph declaration. Signal replay companions
remain optional and distinct; a source receipt does not fabricate analysis.
Original media and saved cut/recipe revisions remain untouched.

Qualification is currently a short **Landscape 1920×1080, target 30 fps** mixed
pilot, with the native layer capped at 1280 pixels on its longer side and scaled
into the output. It is preview-quality capture, not a full-resolution native
render guarantee. Portrait/Square geometry and long-form recording remain
unqualified for this integration. Final HyperFrames/Song Card export still
refuses native Living Light cues; no mint/publication readiness is inferred.

Evidence: the real saved painted album Journey and its child cut, owner recording
readback, ffprobe streams/timestamps, extracted encoded frames and audio levels
in the source chat’s `execution/living-light/mixed-recording/`. The first encoded
inspection showed portal → ordinary footage → painted tunnel → ordinary footage,
H.264 1920×1080 and exactly one non-silent stereo AAC track. Focused native host,
driver and recording checks (52) and production build passed with process cleanup.
The source-bound follow-up is recording `014b164a-4b19-42ad-80d7-292c2a07e51e`: 35.570333 seconds, 1,062 strictly increasing video timestamps, a 122.1 ms maximum frame gap, and one 48 kHz stereo AAC track (mean −17.9 dB). The audio/video stream duration difference is 33.062 ms; this alone does not establish sample-accurate synchronization. Audio and graph hashes are retained in its capture identity. The four extracted pictures at 4, 11, 15 and 24 seconds show the expected Location/video/passage/video sequence. This is variable-frame-rate preview evidence, not a constant-30-fps claim.

LL-903 remains in progress until remaining profile and timing acceptance is
closed; the full integration goal and human creative review remain open.


## Saved prepared-source recovery — October 14

Director Preview, Follow Director and Record + Play now resolve bound Journeys
through the existing protected Living Light prepared-performance read. The ordinary
Echo visualizer bank is a different source policy and cannot satisfy an exact
Living Light binding. A resident exact bank can be reused; otherwise the host
performs one deduplicated read for its current song. Opening/seeking never starts
analysis, decodes another soundtrack, applies an alignment map or changes a cut.

Native preparation waits for that asynchronous read before allocating its renderer.
The existing current/next recipe limit still applies. Leaving the host aborts the
request; abandoning a recipe ignores its late result. The request has a 30-second
timeout, while a successfully loaded bank remains valid beyond that request window.
Retry scene creates a fresh host/read after an explicit failure; no automatic retry
loop or fallback to neutral response is added.

The selected master receipt, exact asset policy, song, prepared fingerprint and
saved binding revision must agree. Stem audition and changed/missing sources fail
visibly. Missing preparation names **Living Light → Song and stem signals** as
the recovery route. A different prepared revision requires explicit source review;
it never upgrades the saved pin. Existing feature-bank admission still checks
byte/PCM identity, timeline, extractor and measurement semantics. Unbound authored
scenes remain neutral and make no prepared-source request. Stem alignment remains
unverified unless independently applied by its owner.

24 focused host/input/feature/protected-port checks passed, followed by four
focused checks after a message-only correction; production build passed. The
production surface rendered actual native prepared response with synthetic
receipts/curves, retained one read while seeking from 0.5 to 1.5 seconds, refused
changed and missing preparation, and recovered through explicit retry/leave/return.
Fixture: `tests/fixtures/echo-living-light-prepared-ui.html`; source-chat evidence:
`execution/living-light/prepared-recovery/`. The temporary Vite server received
explicit SIGTERM (exit143), with zero remaining descendants and restored process
baseline; this is deliberate teardown, not a passing server exit code. An initial
Vite/React duplicate-bootstrap warning is retained as fixture evidence. No real
album bound-Journey acceptance or final-render qualification is inferred.


## Frame-addressed native rendering — October 14

`src/living-light/director-offline.js` adapts the existing native Director host
for an offline encoder. This is a verified frame primitive, **not yet final export
support**: HyperFrames and Song Card retain their explicit Living Light refusal
until exact snapshot/media packaging and the encoder are connected and qualified.

The caller supplies a fixed output width/height, integer frame rate (1–120), song
duration (up to 30 minutes), exact cue/resolution callbacks and prepared inputs.
`prepareFrame(index, {signal})` evaluates `round(index * 1000000 / fps)` with paused
muted decoders, high quality and explicit scene/song coordinates. It waits up to
30 seconds for recipe/input/decode readiness, copying the native canvas immediately
after its successful draw into one persistent staging canvas. Timers only bound
readiness; they never choose picture time. The native owner retains its one graphics
renderer, current/next recipe metadata and two painted-video limit.

`paintFrame(index, context)` only copies a completed frame at that exact index.
A new preparation invalidates the previous frame; simultaneous prepares, stale
indices, missing sources, decode failures, timeout and graphics loss refuse.
Inactive cue gaps leave the ordinary compositor untouched. Cancellation or a fatal
preparation releases the host, pending wait and canvas storage. Graphics loss
releases resources immediately. No soundtrack, animation clock, analysis, Card
write or replacement source owner is introduced. Bound Journeys cannot default to
neutral input; their existing exact prepared-source adapter remains required.

34 affected checks and the production build passed with restored process baselines.
Native browser proof used a neutral fixture Journey and a real local video on Solar
Reliquary and Media Weave surfaces. In 1920×1080,1080×1920 and1080×1080 at30fps,
requests120→390→120→270→390 reproduced identical scene and passage pixel hashes
after backward seeks and a cue gap. Both video decoders were muted, paused and
ready at their requested times; the final host had zero retained recipes/native
renderer after disposal. No browser warnings/errors were observed. Evidence:
`tests/fixtures/echo-living-light-offline-ui.html` and source-chat
`execution/living-light/offline-render/`. This bounds repeatability to the inspected
browser/GPU, recipe, media, frames and profiles; it is not cross-device bit identity,
full-song encoding, audio synchronization or human creative acceptance.

Next integration: preserve the cut's exact Journey/Thing/source revisions in a
bounded export snapshot, package verified local media and prepared assets, bundle
the native adapter, and await preparation before each HyperFrames frame. The
existing compositor still owns ordinary media, lyrics and final master audio.


## Exact render packages — October 14

`scripts/package-living-light-render.mjs` prepares an inert local render package
from an exact saved song/cut. It uses the canonical Living Light authoring owner’s
portable Journey export, including exact module revisions, preset parents and
source attribution, with note inclusion disabled. The protected painted-media API
and this CLI now share `server/echo-saved-cut-reader.mjs` for exact append-only,
embedded and legacy cut resolution. Neither changes a Journey, cut, Card or source.

Example from the Builder root:

```sh
node scripts/package-living-light-render.mjs --song-id=<song> --cut-id=<cut> --output=<new-directory>
```

The output directory must be new. The CLI honors the existing Journey-store and
saved-variant-directory environment overrides. A bound Journey additionally needs
`--prepared-source=<owner-input.json>` containing `performance` and the public
`playbackReceipt`. This is the existing prepared bank/receipt contract, not a new
analysis or approval mechanism. The packet validates master/PCM identity, saved
binding revision, measured feature semantics and complete song duration. It does
not independently certify supplied measurement provenance or refresh source bytes;
the canonical prepared owner still owns that evidence. Automatic owner preparation
and real-owner bound-export qualification remain open.

The local media packager resolves only existing owner video declarations, copies
through a bounded temporary file, detects source changes during copying and emits
content-addressed package-local paths. Existing content addresses are verified
before reuse. Originals are never overwritten; no remote fetch or transcode occurs.
Temporary copies are cleaned on failure. Successfully copied files may remain as
inert partial output if later preparation fails; no valid manifest is emitted.

`hapa.echo.living-light-render.v1` pins cue windows, exact owner metadata packages,
painted-media declaration references plus copied-byte SHA-256/length, and optional
prepared input. Admission verifies both snapshot/package digests, original catalog
definitions, inherited preset defaults, all referenced modules/media, song/binding
agreement and cue/source windows. Raw workstation paths, credentials and custody
authority are refused. Limits:128 cues/recipes,100 module revisions per recipe,
64MiB metadata,2GiB per video; the underlying two-painted-source/Journey cap stays.

`src/living-light/director-snapshot.js` consumes a private copy of this package
through the frame adapter. It resolves recipes and media only from the snapshot;
it owns a bounded feature cache and never falls back to a running authoring/API
service. The metadata digest commits the declarations, while copied file hashes
must also be verified by the render packager/runner. It is not a signed authority
claim or protection against subsequent external modification of package files.

27 affected checks, API/CLI syntax checks, production build and browser-library
bundle passed. The real saved painted pilot packaged one Journey and two exact
clips (3,554,774 and4,664,704 bytes), with snapshot digest
`f06d94f446aadbfea5dfca5befc9d6d6679fdcf737b2c770c60b32c76ad35d43`.
An isolated static server exposed only that directory, with `connect-src 'none'`.
Native1920×1080 output reproduced identical scene/tunnel hashes for requests
120→450→120→330→450 at30fps: song4s/Journey2s, song15s/Journey29s, and an inactive
song11s gap. Both video decoders were paused/muted; native resources and feature
cache were released. The static server exited0 and restored its process baseline.
Evidence remains in source-chat `execution/living-light/render-package/`.

The initial proof omitted UTF-8 declaration, corrupting Unicode metadata during
script loading; digest validation correctly refused it. Explicit UTF-8 fixed the
transport and the final proof passed without browser errors/warnings. This proof
does not include ordinary cut media, lyrics, master audio or final encoded output.
HyperFrames/Song Card still refuse Living Light until that composition path is
connected and qualified. LL-903 remains in progress; human review remains separate.


## Prepared mixed-cut encoding — October 14

The local compiler accepts `--living-light-package=<living-light-render.json>`
only when the snapshot's song, duration and exact cues match both project and
Show Graph. The default path still refuses Living Light export. It copies and
checks packaged video bytes, bundles the existing native snapshot renderer, and
composites it above ordinary media/visualizers and below the existing lyric layer.
The compiled identity includes the snapshot digest and declares
`captureRoute: hapa-prepared-electron-v1` / `requiresPreparedFrames: true`.
Compilation success is not encoded acceptance or showcase readiness.

Use the existing compiler's graph/project/telemetry/audio options plus that
snapshot flag, then run from Builder:

```sh
node scripts/run-prepared-render.mjs --project=<compiled-package> --output=<new-directory>
```

This Hapa-owned capture adapter reuses the Echo HTML compositor and its native
frame primitives; HyperFrames, Electron/Chromium and FFmpeg remain upstream-owned.
The installed upstream HyperFrames CLI does not await HAPA_PREPARE_MEDIA_AT, so
its ordinary render command is not an eligible renderer for these packages.
The local upstream launcher refuses those packages before spawning capture.
No node_modules patch, external service, dependency installation, source repair,
analysis, Card mutation or publication is part of the prepared encoder.

`HAPA_RENDER_FRAME_AT(integerIndex)` awaits ordinary media/ISF preparation and
the exact native Living Light frame, then flushes the shared timeline and lyric
layout. The capture owner validates the frame/cut/snapshot receipt and dimensions,
waits two compositor turns, and sends one PNG at a time with encoder backpressure.
Output is constant-frame-rate H.264 with exactly one mapped stereo AAC master;
preview media remain muted. Existing packaged audio/media hashes are checked
before capture. A prepared Living Light bank must additionally match the packaged
master bytes via its existing playback/source receipt. This metadata and byte
comparison does not independently certify the bank's historical measurements.
General source-bound owner acceptance is still pending.

The Node parent owns one Electron process group and its encoder/helpers. Direct
Electron startup is refused without the parent worker role. Cancellation and
timeout terminate the group, escalate to bounded force termination, verify exit,
and remove only the owned per-run Electron profile. A new output directory is
required. Canceled/failed outputs retain explicit failure evidence. A successful parent
exit with no failure record is required; an encoded file alone is not completion. The renderer exposes a 30-minute ceiling, bounded frame and
pipe waits, and validates output dimensions/rate/duration. The parent currently
uses macOS/POSIX process-group semantics; Windows is not qualified.

Technical proof: a real 22-second landscape prefix contains ordinary footage,
the exact saved Solar scene at2–10s, ordinary footage at10–12s, the complete
Media Weave transition at12–20s, then ordinary footage. All660 timestamps match
30fps; exactly480 frames carry Living Light. Encoded samples show the painted
portal with readable lyrics, blue-eye wall panels in the tunnel, and subsequent
video with the original visualizer layer. Audio/video both last22seconds;
one stereo48kHz AAC track has zero-offset decoded master correlation0.9987603.
This is technical sampled visual/clock evidence, not human taste or word-timing
acceptance. The native/cache resources and owned process group return to baseline.

The original saved graph lacked shader byte pins and used a local reference-media
API URI that the offline preflight did not resolve. Two failed preflights are
retained. Derived render inputs resolve the clip through the existing reference
owner and pin the currently verified catalog shader bytes; no source shot,
Journey, saved cut or shader is changed. Existing Song Registry waveform windows
provide master telemetry without invented stems/bands/onsets or new analysis.
The original38 cuts, saved pilot child and exact Journey payload remain unchanged.

Verification:50 affected checks, then9 focused checks after the parent cleanup
repair (53 distinct tests), production build, native22-second encode/inspection,
explicit cancellation, and successful short-prefix parent capture. The first
direct-Electron cancellation left one ffmpeg for the outer test owner to reap;
that failure is preserved and caused the required parent boundary. All final
owned process baselines are restored. Successful capture through the parent is
qualified separately from the earlier22-second content proof; all90 PNG frames
of the final parent prefix match the corresponding frames of that content proof.

Evidence: source chat01a137cc-de1d-7511-ab65-227c92d5bca0,
`execution/living-light/prepared-export/` in that task workspace. MP4 digest
`fafff210fe463672344389cfd8b4980a4d9d0ef9ef224f3727f2e2749d7fa57d`;
snapshot`f06d94f446aadbfea5dfca5befc9d6d6679fdcf737b2c770c60b32c76ad35d43`.

Remaining: connect the prepared route to existing managed render jobs and Song
Card export, resolve ordinary source preparation through that owner, qualify
real bound sources/full songs/other output profiles and complete shared Hand,
proposal and integrated album acceptance. LL-903 remains in progress. Human
creative acceptance and the active GitHub freeze remain unchanged.


## Managed Song Card route — October 14

The existing Song Card job bridge now freezes neutral/unbound Living Light
Journeys through the saved Journey/media owners before forming checkpoint
identity. Exact metadata and copied painted videos enter its existing source
manifest; corruption or mid-job changes refuse checkpoint persistence. Repeated
identical inputs reuse content-addressed copies. Authoring, source cuts and
media remain unchanged. Renderer identity includes the native source tree and
Living Light contracts, packaging and capture owners.

The normal compiler readiness gate receives that exact snapshot. Managed
admission requires matching compiled identity and every existing compiler gate;
`showcaseReady: false` is not globally ignored. It selects the declared prepared
route explicitly. Pixel QA requests integer output frames, checks every Living
Light cue and samples its boundaries, while retaining ordinary shader, lyric,
network and encoded spatial/audio/release checks. Prepared capture uses original
source bytes and frame-addressed looping; upstream-only loop-file expansion does
not rewrite these hashed assets.

`server/prepared-render-owner.mjs` is shared by the CLI and managed job. Jobs
register the actual Electron process group, show frame progress, and keep
ownership until bounded cancellation/reaping finishes. Per-run output markers
prevent failure receipts from modifying another take. Encoding alone is not
release acceptance or mint authority. No new analysis, generation, publication
or automatic mint is introduced by Living Light source packaging/capture.

Evidence:66 distinct affected tests, final build, real source snapshot/reuse,
31 native mixed-cut pixel samples, shared-owner three-second success and explicit
job-style cancellation pass. All90 captured PNG hashes match the prior verified
prefix. The regenerated executable show and HTML match the prior22-second
package exactly, allowing its existing encode/audio evidence to be reused.
An intentionally wrong pixel expectation now exits1; all owned process baselines
and proof profiles are clean.38 prior cuts, the pilot child and Journey remain
unchanged. Source chat01a137cc-de1d-7511-ab65-227c92d5bca0; evidence is under
`execution/living-light/managed-export/` in that task workspace.

Two initial failures are retained: the successful compiler report lacked its
new show-hash field, and legacy pixel expectations ignored explicit shader layer
order on three frames. Both are corrected. Electron previously returned0 after
a false pixel report; it now propagates failure. No acceptance threshold changed.

This is source-built integration with qualified stages, not a completed live
UI-to-release render. Restart/delivery certification, the saved pilot's ordinary
portable-shader readiness, full-song and other output profiles remain acceptance
work. Audio-bound Journeys remain refused here until their exact prepared bank
and playback clock are qualified; no neutral substitution is allowed. Shared
Hand/proposal parity, integrated acceptance and human creative review remain
open. LL-903/913/914 and the overall goal stay in progress.


## Saved-cut certification integration — October 14

The saved-cut readiness owner now prepares the same exact Living Light snapshot
as the managed renderer. Copied metadata and painted media join the existing
stat-bound execution-input evidence, so later modification invalidates the
certificate. Hashing streams files with bounded memory. The service closes after
success or failure. Ordinary cuts do not open the Living Light owner.

Offline source preparation and runtime route checks now resolve generated Echo
reference clips through the serving owner's exact run/job manifest lookup.
Unknown runs/jobs, malformed routes and paths outside the existing owner root
remain unresolved. No network fetch, generation or source-cut rewrite occurs.

The real saved pilot passes readiness with 45 resolved video sources, 10 exact
visualizers, 13 verified audio inputs, 10 proxy inputs and 169 semantic samples.
Existing stem telemetry was reused.48 affected tests and the build pass; owned
process baselines returned.38 prior cuts, the pilot child and exact Journey
payload remain unchanged. This establishes readiness, not final encoded output.

Activation of the derived execution graph remains pending explicit user approval.
Automatic approval review rejected the owner's apply-stem-repairs flag because
it changes shared execution state; the operation was not retried through the UI
or an alternate route. Source inspection places those writes under the existing
render-artifact owner, but that finding does not substitute for the requested
approval. A separate edit-script rejection was resolved with an approved exact
function-body replacement that preserved other exports.

Source chat01a137cc-de1d-7511-ab65-227c92d5bca0; evidence:
execution/living-light/managed-live/ in the task workspace. Next: activate this
one cut after approval, deliver the fresh service, then qualify managed render
to release. Full-song/profile/audio-bound, shared Hand/proposals, integrated album
and human creative acceptance remain open. The overall goal is active.


## Reviewed Director proposals — October 14

The existing Living Light cue editor now accepts inert director proposals under
**Director proposals**. Start from this cut supplies the exact song, cut and
complete current cue list. A human or agent can add up to32 insert/remove/move/
window/swap operations. Review shows each before/after cue and exact Journey
revision. Apply proposed changes changes only the working cue draft, as one
existing history entry. Undo/Redo preserves unrelated media and lyric edits.
Use the existing Save as new cut flow for persistence; proposals do not save,
render, mint, publish, modify source Journeys or authenticate an author's name.

Contract: `hapa.echo.living-light-proposal.v1`, fields `schemaVersion`,
`proposalId`, `title`, `target:{songId,cutId}`, `baseCues`, `operations`.
Operations reuse the cue edit contract; swaps carry `journeyRef:{journeyId,
revisionId}` instead of embedded recipes. Inserts carry a complete validated
cue. No lock/unlock or arbitrary project patch operation exists. Locks, exact
source/song bindings, song duration, complete passage windows and no-overlap
rules use the existing editor. A late failure refuses the entire proposal.
Operations validate in order; a temporarily overlapping reorder must be planned
as legal intermediate edits. Changed base cues or a different target refuse;
there is no latest-head substitution. The user retains the proposal text and
working cut on refusal. In-flight reads are canceled/invalidate on cue/cut change.

Protected read-only API: `POST /api/echos/living-light/director-proposals/preview`
with `{proposal}`. It reads the exact saved cut and saved Journey revisions.
CLI: `node cli/living-light.mjs preview-director-proposal --file PROPOSAL.json`.
UI previews the current working draft through the same domain spine; API/CLI
previews the saved cut. An unsaved draft may therefore correctly refuse against
the saved owner. Maximum request size1MiB; operations32; source reads deduplicate
exact revisions. There is no proposal commit endpoint or second proposal store.

41 affected tests, canonical build and isolated production-component browser
proof pass. Browser proof covers two-operation apply, single undo/redo, retained
unrelated media, stale-base refusal, locked-swap atomic refusal, compatible move
with Journey lock, visible final apply feedback and390px width without horizontal
overflow. These are fixture observations; full-app proposal save/reopen and
shared Hand integration remain open. All owned proof processes returned cleanly.
Initial fixture setup incorrectly assumed esbuild was installed, then omitted
Vite library mode's production definition; both failures are retained and were
corrected without installing dependencies or touching album data.

Source: Codex /root chat01a137cc-de1d-7511-ab65-227c92d5bca0;
evidence `execution/living-light/director-proposals/` in the task workspace.
LL-912/917 remain in progress under their complete original acceptance criteria.

### Pilot certificate approval and activation

Calder explicitly answered “Approve this pilot certificate activation” to the
pending question for the saved11:23 Meant to Meet, Thu? pilot. The exact previously
refused owner command with `--apply-stem-repairs=true --skip-mint-plans=true` was
then approved by the tool and completed. The one-cut report is ready with no
known blockers and its derived execution graph publication reports `published`.
38 prior cuts, the pilot child and exact Journey payload remain unchanged. This
resolves the prior activation refusal; it does not establish a completed render,
release, mint or human creative acceptance. The current service/UI delivery and
managed render-to-release check remain the next integration step. Evidence:
`execution/living-light/managed-live/activation-approved.json`.


## Cue contract acceptance audit — October 14

LL-911 is technically complete within its four original criteria. The broader
integration goal and human creative acceptance remain open. This dated audit
supersedes the earlier foundation checkpoint's pending contract status; historical
checkpoints above retain their original observations.

| Original criterion | Inspected evidence |
| --- | --- |
| One Scene/Transition contract with exact identities, windows, profile and readiness | Shared cue schema and validator; source-binding and complete-passage refusal cases. |
| Save/reopen/compile/hash preserve exact cues | Persistence/fork/compiler tests plus the saved real-song pilot and fresh-page reopen; the child contains Scene 2–10s and Transition 12–20s pinned to one immutable Journey revision. |
| Legacy cuts unchanged; no compression or automatic upgrades | Legacy omission/removal tests, equal-duration mapping and exact-revision tests; all 38 prior song cuts, pilot child and Journey payload remain unchanged. |
| Shared validation and no silent export omission | Save/fork owner validation; human editor and protected proposal API/CLI use the same cue domain; unsupported export refuses, prepared export requires matched snapshot identity. |

Current source audit reran 25 cue, package and media-resolution checks with clean
owned process teardown. The unchanged surrounding behavior reuses the prior
106-test foundation regression/build, later affected checks/build and actual
save/reopen/native/package evidence. Source checkpoints include `84bcd5a`,
`2b0900d`, `d1e3bcf` and `934dfd4`. Evidence in the source chat workspace:
`execution/living-light/managed-release/acceptance-audit.md`,
`cue-audit-tests.log.receipt.json` and `cue-audit-preservation.json`.

This is not full export or authoring acceptance. LL-914 remains open: exact
closed-cut lookup works, but versioned painted placements currently omit saved
fit/crop controls. LL-901/902/914 need explicit framing carried through the
existing editor, immutable recipe and native preview/export adapter. Full-app
proposal persistence, Hand return, Desktop/profile and prepared audio-bound
acceptance are also pending. The approved full-song managed render is running;
its output cannot be called passed until final QA and file inspection complete.
