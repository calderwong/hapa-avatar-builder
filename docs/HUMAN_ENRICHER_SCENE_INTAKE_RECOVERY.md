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
- **What changed:** Quick Sort decisions now live in `data/human-video-quick-sort-decisions.json` with append-only events. Existing Quick Sort decisions embedded in legacy agent-review receipts are projected forward when no newer ledger decision exists. Source facets include exact owner identities such as `Scenes · Video-transitions`, and Detail's `Quick Sort accepted` filter selects the human triage state.
- **Telemetry ownership:** Hapa Avatar Builder is the narrowest truthful owner because these are local human media decisions. Hapa Telemetry may later consume aggregate health, but it does not own or rewrite the decision ledger.
- **Live proof:** `known=11,305`, `seen=1,411`, `not seen=9,894`, `accepted=1,266`, `rejected=145`; exact `Scenes · Video-transitions` unseen query returned 291 of 291 videos with no pagination remainder.
- **Reusable guardrail:** optical proposal state and human Quick Sort state are orthogonal. “Seen” requires a persisted human keep/reject decision; “accepted” in detailed enrichment means the human kept the video in Quick Sort.
