---
title: Audio Atlas acoustic structure and passage comparison
status: first-pass-prototype; implemented evidence; musical qualification pending
date: 2026-09-27
owner: hapa-avatar-builder
---

# Acoustic structure

New local Atlas analyses include master-source structure evidence. Open a saved
run in **Audio Atlas → Song structure** to inspect acoustic regions and cue the
source player. The view explicitly selects Master; if a stem is selected afterward,
return to Master before cueing structural times. Existing runs without measurements
show an explicit not-requested state; viewing/querying never runs analysis.

The novelty plot spans the entire recording. Choose an acoustic region and press
**Cue region**, then Play. **Similar passages** offers separate listening buttons
for each proposed pair. **Transitions and energy changes** lists playable change
windows. **Review moments** also supports Acoustic regions, Section boundaries
and Transitions through the existing evidence and correction owner.

Region names are neutral ordinals. Functional labels such as verse/chorus are
null, not inferred from lyrics or fixed windows. The structure view presents the
original analysis; corrections remain separately inspectable in Review moments.
No original audio, lyric, Director cut or accepted review is changed.

## Method and evidence

Hapa owns `scripts/audio_atlas_structure.py`, an in-process extension of the
existing Atlas measurement worker. It reuses the current FFmpeg low-pass mono
8kHz decode, not a new service or model runtime. There are no new dependencies,
downloads, network inference calls or worker processes.

Method background: Foote's novelty approach correlates local self-similarity with
a checkerboard kernel. See [Müller's FMP novelty-segmentation notebook](https://www.audiolabs-erlangen.de/resources/MIR/FMP/C4/C4S4_NoveltySegmentation.html).
This is an independently implemented Hapa variant, not copied FMP code or a
replication of an upstream benchmark.

- Centered 4096-sample Hann spectral windows, 2000-sample hop:512ms window/250ms
  grid.48 logarithmic power bands from30Hz to4kHz. Zero-pad edges; no boundary
  scoring within four seconds of either end.
- Per-frame `log1p(1000*bandPower/totalPower)`, L2-normalized spectral vector,
  weighted80%; bounded absolute RMS energy weighted20%. Spectrum zeroed below
  −70dBFS. This is neither perceptual loudness nor source separation.
- Four-second left/right feature means produce one-quarter squared distance,
  algebraically equal to a normalized box-checkerboard on their cosine-product
  self-similarity block. Prefix sums avoid an N×N matrix.
- Local peaks use `max(0.012, median + 2.5*MAD)` and six-second minimum spacing.
  Selected boundaries partition the full source, preserving the exact final
  decoded sample. Grid/context size is retained; acoustic uncertainty is unknown.
- Nonadjacent regions at least six seconds long with duration ratio0.65–1.55
  are compared in16 relative-time bins. Mean cosine≥0.92 plus temporal
  variability≥0.025 yields a similar-spectral-sequence candidate. Uniform tones
  and silence do not establish repeats. At most24 strongest pairs are presented,
  with total/truncation fields. This is not tempo/transposition-invariant matching.
- Two-second pre/post-boundary RMS levels support spectral-change, ≥6dB rise/drop
  and low-energy break candidates. Eight-second trends require slope≥0.7dB/s,
  ≥6dB endpoint rise, at least5/7 rising one-second steps and endpoint above−40dBFS
  for a gradual-build candidate. Musical function remains unverified.

`structure-raw.json` retains all49-dimensional frame vectors, novelty/energy
curve, method settings, source identity and candidate regions/pairs/transitions.
Its SHA-256 is attached to observations and the result. Source sample coordinates
use the explicit8000→source-rate ratio with nearest-ties-even rounding. The last
region ends at the exact source count; duration values derived from the8kHz view
can differ by a fraction of a source sample and are not the timing authority.

Typed section, boundary and transition observations participate in normal
timeline/search/evidence queries and reviews. The contract validates source
identity, complete region partition, matching observation spans, referenced
repeat targets, finite units and raw evidence hashes. Helper code participates
in cache identity; old runs remain immutable.

## API / CLI / agent parity

Authenticated `GET /api/echos/audio-atlas/jobs/RUN/query?op=structure&asset=master`
returns the same original evidence used by the UI. Other source IDs explicitly
reject this operation; filename similarity never maps master times to a stem.
Brief and JSON export include `musical_structure`. Full raw feature evidence
remains in the immutable local run artifact, named and hashed in that response.

```sh
node cli/audio-atlas.mjs analyze SONG_ID
node cli/audio-atlas.mjs query RUN --op=structure --asset=master
node cli/audio-atlas.mjs query RUN --op=timeline --kind=hapa.audio.section_boundary_candidate
node cli/audio-atlas.mjs query RUN --op=timeline --kind=hapa.audio.transition_candidate
```

## Actual evidence and limits

Brave Tongues run `df7d0d39-b320-4556-a828-8c91a4cb388e` completed in17.891s
with13 source assets.14 acoustic boundary candidates partition15 regions;
19 transition/energy-change candidates include five gradual energy rises.
No passage pair met the configured repetition threshold. Do not interpret this
as proof that the song has no repeated sections.

Boundary candidates in source seconds:
12.00,19.50,27.25,63.25,84.00,106.00,112.00,166.00,172.00,196.00,204.00,
221.75,228.00,239.25. These are unreviewed measurements, not music-theory labels.
The first sung-word candidate from the prior vocal run starts27.20s, while this
master boundary is27.25s; this proximity does not qualify master/stem alignment.

Result SHA-256:
`62c7290904ebc59aea2bdbcf534b2b44abbac86767d2477ffe79d9060a5b5325`.
Raw structure SHA-256:
`0e6db046b89b9d0bc72ef77628c717687fbdca3f922ca8e5428caf7bf16328f1`.
All13 original and preserved source hashes match. Prior word-alignment result
hash is unchanged. Worker/CLI exited and decode/low temporary files are absent.

47 distinct JS checks and29 Python checks have passing evidence, including the
new synthetic structure cases, direct-checkerboard equivalence, stationary/silent
abstention, repeated dynamic passage, source mapping and contract failures.
Production build passes. Actual API-owner/CLI evidence agrees. Browser verification
is recorded in the source task's `structure/verification.json` with its screenshot.
No broad-suite or native Electron acceptance repeated for this intermediate batch.

Remaining qualification: human boundary/transition labels, real-song repetition
precision/recall, beat-aware/tempo-varying repeats, functional section alternatives
and broader source genres. Mono cancellation, missing >4kHz evidence, smooth
transitions and same-timbre false matches are explicit limitations. The card remains
in progress; existing broad/native/completion-commit gates remain open.

## Reuse and learning delta

Existing worker decoding, immutable publication, hashes, cache, contract, query,
review and player owners were sufficient; no standalone analyzer was needed.
Structural evidence extends those owners and does not borrow lyric labels as
acoustic truth. A source guard prevents cueing master-region times on a selected
stem. The real repetition result is empty despite synthetic repeated-passage
success: synthetic algorithm checks do not establish real-song recall. Preserve
that difference rather than lower a threshold until the example looks successful.

Reusable Lesson/Flow candidate; attributed source Codex thread
`01a0e4d5-31d6-74f0-ab17-f838cf3f0992`, task evidence
`work/audio-atlas-2026-09-27/structure/`. No human musical acceptance was authored.
