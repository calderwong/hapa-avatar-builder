# Echo saved-cut opening and lyric source truth — 2026-08-11

## Objective

Make every saved Echo Director cut open as an editable copy even while its exact final-render certificate is pending, and distinguish genuinely missing lyric sources from a broken lyric overlay.

## Evidence inspected

- The Director selector showed multiple saved cuts but reverted to Legacy because `execution_preview.status: "preparing"` removed `director_show_graph` from the server projection.
- The source cut timelines and fingerprints were present; the missing artifact was only the per-cut final-render certificate.
- The album lyric audit found 172 projects: 157 source-backed timed projects, 14 declared instrumentals with lyrics disabled, and 15 non-instrumental projects with neither source lyric text nor timing. `Clouds Carry` and `Appa Checkin' In` are in that last group.
- The signed-in Suno backup metadata for those records contained title, audio URL, and duration but no lyric payload.

## What changed

- Saved-cut selection now creates a deterministic local editor graph from the saved timeline when no Legacy graph is already loaded. This graph is only a copy-on-write editing template.
- A local editor graph leaves Song Card rendering in a `certifying:<cut>` wait state; it cannot silently render the fallback or an older cut.
- The Director header explicitly displays `SOURCE LYRICS MISSING` when Lyrics is on but there are no source-backed timed lines.

## Guardrail and reuse

Use the local editor fallback for authoring only. The exact saved-cut certificate remains the sole authority for final rendering. Do not generate lyric text or timing from title/audio metadata; repair the 15 tracks only from a captured Suno lyric source or an approved source file, then run the existing lyric-timing sync.

## 2026-08-11 source recovery checkpoint

The initially discovered `lyrics.txt` files for the fifteen tracks were all zero-byte placeholders, so they were not a recoverable source. The signed-in Suno Lyrics tabs did expose lyric text for every exact Song ID. The importer records that visible source text with Suno URL, stable ID, SHA-256, and local source file; it deliberately leaves timed overlays pending measured alignment.

The lyric audit also reads Director-level source text, so imported lyrics are reported as `timed-lyrics-missing` rather than incorrectly labelled as absent source text.

## 2026-08-13 LitRPG Life playlist delta

The live Echoes From The Other Eras playlist exposed one new track not yet present in the Builder: `LitRPG Life` (`4b9f48b5-3ca9-416e-b88e-75fd223a1dca`). The operator downloaded its MP3 locally; the import preserved the Suno source URL, duration, MP3 custody path, and visible lyric-source SHA without claiming WAV or stems. The generic Director planner initially created uniform, synthetic cue times, so those cues were removed. The source lyrics remain available for inspection and await measured audio alignment before any lyric overlay is rendered.

Guardrail: a recovered lyric source authorizes readable source text, not timed captions. Every newly imported Song must clear generated cue timing unless the timing derives from an approved exact-audio alignment source.

## 2026-08-13 measured timing synchronization checkpoint

The recovered lyric sources for sixteen non-instrumental tracks were aligned against their local full-mix audio with Whisper large-v3-turbo. Thirteen timing sidecars cleared the automatic promotion gate (confidence at least 0.60, non-overlapping timed lines, source/STT sidecars, and audio/lyric provenance hashes) and were copied into the local Suno playlist backup before being synchronized into the matching Song Registry cards and Director projects.

`Clouds Carry` (0.204), `Oie-Oie-Oie` (0.000), and `Tired Eyes` (0.468) did not clear that gate. They remain readable source lyrics with no timed overlay; they are not silently approximated or rendered as captions. The post-sync audit reports 170 verified projects and 3 repair-required projects, with zero synthetic timing projects.

The reusable publisher now evaluates generated timing artifacts before copying them to the playlist’s `lyric_timings` folder, backs up any replaced sidecars, and emits a report. The timing synchronizer accepts an optional exact registry-track allowlist, so a repair run cannot rewrite unrelated Echo songs.

## 2026-08-13 descriptions-and-palettes Director pass

The nearest reusable surface was the append-only enrichment Director compiler. Its derived optical overlay carries the existing agent/human proposal descriptions and frame palettes as proposal evidence; it does not promote that evidence to human-approved direction. A stale overlay fingerprint initially stopped the run before any cut write. Rebuilding the overlay from the current review store restored its integrity receipt.

The full 173-song compiler exceeded the interactive execution window during its global selection stage. Rather than bypassing the immutable-parent or index-parity guards, the compiler now accepts an exact `--song-ids` allowlist. Nine serialized batches (20/20/20/20/20/20/20/20/13) created or replay-verified a palette-aware Direction cut for every song: 156 new append-only cuts and 17 already-identical replays, covering 10,480 shots. Every batch passed exact song coverage, unique-cut, ready-status, immutable-base, immutable-existing-variant, and persisted-index parity checks.

`LitRPG Life` was the only newly imported project without a parent cut; a standard balanced append-only parent was created before its enrichment cut. Guardrail: never force an enrichment cut onto a project with no ready non-legacy parent. Seed a normal append-only parent first, then compile the proposal cut. The large Ref Cards family audit exhausted Node's default memory limit on the enlarged index, so per-batch parity receipts are the current verification evidence; rerun that audit with an explicitly increased Node heap before using it as a final family-wide certificate.
