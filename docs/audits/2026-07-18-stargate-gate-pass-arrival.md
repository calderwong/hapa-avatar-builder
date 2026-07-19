# Stargate Gate Pass and signed peer-arrival audit

Date: 2026-07-18  
Task: `NAV-002`  
Canonical product: Hapa Avatar Builder / existing 3D Tarot Draw  
Protocol donor: `hapa-tarot-stargate-reference@9e59305`

## Outcome

One exact pinned `hapa.stargate-context-card.v1` now crosses into a second isolated Hapa profile while a separate memory-only signed, expiring Gate Pass authorizes a bounded two-peer meeting. Both profiles use distinct operating-system processes, profile roots, and stable Ed25519 identities. They exchange reciprocal signed hello and acknowledgement envelopes over live Hyperswarm discovery, Noise SecretStream, and Protomux. Join succeeds only after both peers explicitly consent and the Pass, Card identity/revision, Formation digest, committed Gate, context digest, signatures, and expiry match.

The canonical Tarot Draw projects the verified result without replacing the existing UI. During verification, cyan and violet signature packets follow two 3D rails into the existing aperture. On success, Gate chevrons lock and Aurora and Beacon materialize as two labeled peer-presence sigils inside the same four-Card Gate. A safe `Stargate Gate Pass Arrival Result` Card records the observed proof.

## Reuse and adaptation

- Reused the existing Avatar Builder `TarotDraw3DView.jsx`, `createTarotStargateRig`, Formation slots, event horizon, camera, particles, Card reconstruction, Catalog Return panel, local-session authority, Tarot store, API, CLI, and isolated evidence harness.
- Adapted the donor's signed invitation/hello/ack, HyperDHT/Hyperswarm, Noise, Protomux, identity, isolation, and leak-check protocol rather than creating a new transport or frontend.
- Preserved donor attribution in source and on the Result Card.
- Added only the bounded peer-arrival projection required by the existing Tarot scene.

## Exact proof

The live proof observes:

- two distinct child processes;
- two distinct private profile roots;
- two distinct stable signing identities;
- one exact stable global Card ID and pinned revision;
- one safe durable Context Card copy in the receiver profile;
- one newly signed and expiring Pass issued from the capability that matches the Context Card's committed private Gate;
- reciprocal application signatures and acknowledgement signatures;
- explicit local consent on both peers;
- Hyperswarm connection and Noise-encrypted stream evidence;
- unchanged semantic Formation fingerprint and Gate commitment;
- no Catalog contact or mutation;
- a separate safe Result Card in the Tarot store.

Seven fail-closed vectors also pass: exact match, different signed Pass, local decline, expired Pass, tampered signature, Card-revision mismatch, and private-field leak detection.

## Secret and authority boundary

The Context Card, Result Card, broker receipt, app HUD, product clip, screenshot, proof log, and subscriber event exclude:

- Gate Pass token;
- cohort secret;
- full rendezvous topic;
- full Stargate address;
- private signing keys;
- profile paths;
- bearer/provider credentials.

The Pass remains memory-only and is replaced by a one-way safe commitment in observed output. An arbitrary restored Card whose original live issuer capability is not available remains disconnected. The local Build Week proof can issue a matching Pass only for the curated public deterministic demo Formation; it does not invent a new private Gate for another Card.

## Product evidence

- Isolated smoke: all acceptance checks passed with `userAppTouched=false`.
- Product capture: `artifacts/demos/NAV-002/signed-peer-arrival.mp4`.
- Capture manifest: `artifacts/demos/NAV-002/signed-peer-arrival.json`.
- Poster: `artifacts/demos/NAV-002/signed-peer-arrival-poster.png`.
- Captured truth: exact four-Card Formation; unchanged fingerprint before/after; two verified peers; two 3D peer presences; two 3D signature rails; Pass not persisted; full address and secret-bearing fields absent; visible 7/7 negative-case boundary.
- Capture scope: hidden isolated Electron window, silent H.264, no desktop or other app, no user-running app restart/navigation/closure.

## Verification

- Full repository suite: 973 passed, 0 failed.
- Focused Gate Pass/Catalog suite: 6 passed, 0 failed.
- Production build: passed.
- Isolated product smoke: passed.
- Isolated 13-second product capture truth gate: passed.
- `git diff --check`: passed before commit.
- Dependency audit: 4 pre-existing/current advisories remain (3 moderate, 1 high). No automatic major-version audit fix was applied because it would exceed this task and could destabilize the canonical visual stack.

## Claim boundary

This proves a live two-process, two-profile local P2P handoff through an ephemeral loopback HyperDHT bootstrap. It does not prove internet-wide availability, NAT traversal, geographic remoteness, production identity custody, hostile-network resistance, public presence, third-party interoperability, or long-running replication. The capture is real product behavior in an isolated deterministic environment; it is not evidence of remote users.
