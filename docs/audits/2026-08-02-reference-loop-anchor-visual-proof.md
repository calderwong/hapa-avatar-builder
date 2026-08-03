# Reference loop anchor visual proof — 2026-08-02

## Objective

Fail closed when an adaptive Reference-loop video used as an A/B anchor cannot be shown to retain the semantic visual identity of the exact Reference still named by a declared Vibes transition.

## Evidence inspected

- The 41 declared transitions in `artifacts/echo-video-enrichment-v1/chain-graph.json` name 82 endpoint uses and 75 unique Reference cards.
- `data/echo-reference-animated-media.json` binds each card to one Reference-image SHA-256 and one adaptive-loop video SHA-256/runtime URI.
- `artifacts/echo-video-enrichment-v1/enrichments.ndjson` independently carries every loop media ID, content hash, runtime URI, and decode/playability state.
- Physical first and last frames were decoded for all 75 loops and compared with the declared still plus every other required still: 150 right-reference comparisons and 11,100 wrong-reference controls.

## Result and truth boundary

> **V6 seam-policy note:** this receipt is now corroborating semantic-lineage
> evidence only. The Full-Source Motion Bridge V6 compiler presents the exact,
> content-addressed Reference catalog image as a bounded hold on each side of a
> certified transition. It does not substitute the adaptive loop for either
> endpoint, because none of the 150 decoded loop terminals met the strict
> clean-still pixel rule.

- 74/75 loop records (148/150 physical terminals) certify bounded semantic visual identity.
- One record is quarantined because both terminals rank a different Reference first under the full absolute-floor and retrieval-margin contract. It is used only by `vibes-transition:09484600`, which the independent transition-terminal proof already quarantines.
- All 60 endpoint uses belonging to the 30 strictly certified transition videos resolve to a certified loop record.
- 75/75 images, loop files, media IDs, catalog byte lengths, and enrichment identities match exactly.
- The strict clean-still pixel rule certifies 0/150 loop terminals. The adaptive loops intentionally add depth, crop, grading, and particle treatment, so this proof must not be described as pixel identity with either the still or a transition terminal.

The reusable receipt is `artifacts/echo-video-enrichment-v1/reference-loop-anchor-visual-validation.json`; its result digest is `df7ca126f4054cd6c52147fb036939db31a8d07d07234c61c79ad895f036f474`. Regenerate or verify it with `scripts/validate-echo-reference-loop-anchors.mjs`.

## Turn-to-Lore reflection

- **What worked:** Reusing the transition verifier's exact decode, normalization, SSIM, pHash, edge, RMSE, histogram, and stable-canonicalization primitives kept the two proofs comparable. Exact image/video bytes and catalog/enrichment lineage made the visual claim attributable.
- **What was noise:** Applying the transition terminal's clean-frame thresholds to adaptive loops produced 0/75 records and answered a different question: pixel identity after authored treatment.
- **What was misunderstood:** A loop derived from a Reference still is not necessarily a clean still at either physical terminal. Its useful contract is semantic identity plus exact lineage, not byte- or pixel-equivalence.
- **What changed:** Loop-specific absolute floors are now combined with first-place retrieval and non-negative margin against the complete required-Reference corpus. Ambiguity quarantines the anchor.
- **Reusable outcome:** This is a Flow-explainer candidate for `adaptive loop -> declared still -> strict transition terminal`. The middle still is a lineage join; transitivity does not create a loop-to-transition pixel-identity claim.
- **New guardrail:** An adaptive loop may inform semantic lineage only after
  validating this receipt's exact inputs/result digest and a certified record
  for that card ID. A pixel-exact seam must use the independent catalog still;
  the motion clip still requires the strict transition-terminal receipt.
