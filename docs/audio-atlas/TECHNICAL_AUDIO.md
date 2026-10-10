# Audio Atlas technical measurements

Status: local prototype; numerical fixtures and one real song verified. Card `atlas-gap-technical-features` remains in progress. Isolated noise estimation, broad/native acceptance and the focused completion commit remain open.

## Use

Open Echo → Audio Atlas → Brave Tongues → **Audio measurements**. Choose Master or a stem with the existing Audio source control. The four summary values and channel table cover the entire decoded source. Window controls select 30 seconds of source-bound threshold evidence; a warning button cues the same source player. Loading, failure/retry and older-run not-measured states are explicit. A new local analysis adds measurements; opening a saved run never launches inference.

The existing query route and CLI use `op=technical`, `asset`, half-open integer sample `start`/`end`, `limit` (maximum 1000) and `offset`. Summary scope remains whole-source even for a range query. Each response declares total/truncated paging state. The UI's 30-second window fits one page; it still shows an incomplete-page warning if that contract is violated.

```sh
node cli/audio-atlas.mjs query RUN --op=technical --asset=master --start=0 --end=1440000 --limit=1000
```

Full contract exports bind technical arrays to their source asset/hash and decoded timeline. Briefs omit frame arrays. Legacy saved results remain readable with an explicit not-available result; new helper bytes participate in the analysis cache key.

## Measurement conventions

- Original decoded float32 channels feed double-precision, non-overlapping ~100 ms PCM windows. Hop is sample rate / 10 rounded to nearest-even; start is zero, not centered. The last partial window retains its actual end. Source time maps are rational identity, with no resampling, gain or downmix for PCM metrics.
- RMS and sample peak use amplitude 1 as full scale. Zero energy has no finite dB value and is encoded null, never 0 dBFS. Full-source RMS, DC and Pearson correlation use stable merged central moments; crest is peak/RMS in dB. Exactly two varying channels are required for correlation. Correlation does not diagnose an acoustic cause.
- Counts are per channel: `|sample| >= 1` and `|sample| >= 0.999`. They are clipping indicators, not confirmed clipping. Lossy decoding may overshoot; clipping already embedded below those thresholds may be missed. No original recording is declared distorted solely from these counts.
- Quiet level is the 10th percentile of linear RMS across complete equal-duration windows, linearly interpolated then converted to dBFS. Partial tail windows are excluded from this percentile but retained in frame evidence. This mixes quiet music and residual noise. `noise_floor_dbfs` remains null because no noise-only reference or qualified separation exists.
- Integrated loudness, loudness range, gate threshold and true peak use **input** statistics from the installed FFmpeg `loudnorm` filter. Explicit mono/stereo layout, dual-mono false, dynamic analysis at 192 kHz. Filtered output goes to the null sink; no normalized audio is retained. FFmpeg's binary hash/version is in run runtime provenance. Original input statistic strings are retained, at the report's 0.01 dB precision. [FFmpeg filter documentation](https://ffmpeg.org/ffmpeg-filters.html#loudnorm).
- Below-gate integrated loudness is null with a reason. Sources shorter than 400 ms have no integrated result; loudness range additionally needs three seconds and eligible blocks. Range remains duration/content dependent. Silence has no finite true peak. Multichannel PCM is supported, but loudness weighting beyond mono/stereo is explicitly unsupported. Meter errors remain failed measurements, not zero-valued success.

## Verification, September 28, 2026

Brave Tongues run `668f53ed-8a18-49cf-848e-6c3140c862c7` measured Master plus 12 stems in **132.920 seconds**, all source analyses ready. Master: **−14.70 LUFS**, **+0.24 dBTP**, **7.70 LU** range, correlation approximately **0.86**. One decoded left-channel sample is above full scale in the 95.2–95.3 second window; this is not a human judgment of audible distortion. Keyboard, Percussion, Strings, Brass and Woodwinds have no blocks above the loudness gate; their finite peak measurements remain available.

47 JavaScript and 46 Python focused checks pass. Meter calibration includes a known stereo sine, mono weighting, silence, a short clip, a final-partial-block peak and an inter-sample-peak fixture. PCM fixtures exercise polarity, DC removal, independent/constant/mono/multichannel inputs, thresholds, partial tails and nonfinite rejection. Validator checks source maps, units, centering, counts, nullable values and half-open paging. Build passes. Real-run contract/API/CLI/cache and original/preserved source hashes are verified; earlier word-alignment evidence is unchanged. Actual browser review confirms Master/Keyboard states and cues the level-warning source player to 95.2 seconds. No human listening, broad or native acceptance is claimed. UI failure/retry exists but an actual request failure was not deliberately injected in the real app.

Evidence is under the source task's `work/audio-atlas-2026-09-27/technical-features/`: immutable result identity, `verification.json`, CLI response, meter probes, build logs and browser screenshot. Initial verifier assumptions wrongly required finite loudness on every stem and omitted the API's `ok` envelope. Those harness errors were corrected without changing audio or measurement values.

## Reuse, process boundary and lesson

Reuse: existing Atlas source decoder, worker lifecycle, writer lock, immutable run, contract, query route, CLI, selected-source player and review layout. No new service, model or dependency. Worker → one serial FFmpeg child, no shell/network input; explicit argv and allowlisted environment, 120-second command bound, existing 590/600-second worker/owner bounds and group TERM/KILL cancellation remain. Tests use bounded serial children and temporary directories. Actual analysis child and decode/low temporaries are absent after completion; the task preview is intentionally retained.

The initial ebur128 metadata probe omitted the final 123 samples and printed linear peaks at only three decimals. Whole-file loudnorm input statistics preserve the tested tail peak and avoid misreading linear amplitude as dBTP. This is a **Lesson Card candidate**, derived from Codex task `01a0e4d5-31d6-74f0-ab17-f838cf3f0992`: a meter's report cadence, units, precision and gate behavior must be qualified before presenting a reassuring value. Future work should qualify an explicit noise-reference workflow and broader meter interoperability without silently treating quiet music as noise.


## September 28 continuation — explicit reference-noise path

[Noise-reference workflow](NOISE_REFERENCE.md) now provides source-bound range RMS,
previewed frame support, attributed noise-only assertions and append-only retraction
through UI/API/CLI. Numerical/owner tests and Brave Tongues preview pass; no human
noise-only assertion was saved. This supersedes the earlier missing reference-path
status, not the limits of automatic noise separation. Card moves to Review; broad,
native, focused-commit and human acoustic qualification remain open.
