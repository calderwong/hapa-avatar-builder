# Echo reference Codex remainder run — 2026-09-14

Status: completed local generation run; human visual approval remains required.

## Objective and prior surface

Fill the exact visual gap in the September 13 Echo reference prompt run using Codex built-in GPT Image rather than the saved OpenAI API key. Reuse the existing Reference Atlas prompt intelligence, local Echo image-run manifest contract, six named Avatar Builder identities, and the consolidated gallery. Do not replace the gallery or mutate the earlier API runs.

## Evidence and outcome

- Source run: `echo-reference-images-2026-09-14T03-19-23-465Z-e94c0e2a`.
- Gap: 301 budget-held jobs plus 2 failed jobs; no prompt hashes duplicated a completed image in retained runs.
- Codex run: `echo-reference-codex-images-2026-09-13-remainder`.
- Result: 303/303 completed PNGs, zero missing files, zero digest mismatches, and no OpenAI API key use.
- Identity anchors: Red, Blue, Green, Bella, Domina, and Falka. Explicit character names win; otherwise strong semantic fit or deterministic distribution selects the anchor. The final assignments include 43 Red, 97 Blue, 38 Green, 37 Bella, 40 Domina, and 50 Falka references; two concepts intentionally carry two anchors.
- A one-image Bella pilot established identity, gate, pencil-vine, pond, and institutional-scale legibility before the full run.

## What worked

- Eight concurrent built-in image calls was the best measured ceiling. The first eight-wide wave took about 6.5 minutes. A sixteen-wide experiment took about 14 minutes and reduced throughput, demonstrating service-side queueing.
- Every job was claimed before generation and marked complete only after the generated PNG was copied into the local run, hashed, and written atomically to the manifest.
- The consolidated gallery consumed completed jobs incrementally; no separate gallery rebuild was required.
- The initial unchanged-prompt drain completed 282 images. A targeted safety pass recovered 20 of 21 rejections; a final narrower craft reconstruction recovered the last item.

## Noise, correction, and guardrails

- Matching the bare word `Red` accidentally attached Red alongside Bella when a prompt merely specified a carmine-red dress. Explicit-name detection now requires character grammar for Red/Blue/Green; Bella, Domina, and Falka remain unambiguous proper-name matches.
- One-token semantic matching over-selected Blue because water and systems are common album motifs. Semantic selection now requires three matching signals; otherwise a stable prompt hash distributes work across all six identities.
- A long-running Codex host cell rolled over with eight jobs still marked running. No files had been registered for those jobs. `requeue-running` records the interruption and safely returns only those jobs to the queue.
- Safety repair never erases the source. Original prompt, prompt hash, rationale, and memory hook remain in `original*` fields and `repairHistory`; only the provider-facing prompt changes. Sensitive scenes were rebuilt as adult, fully clothed, nonviolent material analogs.
- Generated visuals remain review-required proposals. Completion proves file and lineage integrity, not canon, publication, rights clearance, or human taste acceptance.

## Reuse

`scripts/echo-reference-codex-image-run.mjs` is the resumable operator helper for future Codex remainder runs. It prepares the exact gap, resolves avatar anchors from `data/avatar-store.json`, claims bounded batches, imports and hashes outputs, recovers interrupted claims, refreshes queued identity assignments, and preserves targeted safety repairs.
