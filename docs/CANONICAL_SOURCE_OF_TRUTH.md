# Hapa Avatar Builder Source Of Truth

Last audited: 2026-06-29.

## Canonical App

Open and edit this app:

```text
/Users/calderwong/Desktop/hapa-avatar-builder
```

That Desktop alias resolves to:

```text
/Users/calderwong/Documents/Codex/2026-06-10/files-mentioned-by-the-user-screenshot/outputs/hapa-avatar-builder
```

Current active Avatar Card store:

```text
/Users/calderwong/Desktop/hapa-avatar-builder/data/avatar-store.json
```

As of 2026-06-29, the active store contains 74 unique Avatar Builder cards. If a candidate Avatar Builder folder has fewer than 70 cards, it is not the current merged source of truth.

The Finder app wrapper should also point here:

```text
/Users/calderwong/Desktop/Hapa Avatar Builder.app
```

As of 2026-06-23, the Finder wrapper is a symlink to:

```text
/Users/calderwong/Desktop/hapa-avatar-builder/Hapa Avatar Builder.app
```

## Deprecated Duplicate

Do not use these folders as the source of truth:

```text
/Users/calderwong/Documents/Codex/2026-06-12/can-you-create-a-desktop-version/outputs/hapa-avatar-builder-desktop
```

That non-Pinokio desktop export has only 32 cards and predates the merged 74-card library.

```text
/Users/calderwong/pinokio/api/hapa-avatar-builder-desktop/app
```

That Pinokio app copy is the accidental duplicate branch. It carried the Tarot Library management UI and runtime data, but it did not contain the Three.js `TarotDraw3DView.jsx` / `tarot-draw-view` surface. It should be treated as a provenance source or fallback data source only.

## Current Convergence State

- Canonical app now contains both Tarot surfaces:
  - `Tarot Library` for deck/set/card/back/loop/avatar-link management.
  - `Tarot Draw` for the Three.js reading table.
- Canonical `data/tarot-store.json` matches the Pinokio duplicate exactly on deck/set/card IDs and counts.
- Canonical runtime data is broader than the duplicate for avatars, world/scenes, kanban, inventory, songs, and generated lore.
- Canonical Avatar Builder has 74 unique cards in `data/avatar-store.json`; the older June 12 desktop export has only 32 and is superseded.
- Canonical song data lives in `data/hapa-songs-store.json`, `data/dear-papa-songbook.json`, and `/Users/calderwong/Desktop/hapa-song-registry/data/registry.json`; all three currently expose 79 Dear Papa songs/tracks. The deprecated Pinokio duplicate has no `hapa-songs-store.json` or `dear-papa-songbook.json`, so it is not a source for song recovery.
- Pinokio-only avatar IDs `maris`, `naya`, and `zhi-zi` are already represented in canonical as identity-merged records:
  - `avatar-36` / Maris
  - `avatar-33` / Naya
  - `avatar-35` / Zhi-zi

## Historical Record

Useful Codex session anchors:

- `/Users/calderwong/.codex/sessions/2026/06/12/rollout-2026-06-12T12-29-56-019ebd4f-fcb2-7160-9b1a-bbe988739fc6.jsonl`
  - Found `/Users/calderwong/pinokio/api/hapa-avatar-builder-desktop`.
- `/Users/calderwong/.codex/sessions/2026/06/17/rollout-2026-06-17T08-33-57-019ed637-bc98-7f63-a206-a52d059ba1b8.jsonl`
  - User requested Tarot card upload/deck/avatar-link structure for Hapa Avatar Builder.
- `/Users/calderwong/.codex/sessions/2026/06/22/rollout-2026-06-22T20-25-42-019ef283-2a7d-7ce1-a06f-3c12ab632b55.jsonl`
  - Prior agent launched Pinokio copy as "real" at `127.0.0.1:8788`.
  - Later in the same session, the 3D Tarot Draw source was found at the June 10 canonical checkout with `src/components/TarotDraw3DView.jsx`; the Pinokio copy lacked that component and the `tarot-draw` selectors.
- `/Users/calderwong/.codex/sessions/2026/06/23/rollout-2026-06-23T11-41-02-019ef5c9-2bc8-7760-a332-b664bfed3807.jsonl`
  - Shows the misleading Desktop `.app` path discovery that pointed back into Pinokio before this cleanup.

## Operator Rule

When a future agent looks for "hapa-avatar-builder", pick the checkout with `src/components/TarotDraw3DView.jsx` and `src/components/TarotLibraryView.jsx`. If another copy has only one of those surfaces, merge into this canonical app instead of launching or extending the duplicate.
