# Score Dust preparation and stale lyric timing

Status: implemented; local song analysis completed; creative acceptance remains human.
Request: Calder asked why Thirsty in the Dark stayed on one formation, why its
lyrics were off, and for enabling Score Dust to choose a musical direction.

## Findings

- The song had 21 completed Atlas runs, none measuring beats. Most were alignment
  excerpts. Run existence was being confused with musical-structure coverage.
- Both Living Light variants retained 172 old lyric rows starting at 6 seconds.
  The base project had 169 current written lines starting at 12.18 seconds.
  The preview preferred the saved graph's lyric overlay, bypassing that update.
- Current timing has eight unresolved passages and an existing operator decision
  preserving them as flagged written lines. That decision was retained; neither
  source lyrics nor old cuts were overwritten.

## Reuse and repair

Reused Atlas job identity, local models, run selector, prepared stem signals,
Director suggestion, score composer, lyric trust check and append-only direction
ledger. Added an activation coordinator instead of a second analyzer. It prepares
missing beats/sections, polls boundedly, reports errors, and preserves dispatched
jobs on view cancellation. Automatic direction is editable and saved directions win.
The Score Dust overlay chooses current verified lines while preserving manual
locks. Shared phrase selection excludes unresolved timing without shifting line indexes.

## Execution and evidence

One song, 271.67 seconds, master plus ten stems. Existing Atlas CLI → sequential
Python measurement worker → beat worker, with bounded FFmpeg child calls and
Atlas's 600-second per-worker timeout, role sentinel and TERM/KILL cleanup. No
external provider or model download. Completed source-bound results remain in
Atlas. Measured wall work was approximately 126 seconds; no retry was needed.

Run `24c0a132-d5ea-4288-acee-6c13456ae7ae`: 317 beats, 80 downbeats, 17 sections,
17 transition events. Direction revision 1: dark palette, five gathering lifts,
six lyric hooks. Score validates without errors or warnings. Shapes span shell,
fountain, sheet, snowflake, dandelion, helix, ring, attractor and jellyfish.

97 focused Score Dust tests passed, including preparation/reuse/concurrent dispatch,
failure/abort bounds, stale lyric replacement, manual-lock preservation and exclusion
of unresolved hooks. Production build passed. Browser verification is recorded in
the task; tests and structure counts do not prove audible precision or artistic quality.

## Remaining limits and lesson

Eight lyric passages still need review; stem alignment and beat human acceptance
are not manufactured. Historical cuts keep their original timing outside Score
Dust mode. A saved Score Dust direction is not a rewritten Living Light scene plan.
Lesson candidate: select analysis by required evidence, show preparation honestly,
and resolve lyric source at the presentation boundary rather than trusting an old
compiled graph merely because it exists.
