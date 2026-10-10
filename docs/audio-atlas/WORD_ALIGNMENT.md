# Supplied-text word alignment: qualification in progress

First-pass prototype, September 27, 2026. Card `atlas-gap-word-alignment` remains
in progress. Source: Codex thread `01a0e4d5-31d6-74f0-ab17-f838cf3f0992`.

## Current result

The offline Qwen3 forced aligner ran against Brave Tongues' preserved vocal stem:
12 seconds of source-declared spoken introduction, 15 seconds of sung verse,
and five seconds of synthetic silence. These initial probe results preceded the integrated excerpt workflow below.
The current UI/API/CLI support explicit passage alignment. Existing immutable
analyses and human corrections are unchanged.

| Case | Raw words | Valid interval candidates | Unresolved |
| --- | ---: | ---: | ---: |
| Source-declared spoken introduction | 15 | 14 | 1 zero-duration word |
| Sung verse, source seconds 26–41 | 24 | 23 | 1 zero-duration word |
| Synthetic silence | 8 | 0 | All eight |

The model emitted timestamps for every supplied word on silence. Successful
forced alignment therefore does not prove any of the supplied text was performed.
The spoken style is declared by the source lyrics, not independently qualified
speech. No human-labelled boundary error, omitted-word detection, calibrated
confidence, or singing accuracy is established. Inference for the excerpts took
0.942 and 0.153 seconds; total probe 6.041 seconds includes decode/model load.
These are one-run observations, not a performance benchmark.

## Reproducibility and ownership

Integrated upstream: [MLX Audio](https://github.com/Blaizzy/mlx-audio) 0.3.1,
Transformers 5.0.0rc3 (upstream dependency), and the
[MLX-community Qwen3 ForcedAligner 0.6B 8bit checkpoint](https://huggingface.co/mlx-community/Qwen3-ForcedAligner-0.6B-8bit),
revision `0e1a68e91d815300c7c9754b2a7639378b23db15`.
Hapa owns the adapter validation and evidence workflow, not these models.
The model card declares Apache-2.0; preserve upstream notices for distribution.
Ten local checkpoint files total 1,276,474,460 bytes and have individual SHA-256
receipts. A new isolated Python environment holds a frozen dependency list;
existing runtimes were not changed. No model-repository Python was downloaded,
no `auto_map` accepted, and tokenizer loading explicitly disables remote code.
Public package/weight downloads preceded the offline test; audio was not uploaded.

Source SHA-256:
`9c2dffd2fdf92fa4f0b14704c66f7214a305105f96b0a41c9b774151a419f5dd`.
The source has 11,687,040 decoded samples at 48 kHz. Fixed FFmpeg decoding to
16 kHz mono precedes cropping; supplied lyrics remain verbatim alongside the
model's punctuation-normalized tokens. Original source hashes match before/after.
Task evidence: `work/audio-atlas-2026-09-27/word-alignment/` contains raw and
validated probe JSON, checkpoint receipt, dependency lock and process review.

## Validation contract

`scripts/audio_atlas_word_alignment.py` is a pure, bounded validation module;
it does not start models or processes. It preserves supplied text and token spans,
checks exact normalized token order, and retains repeated-token indices. Missing,
extra or changed output tokens abstain from positional matching. This checks the
model output against its input, not the lyrics against the actual performance.

A mono 16 kHz clip is capped at 30 seconds. Whole-clip and interval RMS below
1e-4 abstain; that heuristic is neither a voice detector nor a calibrated score.
Nonfinite, negative, reversed, out-of-bounds, overlapping/nonmonotonic and empty
sample intervals are rejected. Zero durations remain unresolved; they are never
widened. Clip-relative timestamps map to source samples with a rational sample-rate
ratio and explicit source crop offset, rounding once at the source boundary.
No stem-to-master alignment or codec-delay correction is applied.

Candidates remain unreviewed with null confidence/model score and unqualified
quality. A future caller must bind source, model, input and raw-output digests.
Eleven focused tests pass in the canonical checkout. Actual captured probe
validation produces the table above, using real decoded vocal PCM and separately
labelled synthetic silence. No frontend/runtime code is wired yet, so no new build
or browser acceptance is claimed. Previous repository/native/commit gates remain.

## Process boundary and next work

The probe owner starts one guarded worker, which runs one bounded FFmpeg before
in-process inference. Explicit argument arrays, environment allowlist, offline
flags, thread caps, 240/270-second worker/owner deadlines, process-group TERM/KILL
cleanup and no retries bound the run. Socket connections and further subprocesses
are denied during inference. The owner exited successfully and recorded worker
PID 76142 is absent. The validation replay uses one foreground decoder with a
60-second timeout, automatic kill/wait and no temporary file.

Next: connect this adapter to the existing Atlas job/manifest, cancellation,
cache, provenance and review surfaces; add bounded excerpt controls in shared
API/CLI/UI; then verify persistence and actual-song review. Speech fixtures,
human-labelled onset/offset errors, repeated/omitted-performance behavior and
broader singing qualification remain acceptance work, not a reason to await
another foundation approval. Missing Suno files remain lower priority.

Learning delta: a forced aligner can place a supplied transcript onto silence.
Keep raw evidence, acoustic abstention and human accuracy review separate.
An initial package dry-run refused the required Transformers prerelease; explicit
prerelease selection resolved it without enabling unrelated prereleases.
The source-text, immutable-run and existing worker owners remain the reuse path;
a separate service or automatic lyric correction is unnecessary.


## Integrated excerpt workflow — September 27 continuation

Open **Audio Atlas → Analysis settings & saved runs → Align supplied words to a
passage**. Choose a source (prefer Vocals), start/end seconds and the supplied
words, then **Analyze locally / reuse matching result**. English only; 30-second
maximum, 4,000 text characters, source-duration validation. No model runs on view
or checkbox selection. Current source, exact text, excerpt, runtime metadata,
checkpoint hashes and worker/validator code participate in cache identity.

**Lyrics → Supplied-word timing** shows candidates and unresolved words separately.
**Review aligned words** selects that source, cues the passage and opens the Words
list. Each candidate names its method, retains punctuation/source token identity,
and uses the existing evidence, correction, review and export owner. The supplied
passage is retained separately from canonical lyrics, ASR and human corrections.
Silent clips skip model inference; invalid or zero-duration tokens are not made
into observations. No automatic acceptance or Director promotion occurs.

API: existing authenticated `POST /api/echos/audio-atlas/jobs` accepts
`alignment: {sourceId, startSeconds, endSeconds, text, language: "English"}`.
Omit it for normal analysis. CLI from the Builder root:

```sh
node cli/audio-atlas.mjs analyze SONG_ID --align-source=stem-1 --align-start=26 --align-end=41 --align-text-file=./passage.txt
```

`query --op=brief`, `query --op=lyrics` and JSON export include `forced_alignment`;
normal word queries include valid interval candidates. Private ignored local
configuration `data/audio-atlas/alignment-model.json` requires absolute `python`
and `modelPath`, model repository/revision and a `sha256` map for exactly ten
allowlisted checkpoint files. Every hash is checked before the job and in the
worker. The application never installs or downloads. Configured model:
`mlx-community/Qwen3-ForcedAligner-0.6B-8bit`; MLX Audio 0.3.1 required. See the
checkpoint revision and runtime evidence above. Treat this profile as experimental.

The adapter reuses the existing sequential worker lifecycle, cancellation and
immutable publication gates. It resamples the source prefix before cropping;
compressed-container seeking is not used. Input crop indices are rounded to16kHz
samples. The source crop origin is rounded to its nearest sample with the residual
explicitly retained; this is coordinate accounting, not a measured acoustic delay.
Maximum active descendants remain one Python plus one decoder. Optional analysis
now has at most four sequential phases, each subject to the existing owner timeout.

Actual CLI run `b4513c7b-2875-4419-9434-9a55ac90a5b0`: master plus12stems,
20.311s total, 2.064s alignment stage. Verse26–41s produced23 interval candidates
and unresolved zero-duration `A`. First candidate `Lost` is27.20–27.52s on Vocals.
All13 original/preserved hashes match; original lyrics and prior reviews unchanged.
Result SHA-256 `ceb0b1af568eb8c5bbe78bee8fcc4d14ccc27988864ac9b9efb475bc2dc3aa2b`.

Browser submission also exercised Beat This plus alignment in run
`778dc024-fdbd-4f6a-8b51-dc4300bfdd83`, complete in27.660s. The initial attempted
cache comparison had Detect beats selected and correctly created a different
analysis. Matching options then reused the exact CLI run. The browser checkbox
click initially failed its target-state check; keyboard activation and fresh-state
inspection were used. A stale history-menu running label was repaired by projecting
job updates into saved-run rows. Final build/reload shows complete persisted runs,
23 reviewable words, explicit unresolved `A`, and the selected word in its original
vocal source at27.20s. DOM player-property inspection timed out; the rendered player
shows0:27, so no stronger browser sample-accuracy claim is made.

38 focused JS checks and11 validator checks pass. UI status follow-up reused the
owner tests and reran six UI checks plus the production build. Final delivery receipt
`sha256:1c1d021e7f02fe40527f519976e041e7fa197ed8a149dd1378ad4c078e4ac9d2`.
Analysis workers exited and temporary alignment PCM is absent. Only the task-owned
loopback preview was refreshed. No broad-suite/native acceptance or completion
commit is claimed; existing eight repository failures remain separate open work.
Evidence: task `word-alignment/integration/` scripts, logs, JSON and browser image.

Remaining for this card: independent real speech qualification, human-labelled
boundary-error report, and performance omissions/repetitions assessment. Existing
source-declared spoken probe is not sufficient speech ground truth. The integrated
workflow is usable for review but does not close those quality requirements.
Learning delta: compare complete selected analysis options before diagnosing cache
reuse; execution completion must also update the saved-run status projection.


## Listening reference workflow

The selected-source Timing accuracy tab now supports source-bound onset/offset,
uncertainty and omission labels through shared UI/API/CLI history. Original and
accepted corrected errors use the same independent references; synthetic labels
stay separate. Actual Brave Tongues still has zero human labels and unknown
accuracy. See [reference workflow and verification](TIMING_REFERENCES.md).
