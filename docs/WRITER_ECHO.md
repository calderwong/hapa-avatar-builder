# Echo in Writer's Room

Status: installed local prototype. Native owner: Avatar Builder. Contract:
`hapa.writer-echo/v1`. `server/writer-echo.mjs` reads existing songbook, song store
and the owner's Reference Atlas projection. It never edits those sources.

The narrow Writer service mounts it inside the same authenticated
`/v1/writer-characters` boundary. Reads require the private bearer or existing
same-origin browser session. Only exact audio GET routes can use the media
Referer context; JSON and mutation policy is unchanged. Mutations return 405.

| GET route | Result |
| --- | --- |
| `/echo/songs?q=&offset=&limit=40` | Search/page metadata; max 100 per page |
| `/echo/songs/:id` | Full lyrics, native notes, provenance, curated references |
| `/echo/songs/:id/references` | Exact-song edges and referenced Atlas records |
| `/echo/songs/:id/audio` | Existing approved local audio with range streaming |

Paths above are relative to `/v1/writer-characters`. Stable native song IDs join
records; titles never do. Whole source bytes are hashed, stat signatures checked
before/after reading and shared concurrent reads coalesced. Default source read
budget is 128 MiB per file, explicit failure without truncation. Lyrics have no
semantic length cap. Search includes full lyrics, native knowledge and curated
references; Atlas records load separately when requested.

The song revision SHA-256 covers the stable projected record before adding its
`digest`, `revision`, whole-file sourceDigests and audio availability/duration.
JSON uses native `stableEchoMasterReferenceStringify`. The lyric hash separately
covers exact UTF-8 text. Original `lyrics.sha256` remains sourceClaimedSha256;
a mismatch is surfaced without rewriting source. Whole-file hashes attest the
read sources independently. These are integrity commitments, not signatures.

Audio uses a realpath under `~/Desktop/suno-library` or Builder `data/media`,
allowlisted audio extensions, a non-symlink regular descriptor, explicit ranges
and a closed stream lifecycle. No arbitrary path endpoint, external download,
model, child process or media worker exists. Reference Atlas uses the owner's
read-only currentRun; deterministic coverage may be derived in memory. Existing
review/rights/source state is retained, not promoted.

The Writer UI stores explicit cited excerpts with source/revision, UTC citation
time, citedBy, target and SHA-256. Immutable Second Brain project checkpoints
retain these references plus the plot and exact character states. Selected author
specialist packets can include them; character packets require explicit matching
target/knowledge review. Source browsing is not automatic character knowledge.

Read-only CLI: `node cli/writer-echo.mjs list [--query TEXT] [--offset N]`,
`node cli/writer-echo.mjs read --song EXACT_ID`, and
`node cli/writer-echo.mjs references --song EXACT_ID`. It uses the existing private
service config and a finite 30-second request. No service starts implicitly.

Ten finite tests cover exact identities, lossless large text, source refresh,
hashes/mismatch, no native mutation, search/detail parity, read-only routes,
audio root denial and both Atlas reference-ID forms. Runtime/UI evidence lives
in Writer's Room `docs/HISTORY_ECHO_VERIFICATION.md`. Current source inventory:
200 songs, 186 with lyrics, 85 curated references, 136 connectors; 14 missing
lyric texts and 18 source hash mismatches remain explicit owner-source gaps.
