# Per-stem timing evidence

First-pass prototype, September 27, 2026; card `atlas-gap-stem-alignment` remains
in progress. Source: Codex thread `01a0e4d5-31d6-74f0-ab17-f838cf3f0992`.

## Use and ownership

Run a new local Atlas analysis and open **Analysis details → Per-stem timing
checks**. The existing query `op=brief` exposes `individual_stem_alignment`;
JSON exports retain every window, threshold, source identity and proposed map.
CLI: `node cli/audio-atlas.mjs query RUN_ID --op=brief`.
Existing saved analyses are immutable and do not acquire invented new evidence.

The measurement worker reuses Echo's normalized PCM cross-correlation. Each
stem is compared separately to the master at 8 kHz in up to 24 four-second
windows. The requested lag ceiling is two seconds; the existing correlation
owner caps it to one third of the window (1.33325 seconds here). Candidate
windows require correlation ≥0.18, peak margin ≥0.04, and an interior peak.
The median pairwise slope and median intercept fit an affine lag model.
A proposal requires ≥4 usable windows spanning ≥half the common duration,
maximum residual ≤3ms, and absolute drift ≤1%. Thresholds are heuristics,
not a calibrated probability or proof of acoustic accuracy.

Positive offset means place the stem later on the master. Maps and exact rational
inverses use the original decoded source/master sample rates; their proposed
domain is bounded by the usable windows. They are not registered as applied
contract time maps, and nothing time-stretches, trims or edits source audio.
Source/master hashes and timeline IDs bind the evidence. Cache identity includes
the new diagnostic module. Leading activity uses a declared RMS threshold in
10ms blocks. Duration differences are measurements, not missing-content claims.
Residual decoder delay cannot be separated from content offset by this method.
Sampled windows do not verify every interval; leakage/repetition can confound
correlation. Silent/unrelated/repetitive inputs remain ambiguous.

## Verified output

Run `da5ea557-ff18-4d4a-b684-bc508568e0bf` processed Brave Tongues master plus
12 stems in 17.392s. Vocals, drums and guitar produced −18.00ms offset candidates;
bass produced −18.179ms and 1.924ppm drift. Eight other stems received no map:
backing vocals/FX lacked sufficient temporal span; six others lacked usable
window evidence. No claim of absent instruments is made.

13 original and preserved source hashes match. The owner published the new run
only after validating the existing identity/observation contract. No reviews or
previous analysis results were rewritten. Existing API/CLI brief and live browser
details expose the same 12 records. 33 Atlas JS checks, eight new DSP tests and
four existing DSP tests pass; production build passes. The first integration
run revealed a fixture missing the newly hashed module; the fixture was updated,
then all 33 checks passed. The worker exited and no Atlas analysis descendants
remained. Only the task-owned loopback preview was restarted.

## Remaining acceptance and learning delta

This is useful diagnostic progress, not completed stem-alignment acceptance.
Still needed: decoder-delay attribution, missing/edited-material localization,
broader codec/mix/offset/drift qualification, calibrated uncertainty and resolution
of ambiguous real stems where evidence permits. Preserve unknown states where
it does not. No new models, packages, source downloads or paid calls were used.
Native/full-repository acceptance and a focused completion commit remain open;
the previous eight broad failures were not rerun for this intermediate batch.

Reuse decision: extend the existing reconstruction correlation, bounded worker,
immutable job store and analysis-details surface. Lesson candidate: agreement of
the summed stems does not establish each stem's clock. Sparse matching windows
must not be promoted to a whole-song alignment merely because their fit is tight.
Source evidence: this task's `work/audio-atlas-2026-09-27/stem-alignment/`.
