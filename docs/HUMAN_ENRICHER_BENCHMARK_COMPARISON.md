# Human Enricher benchmark comparison

## Objective

Expose the completed 40-video optical benchmark beside the existing production review without importing either record into the other authority surface.

## Reused surface and evidence

- Reuses the existing Human Enricher route, catalog video projection, review vocabulary, palette presentation, and local API boundary.
- Reads the completed benchmark `report.json`, dispatcher `store.json`, and privacy-sanitized accepted-output artifact from `HAPA_HUMAN_VIDEO_BENCHMARK_ROOT`.
- Joins benchmark rows to catalog names by stable `videoKey`, then removes raw paths, frame hashes, packet paths, and receipt lease details from the response.

Open `?view=human-enricher&compare=optical-benchmark`. The API process must receive:

```bash
HAPA_HUMAN_VIDEO_BENCHMARK_ROOT=/path/to/completed/full
```

That directory must contain `report.json`, `store.json`, and `readable-output/all-40-accepted-optical-output.sanitized.json`.

## Authority boundary

The page is GET-only. It exposes no import, approval, editing, rerun, agent-dispatch, or production-write action. The benchmark remains `pending-human`; it is not human validation. The page rejects incomplete runs, broken receipt bindings, changed-production evidence, and any benchmark where the reference pass ran. The accepted optical benchmark shown here has no reference-pass result.

## Learning delta

- What worked: the dispatcher ordinal, accepted receipt, report row, and catalog `videoKey` form a complete fail-closed join for all 40 videos.
- What was noise: the normal `Needs human validation` filter cannot distinguish these outputs because all 40 videos already have older production reviews.
- What changed: a dedicated comparison page now presents both records without changing either store.
- Reusable guardrail: future benchmark viewers should consume sanitized, receipt-bound projections and keep import authority absent by default.
- Candidate: this read-only comparison pattern is reusable as a Flow explainer for proposed-vs-production review surfaces.
