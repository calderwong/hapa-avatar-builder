# Hapa Avatar Builder

Hapa Avatar Builder is a local-first visual workbench for creating Avatar Cards and connecting them to media, skills, protocols, items, scenes, lore, songs, and other Cards. It also includes a 3D Tarot Draw where those Cards can be arranged, explored, saved as scenes, and used to form collaboration contexts.

[Open the live Red, Blue, and Green demo](https://calderwong.github.io/hapa-avatar-builder/?view=builder&stargateDemo=1) · [Watch the Codex Build Week demo](https://youtu.be/Y-RR2AwnH5A) · [Open the judge quickstart](docs/submission/JUDGE_QUICKSTART.md) · [Read the Build Week scope](docs/submission/CODEX_BUILD_WEEK_CUTOFF_AND_CHANGE_AUDIT.md)

## What you can do

| Area | What it does | How to use it |
| --- | --- | --- |
| **Avatar Card** | Presents an Avatar's identity, profile, relationships, scenes, media, and attached Card loadout. | Choose an Avatar from the profile rail, then open **Avatar Card** to inspect the complete profile. |
| **Builder** | Collects source images and videos and attaches them to an Avatar as attributable media. | Use **Preview Local Media** or drop files into Media Intake, inspect a preview, and drag it onto the appropriate Avatar section. Select an image and use **Add Video Branch** to connect alternate motion states. |
| **Mind** | Shows the selected Avatar's working knowledge and equipped Skills, Protocols, and related Cards. | Open **Mind** after selecting an Avatar. Use the Shared Hand to bring another Card or Deck into the view as context. |
| **Items** | Browses reusable Item, Skill, Protocol, Node, and other foundation Cards and connects them to Avatars or workflows. | Filter the Item library, open a Card for details, then use its available attach or equip action. |
| **Scenes, Loops, Look Book, and Lore Reader** | Organize where an Avatar appears, how media loops relate, how the Avatar is presented, and which lore sources belong to it. | Select an Avatar first, then open the relevant workspace. The active Avatar and attached Cards shape what the workspace displays. |
| **Hapa Songs** | Connects Song Cards to Avatars, scenes, direction, and source media. | Open **Hapa Songs**, choose a song, inspect its linked Avatars and media, and open its available direction or playback tools. |
| **Echos Album** | Previews and directs music-video cuts using the song's saved timing, media, visualizer, and output profile. | Choose a song or cut, preview it, adjust its direction, and save a new lineage-bound cut rather than overwriting the source. |
| **Tarot Library** | Manages Tarot decks, sets, Cards, backs, loop videos, and Avatar links. | Select a Deck or Set, inspect its Cards, and edit the collection metadata or linked Avatars. |
| **Tarot Draw** | Places live Cards on a Three.js table for drawing, flipping, focusing, arranging, and saving scenes. | Browse Cards by type, add them to the table, then click or drag them into placements. Drag empty space to orbit, use the wheel to zoom, and right-drag to pan. |
| **Kanban** | Shows build work and Avatar-specific healing work without hiding the underlying Card context. | Open **Kanban** to review the shared board and the selected Avatar's queue. |
| **Shared Hand** | Carries Cards, Decks, and Sets between compatible workspaces without transferring ownership or authority. | Use **Manage** to edit the Hand, **Detach** to float it across views, and **Dock** to return it to the header. |

## Public Build Week demo

The [hosted GitHub Pages demo](https://calderwong.github.io/hapa-avatar-builder/?view=builder&stargateDemo=1) starts in its bounded static public fixture mode. It does not connect to the private local operator stores or services, and changes made in the hosted UI are not durable.

The public branch contains a deliberately bounded demo rather than the private operator libraries. It includes:

- Red, Blue, and Green Avatar profiles with their public Card loadouts.
- Three Echo State Song Cards.
- A representative foundation-card library.
- The complete 16-card Codex Build Week Wisdom Set.
- Deterministic demo Cards for the Stargate route.

The remaining Avatar, Song, Tarot, Item, lore, and generated-media libraries stay in ignored local runtime stores. The exact boundary is documented in [PUBLIC_SAFE_FIXTURE_BOUNDARY.md](docs/submission/PUBLIC_SAFE_FIXTURE_BOUNDARY.md).

### Five-minute demo route

After starting the app, open:

```text
http://127.0.0.1:8787/?view=tarot&stargateDemo=1
```

Then:

1. Use the Avatar rail to open Red, Blue, and Green and inspect their attached loadout Cards.
2. Open **Tarot Library** and select the **Codex Build Week Wisdom Set**.
3. Return to **Tarot Draw** and use the Card browser filters to inspect Avatars, Items, Skills, Protocols, Nodes, Songs, and Wisdom Cards.
4. In the Stargate panel, use **Demo Cards** if the table needs the deterministic public fixture, or **Auto Arrange** to place identity-ready Cards into numbered slots.
5. Follow the visible sequence: **Place Cards** → **Create Cores & Lock Coordinates** when required → **Dial This Formation** → **Save This Gate**.

Creating a Card Core establishes append-only local custody. It does not mint, publish, canonize, transfer ownership, or enable commerce.


<!-- HAPA_ECOSYSTEM_CONTEXT_START -->
## Hapa ecosystem context

Unless this repository explicitly declares a narrower, evidence-backed maturity for a particular capability, treat its Hapa-facing work as **First Pass / Prototype Stage**. Interfaces and workflows may change. There is no general promise of stability, compatibility, uptime, production support, or fitness for a particular use. A label such as **Core** describes current ecosystem importance, not production readiness; a declared release, verified state, MVP, scaffold, or archive status applies only to the named surface and supporting evidence.

Use Hapa as an artist kit. Apps and nodes are work surfaces or specialized paints; Cards and Decks are reusable swatches, recipes, constraints, and remembered techniques; agents are paintbrushes that apply and combine them; Hapa protocols keep the canvas attributable, bounded, and reversible. Start from the closest existing app, Card, agent pattern, or protocol as a **jump-off point**, adapt that pre-existing wisdom to the new problem, verify the result, and preserve source ownership, custody, licenses, attribution, and lineage.

Calder welcomes **for-profit and nonprofit teams and organizations** to suggest a clearly attributed ecosystem presence, service integration, public-interest pilot, connector, Card/Deck, agent route, or future decentralized-commerce experiment. This is an open invitation to explore, not a promise of partnership, acceptance, compatibility, decentralization, funding, commerce capability, or commercial outcome. Canonical guidance: `$HAPA_FRONT_DOOR_ROOT/docs/ECOSYSTEM_STAGE_AND_PARTICIPATION.md` ([public copy](https://github.com/calderwong/hapa/blob/main/docs/ECOSYSTEM_STAGE_AND_PARTICIPATION.md)).
<!-- HAPA_ECOSYSTEM_CONTEXT_END -->

## Place in the Hapa artist kit

Avatar Builder is Hapa's embodiment and media-assembly workbench: the place to
turn source media, identity notes, scene links, Tarot Cards, and song/video
direction into reusable Avatar- and media-shaped jump-off points.

| Question | Truthful answer |
| --- | --- |
| Best jump-off point for | Building and healing Avatar Cards, organizing Tarot media, operating the 3D Tarot Draw, attaching scene/world context, and preparing attributable media or Song Card records. |
| Shared paint it consumes | [`@hapa/overcard`](https://github.com/calderwong/hapa-overcard) supplies Hand, Deck, Placement, Formation, attachment, and bounded-responsibility behavior. Builder is a consumer, not the owner of that shared capability. |
| Records it owns | Avatar, item, scene, Tarot, media, direction, and Song Card authoring state created in this app, including its durable Card-origin outbox. |
| Neighboring Hapa capabilities | [Overwind](https://github.com/calderwong/hapa-overwind-node) acknowledges published Card events; Roomlet joins exported Tarot rooms; Song Registry and Music Viz consume bounded outputs. |
| What it does not own | Overcard's shared package, Overwind subscriber history, third-party frameworks or media, or authority merely because a Card is visible or placed. |

**Current state:** `local-first-canonical` identifies this checkout as Calder's
authoritative Avatar Builder source; it is not a production-readiness or API
stability guarantee. The declared UI/API/CLI/desktop/package parity is bounded
to `docs/API_CLI_UI_PARITY.md` and its checks.

Universal Hapa Card Plane v1 is released. Avatar Builder retains authoring custody of its Avatar and Item stores, publishes immutable events through its durable Overwind outbox, and consumes Overwind Postgres as acknowledged Card subscriber truth; Redis/Postgres serves hot hydration and Elasticsearch serves search/sort/facets. See `docs/OVERWIND_CARD_ORIGIN.md` and `docs/OVERWIND_CARD_SUBSCRIBER.md`.

Hapa Avatar Builder is a neonblade+ operator app for assembling avatar media into a reusable Avatar Card. It standardizes the Red/Reaper scaffold into required media slots, tracks completeness as XP/level progress, exposes a local API and CLI for agents, and includes a kanban board for build and healing work.

## Source Of Truth

Use the repository root of the current checkout as the source of truth. On
Calder's workstation, the stable operator-facing alias is:

```text
/Users/calderwong/Desktop/hapa-avatar-builder
```

That alias currently resolves to the historical Codex working checkout:

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

Tarot Draw also has a credential-safe **Krea Edit** lane for the local Hapa Krea 2 / Flux Identity Node. Select a Card with a still image, bind it as Image 1, choose one of the node-owned Avatar Builder presets, satisfy the explicit identity-use assertions, and create a draft proposal directly in the 3D field. Two-reference presets expose a second subject slot. The Builder discovers enabled presets from the running node and proxies tasks and artifacts without exposing the node bearer token to the browser. Results remain unminted proposals, do not change the source Card, and are not identity truth. See `docs/KREA2_TAROT_DRAW_INTEGRATION.md`.

The judge-facing **Codex Build Week** Set adds 16 mined Turn, Skill, Capability, and Protocol Cards to both Tarot Library and Tarot Draw. Every Card retains attributed `ai_turn:*` lineage, a real local Hypercore custody origin, and digest-verified artwork generated through the Krea node's `build_week_fast` preset. The images remain unminted human-review proposals. See `docs/CODEX_BUILD_WEEK_TAROT_SET.md` for the inventory, mining boundary, reproduction commands, and demo checks.

Tarot Draw also contains the Build Week Stargate path. Place two to eight Cards in numbered order. If an older Card projection lacks custody, **Create Cores & Lock Coordinates** lazily creates or verifies one real per-Card Hypercore, appends `card.created`, and applies the persisted receipt without bulk-processing the library at launch. Custody creation remains separate from mint, Overwind acknowledgement, `.hapaCatalog` publication, commerce eligibility, and canon. Then use **Dial This Formation** to enter the derived private namespace and **Save This Gate** to deal one proposed portable Context Card. **Review & Mint** remains an explicit later human authority gate. The same physical 3D Return Card visualizes the downstream proof stages. Loading it restores the exact scene and Formation but stays disconnected until a fresh transient Gate Pass is supplied. The durable Card never contains the cohort secret, raw Pass/token, full private topic/address, private key, credential, or local path. See `docs/CARD_HYPERCORE_CUSTODY.md`, `docs/BUILD_WEEK_STARGATE_INTEGRATION_PLAN.md`, and the audits under `docs/audits/`.

### OpenAI Codex Build Week disclosure

Hapa Avatar Builder, its Card model, and the 3D Tarot Draw were a pre-existing foundation. The Build Week submission is the later Stargate reference path: Card-birth Hypercore custody, ordered deterministic namespaces, portable Context Cards, human-gated Catalog round trips, expiring Gate Passes with a signed two-peer local proof, consented Comment Cards, Truth Constellation, Context Forge, and the peer-blind Wisdom Council. The auditable minimum for that focused line is **22 commits, 124 files changed, 19,136 insertions, and 326 deletions** between `0b793a9` and `f10c2f8`. The earlier `cd393e2` commit packaged an already-existing application and is deliberately excluded from the new-work headline. See [`docs/submission/README.md`](docs/submission/README.md) for the cutoff audit, change manifest, demo script, and submission checklist.

See `docs/CANONICAL_SOURCE_OF_TRUTH.md` and `data/merge-reports/2026-06-23-pinokio-canonical-audit.md` for the merge history and data audit.

Universal Hand, menu attachment, responsibility, cross-app sync, and Tarot
Formation behavior is documented in `docs/OVERCARD.md`. This app consumes the
separate `hapa-overcard` repository; it does not own or copy the shared feature.

## Publication, ownership, and licenses

The Hapa application and integration work in this repository is attributed to
Hapa.ai / Calder Wong unless a file or source record says otherwise. React,
Electron, Three.js, Hypercore, and other dependencies remain the work of their
respective projects and retain their own licenses. Creator profile images,
platform marks, sponsor logos, linked songs/videos, and other referenced media
remain the property of their respective creators and rights holders; catalog
presence is a source-labeled research or interoperability reference, not Hapa
authorship, sponsorship, or endorsement.

Hapa-authored software in this repository is available under the [MIT License](LICENSE). Third-party frameworks and referenced media retain their own rights and licenses; the software license does not grant rights to those assets.

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

Production app launches enable the Tarot Draw Phone Card bridge by default: the HTTP app listener accepts LAN connections and a secure companion listener starts on the next port. The desktop UI continues to open on loopback, while its QR uses the current LAN address. Keep the phone and Mac on the same reachable network and trust the generated Hapa local CA certificate on the phone. API-only launches remain loopback-only; see [`docs/PHONE_CARD_BRIDGE.md`](docs/PHONE_CARD_BRIDGE.md) for overrides and the security boundary.

For the optional Tarot Draw Krea lane, start `hapa-krea2-identity-node` on its default loopback port `8774` before opening **Krea Edit**. The Builder reads the node's owner-only token from its normal runtime root. Alternate local deployments can set `HAPA_KREA2_URL`, `HAPA_KREA2_RUNTIME_ROOT`, or `HAPA_KREA2_BEARER_TOKEN_FILE` on the Builder server process; never place the bearer token in browser configuration.

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

These launchers call `scripts/launch-desktop-dedicated.zsh`, reuse a currently healthy canonical UI/API on `8797`, and launch Electron with `HAPA_AVATAR_DESKTOP_URL` pinned to that endpoint. Every health probe recomputes Echo delivery freshness against the service's boot identity. A fresh app launch—after the previous Electron window has exited—restarts the canonical API with the app, and a repeat launch also restarts the API when its current source signature is stale; an already-running healthy Builder is simply focused. Launch preparation is single-flight: repeated clicks wait for the first preparation instead of starting competing builds. Electron's native single-instance behavior remains the fallback that focuses or recreates the one window. A registered canonical service that is listening but temporarily too busy to answer a probe is preserved and opened rather than misclassified and restarted. When the server is absent, the launcher reuses the existing certified application bundle instead of walking the source tree or rebuilding. It builds only when that artifact is missing or an operator explicitly sets `HAPA_AVATAR_FORCE_REBUILD=1`; after intentional UI source edits, run `npm run build` once (or force the next launch) to publish them. The launcher preserves existing Builder windows by default; `HAPA_AVATAR_REPLACE_DESKTOP=1` is the explicit stale-shell recovery path. Port `8794` is reserved exclusively for the canonical Overcard host, and `8799` is reserved for the optional desktop operator console. If the optional console port is occupied, the Builder opens without that diagnostic helper instead of failing.

Launcher preparation and Electron runtime output are kept in separate, threshold-rotated logs. Files larger than 20 MiB are preserved under timestamped names on the next launch, and the known repeated Metal-pipeline error is sampled rather than allowed to flood the runtime log.

Generated media is runtime state, not application source. Echo keyframes now default to `~/Library/Application Support/Hapa Avatar Builder/generated-media/`, are streamed through the local Builder API, and are excluded from both Git and the Vite deployment. `public-static/` contains only the small, curated source-controlled assets that intentionally ship with the application. Run `npm run media:migrate-external` to inspect the legacy migration and add `-- --apply` to perform its non-overwriting directory move.

## Local provider API keys

The canonical Electron app exposes **Provider API keys** from the key icon in the top-right header. OpenAI, FAL.com, and xAI credentials are encrypted with the operating system's credential protection and saved beneath Electron's machine-local application-data directory—not in album data, browser storage, or this repository. The UI can replace or remove a key and display only a one-way fingerprint; it cannot reveal a saved value. Storage fails closed if OS encryption is unavailable. See [`docs/LOCAL_PROVIDER_CREDENTIALS.md`](docs/LOCAL_PROVIDER_CREDENTIALS.md).

## Echo Album song notebook

The Echo Album **References** surface includes a durable per-song notebook for free-text notes, marked research URLs, Hapa Avatar links, image/video creative anchors, anecdotes, lessons, and reasoned Tarot Card pairings. The complete supplied 78-card *Echoes from Other Eras* editorial mapping is available with its pairing arguments and lyric evidence; its proposal status is preserved. Agents can read one song or the complete album projection from `GET /api/echos/song-notebook`. See `docs/ECHO_SONG_NOTEBOOK.md`.

The same surface now includes the local-first **FAL H3 Max Turbo Tarot motion pipeline**. It gates album spend behind a three-card pilot, sends each completed Tarot still as both the first and end image, conforms provider results into exact silent five-second source-anchored loops, resumes from durable request receipts, and exposes still/motion review in the per-song and consolidated 165-card album gallery. The encrypted FAL key and provider media URLs remain outside the renderer, manifests, logs, and Git. See [`docs/ECHO_TAROT_FAL_LOOPS.md`](docs/ECHO_TAROT_FAL_LOOPS.md).

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

## Motion Avatar Sources

Use **Builder → Motion Avatar Sources → Add source images** to attach images intended for conversion into moving 2D Avatars. This optional section is separate from the ordinary reference categories and 3D rigs. After sync completes, an agent can retrieve exact source and Avatar IDs from the attach pack’s `motionAvatarSources` list. See [intake and agent pickup](docs/MOTION_AVATAR_SOURCES.md).

## Avatar Voice Cards and Scripts

Use **Builder → Voice & Scripts → Open voice sampler** to record or upload style samples for the selected Avatar, save Voice Cards, write reusable scripts, and queue local voice-overs. Automatic capture can create two starter scripts. Completed clips export audio plus directions for the Avatar Player. See [capture, engine setup, API/CLI and current verification limits](docs/AVATAR_VOICE_CARDS.md).

## Human Enricher

Open **Human Enricher** from the Builder's top-level work surfaces to review every video registered across the System Media Library, Avatar Cards, Tarot Cards, scenes, and read-only Hell Week projections. The workbench shows each video's known technical metadata, source identity, tags, and relationships alongside four human-authored fields:

- **Quality** — a 1–5 grade from Reject through Hero.
- **@Avatars** — explicit Avatar relationships chosen from the Builder roster.
- **Director Notes** — freeform human direction delivered to matching Echo State timeline shots as `human_enrichment.directorNotes`.
- **References** — links to Echo State songs, other songs, Hapa Cards, URLs, or manual anchors.

Human enrichment is a non-destructive overlay stored in ignored local runtime files at `data/human-video-enrichments.json`, with append-only change receipts in `data/human-video-enrichment-events.ndjson`. Changes autosave after a short pause. When an agent proposal exists, Quality begins at the agent grade so a person only needs to move it when they disagree; merely viewing a proposal does not create a human revision. It does not rewrite source media, grant rights, establish canon, approve publication, or authorize a render.

Vision-capable sub-agents can add a separate pending optical proposal after personally inspecting every registered keyframe (minimum First, Mid, and Last). Each inspected frame owns an independent visually estimated 3–8 color palette with uppercase `#RRGGBB` values, labels, prevalence, explanation, and uncertainty; whole-video palette synthesis is forbidden. The optical pass also records literal frame observations, quality, description, categories/tags, Director Notes, uncertainty, and visible signals; it performs no knowledge search and assigns no Hapa Cards. A durable three-worker queue binds opaque leases, frame manifests, claim configuration, normalized-result completion receipts, and immutable job/attempt/frame/lease telemetry under cross-process locks. Agent writes can create only pending/blocked proposals; the human decision path alone can accept, edit-accept, or reject them. The UI renders each palette directly beneath its First/Mid/Last frame, keeps the proposal distinct from human truth, and lets a human use it as an editable draft, append selected suggestions, or reject it. Frame extraction and hashing may be automated; visual judgments and per-frame color selection may not be replaced by heuristics.

A separately configurable reference worker compares those visible signals with one digest-bound, video-specific candidate packet. A deterministic selector outside the model ranks the existing source-backed Reference Atlas projection, caches the resulting selection, and gives the worker 12 Cards by default with a hard 5–20 boundary. The worker never receives or traverses the 258–1,103 Card source profiles or raw Hapa/Echo stores. Every candidate packet records its source Atlas run, source count, query digest, packet digest, evidence mix, review/canon status, rights labels, provenance, and cache key. Workers may rank or reject supplied Cards only. See `docs/HUMAN_ENRICHER_OPTICAL_REVIEW.md`.

An early Terra-medium two-stage pilot found one effective optical lane and three overlapping reference lanes. The later vision-only recheck demonstrated three genuinely overlapping optical workers, empirically rejected a fourth live child in this session, and launched a durable three-worker campaign. Its compact and richer-production timing/token receipts, current 55–70-hour frame-ready forecast, limits, and non-SLA caveats are documented in `docs/HUMAN_ENRICHER_TERRA_MEDIUM_BENCHMARK.md`.

The later cost-focused exact-nine benchmark uses Terra-low, exact-three optical inputs, and separate 12-Card video-specific reference packets. It preserved all production stores and recorded verified elapsed/byte proxies, while leaving provider tokens and credits unavailable instead of estimating them. See `docs/HUMAN_ENRICHER_EXACT_NINE_COST_BENCHMARK.md`.

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
npm run cli -- human-enricher-list --json
npm run cli -- human-enricher-save --file ./human-video-enrichment.json --actor calder --json
npm run cli -- human-enricher-agent-queue --status needs-agent --limit 12 --json
npm run cli -- human-enricher-agent-submit --file ./optical-review.json --agent /root/optical-batch-a --json
npm run cli -- human-enricher-optical-campaign-plan --limit 100 --model gpt-5.6-terra --effort medium --max-workers 3 --json
npm run cli -- human-enricher-optical-campaign-status --json
npm run cli -- human-enricher-optical-campaign-claim --worker /root/terra-vision-01 --lease-seconds 900 --json
npm run cli -- human-enricher-optical-campaign-progress --job-id '<job-id>' --worker /root/terra-vision-01 --attempt 1 --lease-id '<lease-id-from-claim>' --phase inspecting --current-frame 2 --completed-frames 1 --json
npm run cli -- human-enricher-reference-packet --profile echo-reference-cards --json
npm run cli -- human-enricher-reference-queue --profile echo-reference-wide --status needs-reference --limit 12 --json
npm run cli -- human-enricher-reference-submit --file ./reference-review.json --agent /root/reference-batch-a --json
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
curl http://127.0.0.1:8787/api/tarot/krea2
curl http://127.0.0.1:8787/api/human-enricher/videos
curl -X PUT -H 'content-type: application/json' --data @human-video-enrichment.json http://127.0.0.1:8787/api/human-enricher/records
curl 'http://127.0.0.1:8787/api/human-enricher/agent-reviews?status=needs-agent&limit=12'
curl 'http://127.0.0.1:8787/api/human-enricher/optical-campaign'
curl 'http://127.0.0.1:8787/api/human-enricher/reference-card-packets?profile=echo-reference-wide'
curl 'http://127.0.0.1:8787/api/human-enricher/reference-reviews?status=needs-reference&profile=echo-reference-cards&limit=12'
```

`/api/tarot/krea2` reports truthful node and preset availability. The adjacent protected Builder routes upload source images, submit and poll edit tasks, cancel work, and stream result artifacts. The Builder server is the credential boundary; the browser never receives the Krea node token or direct protected node URLs.

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

## Shared character layers

The Builder and Avatar Mind views include **Open shared layers** for Canon, Memory,
Development, and Lore, using the same Second Brain revision history as the
connected Writer’s Room. See [Shared character layers](docs/WRITER_CHARACTERS.md)
for ownership, scope, API/CLI, conflict handling, and the focused local service.

## Shared Hand

The Shared Hand is docked inside the persistent Header. Use **Manage** for Hand/Deck/Set and Library management, **Detach** for the cross-view floating widget, and **Dock** to return it. Connection state is intentionally compact; open the adjacent status control for reconnect and pending/conflict recovery. Shared mutations are disabled while offline and are never presented as committed. See `docs/OVERCARD.md` and `docs/API_CLI_UI_PARITY.md`.

## Living Light in Echo Album

Open **Echo Album → Living Light** to work with Journey, Tunnel and Location
Cards. The [current integration map](docs/living-light/DISCOVERY.md) connects
painted clips, Director scenes/transitions, spatial album navigation and modular
Card editing to their owners and evidence. Follow the
[task board](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder) and
[portable requirements](docs/living-light/REQUIREMENTS.md) for acceptance.
The integration is a prototype in progress; human creative review remains open.

## Echo Album timing and smooth preview

In the Director, uncheck **Highlight individual words** to show each full lyric
phrase uniformly, without karaoke highlighting or word-by-word animation. Save
as a new cut to keep the setting. See [full-phrase lyrics](docs/PLAIN_PHRASE_LYRICS.md).

### Master Reference File export

The Echo workbench header includes **Export Master Reference**. It downloads one
wiki-ready Markdown snapshot containing every track title and lyric, curated and
Reference Atlas associations, complete song metadata, timed/audio telemetry,
reference-card records, graph edges, observability, source receipts, and stable
cross-links.

Use **Lyrics + Main References** for a compact Markdown profile capped at
3,000,000 bytes. It retains every title and available lyric, the curated
song-reference connectors, linked curated reference records, and the curated
reference graph while omitting telemetry, media, local paths, full metadata
dumps, and the large mined candidate graph.

The same read-only process is scriptable:

```bash
npm run echo:master-reference
npm run echo:master-reference -- --out /path/to/echo-album-master-reference.md
npm run echo:master-reference -- --condensed --out /path/to/echo-album-lyrics-and-main-references.md
```

The default command output is
`data/exports/echo-album-master-reference.md`. Source stores are only read; the
export does not publish, mint, approve, or canonize anything. See
`docs/ECHO_MASTER_REFERENCE_EXPORT.md` for the source map, wiki-link contract,
automation options, and publication boundary.

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

### Landscape and Vertical music-video output

Use **Video orientation** in the Echo Director setup to choose the final music-video shape before directing or editing a cut:

- **Landscape** is the backwards-compatible default: 1920×1080, 16:9, 30 fps.
- **Vertical** is the phone format: 1080×1920, 9:16, 30 fps.

The chosen output profile is saved with the project and travels through Director variants, the multitrack editor, HyperFrame compilation, local rendering, release QA, and Song Card mint identity. The Preview frame changes to the real export aspect ratio, including profile-specific title, action, and lyric safe areas. Source-media orientation is independent: wide and tall inputs are cover-cropped into the selected frame without changing the output profile. The same camera-crop corridor drives Preview and final HyperFrames output, so off-center subjects retain the selected framing instead of snapping back to a centered cover crop.

Saving strips preview-only graph and certificate fields from the authoring project, then deterministically recompiles that one song before Song Card planning starts. Render-start certification repeats the single-song compile as a fail-safe. A failed compile leaves the edit intact and blocks rendering with a retry message; it never falls back to a stale Landscape graph. To rebuild one saved project without rewriting album-wide reports:

```bash
node scripts/compile-echo-director-v2-album.mjs --song dear-papa-song-boba-tea-strum
```

New generated-media requests inherit the selected output dimensions. Existing projects with no output profile remain Landscape. To inspect album-wide Vertical plans without changing saved projects, run:

```bash
node scripts/generate-music-video-plans.mjs --orientation=vertical
```

Add `--apply` only when the resulting plans are intentionally ready to replace saved project files; apply mode creates the script's normal project backup first.

With the normal API and Vite development servers running, verify the 390×844 phone editor, selector, 9:16 preview frame, and 360×640 preview canvas with:

```bash
electron scripts/echo-vertical-phone-smoke.cjs
```

The album also carries three append-only **Wide Coverage Director Passes** for every song: Airy (about 45% video time), Rhythmic (about 70%), and Dense (about 92%). They reuse the inherited music decisions and nested shot windows, then refill video from an album-wide least-used queue across Scroll/FAL, Builder Scene, and Builder Avatar Cards. Choose any pass from the **Direction script version** selector to open an editable working copy immediately. The working copy keeps that pass's higher-quality media and portable cards, and it can be switched directly to **Vertical** for a 1080×1920 phone video. **Save as new cut** creates a lineage-bound child without changing Legacy or the selected source cut; the editor keeps the saved high-quality graph pinned while the child's background certification finishes, then reopens that child as the next editable copy.

The planned four-count Codex → GPT Image keyframe pipeline is documented in `docs/ECHO_SCENE_PROMPT_KEYFRAME_PIPELINE.md`. It defines truthfully timed scene prompts, Red/Blue/Green seed-image lineage, prompt/image/video quest states, and a generated-keyframe media eligibility pool. Video generation is explicitly held in the first version.

**Score Dust** (`builtin:score-dust`) is an Echo preview visualizer that directs persistent particle formations from a versioned visual score built on Audio Atlas evidence: repeated sections return to one motif, scheduled beats kick immediately, lifts send shockwaves, and phrases become camera-facing particle words. Compose or validate a score with `node cli/audio-atlas.mjs visual-score RUN [--direction=FILE] [--score=FILE]` or `GET /api/echos/audio-atlas/jobs/RUN/query?op=visual-score`. See `docs/ECHO_SCORE_DUST.md`.

The visualizer picker distinguishes **Final render ready** shaders from catalogued non-final sources and legacy approximations. Non-final rows stay visible with the exact reason they cannot be selected for a finished video. Choosing a final-ready shader attaches its exact, hash-bound portable Visualizer Card to that cue immediately; choosing **None** creates an explicit pass-through cue. The live preview reports readable compile diagnostics, but preview success is not presented as final-render certification.

If an older saved candidate contains a detached shader card, the render gate names the affected shader and time range before encoding starts. Use **Rebuild from saved cut** to create a replacement candidate from the same append-only edit, review it, and then render; the failed attempt remains in history and no edition is consumed. **Retry render** remains the action for transient failures that do not require saved-cut reconstruction.

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
