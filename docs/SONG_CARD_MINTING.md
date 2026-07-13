# Song Card Minting

Song Card Minting freezes an approved music-video render as an immutable numbered edition while leaving the Echo director project editable. The stable identity is `song-card:<song-id>`; editions are `song-card:<song-id>:edition:<number>`.

## Operator flow

1. Open **Echos → Tracks** and review **Current Mint / Next Mint**.
2. Keep the intelligent defaults—current saved edit, **Private demo**, and Builder-managed files—or open recovery controls only when repairing an exceptional run.
3. Review exact changed families and dirty ranges, then click **Render next edition**. Private demo and public publication remain separate gates.
4. When the renderer reports its hashed master, the Builder copies it into a managed workspace, generates and verifies a representative poster when necessary, and binds both artifacts to the still-current plan automatically.
5. Confirm the predicted edition. Verify its immutable video, lineage, timestamp-card index, and historical print behavior before publishing.
6. Use **Export MP4** for the finished video or **Export Song Card** for the complete portable edition bundle. The Builder verifies the complete immutable edition and chooses a unique destination under `HAPA_SONG_CARD_EXPORT_ROOT` or `~/Downloads/Hapa Song Cards`. If the preferred folder is unavailable, it falls back to a private Builder-owned application-data export folder and reports the actual destination.

The trusted loopback Builder UI establishes a process-scoped local session automatically, so it never asks the operator to handle a bearer token. Direct API clients still require `Authorization: Bearer <HAPA_AVATAR_ADMIN_TOKEN>`. Use an `Idempotency-Key` and the plan's head generation (`If-Match`) when minting. Public manifests never contain absolute custody paths; the authenticated private manifest does.

CLI discovery:

```bash
npm run song-card -- --help
npm run song-card -- plan --song-id dear-papa-song-dear-papa --project data/music-video-projects/dear-papa-song-dear-papa-video-project.json --graph artifacts/echo-director-v2/album/dear-papa-song-dear-papa/native-show-graph.json --master /path/to/master.mp4 --poster /path/to/poster.jpg
```

Every CLI mutation requires both `--apply` and a token matching `HAPA_SONG_CARD_MINT_TOKEN` or `HAPA_AVATAR_ADMIN_TOKEN`.

## Custody and recovery

- Edition bundles are staged on the same volume, verified, atomically renamed, and only then committed to the head ledger.
- The rendered MP4 and verified poster are copied into every edition. The bundle also freezes the show graph, semantic snapshot, context, timestamp index, captions, renderer truth, receipts, complete lineage, and bounded telemetry.
- Mint retries with identical content return the existing edition. Concurrent requests allocate exactly one edition. Failed preflight consumes no edition.
- On startup, the Builder reconciles staged or renamed transactions through the append-only mint WAL.
- Cleanup may remove abandoned staging only. It never deletes edition bundles. Archive and revoke are governance states, not deletion.
- Use CLI `backup`, `restore`, `export`, `import`, and `recover` for custody operations. Restore requires an empty target ledger; use import for merges.
- The UI's managed export endpoint is `POST /api/song-cards/:songId/editions/:edition/export` with `{ "format": "video" }` or `{ "format": "bundle" }`. It never accepts a destination path from the browser.

Private edition media is never exposed as an unauthenticated file route. An authenticated operator requests a short-lived, edition/role-bound artifact ticket at `POST /api/song-cards/:songId/editions/:edition/artifact-ticket`; the `<video>` element uses that ticket for immutable HTTP range playback. The server hashes each immutable artifact once per process/stat identity and reuses the verified digest for subsequent range requests, while the explicit verify endpoint rechecks the complete bundle.

## Album remint queue

`src/domain/song-card-remint-queue.js` is the pure planning bridge between Song Card change detection and the existing album batch orchestrator. `server/song-card-remint-store.mjs` persists that queue atomically as `remint-queue.json`, resumes it before the API starts listening, and exposes the same state in the editor. Source, capability, renderer, editor, or semantic snapshot changes create a reasoned **Next Mint candidate** containing the expected current edition, predicted next edition, exact dirty ranges, reusable work, and revision evidence.

The queue has two separate authorization boundaries:

1. An operator must explicitly approve a candidate before any render work enters the album orchestrator. Identical candidates deduplicate by fingerprint; a newer unrendered candidate supersedes older pending work for the same Song Card.
2. Completing the album render pipeline stops at `render-ready`. The worker must report a hashed `master`; it may also report a hashed poster. Its release receipt must identify the executor, candidate, source plan and editor revision, match the master hash, carry executed cue-level renderer truth with no unresolved shader states, and include passing executed QA. The Builder verifies and copies the artifacts into its managed workspace, generates a decoded poster when one was not supplied, and automatically binds a fresh exact plan against the still-current editor and head. Browser declarations cannot substitute for worker execution evidence, and hash/path/head/source mismatches fail closed. Binding never calls the mint ledger or increments an edition; minting still requires explicit UI confirmation or the authenticated API/CLI expected-head contract.

Restart recovery delegates to the album orchestrator's content-addressed artifact index: valid work becomes cached, interrupted running work returns to queued, and enqueue remains idempotent. During active Song Card, Echo, Tarot, or kiosk playback, claims use the queue's scaled `activeSessionScale` resource budget; idle production may use the full configured budget. Renderer/capability-only work and saved editor changes reuse the existing director decision envelope rather than rerunning the intensive creative pass.

Queue responses and mint-plan responses include `renderExecutor`. The UI enables **Render next edition** only while `renderExecutor.available` is true. Availability requires a recent authenticated worker heartbeat at `POST /api/song-card-remints/executor-heartbeat` that advertises the `release-export` capability; a preview-only worker reports `incompatible`, configuration alone reports `offline`, and a Builder with no executor reports `not-installed` plus `executionModel: planner-only`. This prevents a planned queue from pretending that an actual renderer is running.

Queue operations are local-admin only: `GET /api/song-card-remints`, `POST /api/song-card-remints/:candidateId/approve`, `POST /api/song-card-remints/:candidateId/cancel`, `POST /api/song-card-remints/enqueue`, `POST /api/song-card-remints/claim`, `POST /api/song-card-remints/:candidateId/jobs/:jobId/result`, and `POST /api/song-card-remints/:candidateId/bind-render-plan`. Planning a Song Card upserts one deduplicated candidate; an explicit successful mint reconciles only its exact bound plan and marks that candidate `minted`. Neither approval, enqueue, claim, restart, job completion, nor plan binding has mint authority.

The API serializes an explicit mint through a durable queue reservation immediately before the ledger call. A canceled, rejected, or superseded bound plan fails with a conflict and cannot create an edition. If the process stops after reservation, startup releases the reservation to its prior review state; the ledger's idempotency/CAS contract makes retry safe.

The Song Card `<video>` sends a short-lived authenticated playback heartbeat. Queue claims derive protected mode from live Song Card and Tarot sessions and default to the scaled playback budget unless an idle operator explicitly requests full capacity; a caller cannot override a server-observed active session.

## Timestamp printing

Each appearance uses `[startMs,endMs)`, stable layer ordering, a frozen source-card digest, and an embedded historical snapshot. Song Card and Tarot viewers query the chosen edition, not the mutable current Card. Pure-IVF intervals resolve to their portable Visualizer Card; explicit gaps return truthful no-card status.

## Migration

`hapa.song-card.v1` and Native Show Card v1/v2 are compatibility inputs. Empty-video Native cards never become minted editions. Valid legacy material must pass the same physical render, renderer-truth, timestamp, rights, and lineage preflight and receives an immutable migration receipt.

## Dear Papa acceptance

The bounded production harness is:

```bash
node scripts/build-dear-papa-song-card-mint-demo.mjs
node scripts/build-dear-papa-song-card-mint-demo.mjs --apply
```

Dry-run is the default. Apply mints Edition 1, proves an unchanged retry, makes one deterministic 6.0–11.85 second editor/render change without another creative decision run, then mints Edition 2 and verifies both historical print paths.

The production acceptance path also repairs only objectively detected undeclared black stretches with the neighboring non-black Hapa frame while preserving audio packets, then performs two real-time E1→E2 cycles:

```bash
node scripts/repair-dear-papa-black-intervals.mjs
node scripts/build-dear-papa-song-card-mint-demo.mjs --apply \
  --source outputs/dear-papa-production-repair/dear-papa-foundation-no-black.mp4 \
  --output outputs/dear-papa-song-card-mint-demo-production-clean4
node scripts/run-song-card-kiosk-soak.mjs \
  --output outputs/dear-papa-song-card-mint-demo-production-clean4
```

The kiosk receipt fails on any ≥200 ms undeclared black interval, decoded presentation gap, real-time wall stall, reported dropped frame, incomplete pass, or incorrect before/inside/after historical print. Browser evidence lives beside it under `ui-evidence/`.

The release-close kiosk check exercises the actual application surface as a separate gate. Start the built Builder against the production mint ledger, then launch the visible Electron soak. It selects Dear Papa in **Hapa Songs**, switches E1→E2→E1→E2, and lets the real Song Card `<video>` element reach its natural end four times:

```bash
HAPA_SONG_CARD_MINT_ROOT="$PWD/outputs/dear-papa-song-card-mint-demo-production-clean4/mint-ledger" \
HAPA_AVATAR_ADMIN_TOKEN="<local-token>" \
node server/api.mjs --port 8787 --static dist

HAPA_AVATAR_ADMIN_TOKEN="<local-token>" \
npm run soak:song-card-electron -- \
  --url http://127.0.0.1:8787 \
  --output outputs/dear-papa-song-card-mint-demo-production-clean4
```

`electron-kiosk-soak-receipt.json` is based on a visible Electron `BrowserWindow`. Before each pass, the authenticated immutable artifact must be fetched completely, byte-count checked, and bound to the real Song Card `<video>` element as an in-memory Blob. It then receives a muted ten-second decoder/UI preroll before the measured full pass; compositor capture also occurs before instrumentation so the evidence operation cannot block the renderer being measured. Playback evidence comes from `HTMLVideoElement.requestVideoFrameCallback`, Chromium playback-quality counters, 100 ms playback-progress sampling, same-origin pixel sampling, and compositor screenshots. The soak fails on an incomplete prebuffer, hidden/non-application surface, incomplete real-time duration, media errors, ≥750 ms progress or callback stalls, presented-time gaps, any reported dropped/corrupted frame, unavailable black-frame sampling, or any undeclared ≥200 ms black interval.
