# Hapa Avatar Builder Agent Guide

## Node Role

`hapa-avatar-builder` is the local-first React/Electron Avatar Card workbench. It owns Avatar Builder media cards, 3D Tarot Draw, scene/world attachments, Dear Papa song links, tarot/card attach packs, healing queues, and subscriber packets for Hapa Atlas, Second Brain, wiki, song, and visualization nodes.

## Source Of Truth

- `README.md` defines the run commands, CLI/API surface, and current operator workflow.
- `src/App.jsx` owns the operator UI, including the 3D Tarot Draw tab.
- `src/components/TarotDraw3DView.jsx` owns the Three.js tarot table.
- `src/domain/` owns normalization and attach-pack contracts for avatars, scenes, items, songs, tarot, media, and teams.
- `server/api.mjs` owns loopback API parity and subscriber event writeback.
- `cli/avatar-builder.mjs` owns scriptable avatar audits, attach packs, healing plans, and exports.
- `data/` stores local runtime state. Large mutable stores and media are intentionally ignored by Git; see `data/README.md`.

## Safe Edit Boundaries

- Preserve the 3D Tarot Draw surface when merging from generated or Pinokio app copies.
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

