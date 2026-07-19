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
2. The shared `hapa-overcard` Hand remains the portable Card tray. Avatar Builder consumes its held Card references and projects accepted placements into Tarot Draw without creating another Hand or collection reducer.
3. Existing ordered Card placement and scene snapshots produce a canonical Formation payload.
4. A narrow adapter resolves each Gate-eligible Card's stable ID, revision, record digest, origin core key, role, orientation, and contiguous dial position for the tested Stargate derivation core. Camera, pose, hover, live Phone/Webcam presence, and other transient presentation state remain excluded.
5. A thin Stargate adapter calls the transplanted, tested derivation core and returns the semantic digest, private rendezvous topic, explanation, and truth state.
6. Existing Invite Cam / Roomlet / Phone Card participation gains the signed Stargate invitation and session-feed behavior.
7. Communication, consented comments, Wisdom evaluations, generated proposals, mint decisions, and build history return to the table as Cards rather than opening a parallel product workspace.
8. An explicitly human-minted Stargate Context Card publishes one origin event through Overwind. `.hapaCatalog` subscribes to that acknowledged identity and projects it into discovery, dossier, composition, and optional commerce surfaces without minting a second Card or becoming the Card head.
9. Builder's existing API and CLI gain parity routes over the same Stargate core. The renderer never owns secrets, peer keys, provider credentials, or mint authority.

## P0 hero interaction: Dial a Stargate

### Enter Dial mode

- Add **Stargate** to the existing Tarot control dock beside Save Scene and Invite Cam.
- Activating it morphs the existing center visualizer into a Gate aperture and reveals an ordered ring of magnetic Card slots. This reuses the current renderer, board rails, bursts, visualizer, shader, camera, and audio systems.
- The shared Hand remains visible and usable. Picking up a Hand Card and placing it into a Gate slot commits through Overcard Placement; ordinary Tarot Cards already on the table can be moved into the same slots.
- Slots are visibly numbered and connected in sequence. The sequence—not incidental world coordinates—defines dial order. Reordering a Card visibly invalidates the prior digest and prepares a different namespace.
- Only Cards with a complete stable identity can become Gate members. Incomplete or proposed Cards remain viewable but show a truthful **Needs Card identity** state instead of silently receiving invented authority.

### Activation sequence

Use a small state machine: `dormant -> arranging -> ready -> dialing -> active -> expired/disconnected`.

1. **Arranging:** each accepted Card snaps into a numbered slot; the table rail sends a short light pulse to that slot and the HUD names its role.
2. **Ready:** the system shows the ordered Formation summary, purpose, privacy scope, and Gate-readiness checks. The **Dial** action enables only after the closed Formation validates.
3. **Dialing:** Cards lift slightly in order; cyan/gold energy traces the chain; the center aperture spins open; the horizon tunnel and tabletop lighting intensify; the camera eases toward the Gate. Reduced-motion mode uses light, sound, and status changes without the camera move or rapid rotation.
4. **Active:** the HUD shows a redacted address, semantic digest fingerprint, connected participant count, and an explicit private/local truth label. Roomlet peers appear as participant Cards or stars around the aperture.
5. **Changed:** moving, replacing, or reordering a semantic member marks the current Gate stale and requires a deliberate redial. Camera movement and live Phone/Webcam presence do not change the address.

### Save Gate as a Card

**Implementation checkpoint (`NAV-001`, 2026-07-18):** implemented in the canonical Tarot Draw with domain/UI/API/CLI parity. The active Gate now reverses its energy flow, lifts and converges the ordered Cards, contracts into a physical proposed Context Card, and restores the exact Formation while remaining disconnected. The final truth and evidence audit is `docs/audits/2026-07-18-stargate-context-card.md`. Human mint, Overwind acknowledgement, Catalog projection, and fresh Pass issuance remain separate downstream tasks.

Avatar Builder already turns **Save Scene** into a restorable Scene Card containing the Tarot snapshot and canonical Formation. When a Gate is active, the same action becomes **Save Gate** and extends that existing Card with a safe `hapa.stargate-context-card.v1` envelope:

- restorable Tarot scene snapshot and canonical Formation;
- purpose, privacy scope, Card order, roles, revisions, digests, and origin references;
- semantic Formation digest, invitation commitment when present, Gate commitment, and redacted address;
- creator/node identity, timestamps, lineage, session/build evidence references, and truth status;
- connection policy `requires-fresh-gate-pass`.

The durable Card must not contain the cohort secret, raw invitation token, full rendezvous topic, full address, private key, local profile path, or bearer/provider credentials.

The saved Gate Card is immediately dealt onto the Tarot table using the existing Scene Card animation and can be placed into the shared Hand. Opening it later restores the exact scene and ordered Formation but never reconnects automatically.

### Pass the Card to another Hapa node

- The durable Gate Card is the human-facing object that can move through the shared Hand, Card core/custody, export, or another compatible node.
- Joining authority is a separately stored, short-lived signed **Gate Pass** attached transiently to that Card. This preserves the one-Card experience without writing capability secrets into Card history.
- A receiving node verifies the Card, resolves or accepts the Pass, asks for explicit local consent, and derives the same private namespace locally. If the Pass is absent or expired, the Card can still restore/teach the context and request a fresh Pass from an authorized inviter.
- A later Hapa Keys integration may seal a Pass to named recipient keys. P0 uses the already-tested opaque signed invitation and never represents it as a durable public Card field.

### Mint, live, and return through `.hapaCatalog`

The Catalog layer must demonstrate interoperability without creating a competing Card authority:

1. **Save Gate creates a proposal.** The Builder deals a proposed `hapa.stargate-context-card.v1` onto the table. It is restorable locally, but it is not described as minted, shared, acknowledged, sellable, or live in Catalog yet.
2. **Review & Mint is human-gated.** A compact review surface shows the exact ordered Formation, scene fingerprint, safe commitments, privacy scope, excluded secrets, revision, and origin. Only explicit approval appends the origin mint event.
3. **Overwind acknowledges the one identity.** The Builder reports `origin staged` until durable acknowledgement and a cursor exist. Only then may it report `Overwind acknowledged` for that exact Card ID and revision.
4. **`.hapaCatalog` subscribes and projects.** The existing subscriber indexes the acknowledged Card into Card Multiverse and hydrates its Living Card dossier. Catalog may own discovery, Deck membership, merchandising, entitlement, analytics, and an explicitly approved offer; it does not create another Card head or rewrite source history.
5. **Catalog returns to the source experience.** A stable `Open in Avatar Builder` action resolves the exact Card ID and pinned revision, restores the saved Tarot scene and ordered Formation, and remains disconnected until the user deliberately requests or supplies a fresh Gate Pass.

**Implementation checkpoint (`CAT-GATE-001`, 2026-07-18):** the source-side human review, one-event mint, durable Overwind acknowledgement, exact Catalog subscriber projection/status, and UI/API/CLI surfaces are implemented. The saved Return Card remains physically present on the 3D table and becomes the center of a four-stage custody ritual; its visual state never advances beyond the evidence returned by the origin and subscriber. Catalog records the Card as source-only with no inferred offer or second Card head. Cross-node return/deep-link presentation remains the next Catalog-facing task.

The visible sync rail is append-only and revision-specific:

`Proposed -> Origin staged -> Overwind acknowledged -> Catalog indexed`

It also has truthful exception states: `local-stale`, `revision mismatch`, `subscriber unavailable`, `pass absent`, and `pass expired`. A newer source revision appears as **Newer revision available**; Catalog never silently changes the namespace of a pinned Gate Card.

#### Avatar Builder actions

- **Save Gate** — create the proposed safe Context Card and deal it onto the existing table.
- **Review & Mint** — show the exact mint boundary and require a human decision.
- **View in .hapaCatalog** — enable only when Catalog has indexed the exact acknowledged Card revision; otherwise show the current sync state.
- **Copy Card Reference** — copy a stable Card ID/revision/source resolver, never a Pass or private address.
- **Add to Shared Hand** — keep the Card portable through the existing Overcard collection path.

#### `.hapaCatalog` actions and presentation

- Extend the existing Scene Portal reveal into a **Convergence Portal** for Stargate Context Cards rather than building another Catalog mini-app.
- The Living Card dossier presents: identity and hero media; Formation recipe; purpose/privacy; ordered member Cards; source scene; safe Gate commitments; lineage/history/comments; acknowledgement and projection watermarks; revision and freshness; discoverability, joinability, entitlement, and commerce as independent states.
- **Preview Context** reads the safe scene and Formation without joining.
- **Open in Avatar Builder** restores the exact pinned scene and Formation without reconnecting.
- **Request Gate Pass** asks an authorized inviter for a fresh transient capability.
- **Join Stargate** appears only when a valid, fresh Pass is present and still requires local consent.
- **Add to Deck**, **Add to Shared Hand**, **Inspect Live Lineage**, and **Compare Formation Revisions** reuse existing composition, dossier, and comparison grammar.
- P0 keeps the Card `commerce_eligible=false` and `source_only` unless a later explicit human policy creates an offer. Discoverable, deckable, owned, joinable, entitled, and sellable never collapse into one state.

The durable Card, Overwind history, Catalog projection, URLs, logs, and captures never contain the cohort secret, raw Pass, full rendezvous topic/address, private keys, credentials, or local paths. A Gate Pass is short-lived signed runtime authority linked to—but never embedded in—the durable Card.

## Golden demonstration cut

The shortest coherent judge path is:

1. Open the familiar Tarot Draw cockpit with a curated Build Week deck.
2. Draw and order a small Formation containing a Concept/Protocol Card, a Creator Content Card, and a Sponsor or Wisdom Card.
3. Enter Stargate mode and visibly derive a deterministic private meeting address from that exact ordered Formation.
4. Save the active Gate, review its safe envelope, and explicitly mint the one Stargate Context Card.
5. Watch the same Card advance from origin staging through Overwind acknowledgement into `.hapaCatalog`; open its Convergence Portal dossier, inspect its Formation/lineage, and add it to a named Deck.
6. Use **Open in Avatar Builder** to restore the exact scene and Formation from Catalog, still visibly disconnected.
7. Request a fresh Gate Pass and join from a second isolated profile or the existing Phone Card/Roomlet path; show why the peers matched without revealing the private address.
8. Exchange a signed communication or consented video comment that becomes a separate attributable proposed Card while the source Card remains unchanged.
9. Use the resulting context to request one local generated image or Card proposal, review it with a compact Wisdom set, and preserve human mint authority.
10. Call up the Build Week ledger as a spatial Card history, including the mistake, strategy correction, test evidence, demo clips, GPT Image memorials, and open Krea quests.

## Priority order

### P0 — submission spine

- The full Dial-a-Stargate activation sequence in the existing table, fed by the shared Hand.
- Formation-to-Stargate identity adapter and private derivation using the existing tested vectors.
- Save Gate through the existing Scene Card path, then place/pass that portable Context Card through the shared Hand.
- Explicitly human-mint the Context Card, receive Overwind acknowledgement, and project the exact revision automatically into `.hapaCatalog`.
- One source-aware Convergence Portal dossier with Formation, lineage, freshness, stable Builder restore, and transient Pass actions.
- One short-lived Gate Pass accepted by a second isolated Hapa profile, with no private capability material in the durable Card.
- One two-profile signed meeting and message path using existing Roomlet/Phone surfaces.
- Curated Build Week deck and build-history Cards in the existing family rail/browser.
- Existing Camera/Phone Card plus one durable consented Comment Card.
- Existing Electron packaging and a repeatable capture-safe golden route.

### Board implementation chain

`UI3D-001 Dial -> NAV-001 Save proposal -> CAT-GATE-001 human mint/sync -> CAT-GATE-002 Catalog dossier/return -> NAV-002 fresh Pass -> CAT-GATE-003 interoperability proof -> NAV-003 two-node replay -> STG-016 golden path`

The `.hapaCatalog` companion board owns the subscriber projection, Convergence Portal/Living Card presentation, deep-link resolver, and Catalog-side truth states. The Build Week board owns the cross-node golden path and evidence. Cross-board prerequisites are recorded as links and acceptance statements rather than pretending one append-only board controls another.

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
