# Echo hybrid DTW lyric-timing pilot

Date: 2026-09-16

## Objective

Improve sung-word boundaries without weakening Suno lyric fidelity or
misrepresenting word timestamps as syllable-exact evidence.

## Evidence and result

The first DTW-only full-song canary on `Gnow Her` regressed canonical coverage
to 65.2% and continued decoding past the verified audio end. It was rejected.
A hybrid pass instead preserved the accepted transcript and used DTW only for
nearby, exact-word boundary evidence. It refined 249 of 617 STT intervals while
holding the accepted gate at 94.3% word coverage, 99% line-anchor coverage,
0.846 confidence, and no warnings or structural defects.

## What worked

- Hash-bound isolated vocals provided a stable test source.
- Keeping canonical Suno lyrics separate from acoustic evidence prevented STT
  spelling changes from leaking into display text.
- Reusing accepted STT avoided nondeterministic transcript regressions.
- A dry-run promotion report caught quality and source drift before mutation.
- Both the timing promotion and store/project sync created backups.

## Noise and misunderstanding corrected

whisper.cpp DTW is not automatically better transcription and is not a
syllable aligner. Flash attention also disables DTW unless `-nfa` is explicit.
The Metal process can return success without creating JSON, so exit code alone
is not a valid success signal.

The first hybrid guard checked candidate intervals but did not guarantee that
refined starts preserved transcript ordering. The downstream aligner sorts by
start time, so two crossed starts reduced apparent word coverage. The guard now
discards crossing refinements and has a regression test for that invariant.

## Reusable guardrail

An equal-confidence candidate may replace accepted timing only when it is a
measured hybrid boundary upgrade over identical audio and lyric hashes, retains
or improves word and line-anchor coverage, preserves line/word counts, does not
add warnings or structural defects, and reports at least one refined word.

## Remaining gap

The deployed result is word-estimate timing. Exact syllable onsets, melismas,
and mouth-shape timing still require a singing-aware phoneme/forced aligner plus
human review of ambiguous boundaries.
