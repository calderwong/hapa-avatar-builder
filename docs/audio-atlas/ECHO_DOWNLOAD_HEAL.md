# Echo Album download heal

Companion to `AUDIO_UPLOADS.md`.

## Bulk heal from a download folder (2026-10-08)

For many songs at once, `scripts/plan-echo-download-heal.py` plans and
`scripts/apply-echo-download-heal.mjs` applies the same four-slot attachment
as this panel. Matching is by exact Suno ID (UUID-named WAVs, the MP3's
embedded Suno comment for renamed songs, or the playlist manifest title) and
is always confirmed by measured duration (±0.75 s; MP3s are decoded because
VBR stems lack length headers). Only empty master slots are filled.
`.m4a` files are ignored.

A downloaded stem set whose WAV and MP3 archives contain the same roles
becomes the song's current stems: prior stem records move to
`song.stemHistory` (never deleted), and each role carries both `wavPath` and
`mp3Path` with WAV preferred. A single-format download is attached only to a
song with no stems; otherwise it is held so the existing MP3 set is not lost.
Analysis bound to the old stems is not rewritten and should be re-run.

The applier writes the same record fields as the upload service under the
same store lock, but publishes one transaction with one store backup and one
`data/merge-reports/echo-download-heal-*.json` receipt (source, archive member,
destination, SHA-256). Extracted stems are moved and master WAVs hard-linked
into `song-audio-uploads/`, so custody costs no extra disk. Dry-run is the
default; pass `--apply`. Genuinely new songs go through `npm run
echo:song-ingest` instead.

First run: 1,374 files across 75 songs; complete four-slot songs 1 → 72 of
201, no slot regressions. Hey Sister (`47f48e32`) was registered through the
song ingest. Ghost Tea.V, Ruff Waters, The Fussy Sissy and Vēritātem volō are
renamed Suno titles of Ghosts Watching T, Paddle Board Pisces, Sisyphus on the
Climb, Climb. and Gnow Her.
