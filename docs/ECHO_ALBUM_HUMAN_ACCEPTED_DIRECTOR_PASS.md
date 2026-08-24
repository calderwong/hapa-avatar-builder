# Echo Album Human-Accepted Director Pass

## Objective

Refresh the Builder's Echo/Dear Papa album from the live Suno playlist and create an album-wide Director coverage pass whose video boundary is exactly the durable Human Enricher `accepted` state.

> 2026-08-24 correction: this historical pass proves playlist reconciliation and Director-video coverage, not a complete Echo Album update. The active six-stage definition now lives in `docs/ECHO_ALBUM_UPDATE_PROTOCOL.md` and additionally requires independently validated MP3, WAV, source-available stems, lyrics/instrumental truth, measured analysis, and exact Director preflight.

## Result

- Live Suno playlist: 175 songs, up from 167.
- Added songs: 8; six have selected stems and two currently have master/cover media only.
- Human Enricher ledger: 3,267 accepted videos.
- Locally readable accepted Director candidates: 3,133.
- Current-song Director variants: 175.
- Accepted-only video placements: 9,677.
- Diversity: every eligible candidate is used 3–4 times; median 3; zero unused; zero immediate repeats.
- Legacy projects remain immutable. The pass is appended as `human-accepted-diversity-dense-v1`.

The Builder retains 198 song cards because 23 legacy/local cards are preserved alongside the exact 175-song current Suno projection. Two current registry identities have legacy alias cards; the pass chooses the card whose title matches the current playlist and records the aliases in its report.

## Evidence and recovery points

- Suno pre-refresh manifests: `data/backups/echo-suno-refresh-2026-08-20T22-10-00Z/`
- Director-project backup: `data/backups/music-video-projects-2026-08-20T23-39-03-323Z/`
- Direction-index backup: `data/backups/human-accepted-echo-direction-2026-08-20T23-42-12-332Z/`
- Applied pass report: `data/merge-reports/human-accepted-echo-direction-2026-08-20T23-42-12-332Z.json`
- Song sync report: `data/song-sync-reports/latest-dear-papa-songbook-sync.json`

## Turn-to-Lore reflection

### What worked

The live playlist itself was the correct album boundary. Reusing the authenticated Suno downloader preserved current titles, one selected master path, artwork, and the latest stem selection without inventing metadata. That result did not prove WAV custody, decode-valid bytes, or measured analysis; those are now separate mandatory gates. An append-only Director variant kept prior direction intact, while an album-shared least-used ledger gave every readable accepted video coverage before increasing reuse.

### What was noise

The Builder's total song-card count is not the current album count because legacy cards are intentionally retained. Treating 198 Builder cards as 198 current Suno songs would have directed stale material. Likewise, raw Human Enricher “known” video counts include media that is not accepted or is not locally readable and therefore cannot be the Director pool.

### What was misunderstood

The earlier smaller accepted count was stale relative to the reconstructed Human Enricher ledger. The current durable ledger does contain more than 3,000 accepts: 3,267 total, of which 3,133 are readable. Coverage count and accepted-video count are different quantities: the Director created 9,677 placements from those 3,133 identities.

### What changed

Human-accepted video is now an explicit Director source family. Candidate construction rejects every state except `accepted`, selected shots retain the precise acceptance receipt, and the batch pass records source policy, candidate counts, duplicate card aliases, usage distribution, and recovery paths.

### Reusable guardrail

Never infer human acceptance from enrichment presence, “seen” state, tags, source location, or a prior Director selection. Admission requires the durable Quick Sort decision state `accepted`; every resulting shot must carry that decision receipt, and a post-run audit must resolve the shot identity back to the accepted candidate set.

### Candidate Lesson Card

**Acceptance Is a Boundary; Coverage Is a Placement Count.** First establish the exact accepted, playable identity set. Then use a shared least-used ledger across the whole album. Report both the candidate count and the placement count so broad coverage cannot be mistaken for duplicated or broadened acceptance.
