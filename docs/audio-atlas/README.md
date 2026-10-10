---
title: Audio Atlas in Hapa Avatar Builder
status: first-pass-prototype; partial design-pack implementation
date: 2026-09-27
owner: hapa-avatar-builder
---

# Audio Atlas

Audio Atlas is a local derived-analysis feature in **Echos Album → Audio Atlas**. The existing Builder Song store owns song identity, declared lyrics and stem references. Atlas owns reproducible analysis runs and observation reviews; it does not create another Song Library or change Director cuts.

## Implemented

- Immutable source copies under the existing `data/media/` directory, source hashes, decoded timeline identity and provenance.
- Per-channel waveform extrema, RMS and sample peak; spectral centroid and energy transients at 100 ms windows. Transients are not beats. Integer half-open sample queries retain source clocks and the actual final frame length.
- Master/stem inspection, complete-stem reconstruction lag diagnostics and residual measurement. No automatic origin correction; individual stem origins remain unverified.
- Optional offline MLX Whisper vocal transcription with word candidates, model/weight/config hashes, raw evidence, uncalibrated scores and explicitly unknown timing uncertainty. Supplied lyrics and previously imported timing remain separate.
- Optional offline Beat This beat/downbeat candidates and CLAP master-window audio/text embeddings with fixed-concept, explicit free-text and audio-to-audio cosine retrieval.
- WAV, MP3 and WAV/MP3-stem-role file badges in Songs Directory and selected-song file details, with recheck and per-file detail. Checks use readable headers, registered paths, exact basename counterparts and numbered role matches within registered stem folders (512 entries maximum; no recursive discovery).
- Durable jobs, progress, cancellation, content-key reuse, result-integrity validation, source-bound playback, range/lexical/evidence queries and JSON export.
- Append-only review history and sample-boundary/text correction proposals with revision conflicts. Human acceptance is an explicit review action; machine candidates are not automatically accepted.
- UI, API and CLI share `server/audio-atlas.mjs`. Review histories stay attached to their immutable runs, selectable in the UI.

Unsupported: phoneme/syllable alignment, notes, diarization and open-ended semantic narration. Beat/downbeat correctness, instrument labels and lyric accuracy still require human qualification. This is not full implementation of the broader design pack. Words are not quality-qualified by the real-song smoke. Existing lyric correction/Director owners have not been replaced or automatically fed these candidates.

## Operator path

Open **Echos Album → Open audio workspace**, choose a song, then select a source. Existing completed runs load without new inference. For the test song, choose Brave Tongues → Vocals → Words and set the window start to 26 seconds. Select the flagged word at 27.24 seconds to compare the saved review with the original audio.

- **Review moments:** a paginated 40-row list and immediately revealed inspector. Type a word to search the whole selected source; Clear search returns to the 30-second window. Select a moment to cue the player, then press Play. Corrections use seconds and convert to validated source samples; they remain flagged until explicitly accepted by a person. Name and note are required.
- **Find sounds:** describe a sound and explicitly encode/search locally, or choose a saved category. Cue ranked Master passages and reopen saved searches without inference. Scores express similarity, not certainty. See [workflow and evidence](TEXT_SEARCH.md).
- **Lyrics:** compare supplied text with the unreviewed vocal transcript.
- **Audio measurements:** inspect source loudness, true/sample peaks, stereo correlation and windowed level warnings. Quiet-level estimates are explicitly distinct from a noise floor. See [method and evidence](TECHNICAL_AUDIO.md) and [explicit noise-reference review](NOISE_REFERENCE.md).
- **Notes & melody:** source-bound candidate spans, pitch variation, repeated patterns and low-register lines derived from saved pYIN evidence. See [method, review and limitations](NOTES.md).
- **Source activity:** sustained energy spans, source entrances, spectral evidence and available pitch register; imported roles stay separate from acoustic inference. See [method and open qualification](ACTIVITY.md).
- **Harmony:** original/tuning-adjusted chroma, competing chord/inversion and local/global key hypotheses on Master. See [method and qualification limits](HARMONY.md).
- **Rhythm:** source-clock tempo changes, pulse-grouping alternatives, onset strength, and conditional subdivision/accent estimates. Unresolved passages and musical-quality limits stay visible. See [method and evidence](RHYTHM.md).
- **Pitch contour:** optional source-channel pYIN Hz/cents and voicing candidates, raw evidence, explicit abstentions and source-player cues. Real singing accuracy remains unqualified. See [method and evidence](PITCH.md).
- **Spectrogram:** inspect saved source-channel frequency content in the current listening window. Channel, frequency scale and display-floor controls retain explicit FFT/time/unit conventions. See [method and evidence](SPECTROGRAM.md).
- **Song structure:** inspect original master-source acoustic boundaries, regions, similar-passage candidates and energy transitions, with playable context. Functional section labels remain unknown. See [method and evidence](STRUCTURE.md).
- **Timing accuracy:** record source-bound listening references and compare original/accepted corrected boundaries. Uncertain and unperformed words stay explicit; no references means accuracy unknown. See [workflow and evidence](TIMING_REFERENCES.md).
- **Analysis details:** inspect measured coverage, unsupported capabilities, alignment evidence and the JSON export.
- **Analysis settings & saved runs:** choose a prior run or explicitly request local transcription, beat detection, sound indexing or pitch tracking. Matching analyses are reused. No model work starts just by opening a song.
- **Songs Directory:** search songs and filter missing/unchecked WAV, MP3 or MP3 stems. Expand Details for file locations and Open in Audio Atlas. Unknown inventory is never treated as a found file. Metadata completeness is separate from audio availability or quality.
- **Add or import a song:** the existing import workflow is available below Atlas in a disclosure.

The UI automatically refreshes its existing local session once after a typed pre-dispatch auth rejection. It does not replay mutations after ambiguous errors. The player has a separate Reconnect audio action when media fails. Source files, Director cuts and original model observations retain their owners.

Measurements require an existing Python runtime with NumPy and installed `ffmpeg`/`ffprobe`. `HAPA_PYTHON` selects the measurement runtime. Optional transcription requires an already installed `mlx-whisper` runtime and downloaded compatible MLX Whisper model. Put private workstation configuration in ignored `data/audio-atlas/local-model.json`:

```json
{"python":"<absolute path to existing Python>","modelPath":"<absolute path to existing model snapshot>"}
```

The adapter expects `weights.npz` and `config.json`, verifies both, disables Hugging Face downloads/telemetry and blocks Python socket connections during inference. It never installs dependencies or downloads weights. MLX Whisper's English language setting is currently fixed; non-English qualification is outside this pilot.

From the Builder root:

```bash
node cli/audio-atlas.mjs inventory
node cli/audio-atlas.mjs songs
node cli/audio-atlas.mjs analyze dear-papa-song-brave-tongues --dry-run
node cli/audio-atlas.mjs analyze dear-papa-song-brave-tongues --transcribe --beats --acoustic
node cli/audio-atlas.mjs jobs dear-papa-song-brave-tongues
node cli/audio-atlas.mjs query RUN_ID --op=brief
node cli/audio-atlas.mjs query RUN_ID --op=timeline --asset=stem-1 --start=0 --end=480000
node cli/audio-atlas.mjs query RUN_ID --op=acoustic --q='spoken voice'
node cli/audio-atlas.mjs export RUN_ID
node cli/audio-atlas.mjs review RUN_ID --revision=0 --observation_id=OBS_ID --state=needs_review --reviewer=NAME --note=TEXT
```

Read/query operations are also available under `/api/echos/audio-atlas`: `inventory`, `songs`, `jobs?songId=…`, `jobs/:id`, `jobs/:id/query?op=brief|curves|timeline|lyrics|search|acoustic|evidence`, `jobs/:id/export`, `jobs/:id/review`, and `jobs/:id/audio/:asset`. POST `jobs` with `{songId,transcribe,beats,acoustic,pitch}` starts work; DELETE the active `jobs/:id` cancels it. POST review includes revision, observation_id, state, reviewer, note and optional correction `{start_sample,end_sample,text}`. Cancellation belongs to the creating process; the CLI's synchronous analyze run completes before returning. CLI review uses direct local ownership rather than HTTP auth. Pass `--correction='{"start_sample":100,"end_sample":200,"text":"candidate"}'` to append a correction with the same validation as UI/API.

All HTTP routes require existing Builder admin/session authorization. Browser access establishes a bounded same-origin session using the existing local UI session owner. Cross-origin requests fail closed. Audio streaming verifies the preserved file before delegating to the existing range server.

## Original and effective observation queries

Timeline, lexical search and evidence queries accept `view=original|effective`
(CLI: `--view=original|effective`). API and CLI default to original for compatibility;
the review UI defaults to **Use accepted corrections** and exposes **Original analysis**.
Both are projections of the same immutable run and append-only reviews.

Effective queries apply the latest explicit accepted correction before text/range
matching, chronological sorting and pagination. Half-open sample boundaries and
source clocks are retained. Proposals and flags do not replace an earlier explicit
decision. A rejection removes that observation from effective search/timeline,
but it remains directly addressable through evidence and visible in original mode.
Accept original explicitly restores the original text/timing. Accept corrected
text & timing explicitly accepts the proposed values. Neither overwrites source
bytes, supplied lyrics, original observations or an earlier review event.

Observation results include `original`, latest `review`, last explicit
`effective_review`, `correction_applied`, `rejected` and `query_view`. Applied
corrections are human assertions; the original model claim and provenance remain
available. Unreviewed candidates remain candidates. Brief, curves, lyrics and
acoustic-vector operations retain their original measured/raw meaning.

```bash
node cli/audio-atlas.mjs query RUN_ID --op=search --asset=stem-1 --q=book --view=effective
node cli/audio-atlas.mjs query RUN_ID --op=evidence --asset=stem-1 --q=OBS_ID --view=original
```

Reviews remain bound to their original analysis run. Cross-run reconciliation is
separate unfinished work. See [correction-query verification](CORRECTION_QUERY_VERIFICATION.md).

## Identity and timing contract

Analysis details includes **Open identities & time maps**. The versioned contract
distinguishes Song-owner references, unresolved compositions, local recording
instances, source bytes, decoded timelines and transformed views. It validates
typed current payloads, rational/piecewise coordinates, units, uncertainty,
independent execution/result/review states and dependency references.
`query --op=contract` returns a bounded summary; `--detail=full` and JSON export
include all observation envelopes. Originals and saved reviews remain unchanged.
Future extraction kinds remain explicitly unsupported until registered and
qualified. See [the contract and conformance limits](CONTRACT.md).

## Runtime and recovery

One analysis writer runs at a time. Node starts one Python file with an explicit argument array and `shell:false`; no inherited Node flags or provider credentials. Python sequentially runs ffprobe/ffmpeg children. Maximum process depth is two below Node; maximum simultaneous descendant count is two, excluding internal bounded library threads. CPU-library thread caps are one. There are zero automatic retries and no startup queue resumption.

Inputs are capped at 24 stems, 512 MiB total source bytes, 30 minutes per asset, eight channels and 512 MiB decoded bytes per asset. Each decoder subprocess has a 120-second timeout. Each sequential base/Beat This/CLAP/alignment phase has a 590-second Python alarm and 600-second Node timeout (at most four phases), process-group SIGTERM and two-second SIGKILL fallback. Completion waits for child exit. Crashed owners become interrupted, or orphaned while a recorded worker remains alive; do not start replacement work until that worker exits. Inspect recorded PIDs before any manual recovery. Shutdown cancels owned jobs, never unrelated services.

Runs live under `data/audio-atlas/runs/`, jobs under `data/audio-atlas/jobs/`. Originals, lyrics and source cuts are unchanged. Mutable stores/media/model paths/builds are not commit content. Cache identity includes original source hashes, declared lyrics/timing, worker/helper code, Python executable bytes, installed dependency METADATA, FFmpeg binary bytes and model hashes. Runtime upgrades therefore produce distinct keys; changing editable dependency source is outside this metadata-based identity. No cross-version reproducibility guarantee is made.

## Reuse and attribution

Owned: Atlas coordination, query/review API, UI and CLI. Adapted: Builder source inspector, owned-file lock, transient analyzer and reconstruction alignment helpers. Integrated upstream: FFmpeg decoding, NumPy measurements , [Beat This](https://github.com/CPJKU/beat_this) (MIT code and checkpoint), [LAION CLAP](https://huggingface.co/laion/clap-htsat-unfused) (Apache-2.0 model) via Transformers, and [MLX Whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) inference. Hapa does not claim authorship of those upstream tools or their reported performance.

See [discovery](DISCOVERY.md), [verification](VERIFICATION.md), [integration map](integration-map.json) and [batch reflection](REFLECTION.md).

## Optional music profiles

Private `data/audio-atlas/beat-model.json` has `{ "python": "<isolated runtime executable>", "checkpoint": "<final0.ckpt>" }`. Private `clap-model.json` has `{ "python": "<isolated runtime executable>", "modelPath": "<local CLAP snapshot>" }`. Paths are workstation configuration, not portable defaults. See the qualified dependency versions in [requirements-music-profile.txt](requirements-music-profile.txt). Installation and weight acquisition are separate operator setup; Analyze never downloads or installs.

Beat This 1.1.0 runs final0 on CPU, mono 22,050 Hz through upstream soxr HQ resampling, with a 50 Hz inference grid. Its grid resolution is not measured timing accuracy. CLAP uses `laion/clap-htsat-unfused` revision `8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a`, local-only model loading, a disabled Python network socket and no remote code. It creates normalized 512-dimensional vectors for 10-second master windows and 16 declared text concepts. Final-window zero padding retains the valid source span. Scores are cosine similarities, not probability or verified instrument presence. Queries do no new inference; choose an indexed concept or window ID. No stem embedding, general free-text retrieval or arbitrary semantic narration is claimed.

See [Brave Tongues review](BRAVE_TONGUES_REVIEW.md) for the actual run and listening checkpoints.


## Missing-media reconciliation

The checked inventory now finds200MP3s after correcting an alternate-container
sibling lookup and repairing one stale Zerbini source reference.139WAVs and
63stem sets remain unavailable within the bounded search. Exact role gaps,
source-preserving maintenance commands and evidence limits are recorded in
[missing-media reconciliation](MISSING_MEDIA.md).

## Upload missing files

The song directory and selected Atlas song now offer four file drop areas for full-song WAV/MP3 and WAV/MP3 stems. See [upload workflow and API/CLI parity](AUDIO_UPLOADS.md).


### Per-stem timing evidence — September 27 continuation

New analyses expose individual offset/drift candidates in Analysis details and
the brief API/CLI. Four Brave Tongues stems produced candidates; eight remain
unresolved. No alignment is applied. See [method, results and remaining gaps](STEM_ALIGNMENT.md).


### Forced word alignment — qualification in progress

An offline supplied-text aligner has run on two Brave Tongues excerpts and a
silence control. The tested validation module retains 37 interval candidates,
two unresolved zero-duration words, and rejects all silence placements. It now runs through the shared analysis UI/API/CLI with explicit excerpt controls
and unresolved-word review. See [workflow, evidence and quality limits](WORD_ALIGNMENT.md).


### Acoustic song structure

New measurements include source-bound novelty regions, repetition comparisons and
energy-change candidates using the existing local worker. Brave Tongues produces
14 boundary candidates,15 regions and19 transitions; no repetition pair crosses
the configured threshold. Musical qualification remains pending.
See [structure workflow, API/CLI and evidence](STRUCTURE.md).


### Local audio descriptions — qualification in progress

Pinned Qwen3-Omni has executed offline on a Brave Tongues excerpt and synthetic
silence. The silence hallucination is retained and rejected by the tested
source/evidence validator. Six interpretation axes remain unreviewed; description
execution is not wired into UI/API/CLI yet. See [probe and limits](SEMANTIC.md).
