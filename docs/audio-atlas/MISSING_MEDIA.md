# Missing-media reconciliation — 2026-09-27

Status: bounded reconciliation and one source-reference repair verified; unresolved
media inputs remain explicit. Card: `atlas-gap-missing-media`.

## Current inventory

| Check | Found | Missing or unresolved |
| --- | --- | --- |
| Registered songs | 200 | — |
| WAV container | 61 | 139 |
| MP3 container | 200 | 0 |
| Complete declared MP3 stem-role set | 137 | 63 songs |

Of the63songs without a complete stem set,62have no declared role inventory.
Their missing file count is unknown; do not assume12stems each. The remaining
song, **“Bread, Conviction, and Poop in the Tub”**, declares12roles: Vocals,
Backing Vocals, Drums, Bass, Guitar, Keyboard, Percussion, Strings, Synth, FX,
Brass and Woodwinds. Its registered stem folder contains the corresponding
metadata files but none of those audio files. No partial MP3 sets were found.
176songs have at least one unmet format/role requirement.

Checks are limited to registered paths, exact-basename format siblings and
numbered role matches inside registered stem folders. A separate read-only
shallow inspection of the registered audio/stem parent folders for the176songs
found no additional WAV candidates or stem archives;512entries is the per-folder
cap. This is not a whole-disk search. Header readability is not full decode,
original WAV provenance, losslessness, synchronization or musical quality.
No audio was downloaded, converted, generated or overwritten.

The exact per-song JSON and CSV, checked paths, bounded folder observations and
repair receipts live in the originating task's private
`work/audio-atlas-2026-09-27/media-audit/` evidence folder:
`missing-media-manifest.json`, `missing-media.csv`, `bounded-location-check.json`,
`inventory.json`, `verification.json`, `zerbini-dry-run.json`, `zerbini-apply.json`.
They are local runtime evidence, not source-controlled media/metadata payloads.

## Actual defect and repair

Zerbini referenced a missing `song.m4a`, while an existing exact sibling
`song.mp3` was present. The inventory checker only considered WAV/MP3 source
suffixes, so it falsely left this MP3 unresolved. It now checks exact WAV/MP3
siblings for registered WAV/WAVE/MP3/M4A/AAC/FLAC/OGG/OPUS/AIF/AIFF references.
It still rejects unrelated basenames, non-audio suffixes, HTTP/API paths and
wrong headers. Discovery never changes source files or claims original quality.

Before repairing the stored reference, a dry-run of the ordinary Song PUT
normalization showed unrelated field changes across all200songs. No such PUT
was sent. The owner now has a narrow maintenance command that changes only a
missing `audio.localPath` and, when needed, `localAvailable`. It preserves unknown
fields and every other Song, checks reviewed store/candidate hashes, refuses to
replace an existing source, verifies an exact-basename sibling, backs up the
original store bytes, atomically publishes the store, and records a receipt.
Candidate symlinks and extension/header mismatches fail closed.

The real repair changed only Zerbini's `audio.localPath`. The backup is byte-exact;
all199other Songs and every other field are deep-equal. The candidate MP3 hash
is unchanged. Original source metadata remains untouched. This MP3's presence
is not a claim that an original WAV was recovered.

## Owner maintenance command

From the canonical Builder root, first obtain a dry-run receipt:

```sh
node scripts/repair-song-audio-reference.mjs --song=SONG_ID --path=/absolute/registered-folder/song.mp3
```

Review the exact candidate, changed fields and hashes, then explicitly apply:

```sh
node scripts/repair-song-audio-reference.mjs --song=SONG_ID --path=/absolute/registered-folder/song.mp3 --expected-store-sha256=STORE_HASH --expected-source-sha256=SOURCE_HASH --apply
```

This is a bounded local maintenance operation, not a new ingestion service or
an automatic repair on inventory recheck. It never publishes to other nodes.
Run when no other authoring action is active: its lock coordinates repair-command
instances, but legacy store writers do not share that lock. Hash checks before
publication detect intervening changes; there is no global multi-process
transaction guarantee. A prepared receipt after failure/crash is not success.
Inspect current hashes and the retained backup before any retry or restoration.
Do not automatically restore an old backup over newer authoring work.

## Verification and remaining inputs

16focused checks pass: inventory, UI format filtering/auth behavior, and repair
preservation/rejection tests. Negative cases cover stale store/source hashes,
existing sources, unrelated basenames, wrong headers, duplicate Song identity
and symlink candidates. Dry-run is proven write-free, the backup preserves exact
bytes and the lock is released. The real-store readback and candidate hashes pass.
The running preview visibly shows61WAV /200MP3 /137complete stem sets and Zerbini
MP3 Found. The task-owned preview restarted on19873after its prior handle exited;
no active Atlas job or shared desktop service was stopped. New preview PID79085.
No UI bundle change, model execution or broad-suite rerun was required.

Unresolved: supply the139source WAVs if they exist, the12specified stem files,
and stem assets/role declarations for62songs. The bounded manifest records each
song and exact checked reference. Do not manufacture a WAV by transcoding an MP3
and present it as an original. Full repository acceptance, human review and the
focused completion commit remain open.

Reflection / Lesson candidate: availability, declared path and source quality
are independent. A valid sibling can fix a false missing badge; a narrowly
reviewed path repair must preserve unrelated authoring fields and source history.
