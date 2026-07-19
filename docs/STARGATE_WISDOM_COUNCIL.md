# Stargate Wisdom Council

Implemented for Build Week task `STG-013` on 2026-07-19 inside the canonical Hapa Avatar Builder Tarot Draw.

## Product flow

1. A human activates an identity-sealed Stargate and freezes the exact ordered Card revisions into a Context Packet.
2. **Wisdom Council** imports a pinned, source-hashed three-Card subset from Hapa Wisdom Studio: Narrative Purpose & Audience, AI Evidence & Confidence Requirement, and Human Intent & Final Authority.
3. The human selects one to three unique Wisdom Cards. They become the logical `primary`, `companion`, and `sentinel` seats in selection order.
4. Each seat receives the same frozen Context Packet, the human question, and only its one selected Wisdom Card. It receives no sibling Card, sibling prompt, or sibling output.
5. The local provider-model calls are released behind one start barrier. The service publishes only if every selected seat completes and the peer-blindness proof passes.
6. A deterministic reducer compares the independently sealed positions across five classes: `scope`, `goal`, `evidence`, `mechanism`, and `true-tradeoff`.
7. Non-value conflicts receive bounded discriminating experiment proposals. True tradeoffs route to `human:creative-director`; they are never averaged into a model preference.
8. A Council Lesson Card and Council Result Card rise from the active Gate. Both are separate, self-illustrated, `proposed_unminted` Cards. No source, accepted head, canon, or mint changes.

## Spatial grammar

- Three cyan, gold, and magenta sentinel chambers make one-Card visibility legible.
- Blind partitions and center-only custody beams show that seats do not see one another.
- One atomic center seal appears only after all selected seats succeed.
- Five colored fault lines preserve disagreement instead of hiding it.
- A gold human dais appears whenever a protected-value conflict needs accountable judgment.
- The Lesson and Result Cards emerge on opposite sides of the original Stargate; the Tarot table remains the base of operations.

This is a visual projection of recorded application receipts. Spatial separation does not independently prove provider-process isolation; the prompt and input digests are the durable evidence.

## Truth and custody contracts

- Event tape: `hapa.avatar-builder.wisdom-council-event.v1`, append-only and SHA-256 chained
- Council run: `hapa.avatar-builder.wisdom-council-run.v1`
- Atomic seal: `hapa.avatar-builder.wisdom-council-seal.v1`
- Dissent synthesis: `hapa.card-council-dissent-synthesis.v1`
- Lesson Card: `hapa.avatar-builder.wisdom-council-lesson-card.v1`
- Result Card: `hapa.avatar-builder.wisdom-council-result-card.v1`
- Prompt template: `hapa-avatar-builder-peer-blind-wisdom-seat@1.0.0`
- Record owner: Hapa Avatar Builder for this reference-app run
- Wisdom source owner: Hapa Wisdom Studio at the exact pinned source commit/catalog/row digests
- Provider owner: Ollama and the selected local model; Avatar Builder owns only its bounded adapter and custody records

The service accepts only credential-free loopback Ollama origins. Every seat records runtime, adapter, model, prompt, response, usage, output, input, and record digests. Participant truth is `provider-model`; Avatar participation is explicitly `not-invoked` because Registry/Hermes execution did not occur. Any seat failure appends one body-free failure receipt and no partial seat result, synthesis, Lesson Card, or Result Card.

## Surface parity

| Surface | Operations |
| --- | --- |
| UI | Open **Wisdom Council** from an active Gate; select one to three foundation Cards; choose the exact local model; convene; inspect the seal, dissent spectrum, human route, and 3D Lesson/Result Cards. |
| API | `GET /api/wisdom-councils`; `POST /api/wisdom-councils/runs`. |
| CLI | `wisdom-foundation`; `wisdom-councils`; `wisdom-council-run`. |

All surfaces use `server/avatar-wisdom-council-service.mjs`; none has a second dissent reducer or authority path.

## Observed evidence

- `tests/avatar-wisdom-council-service.test.mjs` proves one-to-three seats, unique peer-blind inputs, atomic success, all five classifications, explicit human tradeoff routing, append-only replay, proposed/unminted outputs, and body-free atomic failure.
- `tests/tarot-wisdom-council-visual.test.mjs` proves the three sentinel rigs, blind partitions, five fault lines, gold human dais, and UI/API/CLI contract presence.
- `artifacts/demos/STG-013/stargate-wisdom-council.json` records an isolated canonical Electron capture using three actual loopback Ollama 0.24.0 `qwen3.5:27b` calls at the reported SHA-256 model digest.
- The capture touched neither the user's running app process nor the desktop surface. Model wait time is compressed in the encoded video and disclosed in the manifest.

This evidence proves only the tested packet, adapter, atomic application seal, deterministic structural comparison, and spatial projection on this Mac at capture time. Seat semantics remain provider hypotheses. It does not prove model non-interference outside the recorded prompts, semantic quality, human acceptance, mint, P2P replication, or production readiness.

## Reuse and lineage

The Council contracts were adapted from Hapa Wisdom Studio's `parallel-card-advocates` and `CARD_COUNCIL_DISSENT` protocols. Avatar Builder reused the canonical Context Forge, Stargate, Card renderer, Truth Constellation, and Tarot spatial grammar. It did not copy Wisdom Studio's writing database, claim Avatar participation, invent a second Tarot surface, average scores, or promote proposals into accepted state. This preserves Wisdom Studio's broader evaluation ownership while demonstrating the smallest interoperable Council inside the Build Week reference path.
