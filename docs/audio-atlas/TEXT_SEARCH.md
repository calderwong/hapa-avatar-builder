---
title: Audio Atlas explicit text-to-audio search
status: first-pass-prototype; encoder compatibility verified; relevance unqualified
date: 2026-09-27
owner: hapa-avatar-builder
---

# Search audio by description

Open Audio Atlas, choose a song and a saved analysis that includes **Find sounds**.
In **Find sounds → Describe a sound**, enter a description, then press **Encode &
search locally**. Results cue the exact saved Master audio. Press Play in the
listening view. The existing 16-category lookup is still available without new
inference. Saved text searches reopen without encoding.

This searches audio embeddings, not supplied lyrics or filenames. Up to ten-second
Master windows are ranked by cosine similarity. Results are candidates, not sound
presence/absence assertions, probabilities, human approval, or verified lyrics.
English retrieval relevance has not been qualified; stem and album-wide embedding
search remain outside this slice.

## Shared interfaces

- `POST /api/echos/audio-atlas/jobs/:run/text-search` with `{text,limit}` explicitly
  encodes and returns a completed result. It may take up to two minutes.
- `GET` the same route lists up to 100 saved query attempts, newest first. Add
  `?id=QUERY_ID&limit=8` to read one result. GET never starts inference.
- `DELETE` that route cancels the query owned by the serving process for that run.
  An interrupted owner is never silently restarted; live orphan workers block new
  work. If a connection fails, refresh history before retrying.
- `node cli/audio-atlas.mjs search-text RUN_ID --text='soft guitar under a singing voice' --limit=8`
- `node cli/audio-atlas.mjs text-searches RUN_ID --id=QUERY_ID --limit=8`

HTTP routes reuse Builder session/admin authentication and exact-origin checks.
Only the requested immutable run's Master windows are ranked; a query from another
run cannot be read through this route. Existing preserved-source playback verifies
bytes before streaming. This is local-private access, not a new multi-user or
per-asset policy system. CLI uses the existing local filesystem owner boundary.

## Evidence and bounded execution

The existing local `laion/clap-htsat-unfused` model/text processor is reused. All nine
configured model/tokenizer files must have the exact hashes recorded by the audio
index, with the same revision, embedding-space ID and Transformers version. Vectors
must contain 512 finite normalized components. Incompatible, damaged, missing or
out-of-range evidence fails closed.

The description is 1–500 characters and at most 128 model tokens. The prompt is
`The sound of DESCRIPTION.` to match the original category encoding; no silent
truncation. Query identity includes immutable analysis content, exact trimmed text,
checkpoint, runtime metadata, worker and coordinator code. Limit changes do not
encode again. Concurrent identical calls coalesce; distinct queries and analysis
share the existing single writer lock. Completed caches verify both result and raw
embedding hashes. Corrupt attempts stay preserved and a new explicit attempt may
replace their use.

Artifacts live in ignored `data/audio-atlas/text-searches/QUERY_ID/`: manifest,
job receipt, raw text embedding and ranked result. Up to 256 attempts are retained;
at that budget new queries refuse. Automated pruning/portable query export is not
implemented. Results bind source hash, timeline, integer sample spans, model space,
raw evidence hash and score semantics. Opening the UI or history does not encode.

Process graph: existing Builder/CLI owner → one Python CLAP worker, no intended
worker children, no shell, no retries. Existing argv/environment allowlist and
worker-role marker are reused, with one-thread limits and offline model loading.
Owner timeout is 120 seconds; text phase alarm is 110 seconds. Abort/timeout sends
process-group TERM then KILL after two seconds and waits for exit. Checkpoint/model
load is covered by the owner timeout. No model downloads, installs, paid APIs or
source uploads. A lost browser connection does not establish cancellation.

## September 27 evidence

Real saved Brave Tongues run `af324ed0-1e0e-40e3-abd2-92f68c5c95b0`, 25 windows:

- `singing voice`: maximum component difference from the original category vector
  `1.043081283569336e-7`; encoding 3.751 seconds.
- `soft guitar under a singing voice`: encoding 2.770 seconds. Top windows
  3:40–3:50 (0.5694), 0:30–0:40 (0.5461), 1:00–1:10 (0.5289).
- Exact repeat reused the saved query; read API matches the shared owner.
- All 13 preserved sources and the immutable original result remained unchanged.
- 41 focused JS checks and production build pass, including real child timeout /
  abort exit, shared lock, identity changes, tamper rejection and route auth.
- Actual browser query `drums under a singing voice` encoded in 3.778 seconds;
  visible loading/cancel controls, completed matches and exact Master cue at
  60 seconds were verified. Saved guitar/vocal results reopen with the explicit
  “saved result loaded” label. CLI repeat also returned the same cached query.
- No model workers remained after the CLI/test runs. Broader native/repository
  acceptance and focused completion commit remain pending from the Atlas goal.

These timings are individual measurements, not latency percentiles. Numerical
encoder compatibility does not establish musical relevance. Human relevance and
broader query/song qualification remain open; this card is in progress.

## Reuse decision and learning delta

Objective: replace the fixed-vocabulary restriction with useful explicit queries.
Reused the existing CLAP checkpoint/worker, immutable run, lock, authentication,
source playback, UI client and query owner. Extended them with a bounded text-only
operation and durable search evidence; no additional model, daemon or media store.

The staged concurrent-cache draft looked correct for a single caller but could
lose the second caller's results after cleanup and truncate to the first caller's
limit. Capturing the shared promise and reading the full persisted result after
completion fixes both. A two-caller regression now verifies different limits.
Guardrail: numerical space compatibility and cache correctness need independent
checks; a plausible ranked passage does not prove either or establish relevance.

Reusable Lesson Card candidate, attributed to Codex task
`01a0e4d5-31d6-74f0-ab17-f838cf3f0992`: separate explicit query inference from
read-only retrieval and retain source/model identity through every playable span.
