# Deevid Media Genesis Pipeline

This is the repeatable path for turning the local `Deevid Videos` collection into an evidence-bearing Avatar Builder media-card set and then creating guarded Avatar, Scene, and Tarot connectors.

## Source contract

- `HAPA_DEEVID_ROOT`: folder containing the Deevid MP4 files (defaults to `~/Desktop/Deevid Videos`)
- `HAPA_DEEVID_MANIFEST`: JSON manifest containing stable `id`, `index`, `filename`, and optional public `url` fields
- Builder source of truth: the repository root containing this document
- Set card: `set-deevid-videos`
- Run report: `data/merge-reports/latest-deevid-media-genesis.json`

The manifest supplies stable Deevid IDs and public-object provenance. The local videos supply the actual bytes. The Builder creates content fingerprints so reruns are idempotent even if filenames or ordering change.

## One-command full run

```bash
export HAPA_DEEVID_ROOT="/path/to/Deevid Videos"
export HAPA_DEEVID_MANIFEST="/path/to/deevid-video-manifest.json"
npm run ingest:deevid:full
```

The full command runs the guarded ingestion, Echo v2 technical-affordance refresh, Avatar Mind quality pass, story-spine pass, and both Mind/healing audits. Each mutating stage creates its own timestamped backup.

Useful bounded variants:

```bash
# Rebuild cards and connectors from an already indexed media library.
npm run ingest:deevid -- --root "/path/to/Deevid Videos" --manifest "/path/to/deevid-video-manifest.json" --skip-media-index

# Produce the report without rewriting runtime stores.
npm run ingest:deevid -- --root "/path/to/Deevid Videos" --manifest "/path/to/deevid-video-manifest.json" --skip-media-index --dry-run

# Override source locations.
npm run ingest:deevid -- --root "/path/to/videos" --manifest "/path/to/manifest.json"
```

## Ordered process

1. Run the canonical folder-video indexer with automatic attachment disabled.
2. Fingerprint every clip; probe dimensions and duration; extract first, middle, and last frames.
3. Run the local macOS Vision/OCR pass and retain technical, label, and text evidence.
4. Categorize each clip into a small generated taxonomy and create one `media_card` per video.
5. Create or replace the `Deevid Videos` set card and attach all media cards to it.
6. Create Avatar, Scene, and Tarot candidates only when exact-name or distinctive multi-token evidence clears the confidence gate.
7. Add generated/soft-canon Mind context, memory, canonical-choice, and Genesis receipts to matched Avatars.
8. Add review-gated wisdom nodes to matched Scenes and enrichment connectors to matched Tarot cards.
9. Back up every touched runtime store and write a machine-readable validation report.
10. Refresh Echo v2 hashes/contact frames and quarantine unreadable files explicitly.
11. Run the Avatar Mind quality and story-spine passes, then audit Mind and healing coverage.

## Canon and safety boundary

Vision/OCR labels and semantic matches are hypotheses. They may suggest a character, place, scene, prop, or Tarot motif, but they do not establish identity, real biography, authored lore, or hard canon. Every generated card and connector remains `needs-human-review`; promotion requires human review plus an authored scene, Tarot interpretation, or explicit canon decision.

The generic indexer is intentionally run with `--no-attach`. This prevents weak numeric filenames or generic labels from silently filling Avatar, Scene, or Tarot media slots.

## Verification and downstream refresh

After a successful run:

```bash
npm run build
npm run audit:mind-quality
npm test
node --test tests/overcard-*.test.mjs
```

Run `npm run smoke:tarot` against a dedicated Builder server and confirm the Tarot Draw canvas is nonblank. Use the installed Hapa mass-update runner with `--full-sync` when non-chat media inventory changes need to propagate across every supported ecosystem source, the Second Brain topic/ecosystem maps, turn lineage, capability bridges, and productivity surfaces.
