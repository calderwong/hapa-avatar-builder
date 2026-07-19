# Stargate Context Forge

Implemented for Build Week task `STG-012` on 2026-07-19 in the canonical Hapa Avatar Builder Tarot Draw.

## Product flow

1. A human opens a freshly derived Stargate containing one to eight identity-sealed Cards.
2. **Context Forge** preserves the Gate's exact Card order and lets the human explicitly select the bounded fields used as evidence.
3. **Freeze Context Packet** writes one append-only packet containing every source Card ID, revision, core key, record digest, source-snapshot digest, selected value, selected-value digest, Formation digest, Gate commitment, redacted address, purpose, actor, and time.
4. The ordered Card glyphs travel on luminous rails into a rotating prism at the existing Gate. This is a projection of the evidence seal, not a semantic or mint claim.
5. **Materialize Proposal** runs one of two visibly different paths:
   - `deterministic_scaffold`: no model is invoked; the output only packages the selected evidence and says so.
   - `ollama_local`: a credential-free loopback Ollama origin must report a concrete runtime version, named model, and SHA-256 model digest before invocation. The exact system/user prompt and prompt-template version are recorded.
6. A separate `context_generation_result_card` rises from the Gate with a self-contained Card print. It is always `proposed_unminted`; no source Card changes and no automatic canon, acceptance, or mint action exists.

## Truth and custody contracts

- Packet schema: `hapa.avatar-builder.context-packet.v1`
- Append-only event schema: `hapa.avatar-builder.context-generation-event.v1`
- Provider/scaffold run schema: `hapa.avatar-builder.context-generation-run.v1`
- Result Card schema: `hapa.context-generation-result-card.v1`
- Prompt template: `hapa-avatar-builder-context-forge@1.0.0`
- Record owner: Hapa Avatar Builder
- Provider owner: Ollama and the selected local model; Avatar Builder owns only its bounded adapter and request/result custody
- Downstream subscribers: the planned Wisdom Council, human review/mint, Overwind origin, `.hapaCatalog`, and Build Week memorial replay

The service refuses remote, credential-bearing, query-bearing, and fragment-bearing provider origins. Deterministic mode records `generationPerformed=false`, `semantic=false`, and a null provider. Ollama mode records runtime, adapter, model, prompt, response, output, usage, and run digests. In both modes, the output remains proposal-only with `sourceMutation=false`, `canonPromotion=false`, and `autoMint=false`.

## Surface parity

| Surface | Operations |
| --- | --- |
| UI | Open **Context Forge** on an active Gate; choose **Evidence Scaffold** or **Ollama Local**; freeze; materialize; reveal the proposed Card in 3D. |
| API | `GET /api/context-generation`; `POST /api/context-generation/packets`; `GET /api/context-generation/packets/:packetId`; `POST /api/context-generation/runs`. |
| CLI | `context-packets`; `context-packet-freeze`; `context-generate`. |

All three surfaces use `server/avatar-context-generation-service.mjs`; none has a second packet reducer or provider truth path.

## Observed evidence

- Service, Ollama fixture, endpoint-security, 3D rig, and UI contract tests are in `tests/avatar-context-generation-service.test.mjs` and `tests/tarot-context-forge-visual.test.mjs`.
- API/CLI parity is exercised against a new isolated Avatar Builder process in `tests/avatar-context-generation-parity.test.mjs`.
- `artifacts/demos/STG-012/stargate-context-forge-local-ai.json` records an isolated canonical Electron capture with one actual loopback Ollama 0.24.0 invocation of `qwen3.5:27b` at its reported SHA-256 model digest.
- The capture shows four exact public test Cards, sealed Card/Formation/Gate commitments, the local-provider receipt, a proposed Card face, and the final 3D reveal. It touched no user app process or desktop surface.

That capture proves only this tested machine/path at capture time. It does not establish semantic quality, compatibility with every model, broader-network provider behavior, human acceptance, mint, replication, or production readiness.

## Reuse and lineage

The boundary was adapted from Hapa Wisdom Studio's provider-neutral contracts and native Ollama safety rules, particularly its explicit distinction between deterministic evidence scaffolds and verified provider participation. Wisdom Studio remains the owner of multi-Card evaluation, council disagreement, accepted-head decisions, and writing-specific context contracts. Avatar Builder owns the spatial Gate experience, bounded selected-Card packet, local proposal adapter, and Result Card projection required for this reference demonstration.
