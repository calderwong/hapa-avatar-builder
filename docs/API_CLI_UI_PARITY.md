# Hapa Avatar Builder API / CLI / UI parity

Verified 2026-07-11 for canonical node `hapa-avatar-builder`; aliases are `hapa-app-hapa-avatar-builder` and `Hapa Avatar Builder`.

| Surface | Identity and capabilities | Inputs / outputs | Authorization and errors | Evidence |
| --- | --- | --- | --- | --- |
| API | `/api/health` identifies `hapa-avatar-builder`; `/api/overcard/capabilities` returns the canonical Overcard envelope and HostTargets | JSON HTTP requests and revisioned JSON responses | Loopback defaults, exact-origin browser boundary, bearer gates for privileged origin operations; typed HTTP errors | `server/api.mjs`, `outputs/surface-parity/api-*.json` |
| CLI | `hapa-avatar` / `npm run cli`; `capabilities` returns the same node id, aliases, capabilities, and interface map | command/options in; JSON or concise text out | Local filesystem authority; invalid command or missing avatar exits non-zero with an actionable message | `cli/avatar-builder.mjs`, `outputs/surface-parity/cli-*.txt` |
| UI | Header identifies Hapa Avatar Builder and consumes the same catalog, HostTargets, process adapters, Hand, and capability host | pointer, keyboard, touch, route and card actions; visible state/recovery feedback | Shared changes require an online canonical host; offline actions are visibly rejected rather than implied committed | `outputs/shared-hand-header-visual-qa/report.json` |
| Desktop | Same UI and API with a scoped preload lifecycle bridge | status / ensure / reconnect only | context isolation, Node integration off, web security on, no credential exposure | `electron/main.cjs`, `electron/preload.cjs` |

## Portable Stargate Context Card parity

The canonical domain module is `src/domain/tarot-stargate-context-card.js`. All surfaces create the same `proposed_unminted` safe Card and restore the same exact ordered Formation in a disconnected state:

| Surface | Proposal | Restore |
| --- | --- | --- |
| UI | Dial a valid Gate in 3D Tarot Draw, then use **Save Gate**. The existing Scene Card persistence/deal path produces one physical Context Card. | Select the Card and use **Restore Gate**. The exact scene/Formation returns; a fresh Gate Pass remains required. |
| API | `POST /api/tarot/stargate/context-card/preview` with `sceneCard`, derived `stargate`, and optional safe origin/commitment fields. | `POST /api/tarot/stargate/context-card/restore` with `card`. Invalid schema, digest, snapshot commitment, or connection policy returns `422`. |
| CLI | `hapa-avatar stargate-context-card --scene-file <json> --stargate-file <json> [--actor <id>]` | `hapa-avatar stargate-context-restore --file <json>` |

The parity contract explicitly excludes cohort secrets, raw Passes/tokens, full rendezvous topics/addresses, private keys, credentials, and local paths. `tests/tarot-stargate-context-parity.test.mjs` compares the domain/UI core, isolated API, and CLI results for one fixture.

Registry resolution is verified as follows:

- Quest Keeper maps `hapa-avatar-builder` to board `hapa-app-hapa-avatar-builder` in `hapa-quest-keeper/src/quest-core.mjs`.
- Hapa Dash discovers `/Users/calderwong/Desktop/hapa-avatar-builder/hapa-node.json` from its Desktop manifest scan and therefore resolves the canonical id and aliases.
- Node Space lists `hapa-avatar-builder` in `/Users/calderwong/Desktop/hapa/docs/NODE_MAP.md` and its canonical priority order.
- Second Brain/Worldbuilding retrieval uses the node record linked from the canonical manifest and the same aliases; the parity evidence bundle records the resolved paths.

`hapa-avatar-dashboard` is a different node and is never an alias of this app.
