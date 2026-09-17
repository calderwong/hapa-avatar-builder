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

`Gnow Her` was first re-aligned against its isolated vocal WAV with the local
`ggml-large-v3-turbo` Whisper model. The Metal backend crashed, so the exact same
source-bound run was retried on CPU. A 2026-09-16 correction pass then compared
that result with the full master and a reproducible lead-plus-backing vocal mix.
The full master was rejected (57.1% direct matches, confidence 0.497, one
alignment warning). The vocal mix passed the automatic promotion gate and was
retained with its recipe, both input hashes, derived-audio hash, raw STT, and
durable local analysis WAV.

Promotion result:

- 101/102 lyric lines have at least one direct acoustic anchor.
- 618 display words are timed.
- 583 words are direct STT anchors (94.3%).
- 35 words are interpolated between anchors and remain disclosed as such.
- 81 lines use direct word animation, 20 use honest phrase fallback, and one
  canonical duplicate with no performance anchor is suppressed.
- Overall candidate confidence is 0.846.
- Structural warnings: none.
- Source audio and canonical lyric hashes are stored in the timing sidecar.

The accepted sidecar and raw STT evidence live under
`data/echo-lyric-sources/lyric_timings/`. The project, song store, and songbook
were synchronized through the existing promotion gate. `Gnow Her` now passes
the pipeline audit, but is deliberately classified as `mixed-word-anchor`, not
syllable-exact.

### Hybrid DTW boundary upgrade

A second 2026-09-16 pilot tested whisper.cpp cross-attention DTW on the same
hash-bound vocal mix. DTW-only decoding was rejected: it fell to 65.2% canonical
word coverage and hallucinated tokens beyond the audio. The deployed route is
therefore hybrid and conservative:

- reuse the accepted 617-word transcript;
- run DTW only as additional boundary evidence;
- accept a DTW interval only for the exact same normalized word, near the
  accepted interval, without changing transcript order;
- retain both raw candidates and a machine-readable selection receipt;
- promote only when confidence, word coverage, anchor coverage, source hashes,
  warning count, and structure do not regress.

For `Gnow Her`, 249/617 STT word intervals were refined. The accepted quality
line remained unchanged at 583/618 direct canonical anchors (94.3%), 101/102
anchored lines, 0.846 confidence, and zero structural warnings. The receipt
correctly declares `granularity: word-estimate`, `syllableExact: false`, and
`humanReviewed: false`.

## Authored endings and glyph clipping correction

Aligned word rows intentionally normalize punctuation for matching. The lyric
renderer had been using those normalized tokens as display text, so authored
endings such as curly apostrophes, commas, em dashes, and compound-word hyphens
were lost. It also froze each animated word to an exact measured rectangle,
allowing transformed glyph ink and mid-word wrapping to appear clipped.

The template runtime now maps acoustic rows back to the exact authored word
surfaces when token identity is provable. Hyphen-joined fragments retain their
no-space join while keeping independent timing intervals. The presentation
surface measures its final bold typography, prevents mid-token wrapping, adds a
small ink gutter, keeps overflow visible, and no longer fixes a potentially
clipping height. Fully unanchored rows are hidden rather than flashed through an
invented interval; partially anchored rows still use phrase fallback.

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
- `node --test tests/echo-lyric-*.test.mjs`
- `npm run build`
- `npm run build:check`
