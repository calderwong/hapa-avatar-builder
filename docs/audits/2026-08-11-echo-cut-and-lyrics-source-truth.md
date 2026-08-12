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
