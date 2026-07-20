# Card custody-at-birth correction

Date: 2026-07-19  
Objective: make every durable Card usable as a Stargate coordinate through real append-only custody.

## Evidence inspected

- `hapa-tarot-stargate-reference/src/core/card-custody.mjs`
- Avatar Builder `buildTarotDrawCards`, Tarot normalization, Stargate identity resolution, UI, API, CLI, and current runtime stores
- Hapa Protocol Standards and Universal Card Plane ownership split
- The explicit user decision that an individual Hapa Card plus its Hypercore is the decentralized document/history unit

## What worked

- The reference service already proved one writable Hypercore per Card, deterministic storage naming, append-only registry, verification, and replay.
- Avatar Builder already had the correct Tarot cockpit, ordered Formation, same-machine session gate, API/CLI spine, and Overwind publication boundary.
- A compact registry projection lets startup hydrate known receipts without opening every Card core.

## What was misunderstood

The runtime Tarot deck contains many Card-shaped projections from Item, Avatar, song, and other stores. The UI treated those projections as Hapa Cards, while their origin records often had no per-Card custody. The first Stargate correction generated session-local deterministic hashes so the demo could proceed without overstating them as Hypercore writes. That truth label was honest, but the architecture was wrong for the stated Card-as-document model: the workaround made identity usable without actually creating Card custody.

## What changed

- Custody now begins with `card.created`, not with mint approval.
- Mint, Overwind acknowledgement, Catalog publication, commerce eligibility, and canon remain separate authority states.
- The temporary projection-hash path was removed from the product.
- Legacy projections upgrade lazily only when first used or explicitly captured.
- Tarot normalization and Item projection preserve existing custody receipts.
- Stargate UI/API/CLI create or verify real Card cores and use their exact core/revision/digest commitments.
- Live Phone/Camera streams remain ephemeral until explicitly captured as Cards.

## Remaining bounded gaps

- Avatar Builder currently verifies only the root `card.created` event; append-only `card.revised` support is a follow-up.
- Per-Card Hypercore adoption is not yet proven across every Hapa Card-producing node.
- Origin-only custody is not an Overwind acknowledgement or proof of peer replication.
- Human product QA in the running canonical Tarot Draw remains required before the board cards leave Review.

## New guardrail

If a Hapa interface presents an object as a durable Card, its identity must resolve to a real origin custody receipt. A projection may remain visibly ephemeral, or the application may offer a bounded operation that creates the Card core. It must never fabricate `cardCoreKey`, use a semantic hash as custody, or couple custody creation to mint, commerce, publication, or canon.

## Reuse candidates

- **Lesson Card:** Card-shaped projection is not durable Card custody.
- **Protocol Card:** custody at Card birth; authority states remain orthogonal.
- **Skill candidate:** lazily migrate legacy Card projections without startup fan-out.
- **Flow explainer:** source material → Card core → Stargate Formation → optional mint → Overwind acknowledgement → Catalog projection.
