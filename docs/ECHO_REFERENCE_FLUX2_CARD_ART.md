# Echo Reference Card Art with FLUX.2

## Outcome

The Reference Atlas can now turn eligible, source-backed Reference Cards into a reviewable FLUX.2 art queue.

The current local queue contains 82 planned jobs. Planning is provider-free and made no paid API calls. Every generated image remains an unminted proposal until a human explicitly accepts it.

This lane is for artistic Reference Card imagery. It does not modify lyrics, reference truth, canon state, Song Card editions, or public visibility.

## Why the art queue begins with the Reference Atlas

An image prompt is compiled from the Reference Card rather than from an isolated lyric fragment. The prompt can include:

- The strongest lyric occurrence.
- Public source context.
- Themes and mechanics already attached to the reference.
- Up to four evidence-backed constellation neighbors.
- The Card's truth and review boundary.
- A deterministic Hapa visual language.

This makes the image a projection of the current graph, not a replacement for it. When context changes, a later queue can produce a new prompt hash and a new proposal without silently overwriting prior work.

## Eligibility boundary

A Card is eligible only when all of the following are true:

- Its ID begins with `reference:`.
- Its interpretation is direct or source-backed.
- It has public context and at least one lyric occurrence.
- It is not marked private or withheld.

Private clues, unresolved personal namespaces, and private-visibility context are excluded from the provider queue. Motif Cards remain useful within the Atlas but do not automatically become external image-generation jobs.

## Provider contract

The implementation uses Black Forest Labs' asynchronous FLUX.2 API:

1. Submit a generation request.
2. Store the provider-returned polling URL.
3. Poll until the job is ready or fails.
4. Download the generated image immediately.
5. Hash and store the local artifact.
6. Require human review before acceptance.

The default model is `flux-2-max`, with a 1536 × 2048 portrait output suitable for Card art. The implementation also recognizes `flux-2-pro`, `flux-2-flex`, and `flux-2-pro-preview`.

Official provider references:

- [FLUX.2 overview](https://docs.bfl.ai/flux_2/flux2_overview)
- [FLUX.2 text-to-image](https://docs.bfl.ai/flux_2/flux2_text_to_image)
- [FLUX.2 image editing and references](https://docs.bfl.ai/flux_2/flux2_image_editing)
- [Asynchronous generation API](https://docs.bfl.ai/quick_start/generating_images)

The adapter follows provider-returned polling URLs only when they resolve to approved Black Forest Labs API hosts. Generated media is downloaded only from approved BFL delivery hosts. The API key is sent to the API host and never to the signed delivery URL.

## Prompt rules

Each prompt asks for an original, transformative visual scene rather than a replica of an outside property. It requires:

- No celebrity likenesses.
- No copied franchise character designs.
- No logos or watermarks.
- No baked-in typography.
- No invented private explanation.
- A visually legible relationship among the primary reference and its supported neighbors.
- A clean region for later Card typography.

FLUX.2 does not use a separate negative-prompt field in this pipeline. Avoidance instructions are expressed directly in the positive prompt.

Every planned job records:

- Source Card ID.
- Source mining-run and graph hashes.
- Model and dimensions.
- Prompt and prompt hash.
- Deterministic seed.
- Reference-image inputs, when explicitly supplied.
- Generation status and provider job metadata.
- Artifact path, media type, byte count, and SHA-256 hash.
- Human review decision and reviewer.

## Commands

Plan without contacting the provider:

```bash
npm run echo:reference-art:plan
```

Persist or refresh the local queue:

```bash
npm run echo:reference-art:plan -- --apply
```

Inspect queue status:

```bash
npm run echo:reference-art:status
```

Generate one planned Card after explicitly acknowledging provider cost:

```bash
BFL_API_KEY=... npm run echo:reference-art:run -- --apply --confirm-cost --limit 1
```

Generate selected Cards:

```bash
BFL_API_KEY=... npm run echo:reference-art:run -- \
  --apply \
  --confirm-cost \
  --card reference:example-one \
  --card reference:example-two
```

Accept or reject a completed proposal:

```bash
npm run echo:reference-art:review -- \
  --apply \
  --job <job-id> \
  --decision accept \
  --reviewer <human-reviewer-id>
```

The `run` command requires both `--apply` and `--confirm-cost`. Its default limit is one job. This makes accidental batch spending less likely.

## Custody and publication

The generated file is stored under:

```text
data/media/echo-reference-cards/<reference-card-id>/
```

The queue lives under:

```text
data/echo-reference-art/queue.json
```

Both are runtime artifacts rather than source truth. Generation does not:

- Mark the Reference Card canonical.
- Mint a Song Card edition.
- Change a private visibility boundary.
- Publish the file.
- Replace the source citation.
- Promote a model inference to fact.

Human acceptance means only that the image is suitable as a proposed Card-art asset. Any later canon, minting, or publication action remains a separate governed operation.

## Failure and recovery behavior

The runner can resume a submitted job using its stored polling URL. It handles provider failures, insufficient-credit responses, and rate limiting as explicit errors. A completed output is downloaded immediately because provider delivery URLs are temporary.

The runner refuses to overwrite an existing artifact when its content does not match the recorded hash. This preserves evidence of what the provider actually returned.

## Current baseline

After the denser Reference Atlas pass:

- 1,020 Reference and Motif Cards exist locally.
- 65 evidence-backed constellation edges connect source references.
- Two multi-Card constellations were discovered.
- 82 source-backed Cards are eligible for FLUX.2 art.
- Three private or unresolved references remain excluded.
- Zero images were generated during planning.
- Zero Cards were made public or canonical.

This is intentionally a cautious starting point. The first generated batch should be small and visually reviewed before expanding the queue.
