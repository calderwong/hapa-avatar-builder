---
title: Audio Atlas source-bound pitch candidates
owner: hapa-avatar-builder
status: first-pass-prototype; numerical qualification, real singing accuracy open
date: 2026-09-28
---

# Source-bound pitch and voicing

The existing Atlas job owner optionally runs a local pYIN contour on one source
channel. This extends immutable analysis, query, export and listening workflows.
It does not separate voices or establish note, singer, lyric or singing accuracy.

## Human workflow

In **Echos Album → Audio Atlas**, choose a song, then open **Analysis settings &
saved runs**. Enable **Track vocal pitch and voicing**, choose an isolated vocal
source and an existing channel, then explicitly analyze. Existing matching runs
are reused. Missing runtime/source/channel produces an error; nothing downloads.

Choose **Pitch contour** and the analyzed source. The existing listening window
controls the 30-second range. The graph uses a logarithmic Hz axis, with gaps for
abstentions. The frame slider exposes frequency, cents relative to A4, score and
raw evidence; **Cue inspected pitch frame** seeks the same source player. Other
sources and old runs show an explicit unavailable state. Loading/error/retry and
complete-window paging prevent a partial curve from looking complete.

## Shared interface

POST `/api/echos/audio-atlas/jobs` adds
`"pitch":{"sourceId":"stem-1","channel":0}` to the ordinary request. Source
IDs come from `/songs`; channel is zero-based, integer 0–7 and must exist in the
decoded source. Source registration and runtime config validate before work;
channel availability validates after the ordinary base analysis.

`GET jobs/:id/query?op=pitch&asset=stem-1&start=S&end=E&limit=1000&offset=0`
returns candidate frames whose source centers fall in the half-open sample range.
Maximum page size is 1000; the UI fetches and validates the entire 30-second window
with at most four serial pages. Source/hash/timeline/window/channel/method, page
counts and ordered grid are checked. Brief/contract omit frame arrays; full JSON
export retains them. Authentication, cancellation, locking and source playback
remain with the existing Builder owners.

```bash
node cli/audio-atlas.mjs analyze SONG --pitch-source=stem-1 --pitch-channel=0
node cli/audio-atlas.mjs query RUN --op=pitch --asset=stem-1 --start=1248000 --end=2688000 --limit=1000
```

Private ignored `data/audio-atlas/pitch-runtime.json` points at an **existing**
isolated Python runtime with pinned packages: librosa 0.11.0, NumPy 2.4.6,
SciPy 1.17.1, Numba 0.67.0, llvmlite 0.49.0 and soxr 1.1.0 (librosa dependency, not the decoder resampler). Configuration has
`python` (absolute path) and `packages` (name/version map). No automatic install,
weights, paid provider, network inference or scheduled worker is introduced.

## Method, clocks and missing evidence

Integrated upstream: [librosa pYIN](https://librosa.org/doc/0.11.0/generated/librosa.pyin.html),
librosa contributors, ISC license. The upstream method combines YIN candidates
with Viterbi decoding. This is Hapa's bounded adapter, not a new pitch algorithm.
FFmpeg swr decodes the preserved source channel to 16 kHz without gain or
stereo mixing; container skip/discard semantics are retained. swr uses filter_size=64, phase_shift=10, linear_interp=0, exact_rational=1
and cutoff=0.95; its version is bound by the FFmpeg executable hash. No extra trim or
stem-to-Master alignment is applied.

- Frequency bounds 50–1100 Hz; 1024-sample (64 ms) centered windows, 160-sample
  (10 ms) hops, zero padding at edges, 0.1-semitone (10-cent) bins.
- Complete pYIN parameters travel with the result, including transition/Viterbi
  settings. Analysis uses 30-second cores with one second of context on either
  side; context predictions are discarded, with no contour averaging.
- Analysis center `k*160` maps to source samples by exact rational rate conversion
  and nearest-half-up rounding. Support bounds round outward and clip to source.
  First center is zero, last center is strictly before source end; final partial
  support remains explicit. These are representation conventions, not accuracy.
- Retain raw Hz, raw voicing flag, score, window RMS and the final abstention
  reason. Scores below 0.1, RMS below −70 dBFS, unvoiced labels or missing raw Hz
  yield null usable Hz/cents and `voiced:false`. Neither threshold is a calibrated
  correctness or human-voice probability. Silence/null is not a fabricated zero Hz.
- Cents are `1200*log2(f0/440)`, not a note assignment. Raw estimates are never
  overwritten by the policy mask. Chunk context reduces edge effects but does
  not prove seamless tracking.

Source bytes/hash, own-source timeline, channel, decoded source count, analysis
input hash, worker/helper/FFmpeg hashes and pinned package versions accompany the
frames. Validation rejects identity, grid, mask, cents, parameter and runtime
inconsistencies. Cache keys include pitch request/channel, code, configuration and
runtime; requesting no pitch preserves the existing non-pitch key. Historical
runs remain immutable.

## Process boundary

Existing Node owner → one isolated Python pitch worker → one serial FFmpeg
child, then in-process pYIN. No extra orchestration service. Worker arguments and
environment are explicit, role-marked, offline and limited to one numeric thread.
The owner bounds each worker to 600 seconds; Python alarms at 590 seconds;
decode times out at 120 seconds. Source pilot budget remains 1800 seconds.
Cancellation terminates the detached group, then force-kills after two seconds;
publication waits for all stages. Temporary pitch PCM is removed in `finally`;
the numeric compilation cache is intended retained local runtime data.

## Qualification and open work

Nine deterministic numerical tests exercise tone/cents, silence/quiet signals,
white noise and high-pass noise as unvoiced proxies, vibrato, harmonic/octave
ambiguity, overlapping tones, stitching/source clock and invalid input. Noise
proxies are not real consonant recordings. Overlap produces a roughly 110 Hz
subharmonic for simultaneous 220/330 Hz tones; this is a demonstrated limitation,
not successful multi-voice recovery. A single upper harmonic can also track an
octave above an intended fundamental. High score does not resolve either case.

96 focused Atlas JavaScript checks pass, including malformed evidence,
complete pagination, legacy/source behavior, shared API, optional runtime refusal,
cache invalidation and cancellation. A real process-boundary test verifies exact
worker path/role/environment and PID exit on timeout. Build passes.

Real-song evidence and browser review follow below.
Real singing/consonant references, pitch error and voiced/unvoiced calibration,
polyphonic handling, note segmentation, global/native acceptance and the focused
completion commit remain open. The card remains **In Progress**.

## Reuse and learning delta

Reused immutable Atlas jobs, writer lease, preserved media, source-clock queries,
contract export, 30-second listening window and source player. Initial raw pYIN
probe marked some noise frames voiced at a score around 0.01 and returned a
subharmonic for overlapping tones. Added an explicit low-score/energy abstention
policy while retaining all raw evidence. Lesson candidate: a voicing flag is a
model decision, and score-based abstention must remain distinguishable from
measured absence. Source: this Audio Atlas Codex task and its local pitch probe,
regression and real-song receipts; no independent human review is claimed.


## Brave Tongues verification — September 28

Run `bc67ea7f-1a93-42fc-aa2f-822af16d934a` analyzed all 13 existing MP3 assets and tracked
Vocals channel 1. Total analysis 196.785 seconds; the
pitch stage took 64.525 seconds across 9 chunks.
The contour preserves 24348 frames, of which 10308 meet the
explicit voicing policy. These are algorithm outputs, not accuracy measurements.

Actual UI/API/CLI queries, three-page 30-second retrieval, contract export and
cache reuse pass. All 13 original/preserved source hashes match; prior
technical and forced-alignment result bytes are unchanged. No temporary pitch
PCM or unowned worker remains. Nine numerical plus two whole-worker Python tests
pass; the latter check real decode/channel isolation and failure cleanup. An
additional decoder probe places a synthetic half-second impulse at resampled
frame 8000 for 44.1/48/96 kHz source rates. Build passes. Browser legacy/source
states, raw-frame inspection and player cue are checked separately in the task
evidence. No actual human quality references have been entered.

The first real run (`7cd68a16-715a-45dd-b678-8a43307cedf7`) failed before inference:
the installed FFmpeg omitted optional soxr support. Its failed record remains.
The adapter now uses explicit built-in swr parameters and exposes bounded FFmpeg
stderr. Isolated decoder checks passed before the song was rerun. A proposed
decoder-function refactor was restored before the active pitch stage; whole-worker
regressions provide coverage without changing its execution code during the run.
Cache readback verifies final worker-code identity. Guardrail: confirm backend
build capabilities and freeze execution code before starting a long analysis.

Result SHA-256: `cf50e52b8a3eb481dcea4a0a561ddbe015761e7e516d70a2949fb62f11c71f51`.
