# Echo Tarot FAL Motion Loops

## Outcome

The canonical Hapa Avatar Builder has a repeatable, local-first motion pipeline for the generated Echo Album Tarot cards. It uses FAL model `minimax/h3-max-turbo/image-to-video`, keeps the encrypted FAL credential in the Electron main process, and returns each result to machine-local application data for human review.

Three production runs completed on 2026-09-13:

- source image run: `echo-main-woman-2026-09-13T03-09-34-603Z-0deeed00`
- loop run: `echo-tarot-loops-2026-09-13T17-44-11-745Z-226ca6dc`
- result: 165 completed, 0 failed
- output profile: 768 × 1152, 5.000 seconds, 24 fps, 120 frames, video-only MP4
- estimated promotional spend: USD 8.25; the FAL account invoice is authoritative
- local output size: 1,199,309,008 bytes

| Lead profile | Source image run | Loop run | Result | Local bytes | Estimated spend |
| --- | --- | --- | ---: | ---: | ---: |
| Hapa Main Man | `echo-main-man-2026-09-13T19-20-17-632Z-7ccad9e9` | `echo-main-man-tarot-loops-2026-09-13T20-56-41-741Z-00a6adec` | 167/167 | 1,213,066,390 | $8.35 |
| Hapa Main Couple | `echo-main-couple-2026-09-13T20-12-21-996Z-fcd83995` | `echo-main-couple-tarot-loops-2026-09-13T20-56-41-739Z-f46b3782` | 167/167 | 1,269,241,170 | $8.35 |

The man and couple runs began together and finished 668.49 and 669.84 seconds later, respectively: roughly 11 minutes 10 seconds for both complete decks, including their pilots. Their combined manifest estimate is USD 16.70; FAL account billing is authoritative.

Runtime state lives below Electron's local application-data root and is intentionally outside Git:

```text
~/Library/Application Support/hapa-avatar-builder/Echo Tarot Loop Runs/
~/Library/Application Support/hapa-avatar-builder/Echo Tarot Main Man Loop Runs/
~/Library/Application Support/hapa-avatar-builder/Echo Tarot Main Couple Loop Runs/
```

Each run contains a `manifest.json` and `outputs/`. The manifest is the agent-readable source for song/card identity, source and output hashes, prompt hash and full prompt, FAL request ID, attempt count, provider timing, post-process receipt, estimated cost, and human review decision. It contains no API key.

## Recipe

The fixed production settings are:

| Field | Value |
| --- | --- |
| Model | `minimax/h3-max-turbo/image-to-video` |
| Duration | 5 seconds |
| Resolution | `768P` |
| Prompt expansion | `balanced` |
| Initial local workers | 12 |
| Pilot | 3 deliberately different cards |
| Poll interval | 900 ms |
| FAL input retention header | `X-Fal-Store-IO: 0` |
| Uploaded media lifecycle | 7 days |

The same finished Tarot image is sent as both `image_url` and `end_image_url`. The prompt locks camera, crop, border, typography, anatomy, symbols, palette, and lighting baseline. Motion is low-amplitude and suit-aware: water/mist for Cups, air/fabric/glints for Swords, embers/light for Wands, and grounded gold/dust/leaves for Pentacles. Major Arcana use card-specific motion where available and otherwise inherit a restrained atmospheric breath.

FAL can still return native audio and a slightly long clip even when prompted for silence and five seconds. Every provider result therefore passes through a local FFmpeg conformance step that:

1. strips all audio;
2. normalizes to 24 fps and exactly 120 frames;
3. fades from the exact source still into generated motion for 0.25 seconds;
4. fades back to the exact source still from 4.50–4.75 seconds;
5. holds the source still for the last 0.25 seconds; and
6. writes H.264 with `libx264`, `veryfast`, CRF 15, and fast-start metadata.

This high-quality local re-encode is intentional. It makes the visible endpoints source-anchored and removes provider audio; it does not claim pixel-identical video encoding.

## Pilot and quality findings

The woman and man gated pilots used `Five of Cups × Dear Papa`, `The Devil × Dear Papa`, and `Knight of Swords × For the Throat` to exercise water/mist, fire/chains/smoke, and hair/banner/lightning respectively. The couple pilot used `The Lovers × Pour a Warm One`, `The Hanged Man × Wide and Narrows`, and `The Devil × Dear Papa` to stress two-person identity separation, inverted staging, and shared symbolic action.

Visual inspection found stable lead identities, faces, hands, card frames, title typography, and Tarot symbols. Motion stayed within the supplied cards and matched the intended visible elements. The man/couple pilot conformed-video start-frame SSIM ranged from 0.9894–0.9905 and last-encoded-frame SSIM ranged from 0.9809–0.9821 against a resized source still. A distributed midpoint sample across all 334 new outputs also preserved composition, lead identity, relationship staging, and card meaning. These are image-similarity diagnostics and agent visual checks, not a substitute for human aesthetic approval.

The UI retains separate human review for the still and motion loop. A reviewer can open any generated card, switch between **Still** and **Motion loop**, play the loop at large size, record seam/identity/symbol/motion notes, and mark the loop **Approve**, **Revise**, or **Reject**. The **Full album** tab shows all 165 outputs and motion-readiness badges.

## Performance and recovery

The provider reported inference for all 165 jobs:

- average: 1.317 seconds
- median: 1.261 seconds
- p95: 1.404 seconds
- maximum: 1.411 seconds

The full album continuation began at 17:49:45.351Z and reached its final complete receipt at 18:05:18.488Z: 15 minutes 33 seconds wall time. The complete pilot-to-finish interval was 21 minutes 7 seconds. End-to-end time was dominated by uploads, queue/CDN transfer, roughly 1.20 GB of downloads, local conformance, and recovery work—not model inference.

The original woman fast pass started with 12 workers. Sixteen provider/CDN terminations were retried at 6 workers, then four remaining completed provider requests were recovered at 3 workers. The simultaneous man and couple runs therefore used 6 workers per profile—12 total—and completed without a recovery wave. Man attempt counts were 156 × one and 11 × two; couple counts were 157 × one and 10 × two. An attempt can be a non-billable result/download recovery, so it must not be interpreted as a generation count.

Provider inference stayed small relative to end-to-end work. The man run averaged 1.339 seconds (median 1.386, p95 1.404); the couple run averaged 1.333 seconds (median 1.383, p95 1.404). Upload, download, local H.264 conformance, and manifest persistence dominate the 11-minute wall clock.

The runner persists after every state transition and supports pause/resume. Failed work is retried in adaptive half-concurrency waves with a floor of two. Downloads are restricted to HTTPS `fal.media` hosts, capped at 250 MB per response, retried three times with a 120-second timeout, and written only after a complete local result is available.

## Operator use

The primary workflow is in **Echos Album → Reference Atlas → song notebook → Tarot ↔ song logic**:

- **Generate 3-loop quality pilot** starts the bounded pilot.
- Review the pilot loops in the large preview.
- **Approve pilot & animate album** releases the held jobs.
- **Pause after active loops**, **Resume loop queue**, and **Retry failed loops** preserve the manifest and continue safely.

CLI equivalents use the same encrypted local key and manifest:

```bash
npm run echo:tarot-loops:status
npm run echo:tarot-loops:pilot
npm run echo:tarot-loops:full
npm run echo:tarot-loops:resume

npm run echo:tarot-man-loops:status
npm run echo:tarot-man-loops:pilot
npm run echo:tarot-man-loops:full
npm run echo:tarot-man-loops:resume

npm run echo:tarot-couple-loops:status
npm run echo:tarot-couple-loops:pilot
npm run echo:tarot-couple-loops:full
npm run echo:tarot-couple-loops:resume
```

Do not run the CLI concurrently with the Electron app. Both operate on the same local runtime state and the desktop app owns the normal operator session.

## Custody and privacy boundary

- The FAL key is read from the OS-encrypted local credential store in Electron's main process. It is never exposed through preload, renderer state, run manifests, logs, Git, or remote URLs.
- Tarot source images are uploaded to FAL because image-to-video inference requires them. That transmission is the explicit purpose of this pipeline.
- `X-Fal-Store-IO: 0` disables FAL JSON input/output payload retention for the request. FAL CDN objects have a separate seven-day lifecycle and should still be treated as temporarily public-by-URL provider media.
- Public renderer status omits local paths, provider request IDs, input URLs, and output URLs. A selected local video is transferred on demand across the trusted Electron IPC boundary.
- Generated motion is a review proposal. Completion does not make it canon, approve publication, or authorize downstream use.

## Provider references

- Model contract and current pricing: <https://fal.ai/models/minimax/h3-max-turbo/image-to-video>
- Launch promotion: <https://fal.ai/minimax-h3-max>
- Concurrency behavior: <https://fal.ai/docs/documentation/model-apis/concurrency-limits>
- FAL CDN lifecycle: <https://fal.ai/docs/documentation/model-apis/fal-cdn>
- Request and media retention: <https://fal.ai/docs/documentation/model-apis/media-expiration>
