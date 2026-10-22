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

## October 22 — complete saved-album input audit

LL-919 is in progress. The read-only owner audit covers all 202 Album Passes,
1,205 cues and 203 referenced Journey revisions. **1,204 cues are authored-neutral;
only one cue carries a source binding.** All 202 selected masters have readable
audio headers and byte hashes; this is not a full decode or listening check.
Only Brave Tongues and the 11:23 pilot have source-verified prepared Living Light
banks. 194 songs have no prepared bank; six more are refused before preparation
because their declarations exceed the 32-asset limit.

The Living Light declaration adapter retains every non-archive entry. Across
79 songs its selection differs from the existing one-family/one-role selector
used by Atlas. Thus increasing the asset limit would preserve the wrong input
set. The six refused songs are Cross My Eye, Stolen Toe (Roots on Dirt), Save
Point (Found You in the Code), One More Corner, Quitting the Moon, and I Forgot
What the Mirror Said Last Time (exact IDs are in the private audit report).

The prepared-binding adapter also assigns every stem `alignment-unverified`
with no time map. Prepared source bytes alone do not make synchronized stem
sampling available. Next implementation must connect one coherent stem set and
owner-qualified timing, preserving previously pinned recipes and their source
identities. Explicit measured-master fallback remains necessary where stem
timing cannot yet qualify. Existing native mappings reach only brightness,
small structural breathing and onset impulses; LL-920 must still prove richer
visible response.

Repeat the audit with `node scripts/audit-living-light-album-response.mjs
--out=/absolute/new-report.json`. It reads saved cuts/Journeys through their
owners, validates current prepared source hashes and reports failures per song.
It runs sequentially in one foreground process without analysis, decoding,
workers, network calls or album writes. Reports contain local source locations
and belong outside Git. A successful audit means complete inspection, not
musical readiness. The first audit stopped source inspection on six input-limit
errors; the corrected audit inventories those masters independently without
passing a reduced source set into preparation.

Evidence: source chat `01a137cc-de1d-7511-ab65-227c92d5bca0`,
`execution/living-light/music-response/album-audit-complete.json`. All 405 read
Song-store/project/Album-Pass files and all 203 referenced Journey payloads
match their initial hashes. No cues, recordings or source audio were changed;
none of LL-919–922 is accepted by this inventory.

## Coherent stem preparation — implementation checkpoint

The explicit `coherent-stems-v1` selection now reuses Atlas's one-generation,
one-role selector, preserves exact asset IDs, strips ordinal role labels and
prefers WAV over MP3 within a role. All 202 songs pass input selection, including
the six formerly refused sets. The protected performance read/prepare/status/
cancel routes accept `stemSelectionPolicy=coherent-stems-v1`; the equivalent
CLI option is `--stem-selection coherent-stems-v1`. Omitting it preserves the
original declaration policy for existing saved recipes.

Selection travels through the existing analyzer, prepared performance, cache,
saved binding and Director resolver. Coherent publications have separate pointers
and `prepared-coherent:` binding IDs; they never replace legacy pointers. Source
hash, exact revision, asset identity and playback-clock gates remain unchanged.
New unbound Workspace studies request the coherent set; a bound saved study
continues requesting its recorded set. Export requests that set explicitly and
refuses mixed-bank cuts rather than substituting one source for another.

Verification: the real analyzer/publication/read chain passes on a bounded
two-second fixture, plus focused selection, cache, CLI/API, Director and export
regressions. Both real pilot songs now have a separate coherent bank containing
one master and 12 stems; both original banks retain their exact fingerprints.
The production build passes. An initial CLI check caught an accidental option
lookup change; it was repaired and its targeted checks pass. Native UI delivery
and musical motion acceptance are still pending.

The full album preparation is running sequentially through the existing owner
queue, reusing cached analysis where available. This prepares measurements only:
it does not apply Atlas timing proposals, append new cuts or change recordings.
The foreground execution receipt and per-song results live in the source chat's
`execution/living-light/music-response/coherent-preparation-results.ndjson`;
only a completed `coherent-album-prepared.json` establishes full coverage.
LL-919 remains in progress until timing and usable scene bindings are qualified.

Process review: one foreground orchestrator, one active preparation stage,
sequential Python/FFmpeg analysis then Node/ffprobe publication. Existing stage
timeouts, process-group cancellation and cleanup remain the owners. No models,
render jobs, delegation or services are started. The real fixture returns with
no matching child process; the first sandboxed process listing was denied and
the read-only escalated listing verified cleanup. Storage before album work:
11,991,961,600 strictly free bytes and 1,683,660,890,176 macOS-available bytes;
the latter includes reclaimable space, not already-free blocks.

## Atlas visual timing — bounded implementation checkpoint

The existing Audio Atlas owns measurements and its original affine proposals.
An explicit consumer qualification now checks exact master/stem hashes, decoded
durations, timeline identities, at least four non-overlapping measured windows,
correlation and peak margins, observed source span, constant-offset residual and
drift. Only bounded constant offsets qualify for display envelopes. Maps end at
the observed span and source/master intersection; there is no stretching or
invented padding. Unknown intervals and unqualified stems stay unknown.

This does not apply or approve the Atlas proposal, certify acoustic quality or
claim semantic beats. The original `alignment_applied` and `quality_qualified`
fields remain unchanged. The prepared bank pins the owner result hash and exact
map evidence; changed source bytes, malformed evidence or mismatched saved
revisions refuse. Legacy bank pointers remain unchanged.

Protected API: empty-body `POST /api/echos/living-light/performance/timing` with
exact `songId` and `stemSelectionPolicy=coherent-stems-v1`. CLI:
`node cli/living-light.mjs qualify-signal-timing --song SONG_ID --stem-selection
coherent-stems-v1`. The native signals panel has **Connect verified stem timing**.
Callers cannot supply maps or paths. This checks existing Atlas results without
starting analysis jobs and republishes only the disposable coherent bank. An
already qualified bank returns its verified stored result; after an unresolved
transport outcome, inspect `signals` before retrying.

Real owner publications qualify 5/12 stems for Brave Tongues, 6/12 for the
11:23 Meant to Meet, Thu? pilot, and 4/12 for Dear Papa. The other roles retain
explicit unqualified reasons. Both original legacy fingerprints still match.
Fifteen focused tests pass, including exact feature sampling, reverse seek,
unknown boundaries, stale/malformed evidence refusal, owner publication,
idempotent readback and protected CLI/API behavior. The build passes. One test
initially used the wrong API prefix; that fixture was corrected, with failed
output retained. Current source is not yet delivered or inspected in the live UI.

Evidence in the source chat: `visual-timing-pilot-publications.json`,
`visual-timing-final.log`, `visual-timing-final-build.log` and
`legacy-bank-preservation.json` under `execution/living-light/music-response/`.
Full-album preparation continues on its original sequential foreground handle.
Neither this timing checkpoint nor preparation closes LL-919: usable bindings,
explicit master fallback, native musical movement and new album passes remain.
See [learning and verification limits](../postmortems/2026-10-22-living-light-visual-timing.md).

## Native musical movement — source checkpoint

The sequential preparation run completed all 202 distinct songs with the original
Song-store bytes unchanged. 156 have selected stem inputs; 46 have master-only
banks. These counts describe prepared input coverage, not dancing-scene delivery.
The original foreground handle exited successfully, and a read-only process check
found no preparation descendants. `coherent-album-prepared.json` is the completed
receipt. The existing Atlas visual timing qualification is now running sequentially
across these banks; its per-song journal and eventual `visual-timing-album.json`
remain separate evidence from preparation and native motion.

A deeper integration gap was found: Builder supplied an empty native stem score.
The inherited water, journey and other environment articulation therefore had no
musical inputs even when the host added basic emission/breath offsets. The host
now has an explicit per-use `musicResponse` contract with Gentle, Dance and Surge
presets, bounded intensity and exact source bindings for native movement roles.
It feeds the existing native causal smoothing/integrated-phase owner on Song time;
authored route and painted media retain Journey time. No vendor source changed.

The native adapter keeps at most two response banks within a 96 MiB estimate,
releases them with the host, and identifies every selected or master-fallback
contribution. Master-only presets explicitly assign the soundtrack to movement
roles; they do not claim separated instruments. Unknown pan, width and brightness
are not invented. This checkpoint uses envelope choreography only: discrete event
accents, additional scene-specific tuning and perceptual smoothing review remain.

The Journey editor exposes presets, intensity and exact movement sources through
its existing undoable actions. Locks protect these settings; a scene swap keeps
movement independent, duplicate copies it, and a cross-song fork clears it.
Existing protected save/read/import/export routes preserve the same contract.
Director input and export packaging recognize music-bound drafts and select the
coherent bank; exact saved binding revisions continue to win and cannot silently
substitute. Existing recipes without musical settings retain their old behavior.

Verification: 39 targeted checks, then 46 owner/Director/export checks pass;
four final native numerical checks pass after adding a same-visual-time phase
comparison. The build passes. Actual native water swell and tunnel phase respond
to different source times in the host, including reverse seeks and held motion.
GPU rendering is stubbed in those tests: this is not pixel or live-recording
acceptance. Portable import initially rejected the new field; its allowance was
repaired and the failure retained. Native UI delivery, onset/event accents,
real-song response cost, causal pixel A/B and new album passes remain open.

Evidence: source chat `execution/living-light/music-response/`:
`choreography-final-tests.log`, `choreography-owner-checks.log` (failed initial
import), `choreography-owner-repaired.log`, `choreography-motion-recheck.log`,
`choreography-build.log`. This extends the source checkpoint, not task closure.

## Album timing complete; publication retention repaired

The visual timing run completed 202/202 songs without per-song errors: 601 of
1,653 selected stem declarations qualify across 143 songs. Forty-six songs have
master-only banks; thirteen additional songs have stems but no qualifying timing.
These 59 songs need explicit master response, and partial/unmapped spans on other
songs retain their fallback policies. All 202 coherent publication pointers resolve.
This is timing coverage, not completed music-response Director passes.

The final legacy check exposed a cache-retention defect: the 2 GiB publication
pruner deleted old blobs even while live legacy pointers referenced them. Both
original pilot banks were affected. Existing sources/cuts were not rewritten.
Publication now protects referenced entries, evicts superseded blobs and refuses
an over-budget live set before changing its pointer. A bounded regression verifies
legacy/coherent survival and refusal without mutation; owner tests also pass.

Recovery preserved exact identity rather than repinning saved cuts. The 11:23
frozen render snapshot and original source receipt reconstructed its full original
publication hash. Brave Tongues was rebuilt into an isolated cache; its initial
hash differed because analyzer implementation metadata and cold/disk property order
had changed. Restoring historical metadata was admitted only after all 25 original
resource hashes matched and then the complete historical publication hash matched.
Both recovered entries were published through the owner and read back at their
original fingerprints. Failed reconstruction attempts remain in the evidence.

The inspection also found 63 other missing, older publication targets. This pass
did not establish when each disappeared and does not claim full shared-cache
integrity. Their original owner receipts remain the recovery route; inventory and
scope assessment remain open under LL-919. No source recording or cut was edited.
Evidence: `visual-timing-album-summary.json`, `exact-legacy-restoration.json`,
`legacy-bank-preservation.json`, and `publication-retention-final.log` in the
source chat. The sequential preparation and qualification handles are terminal.

## Native pixels and measured accents — October 22 checkpoint

LL-920 now connects qualified display-onset crossings to native elastic strikes,
water impacts and renderer pulses. These are authored accents from the existing
normalized RMS-delta envelope, not certified beats. Hysteresis and a refractory
interval bound chatter; unavailable timing disarms the detector. Master-energy
fallback cannot manufacture onset events. Song-time articulation and Journey-time
event consumers receive separately mapped scores, clipped to each scheduled use.
Reverse evaluation and held motion preserve those clocks.

A real-source native comparison used the current coherent 11:23 pilot bank,
13 verified source hashes and its preserved decoded playback receipt. Windward
Reach, Rain Court, Weave and Glass visibly differ from neutral at identical times,
including surface shape/reflections and tunnel geometry/travel. Six saved frame
reports cover four environments and an eight-second Glass animation followed by
reverse seek. The repeated Glass comparison statistic is identical. This is a
bounded visual diagnostic without audible playback, not full Director recording,
per-role perceptual isolation or human acceptance.

The first actual GPU run found a missing native stem participation field;
initializing newly supplied roles fixed it. The real-song cold frame also took
about 3.2 seconds because numerical reconstruction repeatedly cloned provenance
trees. Compiling immutable choices once reduced observed cold frames to
0.414–0.577 seconds; warm Glass sampling took 1.8 ms in the retained report.
The water pixel comparison statistic was unchanged by that optimization.
These are local samples, not an album-wide performance guarantee.

Twenty-eight focused checks and the production build pass. The scene diagnostic
has no analysis workers and performs no album writes. Evidence lives in the
source chat's `execution/living-light/music-response/`: native screenshots,
`native-optimized-frames.json`, `native-proof-source.json`, `onset-owner-tests.log`
and `onset-build.log`. The app build alone does not establish live app delivery.
Next: carry this path into saved Director/live recordings and append the new
album response cuts. LL-919–922 remain open; existing cuts/recordings are retained.

## Append-only Music Response authoring

The existing album-pass owner now accepts `--music-response`, creating a separate
`living-light-music-response-v1` cut titled **Living Light · Music Response**.
It reuses each latest saved parent, cue windows, painted sources and authored
Journey schedule. Unlocked recipes fork with exact coherent prepared bindings
and Dance response settings; locked cues or recipes remain unchanged and are
reported as preserved choices, never counted as new response coverage.

```bash
node scripts/append-living-light-album-pass.mjs --music-response --plan=/absolute/new-plan.json
node scripts/append-living-light-album-pass.mjs --music-response --plan=/absolute/new-plan.json --apply
```

`--song=EXACT_SONG_ID` scopes a pilot. `--reuse-plan=/absolute/prior-plan.json`
reuses successful prepared entries only after all original source and Journey
hashes still match; unresolved entries are prepared anew. Apply requires a
complete error-free plan, revalidates each source revision, backs up authoring,
creates Card custody through its owner and reopens the exact saved cut. Existing
children must match; conflicts refuse. Per-cue coverage distinguishes qualified
stem intervals from explicit master response. No analysis or render job starts.

Album preparation exposed 43 authored durations that were 0.2–1 millisecond
shorter than the measured master. A cut's extent is now separate from its exact
decoded audio extent in Director and offline preparation. Containment preserves
1x time and original cue windows; it never stretches audio. The runtime still
requires its exact source identity. A cut extending beyond the master by more
than the existing one-PCM-sample endpoint allowance refuses.

The first 11:23 Music Response pilot saved/reopened three cues and two new Journey
revisions with verified custody, preserving 45 pre-existing files. The actual UI
lists those cues. Its running API reports `server_restart_required` and rejects
coherent selection with `Unknown preparation field`; regular preview timing also
reports an evicted entry. These are open LL-921 delivery findings, not a successful
playback or recording proof. The diagnostic tab was closed without recording.

## October 22 — all 202 Music Response cuts saved

The owner save/readback completed **202/202 songs, 1,205 source-bound cues and
203 response Journey references** (including the reused pilot). No locked
exceptions were present. 143 songs have qualified stem intervals in their cues;
59 use explicit master response throughout those cues. Partial or unqualified
roles on the other songs also keep their declared master fallback. These counts
are authored response coverage, not 202 successful native playback checks.

The final integrity check preserved all 8,014 pre-existing Song/project/cut files
and 203 original referenced Journey payloads. Existing audio and live recordings
were not rewritten. The foreground processes exited successfully; the subsequent
process inspection found no matching preparation descendants. The first plan's
43 duration refusals and the initial test-message mismatch are retained as failed
evidence. The repaired 35 focused checks and build pass.

Evidence in the source chat: `director-album-plan-v2.report.json`, its adjacent
`.summary.json`, `director-duration-gaps.json`, `album-clock-repaired.log`,
`album-clock-build.log`, `director-ui-observation.json` and
`director-ui-health.json`, under `execution/living-light/music-response/`.
All four required P1 tasks LL-919–922 are in progress. Next: refresh the existing
canonical service, verify actual Director/Record + Play behavior, inspect five
contrasting songs and retain before/after recordings. Main-renderer polish is
not the gate for that work; human art-direction acceptance remains separate.
