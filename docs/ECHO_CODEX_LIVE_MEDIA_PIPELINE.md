# Echo Codex Live Media Pipeline

Status: active prototype, local-first  
Owner surface: **Echo Album → Reference Atlas → Consolidated Reference Media**  
Authority: generated proposals require human review; neither an image nor loop is canon or publication approval

## Purpose

Turn each newly qualified Echo reference prompt into a visible, attributable
playing-card image through Codex's built-in GPT Image tool, then immediately turn
that still into a five-second FAL H3 Max Turbo card loop. This route never uses
the saved OpenAI API key. FAL access stays inside the Builder's encrypted local
credential boundary.

```text
Local Qwen intelligence manifest
  → qualified prompt claim
  → Codex built-in GPT Image + Hapa Avatar reference
  → local image-run manifest
  → FAL h3-max-turbo first-frame = last-frame loop
  → local loop-run manifest
  → Consolidated Reference Media
```

## Operator commands

Run from the canonical Builder checkout:

```sh
node scripts/echo-codex-live-media-pipeline.mjs status
node scripts/echo-codex-live-media-pipeline.mjs claim
node scripts/echo-codex-live-media-pipeline.mjs complete --job <job-id> --image <codex-output-path>
node scripts/echo-codex-live-media-pipeline.mjs fail --job <job-id> --reason <safe-message>
```

`claim` first synchronizes the current local-intelligence manifest. It returns
the exact `generationPrompt`, `referencedImagePaths`, job ID, song, reference,
memory hook, and quality lineage needed for one built-in image-generation call.
Claims expire after 45 minutes and are safely re-queued.

After importing one or more images, append and run their loops with:

```sh
env HAPA_TAROT_LOOP_MAX_SPEND_USD=10 HAPA_TAROT_LOOP_CONCURRENCY=12 \
  ./node_modules/.bin/electron scripts/run-echo-tarot-loops.cjs budget reference-atlas
```

The $10 value is a cumulative hard ceiling for this live loop run, not a target.
At the observed promotional rate of $0.01/second, one five-second loop reserves
$0.05. Actual FAL account billing remains authoritative. Never continue paid
generation after the operator's promotion cutoff without fresh authorization.

## Queue and provenance contract

- Source: the current manifest under `Echo Reference Intelligence Runs`.
- Eligibility: `qualityAssessment.ready === true` or status
  `ready-for-image-api`.
- Deduplication: exact `promptId` across every retained completed image run.
- Identity: Red, Blue, Green, Bella, Domina, or Falka; explicit prompt identity
  wins, otherwise selection is deterministic. A second Avatar is added only when
  the authored scene calls for a pair.
- Image provider: `codex-image-generation-tool`; `apiKeyUsed: false`.
- Runtime image root: `Echo Reference Image Runs/echo-reference-codex-live-2026-09-14`.
- Runtime loop root: a matching run under `Echo Reference Loop Runs`.
- Join: loop `sourceImageRunId + sourceJobId`; never title or filename.
- Durable fields: exact source and generation prompts, hashes, Avatar asset IDs,
  quality assessment, intelligence plan/connection IDs, output digest, timings,
  and estimated FAL spend.
- Privacy: local Avatar source paths remain in the private manifest and are not
  emitted by the public media-library API.

The Codex built-in image tool cannot be executed by an ordinary background Node
process. The Node script owns deterministic queue state; a Codex heartbeat owns
the actual tool invocation and hands the resulting local file back to the script.

## Active automation

Heartbeat `monitor-echo-local-prompt-drain` runs every five minutes in the
originating Codex task. It keeps the local-Qwen drain alive, claims at most one
qualified image per pass, uses the built-in image tool, imports the result, and
invokes the incremental FAL loop runner. It stays quiet while work advances and
reports only actionable failure or final catch-up. The current promotion guard
forbids new FAL dispatches at or after **2026-09-15 00:00 America/Los_Angeles**.

## Recovery

1. Run `status`; inspect queued, running, completed, and failed counts.
2. A stale running image claim returns to queued after 45 minutes.
3. Re-run the FAL budget command. If the source run is unchanged, it appends only
   unseen completed image jobs and never resubmits completed loop IDs.
4. If the hard ceiling is exhausted, additional images remain `held` in the loop
   manifest. Releasing them requires explicit new budget authorization.
5. Confirm automatic visibility with
   `GET /api/echos/references/media-library`; no UI-side import is required.

## Verification snapshot

On 2026-09-14, the first live batch produced three Codex built-in images and
three FAL loops without failures. FAL reported $0.15 estimated spend at the
observed promotional rate. The consolidated index automatically advanced to
1,785 visuals, 1,495 loop-ready items, four retained image runs, and three loop
runs.

## Turn checkpoint and reusable lesson

- Reused: existing intelligence checkpoint manifest, encrypted credential store,
  FAL endpoint/prompt/post-processing, and complete Reference Media scanner.
- Changed: added a Codex-tool claim/import adapter and incremental same-run loop
  reconciliation.
- Guardrail: never pretend the built-in image tool is a background API; persist
  the claim before invoking it and import only the exact returned artifact.
- Reusable Flow candidate: a provider-neutral `qualified prompt → human/agent
  tool claim → local artifact → dependent paid transform → indexed provenance`
  queue for other Hapa media surfaces.
