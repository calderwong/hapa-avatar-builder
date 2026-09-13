# Echo Tarot prompt review v2 — 2026-09-12

## Objective

Critique the complete first-pass Tarot Card + Song prompt corpus, then improve its image direction without losing the source logic, human-authored context, provenance, or review-only boundary.

## Evidence inspected

- All 167 Tarot/song prompt sets and all 501 man, woman, and couple variants.
- Representative Major, Minor, and Court cards, including The Fool, The Lovers, Five of Swords, Page of Wands, and Knight of Swords.
- Prompt-length and repetition measurements: first-pass range 5,614–6,533 characters, median 6,047, mean 6,054.
- The current official OpenAI GPT Image 2.5 prompting guide for prompt order, visible subject/action detail, exact-text direction, reference roles, iteration, and separate model parameters.

## What worked

Version 1 correctly preserved source attribution, Tarot inheritance, proposed song synthesis, three replaceable cast configurations, deterministic compilation, and the no-generation review boundary. That foundation meant refinement could stay inside the canonical Song notebook projection rather than create another data store.

## What did not work

The generation string tried to carry the whole review record. Repeated provenance and safety prose delayed the focal scene; essential and optional symbols were merged; both character definitions appeared in single-cast prompts; couple scenes depended on grammatical name replacement; and pairing logic, synthesis, lyrics, notes, and anchors competed at equal priority. The result was complete but visually indecisive.

## Change and reusable guardrail

Version 2 makes the prompt an art brief and the structured `creativeBrief` the durable evidence packet. The copyable prompt now begins with deliverable and visual thesis, specifies body performance and depth staging, distinguishes required from optional symbols, ranks song motifs, gives couple variants a shared action, and constrains exact text once by position. Model, size, quality, background, and format live in output metadata rather than prompt prose.

The audited v2 corpus still contains 167 sets and 501 variants. Prompt length now ranges from about 3,669 to 4,260 characters, with a 3,929 median and 3,935 mean—roughly 35% shorter. The audit found no wrong opposite-cast variable in either single-character lane and no broken `Hapa Main Man and Hapa Main Woman studies` construction.

Lesson Card candidate: a generation prompt and a provenance packet serve different readers. Preserve the entire source graph in structured metadata, but rank only the visible decisions inside the model-facing prompt.
