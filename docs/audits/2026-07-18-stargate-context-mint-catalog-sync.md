# Stargate Context Card mint and Catalog sync audit

Verified: 2026-07-18  
Build Week tasks: `CAT-GATE-001` and companion `.hapaCatalog` task `HCAT-711`

## Result

Avatar Builder extends the existing Tarot Draw Return Card instead of creating another app or persistence model. The proposed Card enters one explicit human review. Approval promotes the safe source record to `origin_staged`, writes it and one append-only `card.created` event atomically, and preserves the local Card identity. The event receives one stable global Overwind Card ID.

An accepted response is not enough to claim acknowledgement. Avatar Builder reports `overwind_acknowledged` only when the exact event has durable acceptance and a positive ledger cursor. It then asks `.hapaCatalog`'s existing Overwind subscriber to consume deltas and checks the exact Card ID/revision. Catalog does not manually import the Card, create a second head, infer an offer, or gain join authority.

The terminal observation is pressed into a separate local `hapa.stargate-catalog-sync-result.v1` evidence Card. It contains the safe source/global identity, exact event/revision/cursor state, Catalog projection status, and explicit no-authority/no-offer boundaries. It is not a second Return Card head and does not claim to be canonical Overwind truth unless separately minted later.

## Visible truth states

`Proposed -> Origin staged -> Overwind acknowledged -> Catalog indexed`

Exceptions remain visible as `subscriber unavailable`, `local stale`, `revision mismatch`, `quarantined`, or a typed failure. The physical Return Card's 3D custody rig and UI chamber use those same returned states; cyan/gold Catalog completion is never shown before exact projection evidence exists.

## Security and authority boundary

- Review contains ordered Formation members, safe fingerprints/commitments, privacy scope, excluded-secret list, revision, and source origin.
- Durable Card and projection exclude cohort secret, Pass/token, full rendezvous topic/address, keys, bearer credentials, and local paths.
- Approval identity is explicitly `locally-asserted-not-remotely-verified` and requires a human control.
- Catalog projection is source-only, non-sellable, and has zero inferred offers.
- Opening the Card still restores a disconnected Formation and requires a fresh transient Gate Pass.

## Evidence

- Domain and origin: `src/domain/tarot-stargate-context-card.js`, `server/avatar-overwind-origin.mjs`, `server/stargate-context-mint-service.mjs`
- UI/API/CLI: `src/components/TarotDraw3DView.jsx`, `server/api.mjs`, `cli/avatar-builder.mjs`
- Catalog: `.hapaCatalog/src/overwind-card-subscriber.mjs`, `/v1/overwind/cards/:card_id/projection-status`, and `overwind status`
- Tests: `tests/tarot-stargate-context-card.test.mjs`, `tests/avatar-overwind-origin.test.mjs`, `.hapaCatalog/test/overwind-card-subscriber.test.mjs`
- Avatar Builder full suite: 966 passed, 0 failed on 2026-07-18; production build passed.
- Isolated product capture: `artifacts/demos/CAT-GATE-001/return-card-custody-relay.{mp4,png,json}`. Its manifest explicitly distinguishes deterministic visual acknowledgement fixtures from the separately tested real origin/subscriber behavior.
