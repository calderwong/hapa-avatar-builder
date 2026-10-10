# Audio descriptions — listener qualification in progress

First-pass prototype, September28,2026. Card `atlas-gap-semantic` is In Progress.
Source task: `01a0e4d5-31d6-74f0-ab17-f838cf3f0992`.
This is an executed adapter probe and tested proposal contract. Description
execution is **not yet connected to Builder's UI/API/CLI**.

## Actual result and limits

The existing local Qwen3-Omni runtime analyzed the Brave Tongues Master excerpt
at source seconds26–41. No title, lyric text or imported stem names were supplied.
It returned descriptions on six independent axes: caption, style, production,
lyrical meaning, perceived vocal affect and musical mood. In the structured
probe, inference took7.073seconds; one initial prose probe took4.748seconds.
These are observations from individual runs, not a performance qualification.

**The silence control failed acoustically.** Five seconds containing80,000 exact
zero samples elicited a claimed sustained low note and a calm/ambient mood.
Its raw response is preserved; the new measured-input validator abstains on all
six axes. Quiet nonzero audio is not automatically labelled absent. Broader
near-silence, adversarial sound, speech, music and stem accuracy remain untested.

The model also supplied gender wording despite instructions to avoid it, and the
first probe inferred centered placement from mono input. Model prose does not
establish those claims. Advisory flags expose known wording risks; they are
neither exhaustive detection nor a substitute for listening review. Five of the
structured song's six axes carry the identity-wording flag. Its lyrical account
resembles the imported verse but does not establish transcription accuracy or
authorial meaning. No human judgment or accepted correction was fabricated.

## Source and runtime identity

Integrated upstream: [Qwen3-Omni](https://github.com/QwenLM/Qwen3-Omni), the
[MLX-community4bit checkpoint](https://huggingface.co/mlx-community/Qwen3-Omni-30B-A3B-Instruct-4bit),
and the existing [yuhuanowo MLX-VLM fork](https://github.com/yuhuanowo/mlx-vlm).
The Hapa Qwen3-Omni node owns the installed isolated runtime; Atlas reuses its
libraries without modifying that node or restarting its shared gateway.
Hapa owns the probe harness, source/evidence validation and review boundary.

- Checkpoint revision: `93b3cbddd65ed4babff8f22fba491cdba7a21778`,17files individually SHA-256 pinned.
- MLX-VLM0.6.3 fork commit: `69acca1d10c231123c0f75fdd29109ac453f1ed3`;807MLX-VLM/MLX-LM Python source files individually pinned and checked before each run.
- Observed packages: MLX0.31.2, MLX-LM0.31.3, Transformers5.12.1, Torch2.12.0, NumPy2.4.6, SciPy1.17.1. No installs or upgrades occurred.
- Master source hash: `3cfcdb8f8ffef8f7ce1bfe6f5670cb337690b937b7bd1a231d133d26f58a27b5`.
- Source run: `8018fabb-8514-45e3-bc11-a42ea8ee3ab2`,48kHz stereo; samples1,248,000–1,968,000.
- Input view: arithmetic channel mean, SciPy polyphase Kaiser5 resampling to16kHz,240,000float32samples; no normalization. Exact input hash: `e477eaf3266e1b268785ea9ba1d8cd357a3d2b813adf43f606eb6e25a3a6d287`.

All13original and preserved source hashes and the saved source result remain
unchanged. The listening-only PCM16 derivative has zero clipped samples and is
distinct from the float32 inference input. Model-generated wording never changes
source timestamps, accepted lyrics, source identity or Director timing.

## Validation owner

`server/audio-atlas-semantic.mjs` validates a ready source and integer sample
range of at most30seconds. It accepts exactly six separately typed axes with
description, model-cited audible cues and model-reported uncertainty text.
One complete Markdown JSON fence is normalized with a disclosed framing field;
incomplete, mixed or extra schemas abstain. Token-limit truncation abstains.
Source/model-input duration and evidence digests are required.

Each candidate cites the entire input excerpt in its original source clock.
These citations show which audio was supplied; model-cited cues remain unverified
claims, not independently measured events or exact internal timestamps. Confidence
is null, review state unreviewed, and quality qualification false. Synthetic
controls remain explicitly synthetic. Original response bytes and digest remain
available even when all candidates abstain.

Eight focused tests pass, covering range/identity, axis separation, schema
framing, digital-silence hallucination, nonzero quiet input, truncation, mismatched
input evidence and advisory flags. Replaying both actual outputs through this
canonical owner yields six unreviewed song candidates and zero silence candidates.
The pure validation module does not start inference or fetch models.

## Process and offline proof

One file-based Node owner starts one isolated Python worker using the existing
runtime under macOS `sandbox-exec` with `deny network*`. The worker demonstrates
permission-denied connects to loopback and an external test address before imports.
An additional Python audit rejects socket connection/resolution and new processes;
offline/telemetry environment controls and local-only, remote-code-disabled loading
remain enabled. Models and libraries are read from existing files.

One worker loads one model and executes at most two serial cases; token limits
are700for the initial probe and1,100per structured case. Worker alarm570seconds,
owner deadline600seconds, process-group TERM then KILL after2seconds, retries0.
Both recorded workers exited and are absent; the shared Qwen gateway and task
Atlas preview remain alive. No speech audio, subprocess or extra service is created
by the model worker. The probe's small local artifacts are intentionally retained.

Task evidence under `work/audio-atlas-2026-09-27/semantic/`: manifests, exact
worker source, raw responses, model-input arrays, process receipts, verification
and `REVIEW.md` with the listening excerpt. These private source/runtime artifacts
are not application commit content.

## Next work and learning delta

Reuse Atlas's existing lock, immutable supplemental-job history, bounded worker,
cancellation, sample-range player and shared API/CLI owner to integrate explicit
description requests. Save actual source observations alongside the audio citation;
offer readable per-axis review and raw evidence without replacing accepted data.
Qualify representative stems, speech and music; preserve human quality gates.
The full card, broader/native acceptance and focused completion commit remain open.

Lesson candidate: a fluent audio listener can invent sound in exact silence and
ignore output constraints. Prompt instructions alone are insufficient. Preserve the
failed output, validate measured inputs and schemas outside the model, and keep
interpretations distinct from measurements. A successful local/offline execution
qualifies the execution path, not its musical accuracy.
