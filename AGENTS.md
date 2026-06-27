# Hapa Avatar Builder Agent Guide

## Node Role

`hapa-avatar-builder` is the local-first React/Electron Avatar Card workbench. It owns Avatar Builder media cards, 3D Tarot Draw, scene/world attachments, Dear Papa song links, tarot/card attach packs, healing queues, the Hapa Music Video Director Agent (timeline matching/scaffolding plans), and subscriber packets for Hapa Atlas, Second Brain, wiki, song, and visualization nodes.

## Source Of Truth

- `README.md` defines the run commands, CLI/API surface, and current operator workflow.
- `src/App.jsx` owns the operator UI, including the `Tarot Library` and `Tarot Draw` tabs.
- `src/components/TarotLibraryView.jsx` owns deck/set/card/back/loop/avatar-link management.
- `src/components/TarotDraw3DView.jsx` owns the Three.js tarot table.
- `src/domain/` owns normalization and attach-pack contracts for avatars, scenes, items, songs, tarot, media, and teams.
- `server/api.mjs` owns loopback API parity and subscriber event writeback.
- `cli/avatar-builder.mjs` owns scriptable avatar audits, attach packs, healing plans, and exports.
- `data/` stores local runtime state. Large mutable stores and media are intentionally ignored by Git; see `data/README.md`.
- `docs/CANONICAL_SOURCE_OF_TRUTH.md` records the Pinokio duplicate branch, canonical launcher, and historical session anchors.

## Safe Edit Boundaries

- Open `/Users/calderwong/Desktop/hapa-avatar-builder` for Hapa Avatar Builder work. Do not extend `/Users/calderwong/pinokio/api/hapa-avatar-builder-desktop/app` unless explicitly doing provenance recovery.
- Desktop launch gotcha: `8787` can be API-only. Electron must load a port that serves Hapa Avatar Builder HTML at `/`; current launcher logic probes and may reuse `8789` or another fallback UI/static API port. The known-good Desktop entry points are `/Users/calderwong/Desktop/Launch Hapa Avatar Builder.app` and `/Users/calderwong/Desktop/Launch Hapa Avatar Builder.command`, both backed by `scripts/launch-desktop-dedicated.zsh`.
- Preserve the 3D Tarot Draw surface when merging from generated or Pinokio app copies.
- Preserve the Tarot Library management surface when merging from the Pinokio app copy.
- Do not overwrite Avatar IDs when duplicate app copies diverge. If an incoming ID points to a different identity, import it under a provenance-marked replacement ID.
- Keep generated media, backups, subscriber logs, Overwind projections, build output, dependency folders, secrets, and local runtime stores out of Git.
- Before changing stores, create a backup under `data/backups/`.
- Prefer repeatable scripts for data merges and audits. Record merge reports under `data/merge-reports/`.
- Maintain UI/API/CLI parity when adding new cards, tarot, media, song, or world-store behavior.

## Verification

```bash
npm test
npm run build
npm run smoke:tarot
```

For the 3D Tarot surface, also run the app and verify the `Tarot Draw` tab renders a nonblank canvas.
