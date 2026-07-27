# GPT Image Reference Atlas benchmark audit — 2026-07-26

> Historical 82-Card benchmark. The completed 89-Card production pass, including
> creator-released personal context, is recorded in
> `2026-07-26-reference-atlas-gpt-image-production-completion.md`.

## Objective

Generate a complete GPT Image high-water benchmark for the current eligible Reference Atlas and explain exactly why other Atlas Cards are not eligible.

## Result

- Atlas Cards audited: **1,020**
- Source Reference Cards (`reference:*`): **85**
- Eligible source references: **82**
- Generated and imported benchmarks: **82**
- Import failures: **0**
- Review status: **82 `review-required`**
- Excluded source references: **3**
- Expansion and motif Cards: **935**

The 935 expansion and motif Cards were not failed source references. They are derived `reference-card:*` and related semantic nodes; the art lane currently begins from direct/source-backed `reference:*` Cards.

## Three excluded source references

All three are excluded by the same overlapping policy gates:

- `unsupported-evidence:unresolved`
- `contains-private-clues`
- `private-visibility`

The Cards are:

1. `reference:asante-page-81` — Asante / page 81 gratitude anchor
2. `reference:fray-i-found-you-playlist-origin` — “I Found You” playlist origin
3. `reference:westco-snohomish-origin` — Wesco / “Snow-hoe” Snohomish origin

They have lyric occurrences and public-context shells. Their exclusion is therefore intentional privacy and evidence policy, not missing occurrence data.

## What the benchmark established

GPT Image set a strong ceiling for:

- cinematic light, depth, and atmosphere;
- coherent full-frame composition;
- turning abstract mechanics into physical action;
- combining a small number of symbols without requiring text;
- making historical repair, relational continuity, and moral choice emotionally legible.

Particularly useful visual strategies included:

- repairing a broken path while displaced witnesses remain visible;
- separating an object from the relationship or consequence it activates;
- using reflected or alternate states to show continuity rather than duplication;
- representing a protocol as embodied action rather than a diagram.

## Failure modes observed

High visual quality did not guarantee acceptable Reference Card art.

- Several images recreated recognizable source characters or costumes despite the original-design constraint.
- Some public-figure references became direct likenesses.
- Some prompts produced polished franchise fan art instead of a transferable mechanic.
- A few images introduced numerals, source-like emblems, or recognizable interface objects.
- Generic fantasy imagery sometimes displaced the specific public-context thesis.
- Some images selected only the most visually familiar namespace and ignored the denser cross-reference meaning.

These are review failures, not pipeline failures. No result was approved, published, minted, or promoted to canon.

## Architecture changes

- Eligibility now returns all exclusion reasons for each Card.
- Queue summaries distinguish source references from expansion/motif nodes.
- GPT Image planning is deterministic and preserves imported state across prompt-manifest refreshes.
- Import records the raw image hash and creates a deterministic SVG Card face.
- Gallery generation produces a static human-review surface and a colocated manifest receipt.
- Every generated artifact remains marked as a proposal requiring human review.

## Next sharpening loop

1. Human-score semantic fidelity, originality, visual quality, rights risk, and leakage risk.
2. Promote successful compositions into explicit reference-specific scene recipes.
3. Add negative exemplars for franchise resemblance, public-figure likeness, and UI/text leakage.
4. Re-run the same Cards through the local Hapa Media Node.
5. Compare local candidates against the GPT benchmark using the shared Card IDs and rubric.
