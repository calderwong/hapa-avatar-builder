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
- a separate three-to-eight-color visual estimate on every inspected First, Mid, and Last frame, with uppercase `#RRGGBB` values, labels, `dominant`/`supporting`/`accent` prevalence, explanations, and per-frame uncertainty;
- a visible-signal handoff covering distinctive text, symbols, markings, palette, geometry, costume, objects, composition, and motifs without assigning Hapa Cards.

Automation may enumerate records, extract frames, calculate timestamps, hash files, validate schemas, and persist proposals. It may not assign quality, describe images, identify Avatars, categorize content, select frame palettes, combine them into a video-wide palette, or infer references. Existing OCR, pixel histograms, filename matches, similarity scores, and semantic rankers are excluded as judgment substitutes. Palette hex values are visually estimated editorial metadata rather than colorimetric measurements. Optical workers receive no Hapa knowledge-store or Reference Atlas inputs; reference lookup is a separate pass. The closed output schema rejects relationship/reference fields, unknown fields, `@Avatar` syntax, and identifiers such as `card:*` or `song:*`. A narrower text guard rejects common explicit claims such as “intended reference,” “visually echoes … concept,” and Hapa/Echo match or relationship phrasing. It deliberately allows literal observations that visible lettering says `HAPA` or `ECHO STATE`.

That text guard is lexical and cannot prove whether every paraphrase is semantic or literal. The primary isolation boundary is the absence of knowledge inputs, the strict vision-only output schema, the separate digest-bound Reference Pass, and required human review. Literal visible text and symbols remain valid signals; the validator is a protocol guard, not a substitute for human semantic review.

The receipt proves that exact frames were delivered and addressed; it cannot cryptographically prove cognition. Human playback and review remain the final attention check.

## Resumable queue

```sh
npm run cli -- human-enricher-optical-campaign-plan --limit 100 --model gpt-5.6-terra --effort medium --max-workers 3 --json
npm run cli -- human-enricher-optical-campaign-status --json
npm run cli -- human-enricher-optical-campaign-claim --worker /root/terra-vision-01 --lease-seconds 900 --json
npm run cli -- human-enricher-optical-campaign-progress --job-id '<job-id>' --worker /root/terra-vision-01 --attempt 1 --lease-id '<lease-id-from-claim>' --phase inspecting --current-frame 2 --completed-frames 1 --json
npm run cli -- human-enricher-optical-campaign-telemetry --job-id '<job-id>' --file ./scheduler-telemetry.json --worker /root/terra-vision-01 --attempt 1 --lease-id '<lease-id-from-claim>' --json
npm run cli -- human-enricher-optical-campaign-complete --job-id '<job-id>' --file ./worker-result.json --worker /root/terra-vision-01 --attempt 1 --lease-id '<lease-id-from-claim>' --json
npm run cli -- human-enricher-agent-decision --review-id '<review-id>' --action rejected --actor calder --json
```

The campaign planner selects only unreviewed videos with accessible registered First/Mid/Last images, hashes those exact files, and persists one immutable canonical SHA-256 frame-manifest digest per new job. It does not send source relationships to optical workers. Jobs issued during the initial kickoff retain their legacy FNV digest for compatibility, but completion also compares the complete normalized frame manifest, so that legacy digest is never the sole integrity check. Claims return a client-held opaque lease ID and an immutable snapshot of model, effort, prompt version, and frame packet. Attempts are explicit, expired claimed work returns to the queue, and the scheduler enforces at most three active child workers in the current runtime. Telemetry, failure, and completion preparation require the matching unexpired worker/attempt/lease tuple. Once completion is reserved, only that exact lease identity, server completion token, and normalized-result digest can finalize it, including after lease expiry. Retryable failures can be reclaimed with a new attempt and a fresh telemetry receipt.

Campaign and proposal mutations use owner-token/PID-checked cross-process file locks so separate API/CLI processes cannot double-claim a job or race an agent revision over a human decision. Stale malformed locks are recovered through a serialized, inode-checked quarantine instead of unlinking a possibly newer owner. Manual submission and campaign planning also share video-custody exclusion: whichever path reserves a video first prevents the other from preempting it. Completion holds campaign custody while it reserves the claim in a `completing` state, writes or reconciles the pending-human proposal, and finalizes the campaign receipt. Status/claim reconciliation freshly rechecks the review store under that same custody lock: a matching persisted review finalizes even after lease expiry, while an expired prepared receipt with no review becomes a retryable failed attempt and can be reclaimed. This avoids both a stale-snapshot review race and a permanently stranded finalizing job. Successful completion retries return the existing submitted receipt when the attempt, hashed lease, frames, persisted review, and normalized result still match. Current frames are re-hashed and compared with the issued manifest before completion is accepted.

Scheduler timing and token telemetry come from the coordinator's runtime receipt, never from model-authored timestamps. A captured receipt retains the rollout start/end, wall-clock duration, model, effort, agent path, direct image-view call count, and cached/input/output/reasoning/total token counters. For new attempts, the server adds a unique receipt ID and binds it to the exact job, attempt, frame digest, and hashed lease; replay across jobs is rejected. It must match the claim's frozen configuration and exact inspected-frame count, and it becomes immutable once recorded. These local bindings make receipt substitution visible, but the values remain coordinator-attested rather than provider-signed; the measured production numbers came from Codex rollout telemetry inspected by the coordinator. The first three kickoff receipts predate this binding and are reported honestly as three `legacyUnboundTelemetryCaptured` receipts and zero `tokenTelemetryBound` receipts rather than being retrofitted. A telemetry record is `captured` or explicitly `unavailable`; it is never synthesized from worker prose. Known structural aliases are normalized without inventing semantic evidence: bare hex arrays, missing prevalence/uncertainty/color explanations, duplicate frame mappings, unknown output fields, relationship/reference fields, and whole-video palettes are rejected. The canonical review validator then enforces frame observations, per-frame palettes, Quality explanation, optical attestation, and the no-reference boundary.

The 10,884-record dashboard includes videos that do not yet have three registered local images. Those records are reported as deferred for frame preparation rather than silently dispatched or counted as optically seen. Dashboard offsets are not campaign identity; stable video keys and frame digests are.

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

The Human Enricher shows the inspected filmstrip, observation and independent hex-palette swatches directly beneath every First/Mid/Last frame, reviewer receipt, proposed grade/description/categories, uncertainty, and optical signal handoff. It does not show or derive a whole-video palette. The separate reference panel shows Card matches, visible evidence, explanation, negative findings, reviewer/model parameters, and the exact Atlas packet receipt. A missing reference pass on a legacy optical proposal is shown as unfinished rather than silently treated as “no matches.”

Quality begins at the agent proposal when no human record exists. Human grades are compared with their originating agent grades to produce a bounded calibration prior (sample size, exact-match rate, within-one rate, error, and per-grade human averages). That prior guides later agents but never overwrites their direct visual judgment. Simply opening a proposal does not create a human record.

The human can:

- use the proposal as an editable draft;
- append suggestions to existing human work;
- edit or add any field; changes autosave after 350 ms and a pending edit is flushed before navigating to another video;
- reject the proposal without changing human truth.

Saving an agent-derived draft creates a normal optimistic human enrichment revision with exact proposal lineage and marks the proposal `accepted-edited`. Agent submission always resolves to `pending-human` (or `blocked`); supplied final statuses, human-decision objects, and scheduler receipts are stripped. Only the human decision endpoint can create `accepted`, `accepted-edited`, or `rejected`. Pending proposals remain structurally and visually separate.

## Initial optical evidence

Two sub-agents completed four bounded waves covering 16 videos and 48 beginning/middle/end frames with `view_image`, writing one literal observation per timestamp. Grades were `4, 3, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 2, 2, 1, 2`. Findings included a probable visual duplicate pair, a questionable existing Calder relationship, strong Blue identity matches, one intentionally low-confidence identity suggestion, multiple identity/continuity failures, and real-person footage explicitly held for consent/privacy validation.

Runtime proposal state lives in ignored `data/human-video-agent-reviews.json`; append-only receipts live in `data/human-video-agent-review-events.ndjson`. Raw screenshots and agent packets remain in ignored `work/human-enricher-optical/`.

The catalog currently contains 10,884 logical video records. The original delivery contained 16 pending-human optical proposals whose per-frame palettes are empty; they remain readable but do not satisfy the current palette-complete contract. The first durable production wave added three independently inspected, per-frame-palette-compliant proposals. Truthful full-catalog optical completion is therefore 3 of 10,884, with 16 legacy palette repairs and 10,881 remaining; 97 of the first 100 planned frame-ready jobs remain queued. This is a resumable campaign: progress is reported as queued, active, inspecting First/Mid/Last, drafting, finalizing, submitted, retryable/terminal failure, deferred for frame preparation, and remaining. Never convert proposal presence or queue coverage into a false claim that a palette-complete optical pass occurred.

The campaign status projection reads worker identity, video assignment, attempt, lease freshness, per-frame progress, and recent activity from the durable campaign ledger and append-only event log. A matching live lease may append completed frame ordinals and advance its phase through the `progress` command; completed ordinals cannot regress or leave the registered manifest. The public status projection never returns the opaque lease ID.

## Measured campaign estimate

The current benchmark used 20 distinct videos, 60 direct image-view calls, `gpt-5.6-terra` at medium reasoning, and no Reference Pass, Hapa store lookup, web search, OCR, or semantic heuristic. Runtime logs—not worker clocks—measured a 25.256-second mean, 25.039-second median, and 29.218-second 95th percentile per video. Three workers genuinely overlapped; a fourth live child was rejected by the scheduler. The full interactive audit took 314.82 seconds because dispatch paused for scheduler and telemetry checks, while continuously filled three-worker capacity is 7.13 videos/minute.

For the 10,868 records remaining before campaign launch, that compact packet projects 76.2 hours with one continuously occupied worker or 25.4 hours with three. Applying its 95th-percentile duration to every video yields 29.4 hours. This 25–30-hour band is a lower scheduling benchmark, not the current production forecast.

The 20 compact workers consumed 2,780,078 gross tokens: 2,600,448 cached input, 154,030 uncached input, and 25,600 output. Mean gross traffic was 139,004 tokens per video. Applying that mean to 10,868 records projects 1,510,694,385 gross tokens: 1,413,083,443 cached input, 83,699,902 uncached input, and 13,911,040 output.

The first three accepted production jobs used the richer canonical payload and took 44.942, 69.343, and 50.606 seconds, with a 54.964-second mean. They consumed 373,760 cached-input, 49,198 uncached-input, and 10,200 output tokens, or 433,158 gross tokens. Applying that production mean to the now-remaining 10,865 records projects 1,353,634,133 cached-input, 178,178,757 uncached-input, 36,941,000 output, and 1,568,753,890 gross tokens. A continuously filled three-worker queue projects 55.29 hours; applying the slowest observed job to every record projects 69.76 hours. Until more production receipts accumulate, use roughly 55–70 hours as the frame-ready planning range. Missing-frame preparation, retries, throttling, and human validation are additional. Reasoning tokens are a subset of output, and gross traffic is not a billing total; exact dollars require separate Terra cached-input, uncached-input, and output rates.
