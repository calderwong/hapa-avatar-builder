---
title: Audio Atlas source-bound rhythm review
owner: hapa-avatar-builder
status: first-pass-prototype; defined measurements, musical qualification open
date: 2026-09-28
---

# Rhythm review

The existing optional Beat This stage now adds time-varying tempo, pulse-grouping
alternatives, spectral-flux onset evidence and conditional subdivision/accent
estimates. It uses the original Master source clock and does not snap lyric or
Director timing. It remains a candidate analysis, with no human acceptance implied.

## Human workflow

Open **Audio Atlas → Analysis settings & saved runs → Detect beats**, then
explicitly analyze. The configured local Beat This runtime/checkpoint must already
exist. Matching results are reused; opening a song or changing review views never
starts inference. Pitch can be enabled in the same run.

Choose **Rhythm**. If a stem is selected, use **Choose Master for rhythm**. The
existing 30-second listening window controls four evidence views:

- **Tempo:** source-clock interbeat BPM segments, local pulse alternatives and
  every overlapping interval in a scrollable table. Select a row to cue Master
  and inspect its original beat references.
- **Bars & meter:** pulse counts between matched downbeat candidates, with half/
  double pulse interpretations. The denominator stays unknown; four pulses are
  never silently promoted to a 4/4 time signature.
- **Onset strength:** a complete spectral-flux curve and separate local energy
  anchor for each selected peak. The plot scales to the current window maximum;
  raw strength values stay unscaled. Cue a peak to inspect exact support.
- **Swing & accents:** first/second subdivision ratios, variation, evidence counts
  and an operational offbeat-accent contrast. Missing evidence stays Unknown.

Unresolved gaps are separately inspectable. Weak, absent or irregular beat
hypotheses do not prove unmetered music or silence. Loading/error/retry, explicit
old-run/source states, keyboard controls and complete-window paging are retained.

## Shared UI/API/CLI owner

The request remains `POST /api/echos/audio-atlas/jobs` with `{songId,beats:true}`.
No new service, extra model or standalone catalog is introduced. The helper runs
inside `scripts/audio-atlas-beats.py`, reusing its existing decoded Master PCM,
owned lifecycle and offline model. Rhythm code participates in beat-enabled cache
identity; base runs without beats retain their existing cache identity.

`GET jobs/:id/query?op=rhythm&asset=master&start=S&end=E&limit=1000&offset=0`
returns up to 1000 onset-strength frames and the complete intersecting event
arrays. Use an integer half-open source window no longer than 30 seconds. Frames
filter by center; onset candidates filter by energy anchor; tempo/bar/groove/
unresolved intervals overlap the query. UI paging checks source/hash/timeline,
window, count and ordered grid. Its page budget derives from actual source rate
and hop. Excessive event density refuses explicitly rather than silently trimming.

```bash
node cli/audio-atlas.mjs analyze SONG --beats
node cli/audio-atlas.mjs query RUN --op=rhythm --asset=master --start=1248000 --end=2688000 --limit=1000
```

Brief and identity-contract projections expose method/counts without dense frame
arrays. Full JSON export retains original `rhythm_analysis`, event references,
source identity, raw beat-evidence digest, NumPy version and helper digest. HTTP
uses the existing Builder session/auth boundary; CLI uses the same local owner.

## Method and units

Upstream beat/downbeat candidates come from **Beat This!**, Francesco Foscarin,
Jan Schlüter and Gerhard Widmer, through its existing CPU adapter and minimal
postprocessor. See the [official implementation](https://github.com/CPJKU/beat_this).
Hapa does not claim those predictions are independent ground truth.

The onset helper uses positive spectral flux, a standard family also documented
by [librosa](https://librosa.org/doc/0.11.0/generated/librosa.onset.onset_strength.html).
This adapter uses a linear FFT grid and explicit formula below; it does not claim
equivalence to librosa's default Mel-power implementation.

1. Average source channels arithmetically, without gain normalization. Phase
   cancellation is possible. No resampling or source-to-Master transform is used.
2. Hop is nearest-half-up 10 ms in source samples. Window is the next power of two
   at least 40 ms, periodic Hann, centered and zero-padded at source edges. First
   center is zero; last center precedes source end, retaining clipped final support.
3. For each FFT bin compute `log1p(200 * abs(rfft(windowed_PCM)) / sum(Hann))`.
   Strength is the mean positive difference from the previous frame's local
   three-bin maximum. The first strength is zero because no preceding frame is
   defined. Strength units are dimensionless, not probability or loudness.
4. `support_start_sample/end_sample` describe the current FFT window and energy
   anchor search. Flux additionally depends on the previous FFT window: its full
   dependency support starts one hop earlier, clipped at source zero. This is a
   declared analysis support convention, not an acoustic timing error bound.
5. Peaks must exceed `max(0.002, local_median + 3*local_MAD)` within ±250 ms and
   current-window mono RMS ≥−70 dBFS. Choose local maxima, greedily keep stronger
   peaks at least 50 ms apart, then restore chronological order. These thresholds
   are operational choices, not calibrated musical detection probabilities.
6. Each retained flux peak has a distinct `anchor_sample`: the maximum 1 ms
   mean-square energy within its current FFT window support. That anchor drives
   subdivision placement and cueing. It is not claimed as the true attack onset.
   Raw flux center, support, threshold and strength remain intact.

For adjacent model beats, interval BPM is `60*source_rate/sample_delta`. Local
tempo uses the median of up to seven intervals (current ±3). Half and double
pulse rates are exposed alongside it. A relative MAD above 0.2, interbeat duration
outside 0.12–3 seconds, a gap longer than 2.5 times the whole-run median interval,
or no source-frame energy above −70 dBFS makes pulse evidence unresolved.
Leading/trailing spans without a bracketing beat pair remain unresolved too.
No interval is fabricated across those edges.

Match downbeats to the nearest beat within 40 ms. Adjacent matched downbeats
supply pulse counts; unmatched downbeats remain explicit. Counts 2–12 with supported
intervening intervals are candidates, others unresolved. Metrical level and
notation remain alternatives; no universal 4/4 assumption is applied.

Within each supported beat interval, select the strongest onset candidate whose
energy anchor lies at phase 0.2–0.8. Phase is the exact source-sample fraction of
that interval. The stored `long_short_ratio` field is defined as
`phase/(1-phase)`: **ordered first/second durations**, not durations sorted by
size. Values below one represent an earlier offbeat. Eight-interval groups require
at least four matches before reporting median ratio, ratio MAD or mean contrast.
Missing subdivisions are not filled or interpolated.

Offbeat-accent contrast is `max(0, offbeat-next_beat)/(offbeat+next_beat)`, using
selected flux-peak strengths. The next-beat input is the strongest detected peak
within ±0.1 interval of the following beat; no matching peak contributes zero to
this proxy, which does not assert physical absence of on-beat sound. This is an
operational syncopation-related estimate, not a perceptual syncopation score.
All results depend on the chosen pulse and onset detector. Multiple subdivisions,
melodic attacks, reverb and sustained sounds can confound them.

## Qualification, process boundary and lesson

Seven deterministic numerical tests cover known click timing, distinct flux/
energy anchors, even versus two-to-one subdivision, changing tempo, 3/4/5 pulse
groupings, missing beats, unmatched downbeats, silence and long gaps. 102 focused
Atlas JavaScript checks cover identity, coordinates, references, complete paging,
legacy states, shared API/contract, helper-code cache invalidation and existing
worker cancellation/timeout behavior. Build passes. These tests do not establish
human musical correctness.

No process path is added: existing Node owner → serial base, Beat This and optional
pitch stages. Rhythm is a pure NumPy helper inside the Beat This worker. Existing
role/environment policies, one-thread bounds, 600-second owner timeout, Python
alarm, process-group TERM/KILL cleanup and writer lease apply. The raw source,
prior immutable runs and approved reviews retain their owners.

Reuse: Beat This results, original Master PCM, immutable jobs, cache, source player,
range queries and contract export. Initial synthetic swing testing exposed an
approximately 10 ms lead in a spectral-flux peak; using that point alone biased
subdivision ratios. The implementation now retains the flux point and a distinct
local-energy anchor. Lesson candidate: a detector's window center and the event
one wants to measure are different evidence objects; do not hide their difference
with false timing precision. Source: this Audio Atlas task's synthetic fixtures,
initial failing test and subsequent implementation/real-song evidence.

Human tempo/meter/swing/syncopation qualification, genuine unmetered examples,
broad/native acceptance and a focused completion commit remain open. The rhythm
card stays **In Progress**. Actual real-song and browser evidence follows below.


## Brave Tongues evidence — September 28

Combined run `e2c13270-33e7-49e8-992d-3bf4005e37a6` retains rhythm on Master and pitch on Vocals.
Total analysis 199.314 seconds; Beat This inference
7.307 seconds, rhythm helper 1.223
seconds, pitch stage 57.195 seconds. There are
486 beat and 122 downbeat candidates,
24345 onset-strength frames, 1199 selected
onset candidates, 485 interbeat intervals and
121 downbeat-derived groupings. Pulse counts are 120 groups
of four and one group of three; no time signature was accepted.
59 of 61 groove windows meet the
method's evidence-count threshold. These are outputs, not accuracy scores.

The real 26–56 second browser window loads all 3000 frames across three pages,
with 60 pulse intervals. Tempo, bar, onset and groove views display their actual
evidence and alternatives. Tempo-row cueing sets the Master player to exactly
26.5 seconds. A stem selection routes explicitly to Master; the old pitch-only
run reports rhythm unavailable. The same combined UI request reuses this run
without new inference or a sixteenth saved job.

UI/API/CLI/contract and content-key reuse pass. All 13 original/preserved audio
hashes match. Earlier pitch and technical result bytes remain unchanged, and
every new pitch frame is identical to the previous pitch-only run. Beat raw-file
hash matches the rhythm evidence reference. Analysis workers exited and transient
PCM is absent; the intended local preview remains available.

Result SHA-256: `268d0a9608f9adc5bf842355f5965c1e229959ee631ffcfa8e38408709d73aa9`. Focused tests/build/browser checks do not
close human musical accuracy, broad/native release or completion-commit gates.
Source chat: [Audio Atlas continuation](codex://threads/01a0e4d5-31d6-74f0-ab17-f838cf3f0992).
