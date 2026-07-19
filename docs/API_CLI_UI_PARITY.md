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

## Consented media Comment Card parity

All surfaces use the append-only service in `server/avatar-media-comment-service.mjs`. A finalized capture creates a separate proposed Comment Card plus Lesson and Result Cards; the exact source snapshot remains unchanged and nothing is minted automatically.

| Surface | Capture and custody behavior |
| --- | --- |
| UI | **Comment Cam** opens the consent-and-attribution chamber over the active Gate. Existing Camera Card records in place; **Phone · No Certificate** uses the native phone camera picker over a token-bound local HTTP page. **Reveal Card in 3D** exposes the separate amber Comment Card and animated lineage tether. |
| API | `/api/media-comments` plus capture, status, consent, binary media, revoke, and content-addressed asset routes. Physical-phone requests require the short-lived invite token. |
| CLI | `media-comments`, `media-comment-create`, `media-comment-status`, `media-comment-consent`, `media-comment-upload`, and `media-comment-revoke`. `HAPA_AVATAR_COMMENT_TOKEN` is the only CLI token source; `--token-out` prevents capability material from entering terminal history. |

Browser, physical-device, local-network, and broader-network claims remain separate. See `docs/CONSENTED_MEDIA_COMMENTS.md` and `tests/avatar-media-comment-parity.test.mjs`.

## Stargate Context Forge parity

The append-only `server/avatar-context-generation-service.mjs` is the sole packet/run authority. It freezes exact human-selected Card revisions in Gate order, then either creates a truth-labeled deterministic scaffold with no model call or invokes an explicitly selected loopback Ollama model with concrete provider/model/prompt provenance. Every output is a separate proposed, unminted Result Card and every source Card remains unchanged.

| Surface | Packet and proposal behavior |
| --- | --- |
| UI | **Context Forge** projects ordered Card glyphs into a sealed prism at the active Gate. **Evidence Scaffold** stays visibly non-generative; **Ollama Local** records the concrete invocation before revealing the textured Result Card in 3D. |
| API | `GET /api/context-generation`; `POST /api/context-generation/packets`; `GET /api/context-generation/packets/:packetId`; `POST /api/context-generation/runs`. |
| CLI | `context-packets`, `context-packet-freeze`, and `context-generate`; local model credentials are neither needed nor accepted in argv. |

See `docs/STARGATE_CONTEXT_FORGE.md`, `tests/avatar-context-generation-parity.test.mjs`, and the truth-audited capture manifest in `artifacts/demos/STG-012/`.

## Stargate Wisdom Council parity

The append-only `server/avatar-wisdom-council-service.mjs` is the sole seat, atomic-seal, dissent, and proposed-Card authority. One to three provider-model seats share one frozen Context Packet but each sees only its selected Wisdom Card. Structural disagreement is classified into five classes without score averaging or preferred-action selection; protected-value conflicts route to an accountable human.

| Surface | Council behavior |
| --- | --- |
| UI | **Wisdom Council** stages three peer-blind sentinel chambers over the active Gate, seals all seats together, reveals five dissent fault lines and the gold human dais, then emits separate Lesson and Result Cards in 3D. |
| API | `GET /api/wisdom-councils`; `POST /api/wisdom-councils/runs`. |
| CLI | `wisdom-foundation`, `wisdom-councils`, and `wisdom-council-run`; the provider is a credential-free loopback Ollama origin. |

See `docs/STARGATE_WISDOM_COUNCIL.md`, `tests/avatar-wisdom-council-service.test.mjs`, `tests/tarot-wisdom-council-visual.test.mjs`, and the truth-audited capture manifest in `artifacts/demos/STG-013/`.

Registry resolution is verified as follows:

- Quest Keeper maps `hapa-avatar-builder` to board `hapa-app-hapa-avatar-builder` in `hapa-quest-keeper/src/quest-core.mjs`.
- Hapa Dash discovers `/Users/calderwong/Desktop/hapa-avatar-builder/hapa-node.json` from its Desktop manifest scan and therefore resolves the canonical id and aliases.
- Node Space lists `hapa-avatar-builder` in `/Users/calderwong/Desktop/hapa/docs/NODE_MAP.md` and its canonical priority order.
- Second Brain/Worldbuilding retrieval uses the node record linked from the canonical manifest and the same aliases; the parity evidence bundle records the resolved paths.

`hapa-avatar-dashboard` is a different node and is never an alias of this app.
