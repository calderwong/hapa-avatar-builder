# Human Enricher Terra-medium vision benchmark

Date: 2026-08-03

## Current question

Measure `gpt-5.6-terra` at medium reasoning on the vision-only Human Enricher pass, verify the live collaboration ceiling after the coordinator changed to Sol/Ultra and Fast, capture exact scheduler timing and token receipts, and forecast the 10,868 unreviewed videos. Reference Atlas work is deliberately excluded.

## Assumption corrections

- The live root session receipt changed from Sol/high to Sol/ultra. The Fast label was not exposed as a telemetry field, so its internal service tier was not inferred.
- Three Terra child workers were accepted simultaneously. A fourth live child was rejected with `agent thread limit reached`. Twenty jobs can be completed in rolling waves, but this runtime does not provide twenty simultaneous workers.
- Agent-authored clocks were unreliable in several packets. All results below use Codex rollout session timestamps and token counters.
- The 10,884-video dashboard is an aggregate of several Hapa stores, not just `data/media-library.json`. The live Human Enricher summary is the count authority.
- Not every logical video is frame-ready. A record without accessible registered First/Mid/Last images must be deferred for frame preparation and cannot be treated as reviewed.

## Method

Twenty distinct videos received one Terra-medium worker each. Every worker was instructed to personally open exactly three First/Mid/Last images, author literal observations, provide one independent 3–8-color uppercase `#RRGGBB` palette per frame, and return visual description, Quality, categories, tags, Director Notes, strengths, issues, uncertainty, and visible reference signals.

Rollout inspection verified:

- 20 worker sessions;
- 60 direct `view_image` calls, exactly three per worker;
- no Reference Atlas, Hapa knowledge store, web, OCR, or semantic automation calls;
- optional shell calls were UTC clock reads only;
- no benchmark output was imported into Human Enricher.

The sample used the existing 16 reviewed video identities plus four additional frame-ready catalog videos. It is sufficient for scheduler/token capacity planning, but it is not a random quality sample of all 10,884 records.

## Timing and parallelism

| Measurement | Result |
| --- | ---: |
| Jobs | 20 |
| Frames personally inspected | 60 |
| Peak live Terra workers | 3 |
| Mean scheduler time/video | 25.256 s |
| Median | 25.039 s |
| 95th percentile | 29.218 s |
| Minimum / maximum | 19.832 / 33.600 s |
| Represented worker time | 505.121 agent-seconds |
| Entire interactive audit wall | 314.820 s |
| Average active workers during the interactive audit | 1.604 |
| Time at the three-worker peak | 77.191 s |
| Observed interrupted throughput | 3.812 videos/minute |
| Continuously filled three-worker throughput | 7.127 videos/minute |

The interactive wall includes pauses to verify the scheduler, inspect receipts, and dispatch subsequent waves. It is an upper-bound operational cadence, not the capacity of a dedicated rolling dispatcher.

## Exact token telemetry

| Token class | 20 jobs | Mean/video | Forecast for 10,868 |
| --- | ---: | ---: | ---: |
| Cached input | 2,600,448 | 130,022 | 1,413,083,443 |
| Uncached input | 154,030 | 7,702 | 83,699,902 |
| All input | 2,754,478 | 137,724 | 1,496,783,345 |
| Output | 25,600 | 1,280 | 13,911,040 |
| Gross total | 2,780,078 | 139,004 | 1,510,694,385 |

Reasoning output was 4,333 tokens in the sample and projects to 2,354,552; it is already included within output. Cached input represented 94.408% of input traffic. Gross tokens are not billable-equivalent tokens: exact dollars require separate Terra cached-input, uncached-input, and output prices.

## Remaining-run forecast

The live dashboard reported 10,884 logical videos, 16 optical proposals, and 10,868 remaining before campaign launch.

- One continuously occupied Terra worker: 76.25 hours.
- Three continuously occupied Terra workers: 25.42 hours.
- If every job takes the sample 95th-percentile duration: 29.40 hours.
- If the manually interrupted benchmark cadence is repeated: 47.52 hours.

Use 25–30 hours only as the compact benchmark-packet lower range. The richer production packet below took materially longer and is the safer current planning signal for canonical accepted proposals. Frame extraction, inaccessible files, retryable worker errors, service throttling, and human validation are outside both ranges.

## Production guardrails derived from the benchmark

1. Plan only frame-ready jobs and retain deferred counts separately.
2. Bind each job to stable video identity plus the exact canonical SHA-256 First/Mid/Last frame manifest; compare the complete normalized manifest again at completion.
3. Keep at most three active leases; total queued work may be much larger.
4. Re-hash the registered frame set before accepting a result.
5. Normalize known field aliases, then validate the canonical optical schema.
6. Reject whole-video palettes and any Card, Avatar, song, scene, relationship, or knowledge match in the optical payload.
7. Record timing and tokens from coordinator-observed rollout receipts, bind each local receipt to its job, attempt, frame digest, and hashed lease, and never use model prose as telemetry.
8. Reserve completion with a server token and normalized-result digest, reconcile partial writes, and persist accepted worker output only as `pending-human`; human and Echo authority remain unchanged.

## Production kickoff receipt

The first durable production wave queued 100 verified frame-ready jobs and ran three concurrent Terra-medium workers. All three passed canonical validation and were stored as `pending-human`; 97 jobs remain queued. The Human Enricher dashboard moved from 16 to 19 agent-reviewed/pending-human videos and from 10,868 to 10,865 remaining optical reviews. No Reference Pass ran.

Those three receipts preserve the exact coordinator-observed timing/token values used below, but they were written before receipt ID, job, attempt, frame-digest, and hashed-lease binding landed. Campaign status therefore classifies them as three captured legacy-unbound receipts and zero bound receipts; the implementation does not rewrite history to imply a stronger receipt. New attempts receive the complete local binding. In both cases, token/timing values are coordinator-attested rollout observations, not provider-signed billing records.

Unlike the compact benchmark artifacts, these workers authored the full production payload: detailed literal observations, 3–8 explained colors on each frame, scoring subdimensions, visible reference signals, Director Notes, strengths, issues, uncertainty, and attestation. That additional output changed the operating profile:

| Measurement | Production wave 1 |
| --- | ---: |
| Jobs / direct image views | 3 / 9 |
| Mean / median rollout time | 54.964 / 50.606 s |
| Minimum / maximum | 44.942 / 69.343 s |
| Represented worker time | 164.891 agent-seconds |
| Staggered three-worker wall | 85.335 s |
| Cached / uncached input | 373,760 / 49,198 tokens |
| Output / reasoning subset | 10,200 / 363 tokens |
| Gross total / mean per video | 433,158 / 144,386 tokens |

Applying this three-video mean to the now-remaining 10,865 records projects 1,353,634,133 cached-input, 178,178,757 uncached-input, 36,941,000 output, and 1,568,753,890 gross tokens. Continuously filled three-worker capacity projects 55.29 hours; treating the slowest observed production job as every job projects 69.76 hours. Repeating the staggered kickoff cadence would project 85.85 hours.

This is a three-video production sample, so it does not replace the broader 20-video scheduler benchmark. It does show that the compact 25–30-hour forecast is optimistic for the accepted rich schema. Until more production receipts accumulate, use roughly 55–70 hours as the frame-ready three-worker range and keep the token-class forecast—not gross tokens—as the basis for any later dollar estimate.

## Historical note

An earlier three-video two-pass pilot observed serialized optical intervals and exact token telemetry was not captured. It also timed a separate bounded Reference Pass. Those results remain useful historical evidence for the older prompt/runtime, but the 20-video vision-only measurement above supersedes them for current optical scheduling and token forecasts.
