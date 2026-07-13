# Hapa Avatar Builder

Universal Hapa Card Plane v1 is released. Avatar Builder retains authoring custody of its Avatar and Item stores, publishes immutable events through its durable Overwind outbox, and consumes Overwind Postgres as acknowledged Card subscriber truth; Redis/Postgres serves hot hydration and Elasticsearch serves search/sort/facets. See `docs/OVERWIND_CARD_ORIGIN.md` and `docs/OVERWIND_CARD_SUBSCRIBER.md`.

Hapa Avatar Builder is a neonblade+ operator app for assembling avatar media into a reusable Avatar Card. It standardizes the Red/Reaper scaffold into required media slots, tracks completeness as XP/level progress, exposes a local API and CLI for agents, and includes a kanban board for build and healing work.

## Source Of Truth

Use this checkout as the source of truth:

```text
/Users/calderwong/Desktop/hapa-avatar-builder
```

That desktop path resolves to:

```text
/Users/calderwong/Documents/Codex/2026-06-10/files-mentioned-by-the-user-screenshot/outputs/hapa-avatar-builder
```

As of 2026-06-29, this merged checkout has 74 unique Avatar Builder cards in `data/avatar-store.json`. Agents should verify 70+ cards before treating any Avatar Builder folder as current.

Do not use this older non-Pinokio desktop export as source of truth:

```text
/Users/calderwong/Documents/Codex/2026-06-12/can-you-create-a-desktop-version/outputs/hapa-avatar-builder-desktop
```

That export has only 32 cards and predates the merged Avatar Builder library.

The duplicate Pinokio copy at `/Users/calderwong/pinokio/api/hapa-avatar-builder-desktop/app` is deprecated and should only be used as historical provenance or backup data. That branch had the Tarot Library management surface but lacked the Three.js `Tarot Draw` table.

The canonical app now contains both Tarot surfaces:

- `Tarot Library` manages decks, sets, cards, backs, loop videos, and avatar links.
- `Tarot Draw` is the 3D Three.js reading table.

See `docs/CANONICAL_SOURCE_OF_TRUTH.md` and `data/merge-reports/2026-06-23-pinokio-canonical-audit.md` for the merge history and data audit.

Universal Hand, menu attachment, responsibility, cross-app sync, and Tarot Formation behavior is documented in `docs/OVERCARD.md`. This app consumes `/Users/calderwong/Desktop/hapa-overcard`; it does not own or copy the shared feature.

## What It Builds

An avatar is complete only when it satisfies the shared media contract:

- 1 Character Dossier per avatar name
- 1 Kit Sheet per avatar name
- 4 Kit Poses
- 9 Kit Items
- 6 Close-up Emotion Shots
- 4 Close-ups with Backgrounds
- 9 Backgroundless Full Body Shots
- 3 Backgroundless 2/3rds Shots
- 4 Full Body Concept Art Shots

The sample Red/Reaper card has two names, so the total contract is 43 required slots.

## Run

```bash
cd /Users/calderwong/Desktop/hapa-avatar-builder
npm install
npm run dev
```

Open the UI at:

```text
http://127.0.0.1:5178
```

Run the production web build and local API:

```bash
npm run build
npm start
```

Open the desktop shell:

```bash
npm run desktop
```

Desktop launch note: `8787` may already be occupied by an API-only helper process. The Electron shell now checks for a Hapa Avatar Builder HTML UI before loading a port, reuses an existing UI server such as `8789` when present, or starts its own static API server on a free fallback port. If the desktop app opens blank or shows API JSON, check `logs/desktop-launcher.log` and verify `/` returns the Hapa Avatar Builder HTML, not only `/api/health`.

Dedicated desktop launchers:

```text
/Users/calderwong/Desktop/Launch Hapa Avatar Builder.app
/Users/calderwong/Desktop/Launch Hapa Avatar Builder.command
```

These launchers call `scripts/launch-desktop-dedicated.zsh`, build the production UI, start or reuse a dedicated static UI/API port beginning at `8797`, then launch Electron with `HAPA_AVATAR_DESKTOP_URL` pinned to that endpoint. Port `8794` is reserved exclusively for the canonical Overcard host. Use the dedicated launchers when the normal `8787` environment is confusing or stale.

## Local Media Preview, Sorting, And Video Branches

In the Builder view, use **Preview Local Media** or drop image/video files onto **Drop media to preview**. Media appears in the Media Intake tray with real previews. Drag image previews onto the exact required slot they belong in.

When a preview is dropped onto a slot, the app processes it into the selected Avatar Card:

- stores the preview media URI
- records source metadata such as file name, MIME type, size, width, and height
- marks the asset as `attached`
- marks `attachedToCard: true`
- persists the updated card through the local API when the API is running

Videos are represented as branches from an image state/start frame. Select an attached image, then use **Add Video Branch** or drop staged/local videos onto **Drop videos onto this state**. One image can own many video branches. Video branches are taggable assets, appear in the card manifest, and are exported in attach packs under `videoBranches` and `stateGraph`.

When the API is running, newly uploaded media files are stored under `data/media` and referenced as `/media/...` URIs so large videos do not bloat the Avatar Card JSON.

If a bucket is already filled, dropping onto the bucket creates an `overfill` slot. The standard target stays fixed, so a section can show `3/3 +1 overfill` without changing what “complete” means.

Image previews preserve their original aspect ratio. Use the expand control on a tile/slot, double-click an asset, or use the selected asset inspector to open the full detail viewer.

Double-click launcher:

```text
launch-avatar-builder.command
```

## Canonical Hapa Node

This checkout is registered as `hapa-avatar-builder`, the canonical local Avatar Builder app node. The Desktop route is:

```text
/Users/calderwong/Desktop/hapa-avatar-builder
```

The app was recovered as the canonical source after a duplicate Pinokio build diverged from the Three.js Tarot Draw build. The merge preserved the 3D Tarot Draw UI and imported the Pinokio runtime data without overwriting conflicting Avatar IDs. Runtime stores and media remain local-first data under `data/` and are ignored by Git by protocol.

On 2026-06-23, the Desktop Finder wrapper `/Users/calderwong/Desktop/Hapa Avatar Builder.app` was repointed from the deprecated Pinokio wrapper to this canonical checkout.
On 2026-06-23, the wrapper was also made self-contained so it builds this checkout and runs `npm run desktop` directly instead of trying to trampoline through `launch-avatar-builder.command`.
On 2026-06-24, `/Users/calderwong/Desktop/Launch Hapa Avatar Builder.app` and `/Users/calderwong/Desktop/Launch Hapa Avatar Builder.command` were added as dedicated launcher entry points that pin Electron to a UI-serving static API port.

Primary protocol files:

- `AGENTS.md`
- `hapa-node.json`
- `data/README.md`
- `docs/CANONICAL_SOURCE_OF_TRUTH.md`
- `scripts/merge-pinokio-avatar-builder-data.mjs`

Merge reports are written under `data/merge-reports/`; pre-merge store backups are written under `data/backups/`.

## CLI

```bash
npm run cli -- list
npm run cli -- audit red-reaper
npm run cli -- audit red-reaper --json
npm run cli -- attach red-reaper --target comic --json
npm run cli -- heal-plan red-reaper --json
npm run cli -- export-card red-reaper --out ./Red.avatar-card.json
npm run cli -- scaffold Red Reaper --id red-reaper-v2 --primary Red
npm run cli -- capabilities --json
```

## API

Start the API:

```bash
npm run api
```

Endpoints:

```bash
curl http://127.0.0.1:8787/api/health
curl http://127.0.0.1:8787/api/avatars
curl http://127.0.0.1:8787/api/avatars/red-reaper/audit
curl "http://127.0.0.1:8787/api/avatars/red-reaper/attach?target=comic"
curl http://127.0.0.1:8787/api/avatars/red-reaper/heal-plan
curl http://127.0.0.1:8787/api/avatars/red-reaper/kanban
curl http://127.0.0.1:8787/api/overwind/card-origin/status
curl -X POST http://127.0.0.1:8787/api/overwind/card-origin/sync
```

Avatar and item-store writes now stage canonical create, revise, and tombstone events in a SQLite/WAL origin outbox before the source file is replaced. Comments and relationships append through `/api/overwind/card-origin/operation`. Queued events are not called replicated until Overwind returns a durable acknowledgement. See `docs/OVERWIND_CARD_ORIGIN.md`.

JavaScript:

```js
const pack = await fetch("http://127.0.0.1:8787/api/avatars/red-reaper/attach?target=video").then((res) => res.json());
console.log(pack.baseReferences);
```

Python:

```python
import requests
pack = requests.get("http://127.0.0.1:8787/api/avatars/red-reaper/attach", params={"target": "comic"}).json()
print(pack["baseReferences"])
```

## Test

```bash
npm test
npm run build
```

## Shared Hand

The Shared Hand is docked inside the persistent Header. Use **Manage** for Hand/Deck/Set and Library management, **Detach** for the cross-view floating widget, and **Dock** to return it. Connection state is intentionally compact; open the adjacent status control for reconnect and pending/conflict recovery. Shared mutations are disabled while offline and are never presented as committed. See `docs/OVERCARD.md` and `docs/API_CLI_UI_PARITY.md`.

## Echo Album timing and smooth preview

The Echo workbench keeps lyric-source truth separate from derived director timing. Restore playlist-aligned timings in place without rebuilding media direction:

```bash
node scripts/sync-dear-papa-lyric-timings.mjs --apply
```

Prepare cut-friendly, duration-safe H.264 proxies for one selected song without rerunning editorial decisions:

```bash
node scripts/build-echo-playback-media-v2.mjs --apply --song=<song-id>
```

The Preview tab exposes the same operation as **Compile Smooth Preview**. Playback uses three persistent decoder slots, preloads the next two video shots, waits for a decoded first frame before handoff, loops short sources before their undecodable end boundary, and keeps poster/IVF fallback visible beneath every video. Run the production acceptance smoke against isolated API/UI ports with:

```bash
electron scripts/echos-album-playback-acceptance-smoke.cjs
```

The album also carries three append-only **Wide Coverage Director Passes** for every song: Airy (about 45% video time), Rhythmic (about 70%), and Dense (about 92%). They reuse the inherited music decisions and nested shot windows, then refill video from an album-wide least-used queue across Scroll/FAL, Builder Scene, and Builder Avatar Cards. Preview them from the **Direction script version** selector. **Continue from this cut** opens an editable working copy; **Save as new cut** creates a lineage-bound child without changing Legacy or the source cut.

Dry-run or append the repeatable album pass with:

```bash
npm run echo:variants:wide-cuts
npm run echo:variants:wide-cuts:apply
```

Do not use `scripts/sync-healed-compositions-to-songbook.mjs` to promote director-projected timings unless `--promote-project-timings` is explicitly intended; the default preserves the upstream timing source.

## Song Card Minting

The Echo Tracks workbench can freeze a rendered music video as an immutable numbered Song Card edition while keeping the director project editable. It shows Current Mint versus Next Mint, exact dirty families/ranges, public blockers, and edition history; minted playback can print the edition-pinned Card visible at an exact timestamp in both the Song Card viewer and Tarot Draw.

The trusted local Builder UI establishes its own process-scoped session, so minting and managed exports never ask the operator for a bearer token or destination path. Direct API and CLI mutations remain bearer-token protected. The separate CLI is:

```bash
npm run song-card -- --help
```

See `docs/SONG_CARD_MINTING.md` for custody, recovery, migration, timestamp printing, and the Dear Papa Edition 1 → Edition 2 acceptance flow.

## Files

- `src/domain/avatar.js` is the shared contract and completeness engine.
- `src/App.jsx` is the neonblade+ builder UI.
- `server/api.mjs` exposes the local process API.
- `cli/avatar-builder.mjs` exposes the agent/process CLI.
- `electron/main.cjs` runs the desktop shell.
- `data/avatar-store.json` contains the Red/Reaper scaffold.
- `data/kanban.json` contains the filled delivery board.
