# Echo Album update protocol

Status: active Avatar Builder handoff contract (2026-08-24)

In this repository, **“Update the Echo Album”** means the complete six-stage operation below for the exact current signed-in Suno playlist. Playlist metadata reconciliation by itself is not completion.

## Ordered stages and admission gates

1. Download and validate an exact-song **MP3** master.
2. Download and validate an exact-song **WAV** master independently.
3. Download and validate the latest complete **stem family** when Suno exposes stems. Preserve “source unavailable” as an explicit state.
4. Download and hash real **lyrics**, or preserve a source-declared instrumental state. Empty placeholders fail.
5. Run full-mix/stem telemetry and **measured lyric alignment**. Actual lyric timing must be non-synthetic, confidence `>= 0.60`, non-overlapping, backed by source/STT sidecars, and bound to audio/lyrics hashes.
6. Use that analysis to generate an append-only **Director music-video script**, then preflight its exact media and rendering graph.

A song must expose the status of every stage. No later stage converts an earlier failure into success. A Director project that only has a default Legacy script is stage 6 incomplete.

## Division of ownership

- The authenticated Suno surface owns source discovery and signed downloads.
- Hapa Song Registry owns byte/container validation, local song/stem custody, actual timing and telemetry receipts, and the manifest-scoped inventory.
- Avatar Builder owns Director script generation, append-only variants, renderer/media preflight, and visible blocked state.

The Registry's canonical gate definitions and fast one-song upsert live at `$HAPA_SONG_REGISTRY_ROOT/docs/ECHO_ALBUM_UPDATE_CONTRACT.md`. Its current inventory is `$HAPA_SONG_REGISTRY_ROOT/docs/audits/2026-08-24-echo-album-library-inventory.md`.

## Builder admission rule

Before generating a new Director script, resolve the exact Suno song ID and require:

- validated MP3 and WAV custody paths;
- complete validated stems, or an explicit Suno-source-unavailable stem state;
- source lyrics or declared instrumental truth;
- complete audio/stem telemetry;
- promotable actual lyric timing for non-instrumentals;
- current content hashes tying analysis to the selected master and lyrics.

If any requirement is absent, preserve the prior project and write a visible blocked receipt naming the failed stage. Do not silently fall back to Legacy, uniform timing, metadata-only cues, or a different audio derivative.

## Incremental operation

Playlist identity is the Suno UUID, not folder number or current ordering. New or repaired songs flow through exact-ID stages and then receive a targeted Song Registry upsert. The Director generator should accept an exact song-ID allowlist and mutate only those projects. Whole-album regeneration is reserved for an explicitly requested global policy change.

Changing master audio or lyrics invalidates downstream analysis/Director receipts unless stored hashes still match. Reordering the playlist does not.

## Validation and completion receipt

The final receipt must list, per exact song ID: MP3 path/hash/probe, WAV path/hash/probe, stem availability and validated count, lyric source/hash or instrumental flag, analysis run IDs/confidence/hashes, Director variant ID/hash, and preflight status. Summary counts must distinguish missing, invalid, source-unavailable, blocked, and complete.

## Process safety

The Registry inventory and targeted updater spawn no child processes and use one worker. Downloaders, ffmpeg analyzers, and Director batch tools must declare bounded concurrency, retries, temporary-file ownership, and exact song-ID scope before execution. Do not run an album-wide batch when a one-song allowlist is sufficient.
