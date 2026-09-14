# Echo Reference intelligence pass — checkpoint reflection

## Objective

Replace motif-template creative authority with an additive reasoning-model pass that retains every supportable visual concept, preserves foundations for retrieval, and quality-gates prompts before any image API request.

## Evidence inspected

- The 199-song Song Workbench payload and 290 staged Reference Atlas connections.
- The completed 290-image manifest and an evenly distributed 36-image contact sheet.
- `src/domain/echo-album-research-pass.js`, the encrypted credential owner, Reference Atlas image runner, and prompt-review UI.
- Official OpenAI Responses/Structured Outputs/model guidance.

## What worked

- The existing Song Card knowledge, Tarot rationales, references, connections, and local credential custody were reusable without replacement.
- An eight-song high-reasoning pilot returned multiple concrete concepts per connection and preserved lower-scoring concepts instead of deleting them.
- Structured Outputs made the foundation, meaning chain, visual signature, prompt, and assessment machine-readable.
- Trusted Electron IPC provides UI access without disclosing private dossiers on the network-bound HTTP server.

## Noise and misunderstanding retained

- The first implementation trusted `/v1/models`; the project listed `gpt-5.5` but real Responses calls returned no access. Model selection now requires a minimal successful Responses request.
- One reference-dense song reached the first 24k output ceiling and a later monolithic retry failed after a long fetch. Requests now contain at most two source connections and merge additively into one song plan.
- The earlier proposal described competing concepts and a critic. Calder corrected the objective: concepts are cumulative. Quality assessment now controls API readiness only; it never ranks or removes ideas.
- The first expansion consumed notebook projections without complete lyrics and consequently gave the provisional motif-derived fields too much influence. That run was interrupted, its completed plans were preserved as superseded evidence, and the corrected jobs now join against the canonical local songbook's complete lyrics and source lore while omitting the legacy stock visual thesis.

## New guardrails

- No competition, winner selection, or destructive critique.
- Preserve every supported concept and every Needs revision record.
- No automatic image dispatch from the intelligence pass.
- Admit prompts to future image jobs only after the explicit quality gate.
- Keep full plans local and Electron-only; do not expose them through the unauthenticated HTTP surface.
- Prefer bounded connection chunks and information-dense output over monolithic prose.

## Reusable outcome

Flow/Skill candidate: `Song evidence → reasoning foundation → additive visual concepts → quality readiness → image queue`, with source digests, model provenance, retrieval tags, and non-destructive revision state.

## 2026-09-13 run checkpoint

The corrected full-album run reached the OpenAI project's enforced spend limit after completing 93 of 199 songs. It processed 158 of 290 song/reference-or-lyric connections and retained 690 distinct concepts/image prompts (3–7 per processed connection, mean 4.37). The corpus audit marked 639 prompts ready for the image API and retained 51 as needs revision. Mean authored quality was 4.54/5; the strongest dimensions were prompt clarity (4.89), visual specificity (4.84), and playing-card reusability (4.64). Reference grounding (4.23) and lesson legibility (4.28) are the relative improvement priorities.

The remaining gap is explicit rather than silently skipped: 106 songs and 132 connections remain to run. Of the 106 failures, 105 report the enforced spend limit and one reports truncated JSON. Raising the project limit and running `npm run echo:reference-intelligence:resume` retries only that unfinished work. The audit does not dispatch images.

## Operator correction: subscription reasoning vs API media spend

Calder expected the intellectual authoring work to use the active Codex subscription rather than bill the stored OpenAI API credential. That expectation was not surfaced before the API-backed reasoning pass, and the implementation consumed API budget that Calder intended to reserve for media. This is a workflow failure even though the API calls were authorized by the earlier request. The immediate correction was to make no further Responses/text-model requests and spend the stated remaining `$14.42` only through `/v1/images/generations`.

The corrective image run added a hard local dispatch ceiling with conservative in-flight reservations and coverage-first ordering. It generated 336 images for an estimated `$14.370330`, leaving `$0.049670` of safety headroom. Future bulk intellectual passes should default to the current Codex session when the user asks Codex to do the thinking; use a paid external LLM API only after explicitly identifying that billing boundary.
