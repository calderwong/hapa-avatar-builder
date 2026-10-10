# Add missing song audio files

Prototype, September 27, 2026. Source: Calder’s request in task
`01a0e4d5-31d6-74f0-ab17-f838cf3f0992` to attach full-song WAV, full-song
MP3, WAV stems and MP3 stems through the Echo Album UI.

## Human workflow

Open **Echos Album → Audio Atlas → choose a song → Add audio files**.
The same panel is available in **Songs Directory → song Details**.
Each of the four areas shows local availability. Drop files into the matching
area, or use its file chooser. Full-song areas accept one file per format;
stem areas accept multiple extracted files. Review the song title and each
stem role, then choose **Save files to this song**.

Exact numbered role filenames suggest a role; ambiguous filenames require a
role to be entered. Suggestions are editable. Duplicate role/format pairs in
a batch cannot be saved. Existing available slots require an explicit
replacement checkbox. Old media files remain intact. A successful file is
marked Saved; partial failures retain earlier successful attachments and
refresh status before a manual retry. Keep the song open while saving.

Limits: WAV/WAVE and MP3 files, 1 GiB each, 48 staged files, two concurrent
server uploads, 48 stem records per song. ZIP archives are not accepted by
this panel. Counts mean **registered roles**; no universal 12-stem expectation
is invented when the song has no declared set. Header recognition does not
certify full decoding, original lossless provenance, song identity or timing
alignment. Adding files does not recompute or rewrite saved analysis.

## Ownership and interfaces

Builder remains the song-store owner. `server/song-audio-upload.mjs` streams
uploads into `song-audio-uploads/` beside the configured song store. UUID
filenames prevent submitted names or song IDs from becoming filesystem paths.
No transcoder, subprocess, model call, external upload or Suno download runs.
A byte digest, original filename, source label and upload time accompany each
attachment. WAV and MP3 references coexist on the same role record; WAV is the
preferred local analysis source. The legacy single localPath is preserved as
an explicit format reference before changing preference.

Authenticated routes under the existing Audio Atlas boundary:

- `GET /api/echos/audio-atlas/songs/:songId/files` returns inventory, song revision,
  title and size limit.
- `POST` to the same route streams a raw binary body. Query parameters:
  `kind=master|stem`, `format=wav|mp3`, `filename`, `role` for stems, `revision`,
  and optional `replace=true`.
- Browser access uses the existing same-origin local UI cookie. Foreign origins
  are refused; CLI/API bearer authentication remains available. The browser
  upload never automatically replays a failed request.

CLI parity uses the same service without HTTP:

```sh
node cli/song-audio-upload.mjs --song=SONG_ID
node cli/song-audio-upload.mjs --song=SONG_ID --file=/absolute/path/Vocals.wav \
  --kind=stem --format=wav --role=Vocals --revision=REVISION_FROM_INSPECTION --apply
```

Inspection is read-only. `--replace` must be explicit for an available slot.
`HAPA_SONG_STORE` selects an isolated store for tests. The API's Atlas inventory,
analysis source listing and upload service honor that same store setting.

Publication validates the song revision before and after streaming, shares the
existing audio-reference repair lock, backs up the raw store, writes a receipt,
then atomically renames a flushed temporary store. Other song records and
unknown fields are preserved; the album normalizer is never used for attachment.
The ordinary audio normalizer now retains the added format paths and upload
history during later unrelated edits. Interrupted/rejected streams discard
unpublished upload files. A process crash may leave unregistered staging files;
there is no automatic deletion of historical uploads. Legacy external writers
that ignore the lock are not covered by a global transaction guarantee.

## Verification and reuse delta

50 focused tests pass, including all four slots, dual-format role preservation,
explicit replacement, source/other-record preservation, format/size/path rejection,
interrupted streams, stale/concurrent writes, auth rejection and raw-body routing.
The production build and 54 Overcard tests pass.

The real browser file chooser uploaded Gnow Her's actual master WAV/MP3 and
backing-vocal WAV/MP3 into an isolated record: all four saved, both masters
became Found, both stem sets became 1/9 with the other eight roles listed.
Reload retained those states. Duplicate replacement was disabled until checked;
a WAV selected in the MP3 area was refused. All four uploaded SHA-256 digests
match their source files; the canonical album store remained unchanged.
Physical desktop-to-browser drag was not exercised by the available automation;
drop and chooser events use the same staging/validation function. Native
Electron acceptance and the existing repository-wide acceptance gaps remain
separate gates. See [batch verification](AUDIO_UPLOAD_VERIFICATION.md): 2,467 pass / 8 previously known failures. Completion commit remains gated.

Reuse decision: extend the existing inventory, same-origin client, song directory
and Atlas components. The earlier whole-song ingest workflow requires complete
source packages and would be inappropriate for filling one missing slot.

A browser check exposed an existing selection mismatch: an initial song ID absent
from the fetched list could leave the visible select showing a different song.
The selected ID is now validated against the list before mounting upload controls.
A second inspection caught loss of the old MP3 reference when promoting a WAV;
the upload service now preserves that format explicitly, with a regression test.
Reusable lesson candidate: format completeness is separate from preferred-source
selection; retaining both and testing their round-trip prevents silent source loss.


## Director song-menu correction — September 27, 2026

Calder's browser annotation found that four stacked availability badges made
song navigation too tall. The Director picker now contains only a single-line
title and perspective tag; the selected Blueprint has a collapsed **Audio files
· WAV, MP3 & stems** section. Expand it for all four states and **Manage audio
files**, which opens that song in the existing Atlas workspace.

Reused the shared availability component and Atlas selection route. Actual
browser inspection measured the first three rows at 27px, previously 196px;
expansion revealed the matching four states, and the management shortcut selected
11:23 Meant to Meet, Thu? in Atlas. Production build and six existing Atlas UI
checks passed. Source annotation and screenshot: task
`01a0e4d5-31d6-74f0-ab17-f838cf3f0992`, `menu-cleanup/compact-song-menu.png`.
The eight previously known repository failures, native acceptance and completion
commit remain open; no broad suite was repeated for this presentation correction.
Lesson candidate: place file-health detail at the selected-song level instead
of repeating it inside narrow navigation rows.
