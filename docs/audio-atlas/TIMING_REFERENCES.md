---
title: Audio Atlas listening references and timing error reports
status: first-pass-prototype; workflow verified; acoustic qualification pending
date: 2026-09-27
owner: hapa-avatar-builder
---

# Timing references

In **Audio Atlas**, load a saved analysis, select **Vocals**, then **Timing accuracy**.
The report compares original and explicitly accepted corrected word boundaries
against independently entered listening references. Viewing it starts no model.
The existing audio player and source timeline remain above the report.

Expand **Record a timing reference**, choose the word and press **Cue word context**.
Press Play in the source player. Enter the onset and offset in source seconds,
your uncertainty in milliseconds, annotator name and listening notes. Times begin
blank so copying a candidate does not silently create its own reference.
Alternatively choose **Word is not performed** or **Uncertain / cannot isolate**;
these labels require no invented boundaries. Unresolved supplied words appear in
passage order. Repeated words have distinct target IDs.

Save appends a source-hash/timeline/target/text-bound reference. It neither edits
nor accepts the candidate. New entries and retractions preserve previous events.
The latest valid entry per target and origin is used; the entered annotator name
is attribution, not authenticated reviewer identity. References are scoped to
this immutable run, not automatically transferred between analyses or sources.

## Shared owner and parity

`server/audio-atlas.mjs` owns validation, append-only history and evaluation.
`src/domain/audio-atlas-references.js` adapts the existing Director lyric-review
concept and reuses `timingErrorDistribution` from `echo-lyric-timing-editor.js`.
No new service, source store, model worker or Director timing promotion is added.

Authenticated API:

- `GET /api/echos/audio-atlas/jobs/RUN/query?op=timing-evaluation&asset=stem-1`
- `POST /api/echos/audio-atlas/jobs/RUN/reference` with the body below.
- Existing review read and export include `reference_events` with corrections.

CLI from the Builder root:

```sh
node cli/audio-atlas.mjs query RUN --op=timing-evaluation --asset=stem-1
node cli/audio-atlas.mjs reference RUN --file=reference.json
```

Reference body (replace all source/target values with the exact report values):

```json
{
  "revision": 0,
  "asset_id": "stem-1",
  "source_sha256": "SOURCE_SHA256_FROM_REPORT",
  "timeline_id": "TIMELINE_FROM_REPORT",
  "target_id": "TARGET_FROM_REPORT",
  "text": "EXACT_ORIGINAL_WORD",
  "label_origin": "human",
  "label": "present",
  "start_sample": 100,
  "end_sample": 200,
  "uncertainty_samples": 10,
  "reviewer": "ANNOTATOR",
  "note": "LISTENING_NOTES"
}
```

Integer sample coordinates use the selected source's sample rate, not master or
model time. `present` requires a nonempty in-bounds interval and declared
uncertainty from zero to one second. `not_performed`, `uncertain` and `retracted`
must omit timing fields. `label_origin` is `human` or `synthetic`; automation and
test labels must declare synthetic. The UI submits human-origin labels only
after explicit operator input. Clients share the existing review revision and
writer lock; stale writes return409 and must reload, not blindly replay.

## Metric meaning

Signed error is candidate minus reference in milliseconds. The report shows
measured boundary count, median absolute error, nearest-rank p95 absolute error,
and signed mean bias separately for onset and offset, original and effective.
No timed references yields null errors, displayed as dashes, not zero accuracy.
Synthetic labels have a separate summary and cannot supersede human history.

Effective results use only the latest explicit accepted correction or original
acceptance. Pending proposals cannot replace that decision. Rejected candidates
and corrections changing the original referenced text are excluded from effective
comparison, with a reason. An unresolved word can have a human reference but no
model error without a timed candidate. Omission/uncertainty counts remain separate.

These are operator-entered references, not independent identity authentication,
inter-annotator agreement, calibrated confidence or album qualification. Candidate
times remain visible in the picker, so this is not a blinded evaluation. Automatic
omission detection and independent real speech/singing qualification remain open.

## Verification and learning delta

Sixty distinct focused checks have passing evidence: Atlas contract/query/UI,
six new reference tests, and existing lyric correction/editor/waveform review.
The first owner fixture omitted required word-score semantics and failed
publication; correcting the fixture restored the pass without relaxing validation.
Production build passes. No broad repository or native Electron gate rerun.

Actual Brave Tongues CLI run `b4513c7b-2875-4419-9434-9a55ac90a5b0` reports24
targets,23 original intervals and unresolved `A`, zero human references and null
accuracy. Result SHA remains
`ceb0b1af568eb8c5bbe78bee8fcc4d14ccc27988864ac9b9efb475bc2dc3aa2b`.
Browser run `778dc024-fdbd-4f6a-8b51-dc4300bfdd83` verifies the same24-target
report, blank fields, disabled incomplete save, omission/uncertainty controls
and cueing preceding context for the unresolved word. No real human label was
invented or saved. Test histories use isolated disposable fixtures.

The canonical owner keeps the shared review revision and preserves references
when corrections append, and corrections when references append. A reload
recovers identical metrics. An initial evidence assertion guessed the unresolved
token's ordinal; the corrected check finds its stable identity and confirms it
is seventh in the supplied passage. Source identity is more reliable than a
remembered ordinal. This is a reusable Lesson/Flow candidate from Codex thread
`01a0e4d5-31d6-74f0-ab17-f838cf3f0992`.

Evidence lives in the source task's `work/audio-atlas-2026-09-27/timing-references/`.
The word-alignment card remains in progress. Existing eight broad-suite failures,
native acceptance and completion commit remain open.
