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
- relationship and reference suggestions that distinguish `visual-observation`, `source-relationship`, and `knowledge-base-inference`;
- exact Hapa source paths for knowledge comparisons.

Automation may enumerate records, extract frames, calculate timestamps, hash files, validate schemas, and persist proposals. It may not assign quality, describe images, identify Avatars, categorize content, or infer references. Existing OCR, filename matches, similarity scores, and semantic rankers are excluded as judgment substitutes.

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

## Human validation

The Human Enricher shows the inspected filmstrip, observation for every frame, reviewer receipt, proposed grade/description/categories, uncertainty, relationships, references, and cited Hapa sources. The human can:

- use the proposal as an editable draft;
- append suggestions to existing human work;
- edit or add any field before saving;
- reject the proposal without changing human truth.

Saving an agent-derived draft creates a normal optimistic human enrichment revision with exact proposal lineage and marks the proposal `accepted-edited`. Pending proposals remain structurally and visually separate.

## Initial optical evidence

Two sub-agents completed four bounded waves covering 16 videos and 48 beginning/middle/end frames with `view_image`, writing one literal observation per timestamp. Grades were `4, 3, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 2, 2, 1, 2`. Findings included a probable visual duplicate pair, a questionable existing Calder relationship, strong Blue identity matches, one intentionally low-confidence identity suggestion, multiple identity/continuity failures, and real-person footage explicitly held for consent/privacy validation.

Runtime proposal state lives in ignored `data/human-video-agent-reviews.json`; append-only receipts live in `data/human-video-agent-review-events.ndjson`. Raw screenshots and agent packets remain in ignored `work/human-enricher-optical/`.

The catalog currently contains 10,884 logical video records. The initial delivery contains 16 pending-human optical proposals and 10,868 explicitly unreviewed records. This is a resumable campaign: progress is reported as reviewed, pending-human, human-decided, blocked, and remaining. Never convert queue coverage into a false claim that unreviewed videos were seen.
