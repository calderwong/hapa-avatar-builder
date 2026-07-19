# Stargate Catalog return and exact-pin restore audit

Verified: 2026-07-18  
Build Week task: `CAT-GATE-002` with companion `.hapaCatalog` task `HCAT-713`

## Result

The existing Hapa Avatar Builder Tarot Draw now accepts a deliberately narrow `.hapaCatalog` handoff containing only a stable global Card ID, a positive pinned revision, the `hapa-avatar-builder` source identifier, and one allowlisted intent. Avatar Builder resolves the exact Card revision from its local origin history, live Overwind history, or a bounded exact-revision subscriber cache. It never substitutes a newer head for the requested pin.

After resolution, the existing Tarot scene loader rebuilds the ordered Formation and deals the original Return Card through the existing 3D scene. The restored Gate is always `disconnected`, carries no session authority, and cannot Join. A newer source revision is displayed as an explicit choice without changing the pin.

The visual re-entry is a continuation of the Tarot Draw experience: the exact Return Card arrives as the hero object inside the cyan/gold Gate, the four member Cards remain spatially legible, and a clipped-glass `.hapaCatalog Return` instrument explains custody and the fresh-Pass boundary. This is not a replacement scene or a parallel mini-app.

## Transient Pass boundary

`Request Fresh Gate Pass` is an explicit local act protected by the existing trusted-local-UI/admin boundary. The current implementation creates only a short-lived, memory-only request receipt. It does not manufacture a Pass, begin P2P transport, or enable Join. The subsequent signed-Pass exchange and two-peer arrival remain separate Build Week work.

The direct exact-Card resolver and Pass-request staging remain available when Catalog is offline. Catalog is a discoverable projection and handoff surface, not a rendezvous dependency.

## URL and authority allowlist

Accepted query fields are:

- `view=tarot`
- `stargate_card=<global Card ID>`
- `stargate_revision=<positive integer>`
- `stargate_source=hapa-avatar-builder`
- `stargate_intent=restore_disconnected|request_pass`

The Card, query, response, UI, screenshots, and logs exclude raw Gate Passes, full topics or addresses, cohort secrets, invitation tokens, private keys, bearer credentials, and local paths. Preview and restore are read-only with respect to connection authority.

## Parity and evidence

- UI: `.hapaCatalog Return` exact-pin panel in the canonical Tarot Draw.
- API: `GET /api/tarot/stargate/context-card/resolve` and `POST /api/tarot/stargate/pass/request`.
- CLI: `stargate-context-return` and `stargate-pass-request`.
- Tests: exact origin revision, exact bounded-cache restore, transient consented request, and parity checks.
- Production build: passed on 2026-07-18.
- Isolated visual evidence: `artifacts/smoke/CAT-GATE-002/catalog-return-restored.png` and `catalog-return-pass-requested.png`.
- Isolated proof observed four sealed Formation members, exact revision 1, disconnected state, fresh-Pass requirement, locked Join, no full address, no secret-bearing field, and `userAppTouched: false`.

## Claim boundary

This slice proves exact revision re-entry, disconnected Formation reconstruction, and an explicit transient Pass-request boundary. It does not yet prove a peer-issued signed Pass, network rendezvous, remote consent, or second-node arrival; those claims belong to the later two-peer round-trip tasks.
