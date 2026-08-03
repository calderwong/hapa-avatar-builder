# Hapa Avatar Builder API / CLI / UI parity

Verified 2026-07-11 for canonical node `hapa-avatar-builder`; aliases are `hapa-app-hapa-avatar-builder` and `Hapa Avatar Builder`.

| Surface | Identity and capabilities | Inputs / outputs | Authorization and errors | Evidence |
| --- | --- | --- | --- | --- |
| API | `/api/health` identifies `hapa-avatar-builder`; `/api/overcard/capabilities` returns the canonical Overcard envelope and HostTargets | JSON HTTP requests and revisioned JSON responses | Loopback defaults, exact-origin browser boundary, bearer gates for privileged origin operations; typed HTTP errors | `server/api.mjs`, `outputs/surface-parity/api-*.json` |
| CLI | `hapa-avatar` / `npm run cli`; `capabilities` returns the same node id, aliases, capabilities, and interface map | command/options in; JSON or concise text out | Local filesystem authority; invalid command or missing avatar exits non-zero with an actionable message | `cli/avatar-builder.mjs`, `outputs/surface-parity/cli-*.txt` |
| UI | Header identifies Hapa Avatar Builder and consumes the same catalog, HostTargets, process adapters, Hand, and capability host | pointer, keyboard, touch, route and card actions; visible state/recovery feedback | Shared changes require an online canonical host; offline actions are visibly rejected rather than implied committed | `outputs/shared-hand-header-visual-qa/report.json` |
| Desktop | Same UI and API with a scoped preload lifecycle bridge | status / ensure / reconnect only | context isolation, Node integration off, web security on, no credential exposure | `electron/main.cjs`, `electron/preload.cjs` |

## Echo Album Master Reference export parity

All three surfaces invoke the same pure Markdown compiler in
`src/domain/echo-master-reference-export.js`. The operation is read-only and
preserves source authority, review, rights, privacy, and lineage fields.

| Surface | Export behavior |
| --- | --- |
| UI | **Export Master Reference** downloads the full snapshot; **Lyrics + Main References** downloads the under-3-MB curated profile. |
| API | `GET /api/echos/master-reference` returns the full live snapshot; add `?profile=condensed` for the size-capped lyrics/main-reference profile. Both use `text/markdown`, attachment filenames, and no-store caching. |
| CLI | `npm run echo:master-reference`; add `--condensed` for the 3,000,000-byte profile. Both accept `--out`, `--stdout`, source-path overrides, and fixed `--generated-at` for fixtures. |

The shared output schemas are `hapa.echo-album-master-reference.v1` and
`hapa.echo-album-condensed-reference.v1`. See
`docs/ECHO_MASTER_REFERENCE_EXPORT.md` and
`tests/echo-master-reference-export.test.mjs`.

## Per-Card Hypercore custody parity

Every durable Builder Card receives a real per-Card Hypercore when it first becomes durable. This root `card.created` event is separate from mint, Overwind acknowledgement, Catalog publication, commerce eligibility, and canon.

| Surface | Create/read custody |
| --- | --- |
| UI | Tarot Draw Stargate uses **Create Cores & Lock Coordinates** for identity-missing legacy projections. The protected same-machine operation returns and applies the exact custody receipt before Gate derivation. |
| API | `GET /api/cards/custody[?cardId=...]`; protected `POST /api/cards/custody/ensure`. Exact reads verify the named Card core; index reads use the compact registry and create nothing. |
| CLI | `card-custody-status`; `card-custody-ensure --file <card.json> --actor <id>`. Mutation authority comes from `HAPA_AVATAR_ADMIN_TOKEN`, never argv. |
| Data | One origin Hypercore per durable Card plus one append-only registry Hypercore under the ignored runtime root `data/card-custody/`. |

All surfaces return `hapa.card-custody-receipt.v1`. See `docs/CARD_HYPERCORE_CUSTODY.md` and `tests/card-custody-parity.test.mjs`.

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

## Human Enricher parity

The canonical overlay schema is `hapa.human-video-enrichment-store.v1` in `src/domain/human-video-enrichment.js`. It preserves source media and projects matching human direction into Echo State director timeline responses by content fingerprint, media/asset ID, source path, or URI.

| Surface | Human Enricher behavior |
| --- | --- |
| UI | **Human Enricher** lists all videos collected from System Media, Avatar, Tarot, scene, and read-only Hell Week sources; it edits Quality 1–5, `@Avatar` links, Director Notes, and typed references. Edits autosave after 350 ms, navigation flushes a pending edit, and Quality begins at the agent proposal when no human grade exists. |
| API | `GET /api/human-enricher/videos` returns video metadata, relationships, options, and current overlays. `PUT /api/human-enricher/records` performs an optimistic-revision save. `GET /api/echos/director-project` includes matching `human_enrichment` fields on timeline shots. |
| CLI | `human-enricher-list` exposes the same read model; `human-enricher-save --file ... --actor ...` uses the same revisioned write endpoint. |
| Data | Current overlays are in ignored `data/human-video-enrichments.json`; append-only update receipts are in `data/human-video-enrichment-events.ndjson`. |

### Optical proposal parity

| Surface | Optical review behavior |
| --- | --- |
| UI | Provides full-catalog review-set views for Optically reviewed, Needs human validation, Human validated, and Not optically reviewed records. It shows the exact inspected filmstrip, per-frame observations, optical attestation, proposal confidence/uncertainty, a dedicated visual Hapa/Echo reference analysis, suggested relationships/references, Hapa source citations, and Use/Edit/Append/Reject human controls. It also exposes the live human-versus-agent quality calibration summary. |
| API | `GET /api/human-enricher/videos?review=agent-reviewed` returns the complete reviewed set with filtering applied before pagination plus aggregate human quality calibration. `GET /api/human-enricher/agent-reviews` exposes the same calibration and a resumable evidence queue whose instructions require explicit visual-reference analysis. `PUT` accepts only hash-bound, optically attested proposals with a completed visual-reference pass. `POST /api/human-enricher/agent-reviews/:id/decision` records explicit human outcomes. |
| CLI | `human-enricher-agent-queue`, `human-enricher-agent-submit`, and `human-enricher-agent-decision` consume the same routes. |
| Data | Pending proposals and append-only events are separate from human enrichment in `data/human-video-agent-reviews.json` and `data/human-video-agent-review-events.ndjson`. |

Queue and import automation may extract/hash frames and validate receipts only. It cannot make semantic or quality judgments. Pending proposals never project into Echo State.

These records are human direction only. They do not establish canon, ownership, rights clearance, publication approval, or render authority.
