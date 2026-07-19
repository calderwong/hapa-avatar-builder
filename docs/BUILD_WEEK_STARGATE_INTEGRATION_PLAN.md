# Build Week Stargate Integration Plan

Decision date: 2026-07-18  
Product owner: Calder Wong  
Active submission app: `/Users/calderwong/Desktop/hapa-avatar-builder`  
Protocol donor and Build Week evidence source: `/Users/calderwong/Desktop/hapa-tarot-stargate-reference`

## Strategy reset

The Build Week submission will be the canonical Hapa Avatar Builder with Stargate capabilities added to its existing 3D Tarot Draw. Work will not continue toward making the separate reference app visually equivalent to Avatar Builder.

The reference repository remains valuable as a tested protocol lab and append-only Build Week evidence source. Its completed domain modules, vectors, tests, Cards, and proof receipts may be transplanted or adapted with exact provenance. Its minimal 3D UI and replacement phone onboarding are not the product direction.

## Why this is the better use of the remaining sprint

- Avatar Builder already has the requested room-scale Tarot cockpit, Card interaction grammar, Card-family navigation, Camera Card, Phone Card, Invite Cam, Roomlet participants, media surfaces, Echo controls, scene persistence, Electron shell, and Hapa-specific visual language.
- The reference repository already earned substantial non-UI results: deterministic Formations and Stargate derivation, Card validation/custody, a shared service core, two-profile signed P2P proof, replayable signed session feeds, curated Build Week Cards, and consent-bound media-comment machinery.
- Integrating the proven core into the proven experience spends the remaining work on the unique demonstration instead of parity recovery.

## Retrospective: what went wrong

1. “Avatar Builder” was initially routed to the similarly named `hapa-avatar-node`, then to downstream `hapa-dev-proto`, instead of the canonical Builder.
2. Existing `docs/CANONICAL_SOURCE_OF_TRUTH.md` already named `TarotDraw3DView.jsx`, but it was not used as a mandatory first gate.
3. “Self-contained” was interpreted as permission to build a new UI rather than package and extend an existing one.
4. Protocol and renderer checks were allowed to stand in for product parity; no side-by-side visual/behavior review preceded implementation.
5. The phone connection was treated as new infrastructure even though Avatar Builder already had Phone Card, Camera Card, Invite Cam, and Roomlet flows.
6. The board described “extract minimal Tarot Draw shell,” encoding the wrong implementation strategy and making the duplication look intentional.

## What the reference build contributed

| Work | Disposition in Avatar Builder |
| --- | --- |
| STG-001 standalone repository and foundation | Preserve as Build Week source/evidence boundary; do not reproduce its shell |
| STG-002 build-as-Card ledger | Adapt into the Builder server/board path and expose its Cards on the canonical table |
| STG-003 minimal Tarot UI | Retire as product UI; salvage deterministic Formation adapter and tests |
| STG-004 Card envelope and type profiles | Adapt as a validation boundary around curated Build Week Cards; do not replace Builder’s authoritative stores wholesale |
| STG-005 per-Card Hypercore custody and catalog replay | Bring into the server/data boundary behind existing Card surfaces |
| STG-006 UI/API/CLI service spine | Port handlers/core behavior into Builder’s existing API and CLI; do not run a second product frontend |
| STG-007 curated Demo Pack | Import as a small Build Week deck/family with exact truth and attribution labels |
| STG-008 Stargate derivation and vectors | Transplant intact with exact vectors and provenance |
| STG-009 signed two-profile P2P handshake | Integrate beneath Roomlet/Invite flows; do not replace their UI |
| STG-010 signed session feeds and deterministic replay | Project communication as participant/message/result Cards in Tarot Draw |
| STG-011 consented media Comment Card service | Connect to existing Camera Card and Phone Card; discard the duplicate certificate-first presentation |
| STG-012 through STG-020 | Implement directly in Avatar Builder, narrowed to the golden demonstration |

## Target architecture

1. `TarotDraw3DView.jsx` remains the sole 3D product surface.
2. Existing ordered Card placement and scene snapshots produce a canonical Formation payload.
3. A thin Stargate adapter calls the transplanted, tested derivation core and returns the semantic digest, private rendezvous topic, explanation, and truth state.
4. Existing Invite Cam / Roomlet / Phone Card participation gains the signed Stargate invitation and session-feed behavior.
5. Communication, consented comments, Wisdom evaluations, generated proposals, mint decisions, and build history return to the table as Cards rather than opening a parallel product workspace.
6. Builder’s existing API and CLI gain parity routes over the same Stargate core. The renderer never owns secrets, peer keys, provider credentials, or mint authority.

## Golden demonstration cut

The shortest coherent judge path is:

1. Open the familiar Tarot Draw cockpit with a curated Build Week deck.
2. Draw and order a small Formation containing a Concept/Protocol Card, a Creator Content Card, and a Sponsor or Wisdom Card.
3. Enter Stargate mode and visibly derive a deterministic private meeting address from that exact ordered Formation.
4. Join from a second isolated profile or the existing Phone Card/Roomlet path; show why the peers matched without revealing the private address.
5. Exchange a signed communication or consented video comment that becomes a separate attributable proposed Card while the source Card remains unchanged.
6. Use the resulting context to request one local generated image or Card proposal, review it with a compact Wisdom set, and preserve human mint authority.
7. Call up the Build Week ledger as a spatial Card history, including the mistake, strategy correction, test evidence, demo clips, GPT Image memorials, and open Krea quests.

## Priority order

### P0 — submission spine

- Formation-to-Stargate adapter in the existing table.
- One two-profile signed meeting and message path using existing Roomlet/Phone surfaces.
- Curated Build Week deck and build-history Cards in the existing family rail/browser.
- Existing Camera/Phone Card plus one durable consented Comment Card.
- Existing Electron packaging and a repeatable capture-safe golden route.

### P1 — meaning and authority

- Small Wisdom evaluation and preserved dissent.
- Human proposal/review/mint boundary.
- Passport/flight-recorder replay inside the 3D history.

### P2 — only after the golden path is stable

- Sealed Context Packets and broader provider adapters.
- Additional Card families, economic simulation, public networking, or generalized platform administration.
- Any visual redesign unrelated to Stargate comprehension.

## Natural learning protocol for every remaining turn

Each meaningful turn or task checkpoint records seven fields:

1. **Objective:** what user outcome this turn serves.
2. **Nearest existing work:** the canonical surface inspected before building.
3. **Reuse decision:** reuse, adapt, transplant, or replace—with replacement requiring evidence.
4. **Observed evidence:** source, runtime, tests, screenshots, and human feedback kept distinct.
5. **Mistake or discarded path:** what did not serve the objective and why.
6. **Learning delta:** the new rule, relationship, or design insight future agents should inherit.
7. **Promotion candidates:** Skill, Lore, Lesson Card, Decision Card, Flow explainer, benchmark, or regression test.

The Codex Turn is the attributed raw source. Board events and docs are append-only derived records. Hapa Turn Miner may later ingest and connect the Turn; it must not erase disagreement, correction, or failed work.

## Stop gates that prevent a repeat

- No new UI before identifying and running the nearest existing Hapa implementation.
- No noun is resolved by repository-name similarity alone.
- No “self-contained” requirement is translated into a redesign without explicit human approval.
- No task reaches implementation before a reuse/transplant inventory exists.
- No visual feature is accepted from tests alone; compare it to the canonical product surface.
- No active app or user test session is restarted, navigated, or closed without explicit permission.
