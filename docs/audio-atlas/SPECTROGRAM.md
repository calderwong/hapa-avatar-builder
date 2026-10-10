---
title: Audio Atlas source-channel spectrogram review
status: first-pass-prototype; source mapping and calibrated fixtures verified
date: 2026-09-28
owner: hapa-avatar-builder
---

# Spectrogram review

Open **Audio Atlas**, choose a song and source, then **Spectrogram**. Use the shared
player/window controls to listen and select a 30-second range. Choose a source
channel, logarithmic/linear frequency view and display floor. **Cue window start**
seeks the selected source; it does not apply a stem-to-Master timing transform.
The chart is saved measurement evidence, not an instrument, note or lyric label.

New base analyses measure every successfully decoded Master/stem channel. Legacy
runs explicitly say that no spectrum was measured and offer explicit reanalysis.
Opening, changing channel, moving the window or reading the query never launches
analysis. Missing data and failed reads are distinct from a floor-colored spectrum.
Loading, error with Retry, no-data and not-measured states remain visible.

## Numerical conventions

- Original decoded sample rate and source channel order; no downmix, resampling,
  source gain normalization, stem alignment or source edit.
- FFT size is the next power of two at or above 50 ms of source samples. A periodic
  Hann window is centered at integer source sample `i * hop_samples`; first center
  is zero. Support is `[center - N/2, center + N/2)`, with zeros outside the file.
  Edge padding attenuates edge-window levels; there is no padding compensation.
- Hop is `max(ceil(sample_rate * .025), ceil(sample_count / 4096))`. At most 4,096
  snapshots per source. The actual spacing is reported. Long recordings can have
  unsampled gaps when hop exceeds FFT support; UI explicitly calls them coarse
  snapshots. Wider display cells hold the nearest snapshot, not inferred data.
- Unique rounded logarithmic FFT-bin boundaries form at most 192 bands. Their
  exact bin intervals and Hz edges partition DC through Nyquist. Each band stores
  its strongest bin. This is **peak-bin amplitude**, not average power density,
  loudness, integrated band energy or a note-frequency estimate.
- FFT magnitudes divide by Hann coherent gain; interior positive-frequency bins
  double, while DC/Nyquist do not. `20*log10(amplitude)` gives the displayed dBFS.
  A bin-centered 0.5 peak-amplitude sine measures approximately -6.02 dBFS.
- Storage saturates at -120 and 0 dBFS, quantized at 0.5 dB with nearest-even
  rounding in frame/channel/band byte order. A floor-colored band can be silence
  or quieter energy; saturation never establishes clipping of source audio.
- Log view shows 20 Hz through Nyquist; linear view includes DC. Display-floor
  changes only color mapping. Frequency labels use actual Hz edges. The FFT
  support—not the sample-coordinate precision—limits localization of events.

Each per-source `.u8` artifact is at most 6 MiB (4,096 × 8 × 192 bytes). The existing
25-source limit bounds total spectral storage to 150 MiB before actual smaller
shapes. Artifacts and metadata remain in the ignored immutable analysis run.
Every query verifies metadata, source/timeline binding, dimensions and file hash;
invalid encoded values fail closed. Damaged artifacts invalidate analysis-cache
reuse, allowing a new explicit analysis to rebuild without overwriting the old run.

## UI / API / CLI parity

`GET /api/echos/audio-atlas/jobs/RUN/query?op=spectrogram&asset=stem-1&start=1248000&end=1968000&channel=1&limit=1000`

```bash
node cli/audio-atlas.mjs query RUN --op=spectrogram --asset=stem-1 \
  --start=1248000 --end=1968000 --channel=1 --limit=1000
```

Start/end are integer source samples in a half-open range. Channel is zero-based
in the API/CLI (UI channel 2 is `channel=1`). Up to 1,000 snapshots per page; offset,
total and truncated are explicit. A 30-second UI range can include more than 1,000 snapshots on shorter files.
The UI reads at most two pages (bounded to 1,202 snapshots), checks their common
artifact/timeline/channel and renders only when all expected snapshots arrive.
Incomplete or mismatched pages produce a visible retryable error. No read triggers worker inference.

Responses carry source/hash/timeline, sample rate/count, channel, exact frequency
bands, encoding, FFT/hop/centering, frame center, source-clipped FFT support, nearest
snapshot display cell and magnitude values. Contract projection retains the same
feature identity and evidence reference. Existing authentication, same-origin and
preserved audio playback checks are reused. CLI retains the local owner boundary.

## Verification and process boundary

The existing measurement process graph is unchanged: Builder/CLI → one Python
worker → one serial ffprobe/ffmpeg child at a time. Spectral extraction itself
creates no new processes and uses the existing NumPy runtime. Environment/role,
one-thread caps, ten-minute owner timeout, worker alarm and process-group
TERM/KILL cleanup remain the existing boundary. No install, model, download,
network analysis, background worker or new service.

50 distinct focused JavaScript checks and 36 Python checks pass; delivery build
passes. Tests cover calibrated bin-centered sine levels, silence, separate stereo
frequencies/amplitudes, anti-phase channels, impulse/edge support, several sample
rates, bounded long sources, odd/even hop boundaries, final-cell coverage,
pagination, invalid metadata, damaged/missing bytes, legacy state and cache recovery.

Brave Tongues run `4eef59d7-ec6b-4147-93a3-713fac1be1ce`: 13 ready sources,
21.431 seconds, 14,373,720 spectral bytes. Master: 4,096 snapshots, 135 bands,
2 channels, hop 2,853 samples (59.4375 ms), window 4,096 samples (85.3333 ms).
Vocals use their own decoded count/timeline and hop 2,854. All 13 original and
preserved source hashes match. Previous forced-alignment result is unchanged.
Every artifact/hash and range query validates; contract includes 13 spectral
feature arrays. API/shared-owner parity and exact analysis cache reuse pass;
CLI readback is retained. Real-source browser checks verify Master/Vocals selection,
channel 2, linear/log frequency view, display floor, loading, exact 26-second
Vocals cue and the legacy not-measured notice. The final chart is saved in task
evidence. Error propagation and bounded pagination have automated tests; runtime
error presentation was not deliberately injected into the real analysis. Workers and temporary decode files are absent afterward.
These are scoped measurements, not real-time guarantees or human musical judgment.

## Reuse and learning delta

Reused the existing full-channel decode, measurement job/cache, immutable result,
contract, API/CLI, source player and window controls. Added one NumPy helper and
one view; no parallel media catalog or spectral service. Source-preserving review
benefits from original-channel measurements: a mono sum can erase antiphase audio.

Nearest-snapshot display cells need explicit half-open boundaries and a final cell
that reaches the real source end; otherwise odd hops and short tails leave missing
or double-covered samples. The 1,000-row API cap initially truncated short-source windows; two bounded
pages now complete the view, with mismatched pages refused. Independent boundary
tests cover every sample in a
small fixture. Spectral hashes must participate in cache health, not just metadata
validation, or a damaged derivative can be reused forever. Those are reusable
Lesson Card candidates from Codex task `01a0e4d5-31d6-74f0-ab17-f838cf3f0992`.

Broader repository/native acceptance and the focused completion commit remain
open under the parent Atlas goal. This capability does not close pitch, notes,
source identification, vocal precision or human-quality qualification.
