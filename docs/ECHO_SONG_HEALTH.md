# Song Health · Topview

First-pass framework, October 25, 2026. Owner: Hapa Avatar Builder. It extends
Audio Atlas, prepared performance, Living Light, saved-cut and delivery owners;
it is not a new transcription engine. Calder's requirement is the source:
actual written lyrics with measured timing, measured beats/stem clocks, and
audio-connected Living Light/shaders, all agreeing in playback.

Open **Echo Album → Song Health · Topview → Open Topview**. Search a song,
expand a failing requirement for its exact evidence and owner action. Album
counts are dated audit snapshots. A completed analysis is not a healthy song.
The report never averages failures into a score or treats missing proof as pass.

## Compliance contract

| Requirement | Evidence required | Failure that remains visible |
| --- | --- | --- |
| Actual lyrics | Song Card written lines and spoken word sequence, in order, in project and timing source | Transcript substitutions, missing/reordered lines, changed written-text hash |
| Timing | Current recording binding and STT sidecar, measured word anchors in each line, passage review and valid intervals | Unresolved/flagged lines, unanchored lines, wrong master, stale source |
| Cut consistency | Current timing in base, recommended saved cut, embedded graph and delivered graph | Updating the base without updating the saved cut; Score Dust-only correction |
| Musical structure | Atlas run with measured beats/sections on this master | Missing/stale beats or sections |
| Stem clock | Current coherent stem set, prepared frames, qualified clock maps | Wrong stem generation, missing files, unqualified offsets; master fallback is not stem proof |
| Living Light | Active Journey response, current source fingerprint, nonempty roles, nonzero intensity, mapped coverage of each cue window | Unbound/stale/silent-disabled roles, schedule gaps, fallback outside qualified windows |
| Shaders | Delivered portable shader and audio mapping | Missing portable card or map remains unverified |
| Visible response | Source-bound quiet/strong A/B at fixed visual time, silence, reverse seek, lyric boundary samples with Score Dust on/off | Configuration alone cannot prove visible motion or audible lyric accuracy |
| Director path | Valid saved Score Dust direction for the current measured timeline | Generic default or stale authored timeline |

Word-token comparison ignores punctuation/capitalization while preserving word
boundaries and accented letters. The written line text remains the canonical
source; timing tokens must not substitute, omit or reorder its words.

`healthy` requires every mandatory check passing. `noncompliant` means a known
failure. `unknown` means required evidence is absent. Cached Healthy rows reopen
as unverified until a live audit. A manual or earlier operator decision allowing
flagged lines to play does **not** make those lines compliant. Human creative
acceptance remains separate from technical checks.

The recommended cut is the Music Response cut, or a dedicated current-lyric
repair child whose lyric digest matches the current source. Other historical
cuts are listed with their stale tracks; they are not overwritten or quietly
certified. A different selected cut needs its own playback verification.

## Repair process

1. Audit the whole album; persist every completed song independently.
2. Resolve recording identity and current written text before alignment. Use
   Audio Atlas's local MLX STT as timing evidence and Qwen forced alignment on
   the unchanged written words. Preserve lead/backing voices. Follow
   [Lyric Timing](audio-atlas/LYRIC_TIMING.md); never use guessed uniform timing,
   clear review flags to pass a gate, or replace written text with STT text.
3. Promote through the existing gate and sync the base only when source and
   manual-lock checks pass. Missing evidence or unresolved passages retain exact
   line numbers/times/text and the specialist action; they do not launch an
   unbounded album transcription from this UI.
4. **Repair eligible stale cuts** appends a deterministic child preserving
   visual direction and audio sources. It requires current source-bound base
   timing, an STT sidecar, no manual locks and the existing promotion gate. It
   compiles/certifies through the existing Builder owner. A saved child whose
   delivery is blocked remains `needs-delivery-review`.
5. **Prepare missing directions** uses the existing Atlas suggestion and saves
   a direction only when no authored revision exists. Existing directions are
   never replaced. Stale authored directions need owner review/rebase.
6. Prepare/qualify coherent signals through the existing performance/Atlas
   owners; repair Journey/shader attachments through their owners. These
   specialist repairs are explicit action plans in this first pass, not yet
   automatic Topview adapters. A weak or absent acoustic match is not waived.
7. **Recheck cut delivery** retries the selected existing cut through the owner
   after addressing its cause. It does not create another child. The master
   resolver now uses the same exact-identity Builder WAV as playback/Atlas,
   including songs not mirrored into the external registry.
8. Re-audit the entire chain after each mutation. Any previously passing check
   that becomes failed or unknown produces `regressed`, not success. Retain
   evidence, stop this repair and inspect it; never erase the parent to hide it.
9. Run and retain actual playback comparisons. The proof importer validates
   source/cut identity, canonical expected lyric text, measurements and local
   artifact hashes. This is an evidence contract, **not an implemented automatic
   browser capture harness or independent verification of an operator's
   measurement**. No proof was fabricated to turn the album green.

Changing master bytes invalidates downstream analysis, stem timing and delivery.
Changing written text/timing invalidates lyric tracks, dependent Score Dust
structure and playback proofs. Changing Journey/shader/cut/build inputs requires
new delivery/response evidence. Always use the shared checks rather than a
feature-local success label as completion.

## UI, API and CLI

All API routes require the existing Builder admin/local-UI session:

| Action | Route under `/api/echos/audio-atlas/song-health` | CLI |
| --- | --- | --- |
| Saved report | `GET` | `node cli/echo-song-health.mjs report` |
| Audit | `POST /audit {songId}` | `node cli/echo-song-health.mjs audit [--song=ID] [--resume]` |
| Repair | `POST /repair {songId, action, expectedFingerprint}` | `node cli/echo-song-health.mjs repair --song=ID --action=fork-current-timing` |
| Direction | same, `action: choose-direction` | `repair --all --action=choose-direction` |
| Delivery | same, `action: refresh-delivery` | `repair --song=ID --action=refresh-delivery` |
| Evidence | `POST /proof {songId, proof}` | `record-proof --song=ID --file=proof.json` |

Repair CLI connects to the existing loopback Builder (`--base` overrides the
local default); it keeps session cookies in memory and does not print them.
`--all` uses only the report's eligible rows and re-audits before each repair.
An ambiguous network failure stops admission; it is never automatically replayed.
CLI exit 2 means unresolved compliance/held work, not a successful album repair.

## Durability and workload

Runtime state stays under ignored `data/echo-song-health/`: per-song reports,
stat-bound source-hash caches, repair receipts and playback proofs/history.
Writes use temporary file, fsync and atomic rename. Songs, source audio and
parent cuts are not overwritten. The canonical fork owner is idempotent by
requested child ID and request fingerprint. Repair is serialized per song within
the Builder process. A crashed/failed dispatch is held for inspection; do not
remove its receipt to reset its attempt. A delivery retry has a separate receipt
bound to current inputs and implementation.

Audit is one foreground sequential process, no audio/model/render workers. The
209-song cold audit measured roughly 15 minutes locally; storage and evidence
size affect this. Source hashes are reused only with matching size/mtime/ctime/
inode. Resume also checks source records, resolved files, timing, variants,
Atlas runs, prepared publications, Journey database/WAL, proofs, build entry and
compiled/readiness artifacts. Code changes invalidate audit reuse. Live delivery
checks never resume from an offline cached pass. Report results remain dated.

Stop admits no new song after the current one. An interrupted current song may
need repeating; completed rows survive. Existing cut warmup owns its bounded
compile/certification subprocesses (up to 2 + 10 minutes). The CLI allows 13 minutes; the UI request allows 3 minutes and may require inspecting a still-running owner. Client timeout is
ambiguous and requires receipt inspection; it does not imply the owner stopped.
No new scheduler, worker daemon, paid service or render export is started here.

## Acceptance and remaining work

Tests cover original-text preservation, manual locks, stale word clocks/graphs,
mandatory checks, lost-pass regressions, actual stem-window coverage, canonical
proof text, idempotent owner cut metadata, and exact Builder master resolution
without a registry mirror (including duplicate/wrong-identity rejection).

The first pass provides album diagnosis and bounded repairs, not a claim that
all songs are now compliant. Remaining owner adapters and measured playback
acceptance belong on the Living Light board. See the dated
[implementation postmortem](postmortems/2026-10-25-song-health-topview.md).
