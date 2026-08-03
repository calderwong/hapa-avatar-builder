# Human Enricher optical review campaign

Status: first-pass prototype and active human-validation campaign.

## Ownership and authority

Hapa Avatar Builder owns the review queue, pending proposals, human decisions, and accepted Human Enricher overlays. Video/frame tooling may enumerate media and extract or hash screenshots, but it does not own semantic judgments. Echo State is a bounded subscriber: only saved human enrichment is projected into `human_enrichment`; pending agent proposals never reach the director timeline.

Agent output is non-canon and pending-human. A quality score is editorial guidance, not rights clearance, identity truth, publication approval, or render authority.

## Non-heuristic optical contract

A completed proposal must include:

- one stable Human Enricher video key;
- every registered keyframe, with a minimum of three distinct screenshots;
- a SHA-256 digest and timestamp-specific literal observation for every frame;
- a named sub-agent, task, vision-capable model, and explicit optical-inspection attestation;
- an explained quality grade, visual description, categories/tags, Director Notes, uncertainty, and confidence;
- three to eight visually estimated recurring/dominant colors, each with an uppercase `#RRGGBB` value, label, `dominant`/`supporting`/`accent` prevalence, explanation, and exact supporting frame hashes;
- a visible-signal handoff covering distinctive text, symbols, markings, palette, geometry, costume, objects, composition, and motifs without assigning Hapa Cards.

Automation may enumerate records, extract frames, calculate timestamps, hash files, validate schemas, and persist proposals. It may not assign quality, describe images, identify Avatars, categorize content, select the dominant palette, or infer references. Existing OCR, pixel histograms, filename matches, similarity scores, and semantic rankers are excluded as judgment substitutes. Palette hex values are visually estimated editorial metadata rather than colorimetric measurements. Optical workers do not traverse Hapa knowledge stores; reference lookup is a separate pass.

The receipt proves that exact frames were delivered and addressed; it cannot cryptographically prove cognition. Human playback and review remain the final attention check.

## Resumable queue

```sh
npm run cli -- human-enricher-agent-queue --status needs-agent --offset 0 --limit 12 --json
npm run cli -- human-enricher-agent-submit --file ./optical-review.json --agent /root/optical-batch-a --json
npm run cli -- human-enricher-agent-decision --review-id '<review-id>' --action rejected --actor calder --json
```

The queue returns registered frame manifests, explicit source relationships, and the exact rule that every registered frame must be inspected. Items without usable frames stay unfinished; metadata alone cannot complete a review.

Agent packets can be normalized without changing their semantic content:

```sh
node scripts/prepare-human-video-optical-review-import.mjs <packet-a.json> <packet-b.json> --out work/human-enricher-optical/normalized-review-import.json
node scripts/import-human-video-agent-reviews.mjs --file work/human-enricher-optical/normalized-review-import.json
node scripts/import-human-video-agent-reviews.mjs --file work/human-enricher-optical/normalized-review-import.json --apply
```

The import command is dry-run unless `--apply` is explicit and backs up an existing proposal store before replacement work.

## Bounded Reference Atlas pass

Reference workers run only after an optical receipt exists. They receive the optical observations and visible-signal handoff plus one exact, digest-bound packet of existing Cards. Model, reasoning effort, and parameters are recorded independently from the optical pass, so reference setups can be compared or replaced without repeating frame inspection.

```sh
npm run cli -- human-enricher-reference-packet --profile echo-reference-cards --json
npm run cli -- human-enricher-reference-queue --status needs-reference --profile echo-reference-wide --offset 0 --limit 12 --json
npm run cli -- human-enricher-reference-submit --file ./reference-review.json --agent /root/reference-batch-a --json
```

The 2026-08-03 Reference Atlas runtime selects `data/echo-reference-research-loop/projected-run.json`, containing 1,103 Cards. The original 85 curated catalog entries remain migrated source material inside that larger run. Profiles deliberately expose different bounded authority classes:

| Profile | Snapshot count | Included records |
| --- | ---: | --- |
| `echo-reference-cards` | 258 | 199 direct plus 59 source-backed-candidate Reference Cards |
| `echo-reference-wide` | 853 | the default 258 plus 595 comparative Cards; excludes unresolved leads |
| `echo-reference-exploratory` | 1,103 | all resolved Cards plus 250 explicitly unresolved leads |
| `echo-core-cards` | 489 | the default 258 plus 157 Song Cards and 74 Avatar Cards |

These counts are discovery evidence for this snapshot, not permanent constants. Every packet carries the selected Atlas run ID/hash, packet digest, evidence-class counts, Card review/canon status, rights/privacy labels, citations, and provenance. A worker may rank or reject supplied Card IDs only; it cannot invent a candidate, convert a proposal into canon, or treat packet inclusion as human approval.

The active preview-first authority receipt currently marks the 853 resolved Cards `approved` for bounded local interpretive use and the 250 unresolved Cards `rejected`/resolved without promotion. All 1,103 remain `non-canon`; public activation and canon promotion are false. Packet receipts expose those status counts and the authority receipt instead of flattening them into one undifferentiated list.

## Human validation

The Human Enricher shows the inspected filmstrip, observation for every frame, reviewer receipt, proposed grade/description/categories, visually estimated hex palette and swatches, uncertainty, and optical signal handoff. The separate reference panel shows Card matches, visible evidence, explanation, negative findings, reviewer/model parameters, and the exact Atlas packet receipt. A missing reference pass on a legacy optical proposal is shown as unfinished rather than silently treated as “no matches.”

Quality begins at the agent proposal when no human record exists. Human grades are compared with their originating agent grades to produce a bounded calibration prior (sample size, exact-match rate, within-one rate, error, and per-grade human averages). That prior guides later agents but never overwrites their direct visual judgment. Simply opening a proposal does not create a human record.

The human can:

- use the proposal as an editable draft;
- append suggestions to existing human work;
- edit or add any field; changes autosave after 350 ms and a pending edit is flushed before navigating to another video;
- reject the proposal without changing human truth.

Saving an agent-derived draft creates a normal optimistic human enrichment revision with exact proposal lineage and marks the proposal `accepted-edited`. Pending proposals remain structurally and visually separate.

## Initial optical evidence

Two sub-agents completed four bounded waves covering 16 videos and 48 beginning/middle/end frames with `view_image`, writing one literal observation per timestamp. Grades were `4, 3, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 2, 2, 1, 2`. Findings included a probable visual duplicate pair, a questionable existing Calder relationship, strong Blue identity matches, one intentionally low-confidence identity suggestion, multiple identity/continuity failures, and real-person footage explicitly held for consent/privacy validation.

Runtime proposal state lives in ignored `data/human-video-agent-reviews.json`; append-only receipts live in `data/human-video-agent-review-events.ndjson`. Raw screenshots and agent packets remain in ignored `work/human-enricher-optical/`.

The catalog currently contains 10,884 logical video records. The initial delivery contains 16 pending-human optical proposals and 10,868 explicitly unreviewed records. This is a resumable campaign: progress is reported as reviewed, pending-human, human-decided, blocked, and remaining. Never convert queue coverage into a false claim that unreviewed videos were seen.

## Measured campaign estimate

Two vision-capable agents each performed a fresh three-keyframe review while timing the complete reasoning and structured-packet pass. The measured runs took 302.000 and 214.738 seconds, an average of 258.369 seconds (4 minutes 18 seconds) per video. At that rate, 10,884 logical videos require about 781.1 serial agent-hours (32.5 agent-days), or 260.4 wall-clock hours (10.85 days) with three agents continuously occupied. A 20% allowance for frame preparation, retries, and blocked media raises the three-agent planning estimate to about 13.0 days.

Exact per-run token telemetry was unavailable. The two structured outputs averaged 17,368 characters, approximately 4,342 output tokens per video, or 47.3 million output tokens for the catalog. A planning envelope of 12,000–25,000 total tokens per video (18,000 midpoint, including prompt/context, images, reasoning, and output) yields 130.6–272.1 million total tokens, with a 195.9 million midpoint. These are capacity estimates, not a claim about an actual Codex subscription bill. More than three frames, inaccessible files, retries, or deeper knowledge retrieval will increase both time and token use.
