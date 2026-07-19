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

| Surface | Proposal / restore | Human mint and exact sync proof |
| --- | --- | --- |
| UI | Dial a valid Gate in 3D Tarot Draw, then use **Save Gate**. Select the Card and use **Restore Gate** to restore the exact disconnected Formation. | **Review & Mint** shows Formation, fingerprints, commitments, excluded authority, origin, and revision. The four-stage 3D custody relay illuminates only from returned evidence. |
| API | `POST /api/tarot/stargate/context-card/preview`; `POST /api/tarot/stargate/context-card/restore`. | `POST .../review`; authenticated `POST .../mint`; `GET .../status?cardId=...`. |
| CLI | `stargate-context-card`; `stargate-context-restore`; `stargate-context-review --file <json>`. | `stargate-context-mint --card-id <id> --approve --actor <human-id>` and `stargate-context-status --card-id <id>`. The bearer token comes only from `HAPA_AVATAR_ADMIN_TOKEN`, never argv. |

The parity contract explicitly excludes cohort secrets, raw Passes/tokens, full rendezvous topics/addresses, private keys, credentials, and local paths. Minting preserves one stable global Card ID: Avatar Builder stages one `card.created` event, Overwind alone acknowledges it with a durable cursor, and `.hapaCatalog` consumes that exact Card/revision through its existing subscriber. Catalog remains a source-only, non-sellable projection until separate governed commerce authority exists.

Registry resolution is verified as follows:

- Quest Keeper maps `hapa-avatar-builder` to board `hapa-app-hapa-avatar-builder` in `hapa-quest-keeper/src/quest-core.mjs`.
- Hapa Dash discovers `/Users/calderwong/Desktop/hapa-avatar-builder/hapa-node.json` from its Desktop manifest scan and therefore resolves the canonical id and aliases.
- Node Space lists `hapa-avatar-builder` in `/Users/calderwong/Desktop/hapa/docs/NODE_MAP.md` and its canonical priority order.
- Second Brain/Worldbuilding retrieval uses the node record linked from the canonical manifest and the same aliases; the parity evidence bundle records the resolved paths.

`hapa-avatar-dashboard` is a different node and is never an alias of this app.
