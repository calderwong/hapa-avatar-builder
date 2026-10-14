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
