# Stargate Context Card audit

Date: 2026-07-18  
Build Week task: `NAV-001`  
Canonical product surface: `src/components/TarotDraw3DView.jsx`  
Status: implemented; final task memorial and focused commit are recorded on the Build Week board

## Objective

Turn an active ordered Tarot Stargate into one portable Hapa Card that can restore the exact safe scene and Formation on a compatible node, while ensuring that durable Card history never contains the authority needed to join a private meeting.

The product story is deliberately physical: the active Gate reverses its energy flow, the member Cards rise and converge, the aperture contracts, and a premium Context Card deals back out of the Gate. Loading that Card restores the ordered Formation in a visibly disconnected state.

## Nearest existing work inspected first

- Avatar Builder's existing `buildTarotDrawSceneCard`, scene snapshot, physical deal, scene load, shared Card browser/Hand, and 3D Tarot renderer.
- The existing Build Week Stargate Formation, deterministic derivation, truth HUD, privacy boundary, and public test vector.
- The donor reference repository's protocol tests and evidence. The donor did not supply a product-parity Save Gate interaction, so no donor UI was copied.

## Reuse decision

**Adapt the existing Scene Card path.** `Save Gate` does not create a parallel persistence model or a second 3D application. It wraps the existing restorable Scene Card with a safe `hapa.stargate-context-card.v1` envelope, persists it through the existing Tarot Card API, and deals it through the existing scene-card animation.

The normal scene loader remains the restore mechanism. A narrow Context adapter adds validation, custody precedence, a disconnected truth state, and the fresh-Pass rule.

## Durable envelope

The portable Card includes:

- exact ordered semantic Formation members, roles, orientation, revision, origin core key, and record digest;
- a safe restorable Tarot scene snapshot and its SHA-256 commitment;
- semantic Formation digest, Gate commitment, privacy scope, purpose, protocol version, and redacted address;
- proposal truth state, origin, parent Card IDs, explicit mint authority, and `requires-fresh-gate-pass` connection policy;
- generated portable Card artwork and a source-labeled derivation record.

It excludes:

- cohort secret;
- raw Gate Pass or invitation token;
- full rendezvous topic or full Stargate address;
- private key, bearer/provider credential, or local profile path.

Local absolute references found in a snapshot are replaced with an explicit omission marker and counted. Envelope and snapshot commitments fail closed after tampering.

## Authority and restore behavior

The Context Card is created as `proposed_unminted`. Saving is not minting, Overwind acknowledgement, Catalog indexing, peer discovery, or connection.

On restore:

1. the safe envelope and snapshot commitments are validated;
2. the ordinary Tarot scene loader recreates the Card objects and camera/settings;
3. identity sealed into the portable Context Card wins over an older or sparse local library record;
4. the Formation is reconstructed in its exact semantic order;
5. all transient joining authority is absent;
6. the HUD remains `disconnected` with `Fresh Gate Pass required` visible.

The custody precedence in step 3 is important: a receiver's local library may enrich copy or media, but it may not erase or rewrite the stable identity sealed into the portable object.

## UI / API / CLI parity

All three surfaces call `src/domain/tarot-stargate-context-card.js`:

| Surface | Create proposal | Restore/validate |
| --- | --- | --- |
| UI | Active **Save Gate** action in canonical 3D Tarot Draw | Select Context Card and **Restore Gate**; renderer stays disconnected |
| API | `POST /api/tarot/stargate/context-card/preview` | `POST /api/tarot/stargate/context-card/restore` |
| CLI | `stargate-context-card --scene-file ... --stargate-file ...` | `stargate-context-restore --file ...` |

The API names `preview` intentionally: it returns a proposed Card and never implies a mint. The CLI and API return the same safe Card/restore result as the UI core for identical fixtures.

## Visual direction

- Active Formation Cards remain legible in numbered slots around the aperture.
- Save begins a 2.25-second authored transformation: Cards orbit the Gate, reverse-energy sparks return toward the center, and the aperture collapses.
- The resulting Card spins into the foreground and settles face-forward while the spent Gate dims to cool blue rather than presenting as an error-red failure.
- The disconnected state retains the compact Stargate controls so the Return Card is not hidden by the general Tarot control drawer.
- Restore removes the single Context Card and recreates the original four-Card Formation without silently reconnecting.

## Observed evidence

- Domain tests cover safe creation, persistence, disconnected restore, tamper failure, and local-reference omission.
- Parity test compares UI core, isolated API, and CLI output for the same fixture.
- Hidden-window product smoke captures active, sealing, proposed Card, and restored frames from an isolated Electron profile and isolated API/static server.
- Smoke asserts four ordered identity-sealed Cards, no live derivation after restore, no full address, no public demo secret, a durable Context digest, and visible fresh-Pass truth.
- Product demo capture: `artifacts/demos/NAV-001/gate-becomes-a-card.mp4` with sidecar manifest and content digests.

Evidence harnesses disable Chromium background throttling because hidden-window timer throttling made animation-state sampling nondeterministic. They do not stop, navigate, or mutate the operator's running Avatar Builder.

## Mistakes and discarded paths

1. The first isolated run exposed that renderer code referenced React's `avatarId` prop without receiving it. The fix passes actor identity explicitly into the renderer factory. Rule: outer UI scope is not renderer authority.
2. The first restore allowed a sparse local library record to overwrite the stronger identity in the portable snapshot. The fix makes sealed portable identity authoritative and tests the exact Formation.
3. Hidden Electron evidence initially sampled animation timers unreliably. The harness now disables background throttling and stages the state machine explicitly.
4. The first completed-frame capture expanded the full Tarot control drawer and hid the Card. The disconnected Stargate state now keeps the compact controls and presents the Card as the hero object.
5. A red disconnected aperture looked like a failure. The spent Gate now uses low-energy cool blue; the truth remains explicit in text rather than being encoded as alarm color alone.

## Learning delta and promotion candidates

- **Lore / design lesson:** The Gate becomes a Card, but authority does not travel with context.
- **Protocol lesson:** Durable context may be portable; private joining capability must be separately requested, short-lived, and consented.
- **Custody lesson:** The object carrying a committed identity outranks a receiver's incomplete convenience cache.
- **Harness lesson:** Product animation evidence needs an explicitly clocked, non-throttled renderer and named-window capture boundary.
- **Future Skill candidate:** `hapa-flow-stargate-context-card`—reuse Scene Card custody, seal safe Formation context, preserve authority separation, restore disconnected.

## Truth boundary

`NAV-001` proves a proposed portable Card, safe persistence, physical in-app presentation, and exact disconnected restore. It does **not** yet prove explicit human mint, Overwind acknowledgement, `.hapaCatalog` projection, fresh Pass issuance, live peer discovery, or a second-node join. Those remain later board tasks and must not be inferred from this implementation.
