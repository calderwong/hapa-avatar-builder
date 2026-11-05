# Campfire systemic review — 2026-11-05

Calder requested a systemic review of Campfire's limited transitions and dead
spots, using Luna di Clara as the visible example but covering all songs.

## Intention and findings

The nearest reusable implementation is the existing Hapa/Leon Lin procedural
fire stage. The standalone creative-priority and r34 records call for persistent
fire/smoke, readable forms, unequal holds, anticipation and varied transfers,
with development inside long musical sections. Builder owned the score and
transport; its vendored renderer lagged behind that work. The earlier all-song
preview fallback added here had empty Campfire cues/defaults, so it enabled
songs but did not provide meaningful intra-section choreography. That was an
incomplete interpretation of the requested all-song feature.

The old FireDust envelope took roughly three seconds to gather at each cue and
released again at its end. Long section holds and repeated losses of formation
made sections feel inert. The later standalone choreography itself remains
bound to Thirsty's exact r3 score; it cannot simply be applied to other songs.

## Repair

- Added a deterministic shared scene compiler over each song's existing cues,
  motifs and measured beats. Unequal holds alternate the song's hero with
  answers; copies, scale, transfer path and continuous motion develop the hold.
  Original scores, lyric intervals, images and stored directions are unchanged.
- Updated the required renderer, motion, framing, lighting, checkpoint and
  bounded lifecycle support from the standalone stage. Scene-directed material
  no longer fades out merely because a source cue changes. Explicit saved
  participation, release, visibility and ending settings still govern it.
- Preserved every supported original motif family, protected object targets,
  source palettes and reduced-motion behavior. No generated image assets,
  pilot-only timeline or paid-generation path was copied into the album.
- Kept strict saved song/master/score/revision compatibility. An initial audit
  falsely flagged Thirsty's saved direction because its API query omitted the
  verified project lyrics used by the UI. Repeating the comparison with
  `lyricLines=project` matched the saved direction; the briefly considered
  automatic fallback was removed. Never relax a binding gate to fix mismatched
  comparison inputs.
- Actual expansion testing caught a cleanup contract mismatch: the imported
  lifecycle expected `pictures.clear()`, absent in the older picture adapter.
  Added idempotent clearing and cancellation, plus a regression. The failed
  expansion is not counted as successful playback evidence.

A final cross-song native check found that the Score Dust cast-library validator
rejected a pilot image before Campfire could try its bounded loader, leaving a
misleading Preparing message. Campfire now delegates only `absent-asset` cases
to its existing loader; all structural validation errors still stop with their
actual explanation. Missing/bad pictures remain explicitly reported fallbacks.

## Verification and limits

65 focused checks pass across Campfire direction, scene control, picture
cleanup, lifecycle, spectrum, recording, stage frame/assembly and Score Dust
performance. The real controller/FireDust simulation stays finite through a
whole synthetic song and retains formation through section boundaries. Build
and production receipt checks pass.

Actual Chrome playback completed Luna from the opening to 4:17.0 in the
expanded Director preview. Sampled requested/presented frame pairs matched at
229,1750,2736,4418,6929 and7715; final state was ready with Play restored.
Thirsty also played with its saved direction to frame1023 (34.1 seconds),
then paused and toggled off successfully. Visible Luna samples showed distinct sunflower, helix, duplicated forms, jellyfish
and ribbon/sheet performances. Expansion after the cleanup fix also succeeded.
This is one continuous song test with sampled visual/clock observations, not
a claim that every displayed frame was inspected.

Read-only owner API audit covered all 209 songs with completed measured runs:
All209 scene plans compiled with finite sampled controls; maximum scene hold
was8.53 seconds. The base-score audit initially flagged one fingerprint
difference; verified-lyric comparisons for Luna, Write Home and Thirsty corrected
the false stale-binding diagnosis. Luna has 65 scenes over 13 source cues (257.2 seconds; maximum hold
6.5 seconds); Write Home has 50 over21; Thirsty has50 over17. This is a score
and control audit, not 209 GPU playback qualifications.

No source media, cuts, timing records or original Electron working draft were
changed. Original media stayed in place. Review artifacts are bounded source
patches, a small audit report and screenshots; no full-song video copy was
created. The prior Campfire live-recording proof remains separate evidence;
this change retains its compositor and has passing recording regressions.

The pre-existing Campfire integration is uncommitted and intertwined with other
work. New independent scene source/tests and this evidence are committed; the
renderer refresh and integration deltas are preserved in a scoped recovery
patch beside the local review, without sweeping pre-existing files into Git.
The local source/build contains the complete repair; this focused commit alone
is not a portable package of the earlier uncommitted integration.

## Learning delta

Reuse the current renderer capabilities but compile against each owner's song;
never confuse widening a toggle with delivering developed choreography.
Changes crossing renderer/adapter versions require a real expand/toggle test,
not only isolated numerical checks. Keep whole-song playback, cross-song
control coverage, recording proof, creative acceptance and whole-song health
as separate claims. Reusable Lesson Card candidate: source-package drift and
empty fallback direction can mimic a GPU/performance failure.
