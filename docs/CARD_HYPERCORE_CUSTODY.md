# Hapa Card Hypercore custody

Status: first-pass implementation, verified locally 2026-07-19  
Canonical application: `/Users/calderwong/Desktop/hapa-avatar-builder`  
Protocol donor: `hapa-tarot-stargate-reference/src/core/card-custody.mjs`

## Decision

Every durable Hapa Card receives append-only Hypercore custody when it first becomes a Card. Custody creation and mint authority are separate events.

Raw Item, Avatar, song, phone, webcam, model, or API material may exist before it is captured as a Card. Once Avatar Builder presents a durable object as a Hapa Card and the operator first uses or captures it, the Builder creates its origin core and appends `card.created`.

`card.created` establishes:

- stable Card ID;
- origin Hypercore key and origin public key;
- immutable root revision ID and canonical record digest;
- semantic snapshot with bounded attribution and source references;
- append-only origin history.

It does **not** establish:

- mint approval;
- Overwind acknowledgement or replication;
- `.hapaCatalog` publication;
- commerce eligibility, price, budget, ownership transfer, or sale;
- canon or ecosystem endorsement.

## Lifecycle

| State | Hypercore custody | Authority meaning |
| --- | --- | --- |
| Raw source material | No | Source-owned input; not yet a Hapa Card |
| Live Phone/Camera stream | No | Ephemeral presence until an explicit capture creates a Card |
| Draft/proposed Hapa Card | Yes | `card.created` exists at the origin; no mint or publication implied |
| Minted Card | Yes, same core | A later explicit human authority event accepted this Card revision |
| Overwind acknowledged | Yes, same core | Overwind durably acknowledged the published origin event/cursor |
| Catalog projected | Yes, same core | `.hapaCatalog` references the acknowledged Card; it is not a new Card head |
| Commerce enabled | Yes, same core | A separate governed commerce decision exists |

## Runtime implementation

`server/card-custody-service.mjs` owns the local origin-core service. Mutable core storage is runtime-only under `data/card-custody/` by default and is excluded from Git.

- One Hypercore is created per durable Card.
- A separate append-only registry Hypercore maps Card IDs to their origin cores.
- `ensure` is serialized and idempotent: an existing Card returns the same verified receipt.
- Exact Card reads open and verify only that Card core.
- Index hydration reads compact registry receipts and does not open every Card core.
- Startup and deck construction never bulk-create legacy cores.
- Unregistered existing core storage fails closed instead of being overwritten.

Current bounded limitation: the Builder service verifies the root `card.created` event only. Append-only `card.revised` support remains a follow-up; no mutable update path is exposed.

## Lazy legacy upgrade

Legacy Item, Avatar, song, and Tarot projections remain cheap to load. When an operator places an identity-missing projection into a Stargate and chooses **Create Cores & Lock Coordinates**, Avatar Builder:

1. establishes the same-machine protected UI session;
2. creates or verifies the exact Card's Hypercore;
3. appends `card.created` only when no registered origin exists;
4. applies the returned custody receipt to the live Card projection;
5. derives the Stargate from the real `cardCoreKey`, revision, and record digest.

Persisted registry receipts hydrate matching Card projections after restart. Incoming source projections cannot erase an already verified receipt during the running Tarot session.

The retired session-hash preparation path was intentionally removed. A deterministic hash must never be labeled or consumed as Hypercore custody.

## Parity surface

| Surface | Operation |
| --- | --- |
| UI | Tarot Draw → Stargate → **Create Cores & Lock Coordinates** |
| API | `GET /api/cards/custody[?cardId=...]`; protected `POST /api/cards/custody/ensure` |
| CLI | `card-custody-status`; `card-custody-ensure --file <card.json> --actor <id>` |
| Data | Runtime-only origin and registry Hypercores under `data/card-custody/cores/` |

The API and CLI return the same `hapa.card-custody-receipt.v1`. CLI mutation authority comes from `HAPA_AVATAR_ADMIN_TOKEN`; tokens are never accepted in argv.

## Verification

- `tests/card-custody-service.test.mjs`: creation, idempotency, restart verification, live-bridge rejection, and receipt binding.
- `tests/card-custody-parity.test.mjs`: bounded file-based UI/API/CLI spine proof with one isolated API child and one sequential CLI child.
- `tests/tarot-stargate-hero.test.mjs`: the Stargate consumes a verified Hypercore receipt and exposes no session-hash custody action.

## Protocol delta

The released Universal Card Plane previously required native origin custody plus immutable outbox events, but did not require a per-Card Hypercore at Card birth. Avatar Builder now treats the per-Card origin core as the local decentralized document/history layer and the Overwind outbox as the later acknowledged publication/subscriber layer. Neither replaces the other.
