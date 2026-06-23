# Hapa Avatar Builder Runtime Data

This directory holds local-first Avatar Builder runtime state. The app reads and writes these files directly, but the large mutable stores are intentionally ignored by Git.

Tracked source should live in `src/`, `server/`, `cli/`, `scripts/`, `docs/`, and protocol manifests. Runtime data should stay local unless a future protocol document promotes a specific small fixture.

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

