# Hapa Avatar Builder Runtime Data

This directory holds local-first Avatar Builder runtime state. The app reads and writes these files directly, but the large mutable stores are intentionally ignored by Git.

Tracked source should live in `src/`, `server/`, `cli/`, `scripts/`, `docs/`, and protocol manifests. Runtime data should stay local unless a future protocol document promotes a specific small fixture.

The Build Week public release promotes one such bounded fixture under `fixtures/build-week/judge-data/`: three RGB Avatars, three Echo State Song Cards, sampled/profile-required foundation Cards, and the complete 16-card Build Week Wisdom Set. These fixtures are public bootstrap material, not replacements for the local-first operator stores.

Important local files:

- `avatar-store.json` - active Avatar Cards and team assignments.
- `scene-store.json` - world, places, scenes, episodes, and timelines.
- `tarot-store.json` - tarot decks, sets, cards, spreads, and avatar/card links.
- `media-library.json` - imported local media records and review metadata.
- `kanban.json` - local builder board.
- `media/` - generated or imported media assets.
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
