# Echo Reference Media Library

Status: current local application contract  
Owner surface: **Echo Album → Reference Atlas → Consolidated Reference Media**  
Authority: preview and review only; visibility is not canon, publication, mint, identity truth, or reuse approval

## Purpose

The consolidated library is the single visual inventory for Echo Album references. Humans can scan every retained visual pass, filter by song or run, play an available video loop on hover, and expand any item to inspect its meaning and provenance. Agents receive the same index through one local API rather than needing to infer run directories or scrape the UI.

## What is indexed

The server rebuilds the index from durable local sources on every request:

1. The Reference Atlas media catalog exposed by the GPT Image reference library. This preserves the earlier Codex/GPT visual corpus and its exact Card-revision logic, lyrics, claims, interpretations, citations, and review state.
2. Every completed job in every retained manifest under `~/Library/Application Support/hapa-avatar-builder/Echo Reference Image Runs/<run-id>/manifest.json`.
3. Every completed loop under `~/Library/Application Support/hapa-avatar-builder/Echo Reference Loop Runs/<run-id>/manifest.json`, joined by the pair `sourceImageRunId + sourceJobId`.

Runs are additive. The gallery does not select only `latest.json`, silently paginate, or collapse multiple visual versions for the same song/reference connection. Missing or malformed manifests are reported in `warnings` without hiding healthy runs.

Codex built-in GPT Image runs are first-class retained runs, not mislabeled API traffic. Their gallery records expose `source.kind: codex-run`, `source.lane: codex-gpt-image`, `apiKeyUsed: false`, the exact avatar-aware generation prompt and hash, the underlying source prompt, safe avatar IDs/asset IDs, and any prompt-repair history. Local avatar source paths remain private to the manifest and never enter the browser payload.

Live verification on 2026-09-14 (America/Los_Angeles), after the Codex remainder image run and its budget-bounded FAL motion pass, indexed **1,782 visual versions** across **1,309 reference connections** and **199 songs**. Of those, **1,422** had hover-ready loops: 853 catalog visuals plus 929 generated visuals from three retained image runs, joined to two retained loop runs. The newest image run contributes 303 Codex built-in GPT Image visuals and does not use an API key; its matching FAL run contributes loops for 233 of those visuals and leaves 70 explicitly held by the $11.68 budget gate. Treat these as an observed snapshot, not a hard-coded target; the counts are expected to grow.

## UI behavior

- The gold ingress is always visible near the top of Reference Atlas and reports total visual versions, unique reference connections, hover-ready loops, image runs, and catalog visuals.
- **Open all reference media** opens an infinite-scrolling thumbnail gallery. The first 60 thumbnails render immediately and each near-bottom scroll adds 60 more until every match is visible; the complete index remains searchable from the first render. Default order is newest first.
- Every tile shows the entire source image with `contain` fitting and dark letterboxing when aspect ratios differ. Art is never cropped merely to fill the tile. Clicking is only for enlargement and details.
- Filters cover free-text retrieval, song, source run, still/loop availability, and sort order.
- Hover starts the linked loop. Pointer leave restores the source still. Reduced-motion preferences suppress autoplay.
- Clicking a tile opens a large detail inspector with the stored rationale, memory hook, lyric moments, claims, interpretations, citations, quality assessment, retrieval tags, exact image prompt, hashes, generator, generation time, and review state when those fields exist.
- **Open song/reference workbench** returns to the associated song and exact Atlas Card when one exists.

The client requests a fresh index every five seconds while the modal is open and every twenty seconds while it is closed. It sends `If-None-Match`; unchanged indexes receive `304 Not Modified`, so polling does not repeatedly transfer the full corpus.

## Agent and API contract

### Complete index

`GET /api/echos/references/media-library`

Response schema: `hapa.echo-reference-media-library.v1`

Important fields:

- `digest`: stable content digest used as the HTTP ETag.
- `counts`: `visuals`, `uniqueReferences`, `songs`, `loopReady`, `catalogVisuals`, `generatedVisuals`, `imageRuns`, and `loopRuns`.
- `runs`: catalog plus every retained image run.
- `items`: one record per visual version. Each record carries public asset URIs, song/reference identity, rationale/intelligence fields, prompt and assessment data when present, review authority, and generation provenance.
- `warnings`: fail-soft manifest scan findings.
- `policy`: explicit completeness, refresh, path-custody, and authority boundaries.

Local filesystem paths are intentionally absent from the payload.

### Media assets

- `GET|HEAD /api/echos/reference-media/assets/image/<run-id>/<job-id>`
- `GET|HEAD /api/echos/reference-media/assets/loop/<loop-run-id>/<loop-job-id>`

Loop assets support byte ranges for responsive hover playback. Asset resolution verifies that the manifest, job, and output path remain inside the expected local custody root.

## Manifest contract for future generators

To make a new reference-image run appear automatically:

1. Create a unique stable directory under `Echo Reference Image Runs`.
2. Write `manifest.json` with `runId`, `createdAt`, `model`, `state`, and `jobs`.
3. Each visible job must have a stable `id`, `status: "completed"`, a valid local `outputPath`, `songId`, `songTitle`, and a stable `referenceId` or `promptId`.
4. Preserve `referenceTitle`, `visualConceptTitle`, `prompt`, `promptHash`, `memoryHook`, `retrievalTags`, `reviewPrompt`, `qualityAssessment`, usage, and timestamps whenever the pipeline has them. These are retrieval and review data, not expendable logging.
   For Codex built-in work, also preserve `provider: codex-image-generation-tool`, `apiKeyUsed: false`, `generationPrompt`, `generationPromptHash`, `sourcePrompt`, `avatarReferences`, and `repairHistory`. Use `outputHash` or `outputSha256` for the durable PNG digest.
5. Write the manifest atomically after the output is durable. Never mark a missing file completed.

To attach a loop automatically:

1. Create a unique stable directory under `Echo Reference Loop Runs`.
2. Its manifest must identify `sourceImageRunId`.
3. Every completed loop job must identify the exact image `sourceJobId`, its own stable `id`, a durable `outputPath`, output hash, and completion timestamp.
4. Do not join by title or filename. Those are presentation fields and may collide.

If a future provider writes to a different root or schema, extend `server/echo-reference-media-library.mjs` with an explicit adapter and a behavioral test. Do not teach the client to walk provider-specific directories.

## Verification

Run the focused contract tests:

```sh
node --test tests/echo-reference-media-library.test.mjs tests/echo-reference-gpt-image-library.test.mjs
```

Build the renderer:

```sh
npm run build
```

After restarting the local application server, verify the live index and range streaming:

```sh
curl -s http://127.0.0.1:8797/api/echos/references/media-library
curl -s -r 0-31 -D - http://127.0.0.1:8797/api/echos/reference-media/assets/loop/<run-id>/<job-id> -o /dev/null
```

A healthy range request returns `206 Partial Content` and `Accept-Ranges: bytes`.

## Files to maintain together

- `server/echo-reference-media-library.mjs`
- `server/api.mjs`
- `src/components/EchoReferenceMediaLibrary.jsx`
- `src/components/EchoHoverLoopMedia.jsx`
- `src/echo-reference-media-library.css`
- `src/components/EchoReferenceExplorer.jsx`
- `tests/echo-reference-media-library.test.mjs`
- `tests/echo-reference-gpt-image-library.test.mjs`

When adding a source or changing the schema, update this document and the Reference Mining Runbook in the same focused commit.
