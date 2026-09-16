# Echo lyric timing precision

Date: 2026-09-16

## Outcome

The Builder now distinguishes a healthy timing payload from performance-exact
timing. A payload can be source-linked, hash-bound, structurally valid, and
promotion-safe while still containing words interpolated between speech-to-text
anchors. The Lyrics workbench reports that distinction directly.

The renderer now supports three honest animation modes:

1. **Phrase** — used for synthetic timing, missing evidence, and any line that
   contains an unaligned/interpolated word.
2. **Word** — used when every word in that line is a direct STT anchor or has
   explicit numeric confidence. The label says that STT anchors are not
   syllable-exact.
3. **Syllable** — used only when every syllable has a valid interval and explicit
   acoustic or human-review evidence. No current Echo song meets this gate.

Bar/beat/subdivision labels are computed only from an actual monotonic beat grid.
BPM by itself is not treated as beat phase. Exact count mapping additionally
requires human-reviewed syllable onset timing.

## Live album audit

The 2026-09-16 read-only audit inspected 200 Director projects:

- 196 pass the existing source/hash/structure promotion gate.
- 180 contain a mixture of direct STT word anchors and interpolated words.
- 2 contain only direct STT word anchors.
- 2 still use synthetic timing.
- 2 vocal projects have no timed lyric payload.
- 0 have human-reviewed syllable timing.
- 0 have both reviewed syllables and a measured beat-phase grid.

These counts explain the user-visible behavior: the old `verified` status was a
pipeline-health claim, not a syllable-accuracy claim. The audit now calls it
`pipeline-verified` in prose and includes a separate `precision` object per song.

## Stale contract bug

Many projects retained `lyrics.timingSource = synthetic-weighted-lyric-heal`
after source-aligned timing was promoted. The display contract previously gave
that stale convenience field precedence over `lyric_timing_truth`, the edit-map
provenance, and the current heal record. This caused valid direct STT anchors to
be treated as synthetic.

The contract now resolves timing identity in authoritative order:

1. `lyric_timing_truth`
2. `song_edit_map.provenance`
3. `lyric_timing_heal`
4. legacy `lyrics` metadata

## Gnow Her pass

`Gnow Her` was re-aligned against its isolated vocal WAV with the local
`ggml-large-v3-turbo` Whisper model. The Metal backend crashed, so the exact same
source-bound run was retried on CPU.

Promotion result:

- 102/102 lyric lines have at least one direct acoustic anchor.
- 618 display words are timed.
- 574 words are direct STT anchors (92.9%).
- 44 words are interpolated between anchors and remain disclosed as such.
- Overall candidate confidence is 0.836.
- Structural warnings: none.
- Source audio and canonical lyric hashes are stored in the timing sidecar.

The accepted sidecar and raw STT evidence live under
`data/echo-lyric-sources/lyric_timings/`. The project, song store, and songbook
were synchronized through the existing promotion gate. `Gnow Her` now passes
the pipeline audit, but is deliberately classified as `mixed-word-anchor`, not
syllable-exact.

## Remaining path to exact animation

The current local stack does not include a singing-aware phoneme/forced-alignment
engine or a measured downbeat tracker. Whisper supplies token timestamps; it
does not establish sung syllable boundaries, melismas, or exact mouth-shape
transitions. The workbench's manual onset references are evidence capture, not
automatic verification.

The repeatable completion path is:

1. Align canonical lyrics to the isolated lead-vocal stem and retain raw STT.
2. Run a singing-aware phoneme/syllable aligner on the same hash-bound stem.
3. Store per-syllable intervals with engine, model, audio hash, confidence, and
   whether each interval was manually reviewed.
4. Detect beats and downbeats from the drum/percussion stem and retain the
   measured beat-phase grid with confidence and source hash.
5. Review ambiguous syllables in the waveform editor, recording reviewer,
   onset, and uncertainty.
6. Promote only after all syllables required for exact animation are reviewed;
   then bar/beat/subdivision annotations and syllable animation activate.

Until steps 2–5 exist, the system should use direct word anchors where a whole
line is anchored and phrase animation everywhere else. It must not split word
durations into guessed syllables.

## Verification

- `node scripts/audit-echo-lyric-quality-v4.mjs`
- `node --test tests/echo-lyric-contract.test.mjs tests/echo-lyric-template-runtime.test.mjs tests/echo-lyric-layout.test.mjs tests/echo-lyric-precision.test.mjs`
