# Echo Reference Contract Tranche — Learning Audit

Date: 2026-07-23  
Stage: First Pass / Prototype  
Objective: Drain the five authorized Ready cards that define Reference Cards, graph ontology, evidence/canon/rights policy, evaluation, and visual interaction.

## Evidence inspected

- `src/domain/song-reference-graph.js`
- `tests/song-reference-graph.test.mjs`
- `docs/ECHO_REFERENCE_GRAPH.md`
- Hapa Songs reference panel in `src/App.jsx`
- Existing board acceptance criteria for the five Ready cards

## Reuse decision

The existing catalog, connector, context-layer, and comparative-edge normalizers remain the jump-off surface. This tranche adds a versioned Reference Card/edge/decision contract, fixtures, and policy/specification documents. It deliberately leaves the song store, current reference panel, runtime mining, persistence, public contribution, and director projections unchanged until their review gates are satisfied.

## What worked

- The current evidence ladder already separates direct, candidate, and comparative routes.
- Existing connectors retain lyric spans, semantic effects, signal channels, caveats, and provenance.
- The current UI already has a compact evidence presentation suitable for progressive extension.

## Noise or misunderstanding corrected

- A confidence score is not an evidence class.
- Human approval is not canon.
- Detecting a matching label is not importing a reference’s story mechanic or emotional stakes.
- “Add” and “Challenge” cannot be direct edits to an approved card.
- Public visibility cannot be inferred from the existence of a source URL.

## New guardrails

- Claims are typed as source fact, lyric observation, inference, or Human decision.
- Evidence, review, canon, visibility, and custody are independent.
- Public projection fails closed on private clues, private citations, or incomplete authority.
- Multiple interpretations remain parallel records.
- Every visible graph edge must retain a plain-language rationale and resolvable claim/citation pointers.
- Contract work does not authorize store migration or product activation.

## Reusable outcomes

- **Protocol candidate:** `hapa.reference-card.v1`, `hapa.reference-edge.v1`, and `hapa.reference-decision.v1`.
- **Lesson Card candidate:** confidence cannot promote evidence, approval, visibility, or canon.
- **Flow-explainer candidate:** lyric/source → claim → interpretation/edge → Human decision → rights-safe projection.
- **UI pattern candidate:** progressive Listen / Explore / Compare / Review modes around the existing compact reference panel.

The raw Codex turn remains the attributed source for these derived candidates.

## Verification correction

The first full-suite run passed 1,068 of 1,070 tests. The two failures were in `echo-scene-keyframe-process-cli.test.mjs`, which assumed three historical pilot images still existed under the repository's old `public/generated` path. Generated media had already been moved outside the repository by the canonical build boundary, so the test was reading workstation state rather than a stable fixture.

The correction stages three temporary pilot plans and image files under the test-owned runtime directory and passes that root through `HAPA_ECHO_KEYFRAME_PILOT_ROOT`. It preserves the existing song/count filter changes and does not restore generated media to Git. The isolated CLI test now passes 4/4 and the full repository suite passes 1,071/1,071.

New guardrail: tests for imported media receipts must create or explicitly bind test-owned media. They must not infer fixture existence from historical absolute paths.
