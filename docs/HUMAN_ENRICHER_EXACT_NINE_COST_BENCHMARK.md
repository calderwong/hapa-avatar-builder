# Human Enricher exact-nine cost benchmark

Date: 2026-08-08

## Outcome

Nine representative, already-submitted videos were re-read through two isolated benchmark passes with `gpt-5.6-terra` at low reasoning. Every optical worker inspected exactly one registered First, Mid, and Last image. Every reference worker ran later and received only the optical handoff plus one video-specific 12-Card packet selected from the 258 source-backed `echo-reference-cards` profile. No benchmark proposal was imported or submitted to Human Enricher, and pre/post SHA-256 snapshots confirmed that the production campaign, agent-review, reference-review, and human-enrichment stores did not change.

This benchmark measured cost controls, not human validation, production truth, or campaign throughput.

| Video | Optical clock | Reference clock | Reference Cards | Reference outcome |
| --- | ---: | ---: | ---: | --- |
| grok-6b57 | 9s | 15s | 12 | none-supported |
| Woman dancing | 10s | 7s | 12 | none-supported |
| 20250519_video_784797 | 9s | 4s | 12 | none-supported |
| Create smooth scene transition | 9s | 3s | 12 | none-supported |
| 20251105_video_140958 | 8s | 5s | 12 | none-supported |
| 20250519_video_784609 | 10s | 4s | 12 | none-supported |
| grok-video-ef53 | 9s | <1s/unresolved | 12 | none-supported |
| grok-video-b487 | 10s | <1s/unresolved | 12 | none-supported |
| 20250520_video_793982 | 11s | <1s/unresolved | 12 | none-supported |

The worker clock had one-second resolution. Three reference comparisons began and ended inside the same displayed second, so their per-video elapsed values remain `0` in the machine report and are shown as `<1s/unresolved` here. They are not replaced by invented durations.

## Accounting boundary

- Combined worker-clock total: 123 seconds.
- Mean combined worker-clock time: 13.7 seconds/video.
- Serial lower-bound clock projection for 10,865 videos: 41.25 hours.
- Verified serialized input/frame proxy: 2,848,751 bytes total; 316,528 bytes/video mean.
- Verified output proxy: 40,324 bytes total; 4,480 bytes/video mean.
- Provider input tokens: unavailable.
- Provider output tokens: unavailable.
- Provider total tokens: unavailable.
- Credits or dollar cost: unavailable.

The runtime did not expose provider-signed or coordinator token receipts for these child tasks. Image bytes and serialized packet bytes are useful verified payload-size proxies but are not token estimates and were not converted into prices. The clock projection is also a lower-bound sample estimate, not an SLA; it excludes extraction, retries, throttling, queue gaps, and human review.

## Configuration and controls exercised

- One shared configuration: `gpt-5.6-terra`, low reasoning, `human-enricher-cost-v1` budgets.
- Optical: exactly three pre-extracted, re-hashed images; compact closed schema; no Card/lore/reference inputs; explicit `observed|none-visible|unknown`; independent per-frame palettes.
- Reference: separate workers; 12 existing source-backed Cards/video; exact packet digest; no raw-store access; no-confident-match allowed and used for all nine.
- Accounting: pass name, packet records, elapsed clock, verified input/output bytes, receipt availability, outcome, and budget-stop state remain per video and per pass.
- Authority: all outputs stayed under the benchmark directory and never became human enrichment or durable review truth.

Machine-readable artifacts are generated outside source control by `scripts/run-human-video-cost-benchmark.mjs`.

## Learning delta

- Objective: reduce and measure per-video analysis cost without weakening optical effort or reference provenance.
- Evidence inspected: the canonical Human Enricher scheduler/review contracts, nine registered 27-frame manifests, source-backed Reference Atlas projection, child-worker outputs, and pre/post production-store digests.
- What worked: exact-three optical packets were fast and visually substantive; a 12-Card reference packet was small enough for bounded comparison; an explicit no-confident-match outcome prevented weak similarities from becoming claims.
- What was noise: the previous 258–1,103 Card worker packets repeated corpus context and dominated input cost without improving the evidence boundary.
- What was misunderstood: calling a full profile “bounded” was technically finite but not cost-bounded per video. Packet size must be bounded after video-specific preselection.
- What changed: hard pass budgets, exact-three validation, compact optical outcomes, deterministic 5–20 Card preselection/cache keys, reference accounting, no-match invariants, UI cost fields, and an exact-nine non-mutating harness.
- Reusable outcome: treat this as a Flow/Lesson candidate for any media-analysis pipeline—literal optical evidence first, cached candidate narrowing second, model comparison third, human authority last.
- New guardrail: never forecast tokens, credits, or dollars from bytes; leave them unavailable until the runtime supplies a verifiable receipt.
