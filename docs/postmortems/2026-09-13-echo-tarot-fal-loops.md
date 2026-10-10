# Echo Tarot FAL Loop Run — 2026-09-13

## Intended outcome

Establish and exercise a repeatable FAL H3 Max Turbo pipeline that turns every existing Echo Album Tarot still into a short, high-quality, continuously replayable card motion loop, while preserving local custody, human review, and API-key secrecy.

## Actual outcome

The pipeline produced 165 of 165 local five-second MP4s with no remaining failures. The Builder now exposes the queue and each loop beside its source still in both song and album views. The run completed before the observed launch-promotion boundary.

## Evidence

- Run manifest: `echo-tarot-loops-2026-09-13T17-44-11-745Z-226ca6dc/manifest.json`
- Completed jobs: 165; failed jobs: 0
- Media audit: every output is 768 × 1152, exactly 5.000 seconds, 120 frames, one video stream, and no audio stream
- Unique output hashes: 165
- Provider timing receipts: 165; median 1.261 seconds; p95 1.404 seconds
- Estimated promotional spend in manifest: USD 8.25; actual FAL billing remains authoritative

## What worked

- A three-card pilot sampled materially different animation vocabularies before releasing album spend.
- Supplying the source as both first and end image kept compositions unusually stable.
- Suit-aware, low-amplitude prompts preserved typography, borders, identity, and symbols better than generic cinematic motion language.
- The local source-anchor pass repaired the final seam and stripped unexpected provider audio.
- Per-transition manifest writes and preserved request IDs made interrupted work recoverable.
- Adaptive retry reduced download pressure while retaining the fast 12-worker first pass.
- The preload boundary exposed status and selected local media without exposing the credential, URLs, paths, or provider request IDs.

## Noise and wasted effort

- The first fast pass treated terminated CDN downloads as if the whole generation had failed.
- Two stale download processes appeared active after the provider work was already complete, which made completion status harder to read.
- The original UI copy said the local conformance step did not re-encode the picture. That was inaccurate because endpoint anchoring uses a deliberate high-quality H.264 re-encode.
- One throughput number mixed pilot/review/recovery gaps with active processing and obscured the much faster provider inference time.

## Root cause versus hypothesis

Observed evidence supports output-transfer instability, not slow model inference: provider timing stayed around 1.3 seconds while failures contained terminated network/download states. The main root cause was insufficient separation between provider generation state and local download state. A secondary reporting problem conflated end-to-end wall time with inference performance.

## Corrective actions

- Preserve `requestId` when FAL reports `COMPLETED`; retry result retrieval and CDN download without resubmission.
- Clear and resubmit only when the provider request itself is terminal and incomplete.
- Add bounded download retries and timeouts.
- Halve concurrency on retry waves while preserving a floor of two.
- Record the retry waves and surface both initial and recovery concurrency.
- Report median provider inference separately from end-to-end throughput.
- Correct the UI and documentation to disclose the high-quality local re-encode.

## Verification

- Targeted runner, UI, and image-pipeline tests pass.
- Production build passes.
- All 165 files pass FFprobe duration, dimension, frame-count, stream-count, and silence assertions.
- The canonical Electron UI visibly reports 165 loops ready, zero active, zero remaining, and exposes the Full album tab.

## Remaining risk

- The visual pilot was agent-inspected and quantitatively checked; individual human aesthetic approval is still pending in the Builder.
- CDN behavior and provider limits can change independently of this source.
- H.264 output is source-anchored but not lossless.
- Estimated cost is not a billing receipt.

## Reusable lesson

For generated-media queues, model completion, provider result availability, remote transfer, and local validation are separate states. Persist their identities independently. A retry must resume from the furthest proven state or it risks duplicate spend, poor throughput, and misleading operator status.

