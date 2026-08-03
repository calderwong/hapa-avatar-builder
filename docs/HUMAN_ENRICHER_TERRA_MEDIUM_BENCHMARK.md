# Human Enricher Terra-medium two-pass benchmark

Date: 2026-08-03

## Question

Measure how `gpt-5.6-terra` at medium reasoning behaves when Human Enricher keeps optical inspection and Reference Atlas comparison as separate stages, and determine how much parallelism this runtime actually delivers.

This is a three-video pilot, not a production SLA. It excludes frame extraction, inaccessible media, retries, API persistence, human review, and audio playback. Exact token telemetry was unavailable.

## Palette protocol correction

The timed optical workers returned one synthesized palette across each video's three frames. Human review identified that as the wrong data boundary. The active protocol now requires an independent palette on each First, Mid, and Last frame and explicitly forbids whole-video palette synthesis. The timing data below remains valid for Terra-medium scheduling research, but its palette payloads are historical benchmark evidence and must not be imported as current optical reviews.

## Method

Three child-agent lanes each received one video with three exact first/middle/last JPEG paths and SHA-256 hashes. Optical workers were forbidden from reading Hapa knowledge stores and personally opened all three images through the vision tool. They returned literal observations, quality, description, categorization, visible signals, and a visually estimated 3–8 color palette with uppercase `#RRGGBB` values and frame evidence.

After each optical receipt completed, the same lane ran a knowledge-free reference stage over only the canonical `echo-reference-cards` packet:

- Card count: 258
- Reference Atlas run hash: `fnv1a:13ae2982`
- Packet digest: `sha256:499541d5f086a467b7afed7df2d87f94b8b9e442032d748ce8aae34792c4c2d4`

Lexical queries were allowed for candidate retrieval inside the packet, but workers had to read and reason about every proposed Card. They could not use raw Hapa stores, web search, image reopening, automated semantic scoring, or invented Card IDs.

## Optical stage

| Lane | Video fingerprint prefix | Image calls | Started UTC | Completed UTC | Agent seconds |
| --- | --- | ---: | --- | --- | ---: |
| 1 | `5179da65` | 3 | 21:30:50 | 21:31:00 | 10 |
| 2 | `c14cc9aa` | 3 | 21:31:03 | 21:31:12 | 9 |
| 3 | `67e65bf6` | 3 | 21:31:17 | 21:31:28 | 11 |

- Mean agent time: 10 seconds per video.
- Requested child lanes: 3.
- Observed peak optical overlap: 1.
- Three-video batch wall time: 38 seconds.
- Effective concurrency (`sum(agent seconds) / batch wall`): 0.79, operationally one vision lane.

The workers were launched concurrently, but the recorded vision intervals did not overlap. This runtime therefore serialized the optical calls during the pilot. Three lanes remain a theoretical scheduling ceiling, not demonstrated optical throughput.

For 10,884 logical videos, the narrow benchmark implies:

- 30.2 hours from the 10-second mean with one continuously occupied vision lane;
- 38.3 hours if repeated in isolated three-item batches with the observed scheduling gaps; or
- 10.1 hours only if a future runtime proves three genuinely overlapping vision lanes.

These figures are much faster than the earlier Terra-Max optical pilot because the Terra-medium packets were intentionally concise and performed no knowledge traversal. Do not combine the two experiments as though they used the same prompt or workload.

## Reference stage

| Lane | Card matches proposed | Started UTC | Completed UTC | Agent seconds |
| --- | ---: | --- | --- | ---: |
| 1 | 2 | 21:34:19 | 21:35:31 | 72 |
| 2 | 1 | 21:34:28 | 21:36:30 | 122 |
| 3 | 1 | 21:34:38 | 21:36:14 | 96 |

- Mean agent time: 96.7 seconds per video.
- Serial work represented: 290 seconds.
- Observed peak overlap: 3 lanes for 53 seconds.
- Three-video batch wall time: 131 seconds.
- Effective concurrency: 2.21.
- Speedup over the represented serial work: 2.21×.

All three workers independently found the literal campfire Card. One cautiously added an eye-motif Card; another explicitly rejected that weaker link. This disagreement is useful evidence for the human-review layer and demonstrates that term retrieval did not force uniform semantic output.

For 10,884 videos:

- one reference lane at the 96.7-second mean: 292.3 hours / 12.2 days;
- three continuously occupied lanes: 97.4 hours / 4.1 days; or
- repeated isolated three-item batches using the observed 131-second batch wall: 132.0 hours / 5.5 days.

## Practical lane plan

This Codex runtime provides three child-agent slots in addition to the coordinator. The benchmark supports:

- Optical pass: request up to three jobs, but plan capacity as one effective vision lane until overlapping image intervals are demonstrated.
- Reference pass: three parallel Terra-medium workers are supported and were observed concurrently; use bounded 258-Card packets and retain per-worker model/parameter receipts.
- Pipelined campaign: one optical producer feeding a three-worker reference queue. Reference comparison is the measured bottleneck, so the narrow steady-state projection is about 4.1–5.5 days for 10,884 videos, plus frame preparation, failures, persistence, and human review.
- If the two stages are run as separate full-catalog campaigns rather than pipelined, the observed batch estimates total about 170.3 hours / 7.1 days.

No benchmark proposal was imported into the Human Enricher stores. The timings and payloads remain non-canon evaluation evidence.
