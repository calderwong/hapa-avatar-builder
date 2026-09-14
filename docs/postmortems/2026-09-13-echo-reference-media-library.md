# Echo Reference Media Library Reflection

## Objective

Replace isolated run galleries with one durable, searchable view of every retained Echo reference visual, including linked motion and the intelligence needed to review the visual later.

## Evidence

- The server index merges the existing Reference Atlas media catalog with all retained reference image-run manifests.
- Loop linkage uses `sourceImageRunId + sourceJobId`, not names or filenames.
- The UI returns every matching item, supports song/run/motion/search filters, plays loops on hover, and exposes a full-screen detail inspector.
- ETag polling refreshes the open library every five seconds and the closed ingress every twenty seconds.
- Behavioral tests add a completed job after the first scan and prove that the next scan includes it.
- Local custody paths never enter the browser payload; asset routes validate containment and loop routes support byte ranges.

## What was reused

The existing `EchoHoverLoopMedia` behavior and the proven Reference Atlas GPT Image library were retained. The latest-run gallery’s visual language informed the ingress, but latest-only selection was removed from the canonical path.

## Noise and misunderstanding removed

The application had two truthful but partial views: an older catalog-only gallery and a newest-run-only gallery. That made “all references” depend on knowing which run produced an item. The consolidated index treats a run as a filter and provenance fact, not as a separate destination.

## Guardrail

Future reference generators must integrate by durable manifest contract. Never add another provider-specific or latest-only gallery as the only ingress. Preserve exact source-job linkage, generation intelligence, hashes, and authority state so humans and agents can retrieve why an artifact exists—not merely its file.
