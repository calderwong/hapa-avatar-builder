# Tarot Spatial Truth Constellation

## What this adds

The canonical Hapa Avatar Builder Tarot Draw can project verified protocol events as bounded 3D effects around the existing Stargate. It does not add another renderer, Tarot table, navigation model, or authority system.

The Gate keeps the hero visual budget. Event receipts become a surrounding **Truth Constellation**:

- Card placement → cyan/gold table ripple
- Stargate activation → teal/gold aperture witness
- Peer arrival → two-body identity orbit
- Appended communication → cyan/magenta comet
- Comment consent → gold/teal lock iris
- Finalized Comment Card → amber/cyan lineage cluster
- Closed build task → magenta/gold ledger spire
- Wisdom Council result → violet/teal triad
- Candidate proposal → amber/magenta ghost Card
- Human-authorized mint → gold authority seal

Each accepted receipt leaves a persistent sigil and a moving commitment packet that travels toward the active event horizon. The effects are deliberately lighter than the Stargate itself so the scene retains one visual hierarchy.

## Admission rule

`projectTarotSpatialTruthEvent()` emits a cue only when all of these fields are valid:

1. Durable event identity
2. Supported event type
3. Exact `verified_event` truth status
4. Parseable observation time
5. Source-node identity
6. SHA-256 payload digest

Proposed, planned, undigested, unattributed, unsupported, or malformed events return a rejection receipt and produce no spatial effect. Duplicate event IDs do not receive a second cue.

The public showcase deliberately submits an unapproved mint first. The rejection count increments, but the constellation stays dark for that attempt.

## Spatial Truth Result Card

After one or more verified events, the Builder can press a deterministic `hapa.tarot-spatial-truth-result-card.v1` Card. It contains:

- Exact accepted event IDs, types, sources, times, and payload digests
- Rejected reasons without converting them into visual proof
- Active Gate commitment when available
- SHA-256 receipt digest
- Explicit `proposed_unminted` lifecycle state
- A statement that the visual is a projection rather than authority or execution proof

The Card does not mint itself.

## Runtime wiring

Real Builder paths already witness these event families when their own receipt digest exists:

- Successful deterministic Stargate activation
- Signed two-peer arrival proof
- Consented Comment event and finalized separate Comment Card
- Candidate Context Card review
- Human-authorized exact revision staged at the origin
- Identity-sealed manual Card placement

Council, general session messages, and Build Week board history use the same subscriber contract but still require their corresponding integration tasks. The public showcase proves only the visual admission contract and labels those fixture events as fixtures.

## Truth boundary

The isolated capture proves that the tested verified envelopes emit ten distinct families, the tested unverified mint emits no visual cue, the proposed Result Card seals both accepted and rejected outcomes, and no full Gate address or secret is displayed.

It does not prove a live council result, real build-board ingestion, physical phone, broader network, remote provider, human mint, or domain execution merely because a fixture sigil is visible.

## Evidence

- Implementation: `src/domain/tarot-spatial-truth.js`
- 3D effects: `src/domain/tarot-spatial-truth-visual.js`
- Canonical surface: `src/components/TarotDraw3DView.jsx`
- Regression tests: `tests/tarot-spatial-truth.test.mjs`
- Isolated capture: `artifacts/demos/UI3D-003/tarot-spatial-truth-constellation.mp4`
- Evidence manifest: `artifacts/demos/UI3D-003/tarot-spatial-truth-constellation.json`
