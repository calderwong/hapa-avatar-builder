# Echo State four-count keyframe operations

Status: active first-pass local process. GPT Image execution is authorized through Codex built-in image generation only. OpenAI API dispatch and all video generation remain disabled.

## Outcome

The process continues until every Echo State song has source-backed four-count timing and every count has:

1. a lyric/context-grounded Scene Prompt;
2. a claimed Codex GPT Image result using at least one verified Red, Blue, or Green Avatar seed;
3. a hash-verified native image and 1920×1080 Director derivative;
4. a candidate `echo-scene-keyframe` Media Card record; and
5. a visible but unclaimable held-video quest.

The controller is restart-safe. Pausing prevents new claims without deleting active or completed work. `stop-after-current` lets active claims finish and then moves the process to `paused`.

## Operator controls

From `/Users/calderwong/Desktop/hapa-avatar-builder`:

```bash
npm run echo:keyframes:status
npm run echo:keyframes:run
npm run echo:keyframes:pause
npm run echo:keyframes:resume
npm run echo:keyframes:stop-after-current
node scripts/echo-scene-keyframe-process.mjs configure --concurrency 3 --per-run-claim-limit 3
```

Read-only screenplay-authoring controls:

```bash
node scripts/echo-screenplay-authoring-queue.mjs
node scripts/validate-echo-screenplay-authoring-draft.mjs --file <explicit-INCOMPLETE-draft.json>
```

The authoring queue distinguishes `packet_ready`, `authoring_partial`, `awaiting_finalization`, `awaiting_review`, `approved`, `staged_imported`, `image_activation_partial`, and `complete`. Count coverage cannot advance a song when authorship, provenance, source revision, or draft integrity fails. An incomplete direct-author draft must be an exact contiguous prefix; gaps, duplicate count IDs, declaration mismatches, or authored-field automation fail closed.

Lower-level bounded worker operations:

```bash
node scripts/echo-scene-keyframe-process.mjs claim --lane prompt --limit 2 --runner-id codex-terra --run-id <run-id>
node scripts/echo-scene-keyframe-process.mjs prompt-complete --quest-id <quest-id> --runner-id codex-terra --result <result.json>
node scripts/echo-scene-keyframe-process.mjs claim --lane image --limit 2 --runner-id codex-terra-image --run-id <run-id>
node scripts/echo-scene-keyframe-process.mjs image-complete --quest-id <quest-id> --runner-id codex-terra-image --local-path <codex-gpt-image-output>
node scripts/echo-scene-keyframe-process.mjs fail --quest-id <quest-id> --runner-id <runner-id> --error <reason>
node scripts/echo-scene-keyframe-process.mjs release-expired
```

Only `prompt` and `image` are claimable lanes. Any attempt to claim or complete `video` fails closed.

## Codex worker loop

The Codex app heartbeat `echo-state-keyframe-worker` checks this process every 10 minutes. When state is `running`, each heartbeat is bounded to:

- at most three Terra prompt workers;
- at most three Terra Codex GPT Image workers;
- sequential parent-agent installation of returned files to avoid state races; and
- at most one missing Song Registry timing analysis before replanning.

When state is `paused`, `stop_after_current`, or `completed`, the heartbeat performs no claims. The automation can remain active because the process state is the execution authority.

## Durable local state

- `data/echo-scene-keyframes/audit.json`: source/timing coverage and storage estimate.
- `data/echo-scene-keyframes/process.json`: current normalized process projection.
- `data/echo-scene-keyframes/events.ndjson`: append-only process event journal.
- `data/echo-scene-keyframes/claims/`: bounded Codex claim/evidence packets and worker results.
- `data/echo-scene-keyframes/media-cards.json`: generated candidate Media Card records.
- `public/generated/media-queue/echo-scene-keyframes/`: native and Director-size keyframe files.

Runtime state and generated media stay local and outside Git. Source code, tests, and contracts are committed separately.

## Current audited scale

The 2026-07-18 audit found 109 unique Director song projects. Forty-seven have complete source-backed beat telemetry and yield 6,025 four-count windows, including 38 explicit partial final counts. Sixty-two songs remain timing-gated. Three accepted pilot keyframes are imported without replaying generation, leaving 6,022 currently measurable images. At the observed pilot average of 5.7 MiB per native-plus-Director pair, current source-backed coverage projects to about 33.6 GiB.

These numbers are projections from current local evidence, not a guarantee of final volume. Timing analysis can add more windows, and regenerated attempts preserve lineage rather than overwriting earlier artifacts.

## Quality and provenance gates

- Every prompt packet names the exact four-count, timing source/confidence, overlapping lyrics, continuity windows, Director context, output profile, and RGB seed lineage.
- Instrumental windows must say that no lyrics overlap; they may not invent lyric evidence.
- Codex GPT Image receives the local seed file, not only a prose description.
- Installation creates a new revisioned filename, hashes both outputs, records dimensions and provider/run identity, and leaves `eligibleForDirector: false` pending review.
- Existing Director cuts and Song Card editions are unchanged.
- OpenAI API credentials are neither required nor read by this process.
- Direct-author screenplay work is performed by one declared LLM author with zero subagents and zero authored-field scripts/templates. Mechanical validators may inspect or hash authored text but may not create or rewrite it.
- Each incomplete tranche is audited for exact contiguous source order, count declaration truth, semantic/shot/prompt completeness, and repeated scene/prompt/justification/metaphor scaffolds before the same author may continue.
- A complete candidate still requires a different independent reviewer and an immutable approval receipt before prompt import. Image activation remains a separate bounded step after import; video stays held.
