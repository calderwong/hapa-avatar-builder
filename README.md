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

## Install and run

### Requirements

- Node.js 22 or newer
- npm
- macOS on Apple Silicon is the tested desktop path
- No cloud account, API key, certificate, or local model is required for the public demo

### Public branch

```bash
git clone --branch codex/build-week-submission --single-branch https://github.com/calderwong/hapa-avatar-builder.git
cd hapa-avatar-builder
npm ci
npm run build
npm start
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787).

### Development mode

```bash
npm run dev
```

The API runs on `127.0.0.1:8787` and the Vite UI runs on [http://127.0.0.1:5178](http://127.0.0.1:5178).

### Desktop shell

Build once, then open the Electron app:

```bash
npm run build
npm run desktop
```

Generated media is runtime data. It is stored outside the source-controlled public assets and is not bundled into the public demo.

## Core workflows

### Build an Avatar Card

1. Select an existing Avatar or create a new Avatar identity.
2. Use **Builder** to preview local media and attach approved assets.
3. Open **Mind** and **Items** to inspect or equip supporting Cards.
4. Use **Scenes**, **Look Book**, **Lore Reader**, and **Hapa Songs** to connect the Avatar to its surrounding context.
5. Open **Avatar Card** to review the combined profile and its provenance.

The Builder records source metadata and attachment state with each asset. Media may be previewed before it is attached, and attaching a reference never claims ownership of its source.

### Work with Tarot Cards

Use **Tarot Library** for collection management and **Tarot Draw** for spatial interaction:

- Filter the live Card browser by Card family.
- Add Cards to the table and flip or focus them.
- Drag Cards into table placements or ordered Stargate slots.
- Save a scene as a restorable Card.
- Reopen an Avatar profile directly from an Avatar Card on the table.
- Use cinematic and media controls when the selected Cards provide compatible assets.

### Create a Stargate context

Stargate treats the ordered Formation as meaningful input:

1. Place two to eight Cards into numbered slots.
2. Ensure each participating Card has its own persisted Card Core.
3. Dial the Formation to derive its deterministic collaboration namespace.
4. Save the safe Formation and commitment as a portable Return Card.
5. Use an explicit human review before any later mint or Catalog action.

Return Cards do not carry private keys, raw Gate Passes, cohort secrets, credentials, local paths, or live joining authority. Restoring one reconstructs the scene in a disconnected state until a fresh transient Pass is supplied.

### Direct and preserve song/video work

**Hapa Songs** connects songs to Avatars and source material. **Echos Album** provides playback, saved direction variants, landscape or vertical output profiles, and lineage-bound cuts. A saved cut remains editable; a Song Card edition is a separate immutable release decision with its own review and history.

See [SONG_CARD_MINTING.md](docs/SONG_CARD_MINTING.md) for the complete minting and recovery boundary.

## API and CLI

Start the local API with:

```bash
npm run api
```

Useful read endpoints include:

```bash
curl http://127.0.0.1:8787/api/health
curl "http://127.0.0.1:8787/api/avatars?mode=index"
curl http://127.0.0.1:8787/api/items
curl http://127.0.0.1:8787/api/tarot
curl http://127.0.0.1:8787/api/overcard/capabilities
```

Discover the scriptable interface with:

```bash
npm run cli -- --help
npm run cli -- capabilities --json
npm run song-card -- --help
```

Commands that read or modify the full Avatar library require an operator-owned local data store. The public demo uses tracked fixtures for the UI/API bootstrap and does not publish the private store.

## Build Week and Codex

Hapa Avatar Builder, the Hapa Card model, and the 3D Tarot Draw existed before OpenAI Codex Build Week. The Build Week extension is the Stargate path: per-Card Hypercore custody, ordered deterministic Formations, portable safe Context Cards, human-gated Catalog round trips, transient Gate Passes, a signed two-profile local proof, consented Comment Cards, Context Forge, Truth Constellation, and peer-blind Wisdom Council.

Codex Desktop with GPT-5.6 was used as the build-time reasoning and implementation partner to inspect the pre-existing application, trace shared contracts, implement the Stargate path, add regression and proof tests, prepare public-safe fixtures, and produce the reproducible judge package. Human decisions retained authority over product direction, privacy boundaries, custody, minting, publication, and final submission claims. GPT-5.6 is not required at runtime for the public demo.

The conservative prior-work/new-work evidence is recorded in [CODEX_BUILD_WEEK_CUTOFF_AND_CHANGE_AUDIT.md](docs/submission/CODEX_BUILD_WEEK_CUTOFF_AND_CHANGE_AUDIT.md).

## Verification

```bash
npm run build
npm run build:check
npm run test:judge
```

The broader repository suite is available with `npm test`. The judge route focuses on custody, deterministic Formation, portable Context Cards, Gate Passes, and the encrypted two-profile local proof.

## Project boundaries

- This is a **First Pass / Prototype Stage** workbench. Interfaces and workflows may change.
- Avatar Builder owns the authoring state created here. It consumes [`@hapa/overcard`](https://github.com/calderwong/hapa-overcard) for shared Hand, Deck, Placement, Formation, attachment, and responsibility behavior.
- Card custody is distinct from minting, publication, subscriber acknowledgement, ownership, commerce eligibility, and canon.
- Third-party frameworks, names, images, logos, songs, and linked media remain the property of their respective owners. A reference in the app is not a claim of Hapa authorship, sponsorship, endorsement, or reuse rights.
- Hapa-authored software in this repository is available under the [MIT License](LICENSE). Third-party frameworks, names, images, logos, songs, and linked media remain subject to their own rights and licenses.

## Key documentation

- [Judge quickstart](docs/submission/JUDGE_QUICKSTART.md)
- [Public fixture boundary](docs/submission/PUBLIC_SAFE_FIXTURE_BOUNDARY.md)
- [Build Week cutoff and change audit](docs/submission/CODEX_BUILD_WEEK_CUTOFF_AND_CHANGE_AUDIT.md)
- [Card Hypercore custody](docs/CARD_HYPERCORE_CUSTODY.md)
- [Stargate integration](docs/BUILD_WEEK_STARGATE_INTEGRATION_PLAN.md)
- [Overcard integration](docs/OVERCARD.md)
- [UI/API/CLI parity](docs/API_CLI_UI_PARITY.md)
- [Song Card minting](docs/SONG_CARD_MINTING.md)

## Code map

- `src/App.jsx` — application shell and Avatar Builder workspaces
- `src/components/TarotLibraryView.jsx` — Tarot deck, Set, Card, back, loop, and Avatar-link management
- `src/components/TarotDraw3DView.jsx` — 3D Tarot table and Stargate interaction
- `src/domain/` — shared Avatar, Card, Formation, media, song, and context contracts
- `server/api.mjs` — local API and public fixture bootstrap
- `cli/avatar-builder.mjs` — scriptable Avatar/Card operations
- `electron/main.cjs` — desktop shell
