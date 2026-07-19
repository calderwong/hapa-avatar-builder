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

When a future agent looks for **“Hapa Avatar Builder,” “Avatar Builder,” “Tarot Draw,” “Tarot Draw UI,” “Tarot Draw 3D,” “Phone Card in Tarot Draw,” “Camera Card in Tarot Draw,” “Invite Cam,” “Comment Cam,”** or **“Comment Card Bridge,”** pick the checkout with `src/components/TarotDraw3DView.jsx` and `src/components/TarotLibraryView.jsx`. These names do not resolve to `hapa-avatar-node` or `hapa-dev-proto`.

Before implementing a derivative or standalone Tarot Draw app:

1. Open the running canonical Tarot Draw and inspect the complete cockpit, not only a source-search result or a downstream integration.
2. Trace `src/components/TarotDraw3DView.jsx`, `src/components/PhoneCardMobileView.jsx`, `server/api.mjs`, `server/avatar-media-comment-service.mjs`, and `server/roomletInvite.mjs` at an exact commit.
3. Record a side-by-side parity matrix for the room/table composition, HUD and controls, Card-family rail, camera and Card manipulation, media surfaces, Camera Card, Phone Card, and scene save/invite behavior.
4. Treat “self-contained” as a packaging requirement. It does not authorize a replacement visual or interaction design.
5. Obtain Calder’s explicit approval for any deliberate deviation before calling the derivative interface complete.

If another copy has only one of the Tarot surfaces, merge into this canonical app instead of launching or extending the duplicate.

## Launcher Incident And Guardrail — 2026-07-19

The dedicated launcher previously closed the active Electron window and rebuilt `dist` before checking whether the healthy canonical `8797` service could simply be reused. Because the Finder wrapper runs silently in the background and had no preparation lock, repeated clicks started concurrent Vite builds against the same output directory. One build failed while emptying `dist/generated`; the surviving launch later failed an overly short health probe and exited before recreating the Electron window. An older, unrelated `hapa-dev-proto` process remained visible, which made the failure look like a source-of-truth mix-up even though the Avatar launcher never targeted dev-proto.

The same audit found that Electron inherited the preparation log for its entire lifetime. Repeated Chromium/Metal messages had grown `desktop-dedicated-launcher.log` to approximately 678 MiB and more than four million lines, making every diagnostic read unnecessarily expensive. Launcher and Electron output are now separated, oversized logs are timestamp-archived rather than deleted, and that known repeated graphics error is sampled.

Operational guardrails:

1. Reuse and open a healthy canonical `8797` endpoint before doing build work.
2. Serialize launcher preparation with an owned, stale-recoverable lock.
3. Preserve an existing Electron window by default and rely on Electron's single-instance focus behavior.
4. Treat window termination as explicit recovery via `HAPA_AVATAR_REPLACE_DESKTOP=1`, never routine launch behavior.
5. Rebuild only for a missing or mismatched endpoint, or explicit `HAPA_AVATAR_FORCE_REBUILD=1` maintenance.
6. Give local UI/API probes enough time to survive a busy workstation without misclassifying a healthy Hapa service.
7. If the registered canonical service still owns a listening `8797` while probes are delayed, preserve and open it; busyness is not authorization to restart it.
8. Keep preparation and long-lived runtime logs separate, threshold-rotated, and recoverable; repeated renderer noise is evidence to sample, not an append-only license to exhaust the workstation.
9. Focus an already-running Builder through its exact loopback desktop control before paying the cost of a second Electron bootstrap; retain Electron's single-instance lock as the fallback.

Lesson Card candidate: a launcher must validate and reuse the live canonical surface before it mutates build output or window state. A silent retry is a concurrency event, not permission to repeat destructive preparation.
