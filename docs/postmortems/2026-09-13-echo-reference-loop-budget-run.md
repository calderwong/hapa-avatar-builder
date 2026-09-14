# Echo Reference Atlas FAL loop budget run — 2026-09-13

## Objective

Animate the 336 completed images in the latest Echo Reference Image run with the existing MiniMax H3 Max Turbo living-card loop contract before promotional pricing ended. Keep paid submissions below the operator-authorized $18.48 ceiling and expose completed loops beside their source images in Reference Atlas.

## Evidence inspected

- Source image run `echo-reference-images-2026-09-14T03-19-23-465Z-e94c0e2a`: 336 completed local images.
- Existing `echo-tarot-loop-generation.cjs` first/last-frame, silent post-processing, encrypted-key, expiring-upload, and local-custody boundaries.
- FAL's September 13 model page: 768p promotional price $0.01/second through September 14.
- Completed loop run `echo-reference-loops-2026-09-14T03-50-00-500Z-f07253ea` and its local manifest/output probes.

## Result

- 336 five-second 768p loops completed in 437.1 seconds at 24-way local concurrency: 46.12 completed loops/minute.
- Estimated promotional spend: $16.80; zero failed or held jobs. The manifest records the $18.48 hard cap.
- All 336 active MP4s are exactly five seconds and contain zero audio streams.
- Every source job has one distinct output path and one distinct output hash.
- Reference Atlas now reads the local loop manifest and plays each linked loop on hover.

## Learning delta

What worked: the proven Tarot first/end-image request and local silent anchor post-process generalized cleanly to Reference Atlas artwork. Durable FAL request IDs made result recovery possible without new generation submissions.

What was misunderstood: the Tarot output filename assumed one card title per song. Reference research can produce several jobs sharing the same song and reference title, so the first completed manifest reported 336 jobs while only 157 filenames existed after overwrites.

What changed: output filenames now include the deterministic loop job ID. A result-only repair path re-downloaded and post-processed all 336 already-paid FAL results, then moved 157 superseded collision files into a recoverable quarantine directory.

## Reusable guardrail

Any many-to-one media projection must include a stable job/content identity in its filename. Completion acceptance must compare manifest job count, unique output-path count, and physical-file count; manifest status alone is insufficient. Provider request IDs must remain durable so local custody failures can be repaired without repeating paid inference.

Candidate: promote the hard-budget selection plus result-only local repair path into the Hapa media-generation queue protocol.
