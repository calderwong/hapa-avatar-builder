# Echo Album: Codex and Conviction working agreement

Version 0.1 · 2026-09-06 · status: active scoped delegation pilot; effectiveness unproven.

Calder explicitly requested this collaboration in task `01a072d3-d593-74f2-8c89-2470c2ee1a40`. It adapts Papa’s Island's `CONVICTION_COLLABORATION_PROTOCOL.md` v0.2 and the shared Codex/Conviction continuous-sharpening convention v1.0. It extends the existing Echo requirement-completion workflow; it is not another independent goal or a license to expand the album scope.

## Roles and assignment size

Codex is orchestrator and director: owns requirement scope, creative intent, architecture, data/renderer contracts, integration, acceptance testing, canonical board writes and communication with Calder. Conviction is a local contributor: owns the result of a bounded delegated assignment and identifies uncertainty. Calder retains human taste, costly-work and publication decisions already reserved in the goal.

| Route to Conviction now | Keep with Codex |
| --- | --- |
| Review a coherent packet of source excerpts for correctness risks and requirement coverage | Solve the current critical path, select architecture and integrate code |
| Compare explicitly supplied cut/analysis manifests and flag inconsistent IDs, missing evidence or unsupported claims | Inspect live state and resolve authoritative source/cut lineage |
| Draft a few discriminating acceptance cases for a completed feature batch | Choose and run acceptance gates; decide what passes |
| Summarize a bounded failure log or draft a board-ready finding | Verify material findings and append canonical board/memory records |
| Contribute a short retrospective in the same result | Reconcile suggestions and maintain the shared decision ledger |

Do not offload trivial lookups, unbounded exploration or work whose packaging/review costs exceed doing it directly. Aim for coherent 2–6k-token input packets, compact results and useful independent work for Codex during inference. Local execution is not automatically cheaper once lead review and rework are counted.

Future coding delegation is conditional: first qualify an explicitly scoped scratch/file-tool route on a pure domain utility or contained patch. Require precise file ownership, source hashes, a reviewable diff and focused evidence; Codex integrates. No canonical source edits, shared stores, shell access or broad test execution are granted to the present worker. Hermes images/audio and actual audiovisual critique remain unqualified. No silent cloud auxiliary or fallback is permitted.

## Route and enforcement

Never infer a current model route from the name `conviction` or a prior successful receipt. The initial Echo CLI contact inherited a changed OpenRouter GPT-5.5 profile; it is preserved as a routing incident, not local Qwen evidence. A subsequent CLI preflight rejected the mismatch before inference. The corrected path uses Hermes's existing `AIAgent` API with the `conviction` profile for identity and explicit per-invocation `model=qwen38-flash-next:fast`, `provider=custom`, `base_url=http://127.0.0.1:8001/v1`, and Chat Completions.

The process-scoped wrapper checks provider resolution after normal dotenv loading and supplies all route fields explicitly to `AIAgent`. A Python audit boundary denies connections except literal `127.0.0.1:8001` and denies child process creation; tools are disabled. The wrapper changes no global/profile configuration, launches no inference service and resumes no existing desktop conversation. Current direct-runtime calls have their own task receipt; do not claim a persisted Hermes CLI session unless independently read back.

This is a bounded text-review route, not an OS filesystem sandbox or qualification for unrestricted agents. Existing Hermes runtime bookkeeping may occur. The context is deliberately supplied text, with automatic workspace/memory loading disabled; source hashes are supplied by Codex, not independently checked by Conviction. Identity is separate from competence and model-weight attestation.

Reference harness and receipts are in the source task's `work/echo-album-review-2026-09-05/conviction/` directory. The runtime helper is `scripts/echo_contact.py`; it supervises `scripts/local_hermes_cli.py` (the filename is historical; the corrected implementation invokes the existing AIAgent API). Before reuse, read the helper and latest receipt. Each new --name supplies a unique session/usage receipt name. Fresh text-only sessions are enabled; resume and own-memory writes are refused. The post-contact naming/exit-status refinements have static verification only, not a second runtime qualification.

## Dispatch contract

Every packet includes job ID, board requirement, method version, one deliverable, why delegation helps, Codex's independent work, exact relevant excerpts/line ranges and whole-file hashes, source revision or dirty-state label, supplied-text qualification, tools/paths/network allowed, output location, time/token/retry budgets, unresolved human gates and the shared-ledger event/hash read.

Default job limits: one active Conviction job across participating workstreams, no nested agents, no tools, one inference iteration, bounded output, 120-second intended work budget and 180-second outer deadline. The outer supervisor owns a process group and escalates TERM then KILL on timeout. A tool exit does not prove model success. Read the child return code, actual route, response and cleanup evidence.

Use a nonblocking shared lock at `$HAPA_CODEX_ROOT/shared-collaboration/codex-conviction/conviction-dispatch.lock` and coordinate with other active Conviction consumers. The lock coordinates cooperating launchers; it does not stop the user's desktop or older launchers. If the service is busy, defer dispatch and continue independent work. Do not restart, retune or stop another task's service.

Track proposed → dispatched → running → result_ready → accepted/revise/deferred/cancelled. After timeout, route mismatch or uncertain output, inspect the owned process and receipt before any retry. Permit at most one inspected corrective model attempt; a preflight that rejects before inference is recorded separately, not counted as successful local work. Never erase an attempt or disguise repeated work under unrelated job IDs.

## Review and completion

Conviction returns: terms accepted/requested amendments; concise findings with supplied line evidence and confidence; at most a few useful acceptance cases; uncertainties; actions/tests actually performed; limitations; and an embedded reflection. No invented numeric thresholds, visual impressions, file reads, test results, performance gains or financial savings.

Codex verifies consequential claims from live source. Classify each finding accepted, conditional, rejected or already known, with reasons. Advice cannot close a requirement or redefine its acceptance. An entire requirement batch, not each delegated review, triggers broad regression/build/native/export gates. Use targeted checks during construction only for actual contract uncertainty or integrity/safety needs.

Next suitable Echo packets after the current review: lyric/clock boundary cases (ECHO-04/06), evidence-field completeness for shot ranking (ECHO-10), and cache invalidation/identity review (ECHO-17). These are routing candidates, not automatic dispatches. Select only work that advances the active batch.

## Learning, memory and authority

Use the shared ledger at `$HAPA_CODEX_ROOT/shared-collaboration/codex-conviction/`: read README and CURRENT plus relevant events; append with its existing locked `ledger.py` owner. Codex is the integrating writer. Keep both perspectives attributed and label feedback influence. Default each reflection to 120 words and two suggestions; include it in the result rather than starting a review-of-review loop. Decisions are adopt/trial/defer/reject/no_change with scope, evidence and next review trigger.

The existing Echo batch-cadence pilot is the one active workflow-improvement trial. Delegation observations feed it; route containment fixes are immediate correctness requirements, not a second trial. Reassess assignment usefulness after three relevant delegated chunks and batch cadence after two accepted implementation batches. Count local usage, packaging/review effort, rework and the misrouted call separately; unknown metrics remain null.

Update `ECHO_WORKFLOW_PILOT.md/json`, the owning board cards, relevant Second Brain article/attributed note and postmortems after meaningful outcomes. File-backed discovery is not fleet replication. Do not fabricate independent reflections or durable Card custody. A local review is not human approval.

Echo implementation is authorized; Papa’s Island's project-specific art hold does not transfer. Echo's GitHub freeze, source/cut immutability, protected unrelated work, costly alignment/render expansion boundary and pending human pilot comparison remain intact. This agreement does not grant new remote writes or autonomous background scheduling.

## First Echo assignment: disposition

Conviction's corrected local response accepted the supplied Echo terms. It completed in 34.742 seconds with no tools and the owned process group absent after exit. Exact local token counts were not captured by the selected attribute names and remain unknown; no dollar/cloud savings claim is made.

Codex rejected the principal lock finding: the supplied Boolean OR explicitly protects locked events regardless of window membership. Codex rejected the claimed flash-spacing violation: every retained addition is checked by absolute distance against protected and previously accepted flashes. Survivor choice may depend on input order, which is a conditional determinism question, not proof of a spacing breach. Applying the strictest section budget across the entire window would change the current event-section policy; it is a design suggestion, not a demonstrated bug. A supplied acceptance case placed an addition outside its selected window and would not discriminate lock behavior.

This first review delivered agreement and boundary prompts, but no accepted new defect. High-confidence false positives make unrestricted code review/editing inappropriate. Prioritize extraction of explicit facts and acceptance coverage from supplied records; qualify each wider route separately. Codex independently diagnosed the preview audit's sampling error and verified 476 event observations across 12 six-song/two-recipe plans. That is pure projection evidence, not painted/native/export/human acceptance.

The initial wrong-route response and the rejected preflight remain in task receipts. See [the incident and delegation postmortem](postmortems/2026-09-06-echo-conviction-first-contact.md). The existing shared ledger records both perspectives and dispositions; this first assignment is one observed delegation chunk, not an accepted implementation batch.

## September7 second-review disposition

Shared event `cs-echo-terminal-20260907-002` records the successful33.99s local route and rejected terminal acceptance inferences. No new defect accepted; token usage and savings unavailable. Broader expected-result/code inference is unqualified after repeated material errors. For the next useful Echo delegation, supply a compact source-labeled record and ask for literal fact extraction or structured status summarization with exact pointers; Codex verifies it and retains all implementation, visual judgment and closure authority. Do not automatically retry or treat supplied excerpts as agent file access. Existing explicit route, network boundary and shared dispatch lock continue. This is a scoped routing revision, not a judgment about unrelated Conviction tasks.
