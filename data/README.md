# Hapa Avatar Builder Runtime Data

This directory holds local-first Avatar Builder runtime state. The app reads and writes these files directly, but the large mutable stores are intentionally ignored by Git.

Tracked source should live in `src/`, `server/`, `cli/`, `scripts/`, `docs/`, and protocol manifests. Runtime data should stay local unless a future protocol document promotes a specific small fixture.

Important local files:

- `avatar-store.json` - active Avatar Cards and team assignments.
- `scene-store.json` - world, places, scenes, episodes, and timelines.
- `tarot-store.json` - tarot decks, sets, cards, spreads, and avatar/card links.
- `media-library.json` - imported local media records and review metadata.
- `human-video-enrichments.json` - revisioned human Quality grades, `@Avatar` links, Echo State director notes, and manual references keyed to known videos.
- `human-video-enrichment-events.ndjson` - append-only local receipts for human enrichment revisions.
- `human-video-agent-reviews.json` - evidence-bound optical sub-agent proposals pending explicit human validation; owner-token/PID-checked locking prevents an agent revision from racing over a human decision.
- `human-video-agent-review-events.ndjson` - append-only proposal submission and human decision receipts.
- `human-video-likeness-decisions.json` - durable Human Likeness lane decisions (Avatar Likeness Assignment, layer L4): one per enricher-accepted video, `origin: "avatar-likeness"`, carrying the matcher's full score receipt. The human gate the Director consumes (layer L5); written only through the enricher API, never by the matcher batch.
- `human-video-likeness-decisions-events.ndjson` - append-only accept/reject receipts for the likeness decision ledger.
- `human-video-optical-campaign.json` - resumable vision-only job claims, immutable canonical First/Mid/Last SHA-256 manifests, opaque worker leases, frozen claim configuration, normalized-result completion receipts, scheduler timing, and immutable job/attempt/frame/lease-bound token telemetry receipts for new attempts. Initial kickoff jobs retain legacy digests but are also checked against their complete manifests; their first three captured telemetry receipts predate local receipt binding and remain explicitly classified as legacy-unbound.
- `human-video-optical-campaign-events.ndjson` - append-only plan, claim, recovery, completion, failure, and telemetry events; it contains no media judgments or Reference Pass output.
- `kanban.json` - local builder board.
- `media/` - generated or imported media assets.
- `media/echo-preview-recordings/` - Director Preview quick captures (`index.json` plus one file per capture). Scratch clips from the Echo Album preview Record control: no mint ledger, no edition, no release semantics; freely deletable.
- `avatar-likeness/profiles.json` - per-Avatar likeness profiles (Avatar Likeness Assignment, layer L2): weighted visual signature + text channel + content-hash fingerprints. Sidecar data, never mutates `avatar-store.json`; rebuilt at any time by `node cli/avatar-builder.mjs avatar-likeness-profile --apply` and served read-only at `GET /api/avatars/likeness` (admin-gated).
- `avatar-likeness/media-signatures.json` - Human Enricher accepted-media likeness signatures (layer L3): content-hash keyed, signer-versioned L1 visual signature + enrichment text channels + deterministic palette color words. Written by `node scripts/avatar-likeness-match.mjs --apply`.
- `avatar-likeness/verdicts.json` - likeness matcher verdict receipts (layer L3): gated primary/secondary Avatar proposals + top-5 candidate tables, one per accepted media. Proposals for the human likeness lane (layer L4); the batch never writes the enricher ledger.
- `backups/` - pre-merge and pre-heal store snapshots.
- `merge-reports/` - JSON reports from repeatable data merge scripts.

Before making direct store edits, back up the touched JSON files under `data/backups/`.

## Current Avatar Store

As of 2026-06-29, this canonical checkout's `avatar-store.json` contains 74 unique Avatar Builder cards. The older non-Pinokio desktop export at `/Users/calderwong/Documents/Codex/2026-06-12/can-you-create-a-desktop-version/outputs/hapa-avatar-builder-desktop` has only 32 cards and must not be used as the active source of truth.

## Pinokio Duplicate Audit

The deprecated duplicate app is:

```text
/Users/calderwong/pinokio/api/hapa-avatar-builder-desktop/app
```

The canonical app is richer or equal for every audited runtime store as of 2026-06-23. `tarot-store.json` and `media-library.json` matched exactly; Pinokio-only avatar IDs `maris`, `naya`, and `zhi-zi` are already represented in canonical as `avatar-36`, `avatar-33`, and `avatar-35` with `pinokio-merged` provenance.

See `merge-reports/2026-06-23-pinokio-canonical-audit.md`.
