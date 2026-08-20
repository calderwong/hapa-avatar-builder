# Human Enricher Scene Intake Recovery

Source turn: current Codex task, **Add Quick Sort telemetry**, correction reported 2026-08-20 after a roughly 220-video Scene intake.

## Turn-to-Lore reflection

- **Objective:** make newly uploaded Scene videos durably discoverable by Human Enricher and make the optical-review boundary visible in Quick Sort.
- **Canonical surface reused:** `src/App.jsx` remains the Scene authoring owner; `src/domain/scene.js` remains the attachment contract; `server/api.mjs` remains the loopback persistence owner; Human Enricher keeps the existing optical-proposal decision workflow.
- **Evidence inspected:** the live Builder process, `data/scene-store.json`, `data/media-library.json`, `data/human-video-agent-reviews.json`, the upload pipeline, world request-size guard, and 2026-08-20 media mtimes. The batch persisted 211 MP4s and 1,320 derived frame images, while the 110 MB Scene store did not change.
- **What worked:** per-file media persistence completed and preserved the uploaded bytes. The current Quick Sort accepted/rejected ledger remained durable.
- **What was noise:** older large Scenes and a 205-image Scene initially resembled the reported count but were unrelated to the new intake.
- **What was misunderstood:** a successful per-file upload did not imply that the final Scene relationship had persisted. The client subsequently resent the whole world graph, which exceeded the API's 8 MB request limit. The initial Quick Sort implementation also incorrectly coupled human media triage to the presence of an optical proposal.
- **What changed:** Scene drops now use one bounded asset-batch route and one-pass Scene normalization. Persisted-media record IDs include a hash of the full identity so a long shared path prefix cannot collapse distinct uploads. Quick Sort now admits untouched known videos and records keep/reject decisions in a separate human-owned ledger.
- **What remains reusable:** the media files, extracted first/mid/last frames, Scene attachment normalization, optical campaign, and human decision endpoints. No replacement review surface was introduced.
- **New guardrail:** never persist a small Scene relationship change by retransmitting the canonical world graph; never derive a media identity from a truncated path prefix alone; never make human media triage eligibility depend on an agent proposal.

Promotion candidate: **Lesson Card — “Uploaded Bytes Are Not an Attached Relationship.”** A staged media write, catalog projection, Scene relationship, optical proposal, and human decision are separate durable checkpoints and must expose separate telemetry.

## Recovery checkpoint · 2026-08-20

- **Objective:** restore the operator-confirmed `Video-transitions` relationship without repeating a 736 MB upload.
- **Evidence:** the source folder contained exactly 220 MP4s; the failed intake left 211 MP4s plus exactly 1,320 derived JPGs (six per source video). Nine originals exceeded the request ceiling but remained available in the source folder.
- **What worked:** exact filename slug, byte-size, time-window, and frame-role matching produced 220 unique asset IDs, 220 unique video URIs, and three full optical frames per asset. A dry run proved the Scene delta before mutation.
- **What was noise:** the persisted-media library held only the last upload because the pre-fix long-path record ID collided; it could not serve as the recovery manifest.
- **What changed:** nine oversized originals were copied into managed media, all 220 assets were atomically attached, and `Video-transitions` moved from 71 to 291 videos. The prior Scene store was preserved in a timestamped backup and a machine-readable merge report records the hashes.
- **Reusable guardrail:** for failed batch recovery, prove `source count = recovered video URI count = three-frame asset count` and require an operator-confirmed target before writing. Preserve a byte-complete backup and use an atomic store rename.

## Queue-visibility correction · 2026-08-20

- **Objective:** make the reconstructed Scene batch directly usable in Quick Sort and preserve the meaning of seen, not seen, accepted, and rejected.
- **Evidence:** the live query for the exact source `scene:place-3-scene-1` returned all 291 `Video-transitions` videos, including raw records with no optical review. The prior Quick Sort request hard-coded `review=agent-reviewed`, excluding those records before rendering.
- **What changed:** Quick Sort decisions now live in `data/human-video-quick-sort-decisions.json` with append-only events. Existing Quick Sort decisions embedded in legacy agent-review receipts are projected forward when no newer ledger decision exists. Source facets stay consolidated into broad families such as `Scenes`, `Avatars`, and `Items`; owner names such as `Video-transitions` remain searchable. Detail's `Quick Sort accepted` filter selects the human triage state.
- **Telemetry ownership:** Hapa Avatar Builder is the narrowest truthful owner because these are local human media decisions. Hapa Telemetry may later consume aggregate health, but it does not own or rewrite the decision ledger.
- **Live proof:** `known=11,305`, `seen=1,411`, `not seen=9,894`, `accepted=1,266`, `rejected=145`; exact `Scenes · Video-transitions` unseen query returned 291 of 291 videos with no pagination remainder.
- **Reusable guardrail:** optical proposal state and human Quick Sort state are orthogonal. “Seen” requires a persisted human keep/reject decision; “accepted” in detailed enrichment means the human kept the video in Quick Sort.

## Quick Sort identity and latency repair · 2026-08-20

- **Objective:** stop an accepted physical video from reappearing under another store record, make repeated decisions idempotent, and remove the full-dashboard rebuild from the normal save path.
- **Evidence:** before repair, the raw projection contained 7,760 video records, including 159 exact-URI duplicate groups, 321 exact-asset-ID duplicate groups, and 102 physical identities split between a decided record and an unseen alias. Six decisions had already reached revision 2. A one-video live dashboard request took 3.16 seconds because the API rebuilt the complete media projection, and the decision endpoint repeated the same rebuild before every write.
- **What worked:** content fingerprints, managed URIs, source paths, and sufficiently long canonical asset IDs were already present and could form a truthful alias set. The append-only event ledger and revisioned current store remained usable.
- **What was misunderstood:** record IDs identify store projections, not physical videos. Prioritizing a record ID over the physical URI allowed the same file to acquire independent decisions. A successful response also did not need a second full queue reconstruction.
- **What changed:** system media now merges compatible physical aliases while refusing contradictory non-empty fingerprints. Human enrichment, optical/reference reviews, and Quick Sort decisions resolve through the same alias set. The normal decision route uses the last dashboard identity index, identical repeated states perform no write and append no event, and the UI removes an unseen tile optimistically with rollback on failure.
- **Migration:** the service was stopped before mutation. The decision store and event ledger were backed up under `data/backups/human-video-quick-sort-identity-migration-2026-08-20T21-56-12-951Z`, then 164 of 524 decisions were atomically re-keyed. No decisions collapsed, conflicted, or remained unresolved. The receipt is `data/merge-reports/human-video-quick-sort-identity-migration-2026-08-20T21-56-12-951Z.json`.
- **Live proof after restart:** the complete 10,980-video API projection contains zero exact-URI duplicate groups, zero exact-asset-ID duplicate groups, and zero accepted identities that also appear unseen. Repeating an existing accepted decision returned `changed=false` in 7.4 ms; its revision remained 1, the decision count remained 524, and the event log remained 530 lines. `Video-transitions` still exposes all 291 Scene videos and all 291 are presently unseen.
- **Reusable guardrail:** human decisions bind to a canonical physical-video identity with retained aliases. Equal-state commands are reads, not new historical events. Conflicting fingerprints prevent an otherwise matching URI or asset ID from being merged.
