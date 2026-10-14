# Living Light Director cues

Status: **prototype; authoring contract and compiler preservation implemented**.
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

This is not yet a user-visible Director feature. The cue editor, native Director
canvas host, full live API save/reopen proof, media resolution across cuts and
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
