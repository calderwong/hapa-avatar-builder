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

## Echo Score Dust visual-score parity

All three surfaces call the same pure builders in
`src/domain/echo-visual-score.js` over one saved Audio Atlas run. The operation
is read-only: it composes or validates a score and never writes Atlas results,
reviews, Songs or Director projects.

| Surface | Behavior |
| --- | --- |
| UI | **Score Dust** (`builtin:score-dust`) in the Echo preview visualizer list loads the newest completed Atlas run's score for the selected Song, falls back to the prepared performance, then to an explicit live-reflex-only mode. The canvas footer names the source, cue, formation and next event. |
| API | `GET /api/echos/audio-atlas/jobs/RUN/query?op=visual-score[&pulse=half\|normal\|double&seed=N]` returns `timeline`, `score`, `validation` and `playSettings`. `POST /api/echos/audio-atlas/jobs/RUN/visual-score` accepts `{direction?, score?, assets?, playSettings?}` to compose a directed score or validate a supplied one. |
| CLI | `node cli/audio-atlas.mjs visual-score RUN [--direction=FILE] [--score=FILE] [--assets=a,b] [--pulse=…] [--seed=N]`. |

Schemas: `hapa.echo.musical-timeline.v1`, `hapa.echo.visual-score.v1`,
`hapa.echo.dust-play-settings.v1`. See `docs/ECHO_SCORE_DUST.md`,
`tests/echo-visual-score.test.mjs` and `tests/echo-dust-swarm.test.mjs`.

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

### Optical and Reference Atlas proposal parity

| Surface | Optical and reference review behavior |
| --- | --- |
| UI | Provides full-catalog review-set views for Optically reviewed, Needs human validation, Human validated, and Not optically reviewed records. The optical panel shows the exact inspected filmstrip, per-frame observations, attestation, confidence, uncertainty, and an independent visually estimated `#RRGGBB` palette directly beneath each First/Mid/Last frame. It never synthesizes a whole-video palette. A passive campaign strip shows Terra setup, queued/active/finalizing/submitted/failed counts, expired leases, frame-preparation deferrals, and captured token receipts split into locally bound versus legacy-unbound counts. A separate reference panel shows the bounded packet profile, exact Atlas run hash/digest, evidence-class mix, and Card-only matches. Use/Edit/Append/Reject human controls and live quality calibration remain separate from both proposal passes. |
| API | `GET /api/human-enricher/videos?review=agent-reviewed` returns the complete reviewed set plus aggregate human quality calibration. `GET/PUT /api/human-enricher/agent-reviews` serves optical worker packets without embedding existing mixed-pass reviews; new direct submissions must match the current registered frame manifest, cannot preempt a campaign-reserved video, always become pending/blocked, strip forged human/scheduler authority, require 3–8 explained colors plus prevalence and uncertainty on every First/Mid/Last frame, and reject explicit named-reference assertions. `GET/POST /api/human-enricher/optical-campaign*` adds resumable SHA-256 manifest-bound planning, at most three live opaque leases, immutable claim configuration and job/attempt/frame/lease-bound telemetry, lease recovery, strict vision-only normalization, and normalized-result-digest prepare/finalize completion under owner-checked cross-process locks. Its status projection exposes active/recent worker identity, current video, attempt, lease freshness, First/Mid/Last progress, compliant-vs-legacy palette coverage, and append-only recent activity without exposing lease secrets. Lease-bound `/jobs/:id/progress` receipts can only advance manifest-valid completed frame ordinals. Status and claim reconcile partial completion safely, finalizing matching reviews or requeueing expired reviewless preparations under shared custody. The complete endpoint re-hashes and exactly compares the current registered frames before accepting a proposal. `GET /api/human-enricher/reference-card-packets` builds a bounded packet from the canonical Reference Atlas runtime. `GET/PUT /api/human-enricher/reference-reviews` serves an independently configured worker queue and rejects Card IDs outside the packet. `POST /api/human-enricher/agent-reviews/:id/decision` is the only route that records explicit human outcomes. |
| CLI | `human-enricher-optical-campaign-plan/status/claim/progress/complete/fail/telemetry` operate the durable vision-only campaign; `progress` records forward-only leased phase and frame ordinals for visible telemetry. `human-enricher-agent-queue`, `human-enricher-agent-submit`, and `human-enricher-agent-decision` remain the manual proposal surface. `human-enricher-reference-packet`, `human-enricher-reference-queue`, and `human-enricher-reference-submit` operate the separate Reference Atlas pass. Profiles are `echo-reference-cards` (258 direct/source-backed), `echo-reference-wide` (853 resolved), `echo-reference-exploratory` (all 1,103), `echo-core-cards` (489 references/songs/Avatars), and `hapa-card-library`; counts describe the 2026-08-03 snapshot and travel with each packet. |
| Data | Pending optical proposals/events live in `data/human-video-agent-reviews.json` and `data/human-video-agent-review-events.ndjson`. Campaign claims and scheduler receipts live separately in ignored `data/human-video-optical-campaign.json` plus its append-only event log. Reference proposals/events live separately in `data/human-video-reference-reviews.json` and `data/human-video-reference-review-events.ndjson`. The selected Atlas projection is `data/echo-reference-research-loop/projected-run.json`; the original 85-entry catalog remains a legacy input, not the complete discovery surface. |

Queue and import automation may extract/hash frames and validate receipts only. It cannot make semantic or quality judgments. Reference workers may compare optical evidence only with their supplied packet, and packet breadth never changes Card authority. Pending proposals never project into Echo State.

These records are human direction only. They do not establish canon, ownership, rights clearance, publication approval, or render authority.

## Motion Avatar Sources (2026-10-15 prototype)

- UI: Builder's optional **Motion Avatar Sources** section, image picker/drop, existing reorder/preview/delete and save queue.
- Contract: image assets with `requirementId: motion_avatar_source`; optional, no completeness quota.
- API: existing `GET /api/avatars/:id/attach?target=motion-avatar` adds `motionAvatarSources`.
- CLI: `node cli/avatar-builder.mjs attach <id> --target motion-avatar --json` returns the same list.
- Evidence: `tests/motion-avatar-source.test.mjs` covers persistence/normalization, ID/provenance export, optional scoring, reorder/move/remove, image-only domain guards and isolated-store CLI pickup.
- Boundary: image intake is implemented; automated rigging, rig review and audio acceptance remain downstream work. See [operator and agent flow](MOTION_AVATAR_SOURCES.md).

## Avatar Voice Cards and Scripts — local prototype

UI: Builder → Voice & Scripts. Shared service: `server/avatar-voice.mjs`; authenticated routes: `/api/avatar-voices/:avatarId`; CLI: `node cli/avatar-voice.mjs`. Capture, list, scripts, generation, cancellation, archive/restore, and audio retrieval have the same owner. Player bundles use the authenticated API and UI download. See [contract and evidence limits](AVATAR_VOICE_CARDS.md). Real cloning acceptance requires installed OmniVoice weights and a permitted reference recording; fixture audio does not establish voice quality.
