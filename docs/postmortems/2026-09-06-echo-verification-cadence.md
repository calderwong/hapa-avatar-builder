# Postmortem: Echo verification cadence

Date: 2026-09-06. Status: **cause assessed; corrective workflow pilot adopted; effectiveness pending**.
Author: Codex. Human correction: Calder. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`.

## Intended outcome and observed result

Drain 18 approved Echo Album requirements with appropriate testing confirmation. At the user's status review, six were done and twelve remained in progress. The last committed checkpoint had 2,192 passing repository tests and native short-capture evidence. Many useful implementations and regression fixes existed, but broad checks repeatedly followed small increments rather than completed acceptance paths.

Calder identified the mismatch and proposed complete requirements or larger groups before testing. Codex agreed. The correction changes verification cadence, not the promised scope or quality bar. Exact historical implementation/test time and avoidable-run counts were not measured; no numerical savings or attribution to every prior run is claimed.

## What helped

Source/cut preservation, lock and exclusion regressions, deterministic fixtures, native observations, and honest scope labels prevented false closure. The recording proof established actual consumed signal replay. The checkpoint record preserves failures and avoids losing work across context changes.

## What went wrong

The execution unit drifted toward small verified checkpoints. Full suites, builds, native checks and evidence writebacks were repeated before whole requirements were finished. Passing tests and accumulating artifacts became too prominent as progress signals. The user needed completed behavior.

A concrete boundary gap survived planner work: semantic accent descriptors were created while both painters still used full-frame washes. The six-song projection audit also still reports `Preview event missing`. These observations show why acceptance must follow the data into the actual renderer and persisted cut. They do not establish the unresolved audit's root cause.

## Cause and contributing factors

Primary process cause: the agent selected too small a delivery unit and applied broad verification at that unit. It over-applied local verification/checkpoint guidance without a clear batch-completion condition or evidence-invalidation rule. Cross-cutting requirements and shared mutable build/certification outputs encouraged cautious repeated checks. Those are contributors, not justification for endless micro-passes. Existing Hapa protocols did not require a full suite after every tiny edit.

## Corrective actions

| Action | Owner / tracking | Status |
| --- | --- | --- |
| Define coherent requirement batches and broad-test boundary | Echo goal agent; ECHO_WORKFLOW_PILOT | adopted, not evaluated |
| Finish actual event delivery, painter semantics and combined budgets | ECHO-07 with ECHO-04/08 dependencies | pending A1 |
| Measure active implementation/verification/rework and repeat reasons | continuing batch owner | prospective; old timing unknown |
| Preserve explicit physical/export/human evidence boundaries | ECHO-18 and relevant owning cards | continuing |
| Publish method, status, and postmortems to bootstrap and Second Brain | this documentation pass | evidence in task-local registration receipt |
| Evaluate after two accepted batches; revise earlier after serious failure | continuing agent and Calder | pending |

## Verification and residual risk

This postmortem is based on board readback, checkpoint 43 evidence, current targeted test/build results and the failing audit. Publishing documentation does not fix code or close requirements. The batch workflow has not yet produced an accepted implementation batch. Larger batches can hide defects longer, so targeted checks remain mandatory when needed for uncertain interfaces, persistence, integrity and process safety. Existing human and resource boundaries remain active.

## Reusable lesson

Optimize for completed, tested user outcomes. Use targeted checks to steer construction; use broad tests to accept coherent finished behavior. Count accepted requirements and escaped defects, not green checkpoints. This is a **Lesson Card candidate**, not a claim that a durable Card was minted or replicated.
