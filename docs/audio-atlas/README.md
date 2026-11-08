---
title: Audio Atlas in Hapa Avatar Builder
status: first-pass-prototype; partial design-pack implementation
date: 2026-09-27
updated: 2026-11-07
owner: hapa-avatar-builder
---

# Audio Atlas

Audio Atlas is the song-analysis workspace built into **Hapa Avatar Builder →
Echos Album → Open audio workspace**. It is part of the
[Builder repository](https://github.com/calderwong/hapa-avatar-builder), not a
separate app, server installation or Song Library. The original Audio Atlas design
pack was integrated into Builder; [discovery](DISCOVERY.md) records that decision
and the pack's missing material.

Builder's Song store owns song identity, written lyrics and stem references.
Atlas owns source-bound analysis runs and observation reviews. Its whole-song
lyric workflow explicitly promotes and syncs qualified timing into Song Cards
and Director projects; viewing or analyzing a song alone does not do that.
Historical saved cuts retain their timing unless an explicit repair creates a
new child cut. See [whole-song lyric timing](LYRIC_TIMING.md).

This guide describes the source implementation reviewed on November 7, 2026.
It does not certify a running installation or musical accuracy. The capability
remains a first-pass prototype and a partial implementation of the design pack.

## Where it lives

| Surface | Owner in this repository |
| --- | --- |
| Echo Album host | [`HapaEchosView.jsx`](../../src/components/HapaEchosView.jsx) |
| Analysis workspace | [`AudioAtlasPanel.jsx`](../../src/components/AudioAtlasPanel.jsx) |
| Shared engine | [`server/audio-atlas.mjs`](../../server/audio-atlas.mjs) |
| Protected HTTP routes | [`server/audio-atlas-routes.mjs`](../../server/audio-atlas-routes.mjs), mounted under `/api/echos/audio-atlas` |
| Command-line interface | [`cli/audio-atlas.mjs`](../../cli/audio-atlas.mjs) |
| Base measurement/transcription worker | [`scripts/audio-atlas-worker.py`](../../scripts/audio-atlas-worker.py) |
| Whole-song timing orchestration | [`scripts/atlas-lyric-timing.mjs`](../../scripts/atlas-lyric-timing.mjs) |
| Feature owners and limits | [Integration map](integration-map.json) |

Launch Builder using the [repository run instructions](../../README.md#run).
The hosted static demo does not supply a Python runtime, models or private audio.
There is no separate Audio Atlas launcher to install.

## Implemented

- Source hashes, decoded timeline identity, provenance and hash-checked source custody. Existing storage behavior and its policy gap are documented under [Storage and recovery](#storage-and-recovery).
- Per-channel waveform extrema, RMS and sample peak; spectral centroid and energy transients at 100 ms windows. Transients are not beats. Integer half-open sample queries retain source clocks and the actual final frame length.
- Master/stem inspection, complete-stem reconstruction lag diagnostics and residual measurement. No automatic origin correction; individual stem origins remain unverified.
- Optional offline MLX Whisper vocal transcription with word candidates, model/weight/config hashes, raw evidence, uncalibrated scores and explicitly unknown timing uncertainty. Supplied lyrics and previously imported timing remain separate.
- Optional offline Beat This beat/downbeat candidates and CLAP master-window audio/text embeddings with fixed-concept, explicit free-text and audio-to-audio cosine retrieval.
- WAV, MP3 and WAV/MP3-stem-role file badges in Songs Directory and selected-song file details, with recheck and per-file detail. Checks use readable headers, registered paths, exact basename counterparts and numbered role matches within registered stem folders (512 entries maximum; no recursive discovery).
- Durable jobs, progress, cancellation, content-key reuse, result-integrity validation, source-bound playback, range/lexical/evidence queries and JSON export.
- Append-only review history and sample-boundary/text correction proposals with revision conflicts. Human acceptance is an explicit review action; machine candidates are not automatically accepted.
- UI, API and CLI share `server/audio-atlas.mjs`. Review histories stay attached to their immutable runs, selectable in the UI.
- Supplied-text Qwen3 forced alignment and whole-song timing assembled from bounded excerpts; transcription evidence is matched to the written lyrics, including separate lead/backing voices. Promotion and sync preserve written text and hold unresolved passages unless the exact operator-decision gate is satisfied. See [LYRIC_TIMING.md](LYRIC_TIMING.md).
- Pitch-derived notes and melody candidates, rhythm, harmony, source activity, spectrograms and acoustic structure, each with its own evidence and limits.
- Explicit local Qwen3-Omni descriptions of source excerpts through the UI, API and CLI, with separate interpretation fields and human review. See [SEMANTIC.md](SEMANTIC.md).
- Saved analysis feeds downstream [Score Dust visual scores](../ECHO_SCORE_DUST.md) and [Song Health](../ECHO_SONG_HEALTH.md); a completed Atlas job alone does not establish a healthy song.

Not implemented or not qualified: phoneme/syllable alignment, speaker diarization,
the generic typed note-observation/correction contract, and full design-pack
conformance. Notes do exist as a derived pitch view; that does not establish
accurate polyphonic transcription. Audio descriptions are bounded, unqualified
interpretations, not unrestricted authoritative narration. Beat correctness,
instrument labels, lyric boundaries and musical interpretation still require
appropriate listening/quality review.

## Operator path

Open **Echos Album → Open audio workspace**, choose a song, then select a source.
Existing completed runs load without new inference. If no usable run exists,
open **Analysis settings & saved runs**, select the configured analysis options,
and press **Analyze locally / reuse matching result**. Review the actual source
audio alongside its results. The historical Brave Tongues examples below require
the private local song, sources and saved runs; they are not bundled fixtures.

- **Review moments:** a paginated 40-row list and immediately revealed inspector. Type a word to search the whole selected source; Clear search returns to the 30-second window. Select a moment to cue the player, then press Play. Corrections use seconds and convert to validated source samples; they remain flagged until explicitly accepted by a person. Name and note are required.
- **Find sounds:** describe a sound and explicitly encode/search locally, or choose a saved category. Cue ranked Master passages and reopen saved searches without inference. Scores express similarity, not certainty. See [workflow and evidence](TEXT_SEARCH.md).
- **Lyrics:** compare written text with the unreviewed vocal transcript. To deliver whole-song timing, follow [the separate plan → align → assemble → promote → sync workflow](LYRIC_TIMING.md); recognizer output must not replace the written lyrics.
- **Descriptions:** select an excerpt of up to 30 seconds and explicitly press **Describe locally**. Review caption, style, production, lyrical meaning, vocal delivery and musical mood separately. Saved results reopen without inference; missing configuration is reported. See [setup and interfaces](SEMANTIC.md).
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

The adapter expects `weights.npz` and `config.json`, verifies both, disables Hugging Face downloads/telemetry and blocks Python socket connections during inference. It never installs dependencies or downloads weights. Transcription defaults to English; API `transcriptionLanguage` and CLI `--transcription-language=auto` support auto-detection. This does not qualify every language. Supplied-text forced alignment still requests English; see [language and timing limits](LYRIC_TIMING.md#limits).

Optional features require their own already-installed runtimes and private
configuration under `data/audio-atlas/`: `alignment-model.json` for Qwen3 forced
alignment, `beat-model.json` for Beat This, `clap-model.json` for CLAP,
`pitch-runtime.json` for pYIN and `semantic-model.json` for the pinned Qwen3-Omni
listener. Consult [alignment](WORD_ALIGNMENT.md), [pitch](PITCH.md),
[descriptions](SEMANTIC.md), and the music-profile notes below for each schema.
An `npm install` alone does not provision these models. Do not copy another
machine's absolute runtime paths or treat a model version listed in an old
verification report as an installation recipe.

From the Builder root (replace song/run/source IDs with your own):

```bash
node cli/audio-atlas.mjs inventory
node cli/audio-atlas.mjs songs
node cli/audio-atlas.mjs analyze dear-papa-song-brave-tongues --dry-run
node cli/audio-atlas.mjs analyze dear-papa-song-brave-tongues --transcribe --beats --acoustic
node cli/audio-atlas.mjs jobs dear-papa-song-brave-tongues
node cli/audio-atlas.mjs query RUN_ID --op=brief
node cli/audio-atlas.mjs query RUN_ID --op=timeline --asset=stem-1 --start=0 --end=480000
node cli/audio-atlas.mjs query RUN_ID --op=acoustic --q='spoken voice'
node cli/audio-atlas.mjs search-text RUN_ID --text='soft guitar under a singing voice' --limit=8
node cli/audio-atlas.mjs descriptions RUN_ID
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

## Storage and recovery

One analysis writer runs at a time. Node starts one Python file with an explicit argument array and `shell:false`; no inherited Node flags or provider credentials. Python sequentially runs ffprobe/ffmpeg children. Maximum process depth is two below Node; maximum simultaneous descendant count is two, excluding internal bounded library threads. CPU-library thread caps are one. There are zero automatic retries and no startup queue resumption.

An analysis admits at most 24 stems from one selected set, one record per role,
with WAV preferred; duplicate roles/files are rejected. The base decoder limits
each asset to 30 minutes, eight channels and 512 MiB decoded bytes. There is no
current aggregate 512 MiB source-custody cap: that old README claim was stale.
Each decoder subprocess has a 120-second timeout. Selected base, Beat This, CLAP,
alignment and pitch phases execute sequentially with per-phase bounds (normally
a 590-second Python alarm and 600-second Node deadline), process-group SIGTERM
and two-second SIGKILL fallback. Completion waits for child exit. Crashed owners become interrupted, or orphaned while a recorded worker remains alive; do not start replacement work until that worker exits. Inspect recorded PIDs before any manual recovery. Shutdown cancels owned jobs, never unrelated services.

Current code preserves sources by digest plus extension under
`data/media/audio-atlas/`, reusing existing verified files. Runs live under
`data/audio-atlas/runs/`, jobs under `data/audio-atlas/jobs/`; supplemental text
searches and descriptions have separate bounded-count histories. Those paths
describe the implementation, not a guarantee of aggregate storage enforcement.

The adopted [Hapa storage-placement protocol](https://github.com/calderwong/hapa/blob/main/docs/STORAGE_PLACEMENT.md)
requires registered external storage for full-size media/evidence in the Silicon
Nexus workflow, shared byte caps and no silent SSD fallback. Atlas's current
path-based custody and per-asset decode limits do not by themselves satisfy that
whole-task policy. Migration and aggregate budget enforcement remain separate
work; do not launch a large intake based on this documentation update. No media
migration, deletion or worker resumption is part of this documentation revision.
See Builder's [backup retention contract](../BACKUP_RETENTION.md).

Originals, lyrics and source cuts are unchanged. Mutable stores/media/model paths/builds are not commit content. Cache identity includes original source hashes, declared lyrics/timing, worker/helper code, Python executable bytes, installed dependency METADATA, FFmpeg binary bytes and model hashes. Runtime upgrades therefore produce distinct keys; changing editable dependency source is outside this metadata-based identity. No cross-version reproducibility guarantee is made.

## Reuse and attribution

Owned: Atlas coordination, query/review API, UI and CLI. Adapted: Builder source inspector, owned-file lock, transient analyzer and reconstruction alignment helpers. Integrated upstream: FFmpeg decoding, NumPy measurements , [Beat This](https://github.com/CPJKU/beat_this) (MIT code and checkpoint), [LAION CLAP](https://huggingface.co/laion/clap-htsat-unfused) (Apache-2.0 model) via Transformers, and [MLX Whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) inference. Hapa does not claim authorship of those upstream tools or their reported performance.

See [discovery](DISCOVERY.md), [verification](VERIFICATION.md), [integration map](integration-map.json) and [batch reflection](REFLECTION.md).

## Optional music profiles

Private `data/audio-atlas/beat-model.json` has `{ "python": "<isolated runtime executable>", "checkpoint": "<final0.ckpt>" }`. Private `clap-model.json` has `{ "python": "<isolated runtime executable>", "modelPath": "<local CLAP snapshot>" }`. Paths are workstation configuration, not portable defaults. See the qualified dependency versions in [requirements-music-profile.txt](requirements-music-profile.txt). Installation and weight acquisition are separate operator setup; Analyze never downloads or installs.

Beat This 1.1.0 runs final0 on CPU, mono 22,050 Hz through upstream soxr HQ resampling, with a 50 Hz inference grid. Its grid resolution is not measured timing accuracy. CLAP uses `laion/clap-htsat-unfused` revision `8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a`, local-only model loading, a disabled Python network socket and no remote code. It creates normalized 512-dimensional vectors for 10-second master windows and 16 declared text concepts. Final-window zero padding retains the valid source span. Scores are cosine similarities, not probability or verified instrument presence. The read-only `query --op=acoustic` operation searches saved concepts or window
IDs without new inference. Explicit `search-text` / **Encode & search locally**
encodes a new text query in the same pinned CLAP space, then reuses its saved
result. Stem embedding and album-wide embedding search are outside this slice;
free-text retrieval within the selected run is implemented. Qwen3-Omni
descriptions are a separate operation, not a CLAP capability.

See [Brave Tongues review](BRAVE_TONGUES_REVIEW.md) for the actual run and listening checkpoints.


## Missing-media reconciliation

The September 27 reconciliation reported 200 MP3s found, with 139 WAVs and
63 stem sets unavailable within that bounded search. These are historical
observations, not today's inventory. Use `inventory` or the directory's recheck
for current results; unknown is not missing. See [the dated reconciliation and
its evidence limits](MISSING_MEDIA.md).

## Upload missing files

The song directory and selected Atlas song now offer four file drop areas for full-song WAV/MP3 and WAV/MP3 stems. See [upload workflow and API/CLI parity](AUDIO_UPLOADS.md).


### Per-stem timing evidence — September 27 continuation

New analyses expose individual offset/drift candidates in Analysis details and
the brief API/CLI. Four Brave Tongues stems produced candidates; eight remain
unresolved. No alignment is applied. See [method, results and remaining gaps](STEM_ALIGNMENT.md).


### Forced word alignment — original excerpt evidence

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


### Local audio descriptions — integrated; quality review remains open

Explicit description jobs now use the shared Atlas owner, UI, protected API and
CLI. The original Qwen3-Omni probe's silence hallucination remains a documented
failure; integration does not erase it or certify interpretation accuracy.
See [current operation and historical evidence](SEMANTIC.md).

## Documentation map and verification scope

- Start here for ownership, setup and the operator route; use [LYRIC_TIMING.md](LYRIC_TIMING.md) for current whole-song timing and [integration-map.json](integration-map.json) for source owners.
- Feature guides above describe their own methods and quality limits. [CONTRACT.md](CONTRACT.md) defines source identity, coordinates and uncertainty.
- [VERIFICATION.md](VERIFICATION.md), [UI_VERIFICATION.md](UI_VERIFICATION.md), [BRAVE_TONGUES_REVIEW.md](BRAVE_TONGUES_REVIEW.md) and [REFLECTION.md](REFLECTION.md) preserve dated evidence. Their pass counts, missing files, acceptance blockers and example runs are checkpoint facts, not a live health report.
- [PACK_INPUT_AUDIT.md](PACK_INPUT_AUDIT.md) and [DISCOVERY.md](DISCOVERY.md) distinguish the supplied design pack from the implemented subset.

This revision reconciles documentation with source. It does not rerun audio
inference or grant human listening acceptance.
