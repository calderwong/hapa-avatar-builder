# Krea 2 / Flux in Tarot Draw

## Outcome

The canonical Three.js Tarot Draw cockpit now attaches to the local Hapa Krea 2 Identity Node as an image-edit proposal lane. It reuses the selected Card and runtime field-card patterns without replacing Card Forge or changing the source Card.

The operator flow is:

1. Select a Tarot Card with a still image and open **Krea Edit**.
2. Bind the selected Card to Image 1. For two-reference presets, select another Card and bind Image 2.
3. Choose an enabled preset returned by the node. The Avatar Builder presets from the current node catalog are promoted as the demo defaults, with `avatar_builder_portrait_quality` preferred when available.
4. Enter a bounded instruction, acknowledge the consent, safety, and AI-disclosure assertions, and submit.
5. The Builder polls the node task and deals the successful artifact into the 3D field as a selected draft Card proposal.

The result is explicitly unminted, requires human review, is not identity truth, and records that the source Card remains unchanged.

## Ownership and boundary

- `src/components/TarotDraw3DView.jsx` owns the cockpit UI, selected-card slots, task progress, and runtime proposal materialization.
- `src/domain/tarot-krea2-edit.js` owns the Tarot-specific request and proposal-Card projection.
- `server/krea2-tarot-adapter.mjs` owns the loopback node adapter, token-file access, protected requests, and artifact proxying.
- `server/api.mjs` exposes only Builder-local Tarot routes under `/api/tarot/krea2`.
- `hapa-krea2-identity-node` remains the authority for the edit contract, enabled presets, operation defaults, task truth, and generated artifacts.

The browser never receives the node bearer token. By default, the server connects to `http://127.0.0.1:8774` and reads the node's owner-only `node.token` from `~/Library/Application Support/Hapa/Krea2IdentityNode/`. Server-only overrides are `HAPA_KREA2_URL`, `HAPA_KREA2_RUNTIME_ROOT`, `HAPA_KREA2_BEARER_TOKEN_FILE`, and, for controlled test environments, `HAPA_KREA2_BEARER_TOKEN`.

Offline is a valid and visible state. Tarot Draw does not invent fallback presets or claim an edit was dispatched when the node or protected catalog is unavailable.

## Builder routes

- `GET /api/tarot/krea2` — health, protected preset catalog, and safe boundary status.
- `POST /api/tarot/krea2/assets` — raw image upload proxied to the node's multipart asset endpoint.
- `POST /api/tarot/krea2/edits` — submit the node's `hapa.krea2_identity_edit.request.v2` packet.
- `GET /api/tarot/krea2/tasks/:taskId` — task progress and Builder-proxied artifact URIs.
- `POST /api/tarot/krea2/tasks/:taskId/cancel` — cancellation request.
- `GET /api/tarot/krea2/assets/:assetId/content` — credential-safe artifact stream.

## Verification checkpoint

Evidence gathered for this integration:

- Inspected the running canonical Tarot Draw cockpit before editing and preserved its 3D interaction model.
- Read the Krea node's current contract, preset catalog, API documentation, and adapter boundary before implementing the client.
- Verified the offline UI and disabled submission state with no node available.
- Verified live preset discovery and the full Builder → Krea fixture → Builder artifact path against the node's deterministic production-contract fixture. The downloaded artifact digest matched its content-addressed asset ID.
- Passed focused domain/adapter tests, the Overcard suite, the Tarot desktop smoke, and the production Vite build.

The repository-wide test run has two unrelated failures in `tests/echo-scene-keyframe-process-cli.test.mjs`; both correspond to pre-existing uncommitted Echo Scene changes that this work did not modify.

## Turn-to-lore reflection

- Objective: place this week's Krea 2 / Flux work inside the actual Tarot Draw demo surface while keeping trust boundaries legible.
- What worked: following the canonical Builder node skill separated this cockpit from the similarly named Avatar Node; reading the live node catalog prevented duplicated preset truth; the existing selected-Card and `spawnBrowserCard` patterns made the integration native to the cockpit.
- Noise removed: broad repository naming initially surfaced historical and neighboring Avatar projects; canonical repo instructions and the live `?view=tarot` UI resolved ownership.
- What changed: Tarot Draw gained an additive Krea panel, a server credential boundary, API-derived preset grouping, two-reference slots, explicit use assertions, task polling/cancellation, and proposal Card materialization.
- What remains reusable: the adapter and domain projector are UI-independent and can support future Card editors without moving credentials or copying preset configuration.
- New guardrail: no node preset may be silently recreated in the Builder, no protected Krea request may originate in browser code, and no generated artifact may be presented as mint, canon, or identity truth.
