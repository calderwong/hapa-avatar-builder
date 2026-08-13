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
