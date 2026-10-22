# Music-driven Living Light — required goal work

October 22, 2026 · Planned implementation, not accepted behavior.
Owner: Hapa Avatar Builder; board `hapa-living-light-avatar-builder`.
Source: Calder's direct feedback in chat `01a137cc-de1d-7511-ab65-227c92d5bca0`
after viewing the first-pass prototypes: stems/music should make Living Light
scenes dance more during Director scripts. This adds required goal work and
supersedes any earlier suggestion that saved album coverage completes the goal.

## Observed gap and reuse

All 202 songs have saved first-pass placements, but the album-pass generator
explicitly labels new arrangements authored-neutral. The existing exact-source
signal router currently maps energy to emission and a small world-breath offset,
and onset to a small impulse. A measured pilot and correct clock wiring do not
establish expressive musical response across the album. Calder's report is
direct creative feedback; it is not a fabricated technical diagnosis of every
scene or a human acceptance decision.

Reuse Audio Atlas preparation/alignment, the one-stem-set selector, existing
prepared feature bank, exact per-use bindings, native scene signal ports,
Director cue clock adapter, append-only cuts/Journeys and live recording owner.
Do not add another analyzer, soundtrack or renderer. Diagnose missing bindings,
unavailable signals, weak response mapping and Director delivery separately.
File readability is not timing qualification; a neutral fallback is not a pass.

## Required tasks

All four tasks are P1 in this goal. LL-919 is ready; the remaining tasks follow
its evidence and implementation. Existing LL-006/007/008/026 remain related
foundation work, with their original criteria preserved.

### LL-919 — Audit and connect exact music/stem signals for the album

Dependencies: LL-911. Reuse Atlas and existing feature preparation owners.

- Inventory all 202 saved Album Passes: exact master, one authoritative stem
  generation, available roles, timing/alignment evidence, prepared signals,
  per-cue bindings and explicit missing/unqualified states.
- Trace representative real songs from decoded measurements through the exact
  source bank, Song-time/scene-time mapping and native parameter inputs. Identify
  absent binding, neutral fallback, timing mismatch and weak mapping separately.
- Prepare/reuse needed existing local measurements through Atlas; preserve source
  hashes and one record per stem role. Do not stretch unverified stems or invent
  beat, section, vocal or emotional evidence. Record per-song remediation.
- Make available master and qualified stem signals usable by Director scenes
  with one soundtrack; missing stems have a visible, explicit master fallback.
  Measured master fallback and qualified multi-stem response remain distinct.

### LL-920 — Make scene and tunnel choreography visibly follow the music

Dependencies: LL-919. Extend existing native ports and modular recipe controls.

- Use distinct available musical drivers: percussion/onsets for impulses,
  bass for low-frequency geometry/breath, voice for expressive reveal, and
  harmonic energy for flow/lighting. Name the actual feature behind each mapping;
  unavailable semantic/beat analysis is not silently approximated as measured.
- Produce visible scene-specific movement, deformation/flow and accent changes,
  beyond uniform brightness or tiny global breathing. Preserve each environment's
  character and continuity across passages; avoid indiscriminate camera shaking.
- Provide reusable response presets and per-use intensity/source overrides,
  retaining independent media, Location, Tunnel and Journey swaps, locks and Undo.
  Envelope smoothing, gain limits and reduced motion prevent uncontrolled flicker
  or motion. Silence settles; it does not keep pretending to follow a beat.
- Demonstrate causal A/B evidence at identical song times: measured response
  versus neutral, isolated role/envelope changes, quiet versus energetic passages.
  Save native clips plus parameter traces showing the response actually reaches
  geometry/flow. A green signal meter alone cannot satisfy this task.

### LL-921 — Carry musical response through Director preview and live recording

Dependencies: LL-919, LL-920, LL-913.

- Director Scene and Transition cues automatically use their saved exact musical
  response bindings, including cue offsets, without silently reopening as neutral.
  Save/reopen, recipe replacement and per-use overrides retain those bindings.
- Song time drives audio response while Journey time drives authored travel and
  painted source mapping; play, pause, backward seek, loop, cue boundaries and
  handoff stay synchronized with one audible master.
- Preview and Record + Play contain the same dancing scenes and painted media.
  Verify actual native motion and a short live recording. Main-renderer repair
  or a full-song encoded export is not a prerequisite for this task.
- Show measured stems, measured master fallback, neutral and unavailable states
  clearly. Keep preparation, cancellation, cache and decoder ownership bounded;
  returning from Explore restores the exact song, cut, time and editing state.

### LL-922 — Apply and verify the music-response pass across the entire album

Dependencies: LL-919, LL-920, LL-921.

- Append a new music-response Director pass across all 202 songs, retaining the
  first Album Pass, original cuts/audio, existing recordings and locked choices.
  Each pass saves exact Journey revisions and source-bound response settings.
- Produce a per-song coverage report for every Living Light cue: measured master,
  qualified stem roles, response preset, clock mapping and explicit deficiencies.
  Every readable master must drive a response; missing stems may use declared
  master fallback, never be counted as qualified multi-stem response. Unreadable
  masters remain named blockers, not silently covered songs.
- Inspect at least five contrasting songs in the actual Director, including
  quiet/strong passages, sparse/dense stems, a vocal-led passage and a missing-stem
  fallback. Retain before/after live recordings and exact source/time references;
  include seeks and scene/transition boundaries. Check every distinct response
  preset used album-wide, expanding samples only when preset coverage requires it.
- Verify saved coverage, source preservation and affected tests; keep subjective
  review separate. Report actual response coverage and remaining failures, not
  merely cue count. Prioritize broad usable coverage before perfecting one song.

## Completion and sequencing

LL-902 retains its original composition criteria and adds music-response
acceptance from LL-922. LL-918 retains its original delivery criteria and depends
on all four new tasks; the goal cannot close on the earlier twelve-task audit.
The original four integration points, source safety and truthful export remain
required. No existing accepted task is erased or falsely reopened as failed.

Immediate sequence: audit existing bindings/signals, make one reusable response
path work in Director/live recording, then apply it across the album and verify
the contrasting set. Full-album response coverage comes before single-song polish.
Human art-direction acceptance remains pending; no new approval ceremony is
introduced for ordinary authorized local work.

Learning/Decision Card candidate: distinguish authored coverage, clock correctness,
measured inputs and perceptible musical choreography. The earlier milestones
proved the first two and a bounded measured pilot; they did not prove the fourth
across the album. Preserve that evidence while making the missing behavior an
explicit completion gate, rather than calling it optional later polish.
