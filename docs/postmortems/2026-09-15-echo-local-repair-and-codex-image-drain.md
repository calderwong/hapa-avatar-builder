# Echo local repair and Codex image drain

## Objective

Finish incomplete Echo reference prompts with the local oMLX Qwen route, then turn qualified prompts into reference cards with Codex built-in image generation without consuming an OpenAI API key or dispatching FAL.

## Evidence

- The existing intelligence manifest was `complete-with-errors`: 23 songs had failed and 66 concepts needed revision.
- `local-resume` skipped failures already stamped with the current local retry policy, so restarting it could not make progress.
- The added `local-repair` command explicitly reselects failed or below-gate local plans while retaining completed work.
- The focused intelligence test suite passes 16/16 and proves repair never reads a paid-provider credential.
- Six Codex images were generated and imported during the repair kickoff. A concurrent import experiment exposed last-writer-wins manifest behavior; the ongoing heartbeat now generates concurrently but serializes all manifest writes.

## What worked

- Keeping Hapa Avatar Builder as workflow owner and oMLX as a loopback compute provider preserved canonical lineage and UI ingestion.
- Repairing only failed or below-gate plans avoided resetting the completed album corpus.
- Claiming exact prompt IDs before generation kept every image attached to its song, reference, concept, avatar references, and source-intelligence run.

## Noise and misunderstanding

- A healthy oMLX process can be silent for minutes because the CLI prints only after its active batch finishes; manifest status is the reliable progress signal.
- Parallel image generation is safe, but parallel `complete`/`fail` commands race on the shared JSON manifest. Two lost completion writes were detected and replayed sequentially; no generated artifacts were lost.

## Changes

- Added `local-repair [limit]` to `scripts/run-echo-reference-intelligence-local.cjs`.
- Extended the local-provider test to cover current-policy failure repair and credential isolation.
- Installed an active thread heartbeat that resumes one repair process when needed, claims qualified prompts, uses Codex image generation exactly once per claim, serializes imports, and stops itself only when both queues are empty.

## Reusable guardrail

Run compute-heavy generation concurrently, but treat file-backed manifest mutation as a single-writer operation until the storage layer provides locking or atomic compare-and-swap semantics.
