# Human Enricher minimal optical review

Status: first-pass prototype with human validation.

## Authority

Hapa Avatar Builder owns the local review queue, benchmark receipts, human decisions, and saved Human Enricher overlays. New optical output is always `pending-human`; it is not human validation, identity truth, canon, publication approval, rights clearance, or director authority. Saving human enrichment remains a separate action and production stores are never changed by benchmark-only gates.

## Minimal v3 worker contract

The worker receives exactly three already-registered images: First, Middle, and Last. It opens only those images and receives no examples, quality calibration, Hapa knowledge, Card packet, Reference Atlas data, songs, scenes, Avatar records, web search, OCR, or automated semantic-analysis result.

The complete semantic response is:

```json
{
  "description": "One specific overall visual description grounded in all three frames.",
  "palettes": {
    "first": ["#RRGGBB", "#RRGGBB", "#RRGGBB"],
    "middle": ["#RRGGBB", "#RRGGBB", "#RRGGBB"],
    "last": ["#RRGGBB", "#RRGGBB", "#RRGGBB"]
  }
}
```

Rules:

- `description` is 80–1200 characters and describes only visible content across the supplied frames.
- Each palette contains 3–5 distinct uppercase `#RRGGBB` strings visually estimated for that frame.
- There are no frame observations, color labels, color explanations, quality scores, categories, tags, signal outcomes, visible signals, strengths, issues, uncertainty prose, confidence, Director Notes, examples, calibration data, references, relationships, Card IDs, or reference work.
- The validator rejects unknown output fields, missing palette roles, invalid hex values, duplicate colors, and anything other than exactly one claimed First/Middle/Last frame set.
- Optional receipt/video identifiers may wrap the semantic result as dispatcher transport bindings. They are scheduler metadata, not additional model-authored analysis.

The receipt schema is `hapa.human-video-optical-direct-receipt.v3`. Claim paths and hashes bind the three returned palettes to registered frames without making the model repeat paths, hashes, observations, or attestations in its token-bearing semantic response.

## Cost defaults

New campaign configuration defaults to:

- model: `gpt-5.6-terra`;
- reasoning effort: `low`;
- prompt: `human-enricher-optical-minimal-v3`;
- maximum input: 24,000 tokens;
- maximum output: 600 tokens;
- maximum total: 24,600 tokens;
- maximum wall time: 90 seconds;
- exactly three image inspections.

Provider token or credit use is reported only when a runtime receipt exists. Byte counts and elapsed time must never be relabeled as tokens or credits.

## Human Enricher UI

The optical proposal panel shows only:

1. the overall description;
2. the First frame and its hex swatches;
3. the Middle frame and its hex swatches;
4. the Last frame and its hex swatches.

“Use description” and “Append description” affect only the human description draft. Optical output never starts a human quality grade or fills human categories, tags, Avatar mentions, Director Notes, or references. Those remain optional human-authored enrichment fields.

Legacy production reviews remain readable for store compatibility, but discarded legacy agent fields are not part of the v3 output contract or displayed as current optical output.

## Queue commands

```sh
npm run cli -- human-enricher-optical-campaign-plan --limit 12 --model gpt-5.6-terra --effort low --max-workers 3 --json
npm run cli -- human-enricher-optical-campaign-status --json
npm run cli -- human-enricher-optical-campaign-claim --worker /root/terra-vision-01 --lease-seconds 900 --json
npm run cli -- human-enricher-optical-campaign-complete --job-id '<job-id>' --file ./worker-result.json --worker /root/terra-vision-01 --attempt 1 --lease-id '<lease-id>' --json
```

Production campaign and human-review stores retain their existing ownership and optimistic concurrency protections. A benchmark must use a separate artifact root, prove its sample keys were not previously reviewed or benchmarked, and hash production stores before and after.

## Reuse decision and learning delta

- Reused: the existing immutable First/Middle/Last claim, palette-to-frame binding, pending-human authority, scheduler accounting, and Human Enricher filmstrip.
- Removed from new agent output: grading, diagnostic lists, visible-signal handoff, reference/Card work, calibration/examples, and prose attached to individual frames or palette colors.
- Guardrail: cost reduction happens by shrinking the semantic contract, not by reducing the frame count below three or by substituting automated palette heuristics for direct visual inspection.
