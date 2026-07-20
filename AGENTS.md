# Hapa Avatar Builder Agent Guide

<!-- HAPA_ECOSYSTEM_AGENT_CONTEXT_START -->
## Ecosystem stage and claim discipline

- Treat this repository's Hapa-facing work as **First Pass / Prototype Stage** unless the owning docs explicitly declare a narrower, evidence-backed maturity for the capability in scope. Never imply a general stability, compatibility, availability, support, or production-readiness guarantee.
- `Core` means important to current ecosystem operation, not production-ready. Preserve explicit local states such as released, verified, MVP, scaffold, deprecated, or archive/reference, and keep each claim bounded to its evidence.
- Use Hapa as an artist kit: apps/nodes are work surfaces or specialized paints, Cards/Decks are reusable swatches and recipes, agents are paintbrushes, and protocols keep the canvas attributable and reversible. Begin from the nearest existing app, Card, agent pattern, or protocol as a jump-off point; inspect it, adapt it, verify it, and write useful evidence back.
- Preserve origin ownership, custody, authority, privacy, licenses, upstream attribution, and lineage. Hapa presence or integration never transfers upstream ownership.
- The open invite to for-profit and nonprofit teams is exploratory. Do not imply partnership, endorsement, acceptance, compatibility, decentralization, funding, nonprofit status, commerce capability, or commercial terms without separate evidence and explicit human approval.
- Canonical guidance: `$HAPA_FRONT_DOOR_ROOT/docs/ECOSYSTEM_STAGE_AND_PARTICIPATION.md` ([public copy](https://github.com/calderwong/hapa/blob/main/docs/ECOSYSTEM_STAGE_AND_PARTICIPATION.md)).
<!-- HAPA_ECOSYSTEM_AGENT_CONTEXT_END -->

## Capability orientation for agents

- **Paint/work surface:** embodiment, Avatar Card/media assembly, Tarot
  management and Draw, scene/world attachment, and song/video direction.
- **Shared paint:** consume `hapa-overcard` for Hand, Deck, Placement,
  Formation, attachment, and responsibility. Do not fork those contracts here.
- **Jump-off material:** source-labeled Avatar, item, scene, Tarot, media, and
  Song Card records. Adapt them without stripping creator, tool, rights, or
  lineage fields.
- **Current claim:** `local-first-canonical` identifies the owning checkout,
  not a stable release. Parity claims are limited to
  `docs/API_CLI_UI_PARITY.md`.
- **Custody route:** Builder owns origin authoring; its durable outbox stages
  events; only an Overwind Postgres acknowledgement creates subscriber truth.
  Roomlet and media/song apps are bounded consumers, not co-owners.
- **Publication rule:** third-party names, profile images, logos, songs, and
  linked media are references owned by their respective rights holders. Never
  imply Hapa authorship, sponsorship, endorsement, or reuse rights.

Universal Hapa Card Plane v1 is released. Avatar/Item JSON stores remain authoring-owned here; origin events publish through the durable outbox, and acknowledged subscriber reads use Overwind Postgres with Redis/Elasticsearch serving projections.

## Node Role

`hapa-avatar-builder` is the local-first React/Electron Avatar Card workbench. It owns Avatar Builder media cards, 3D Tarot Draw, scene/world attachments, Dear Papa song links, tarot/card attach packs, healing queues, the Hapa Music Video Director Agent (timeline matching/scaffolding plans), and subscriber packets for Hapa Atlas, Second Brain, wiki, song, and visualization nodes.

## Source Of Truth

### Name-resolution and Tarot Draw inheritance gate

- A request that says **“Hapa Avatar Builder,” “Avatar Builder,” “Tarot Draw,” “Tarot Draw UI,” “Tarot Draw 3D,” “Phone Card in Tarot Draw,”** or **“Camera Card in Tarot Draw”** resolves first to this canonical checkout and `src/components/TarotDraw3DView.jsx`.
- `hapa-avatar-node` is a separate avatar/phamiliar generation service. `hapa-dev-proto` contains downstream or historical Tarot integrations. Neither is the owner of the Hapa Avatar Builder 3D Tarot Draw environment.
- Before designing, extracting, or rebuilding a Tarot Draw surface, inspect the running canonical Builder UI and trace the relevant behavior in `TarotDraw3DView.jsx`, `PhoneCardMobileView.jsx`, `server/api.mjs`, and `server/roomletInvite.mjs`. Source search alone is not enough to establish interaction or visual parity.
- The canonical inheritance target is the whole 3D cockpit: room/table composition, HUD and control dock, Card-family rail, camera behavior, draw/flip/drag/place interactions, Card media surfaces, cinematic and visualizer modes, Camera Card, Phone Card, and scene save/invite behavior. A standalone app may curate its data and adapters, but it must not replace that environment with a new interaction design unless Calder explicitly approves the redesign.
- Treat copies and extractions as downstream consumers. Record the exact source commit and preserve Calder Wong / Hapa.ai authorship, upstream attribution, and the distinction between inherited behavior and new implementation.

### Turn-to-Lore reflection gate

- Before starting a meaningful implementation turn, identify the nearest completed Hapa surface that already serves the objective and state what will be reused, adapted, or deliberately left alone.
- Before creating a replacement component or service, record the canonical owner, inspect its running behavior when available, and explain why extraction or extension is insufficient. If that explanation is missing, stop and reuse the existing surface.
- At each meaningful checkpoint or correction, append: the objective, evidence inspected, what worked, what was noise, what was misunderstood, what changed, what remains reusable, and the new guardrail. Preserve mistakes as learning evidence; do not rewrite them into a false clean history.
- Mark reusable outcomes as explicit Skill, Lore, Lesson Card, Decision Card, or Flow-explainer candidates. The raw Codex Turn remains the attributed source and can later be mined by Hapa Turn Miner; the derived artifact must link back to that Turn instead of replacing it.
- A task is not fully handed off when code and tests exist but the reuse decision and learning delta are absent. Keep the reflection concise and operational so future agents can act on it.

- Canonical local checkout: `/Users/calderwong/Desktop/hapa-avatar-builder`.
- Resolved checkout: `/Users/calderwong/Documents/Codex/2026-06-10/files-mentioned-by-the-user-screenshot/outputs/hapa-avatar-builder`.
- Current Avatar Card store: `data/avatar-store.json`, verified on 2026-06-29 with 74 unique Avatar Builder cards.
- Do not use `/Users/calderwong/Documents/Codex/2026-06-12/can-you-create-a-desktop-version/outputs/hapa-avatar-builder-desktop` as source of truth. It is an older non-Pinokio desktop export with only 32 cards.
- `README.md` defines the run commands, CLI/API surface, and current operator workflow.
- `src/App.jsx` owns the operator UI, including the `Tarot Library` and `Tarot Draw` tabs.
- `src/components/TarotLibraryView.jsx` owns deck/set/card/back/loop/avatar-link management.
- `src/components/TarotDraw3DView.jsx` owns the Three.js tarot table.
- `src/domain/` owns normalization and attach-pack contracts for avatars, scenes, items, songs, tarot, media, and teams.
- `server/api.mjs` owns loopback API parity and subscriber event writeback.
- `cli/avatar-builder.mjs` owns scriptable avatar audits, attach packs, healing plans, and exports.
- `data/` stores local runtime state. Large mutable stores and media are intentionally ignored by Git; see `data/README.md`.
- `docs/CANONICAL_SOURCE_OF_TRUTH.md` records the Pinokio duplicate branch, canonical launcher, and historical session anchors.
- `docs/OVERCARD.md` is the agent/operator map for the package-owned Hand, sixteen HostTargets, runtime boundaries, interfaces, and verification. Do not confuse this node with `hapa-avatar-dashboard` or move shared behavior out of `/Users/calderwong/Desktop/hapa-overcard`.

## Safe Edit Boundaries

- Open `/Users/calderwong/Desktop/hapa-avatar-builder` for Hapa Avatar Builder work. Do not extend `/Users/calderwong/pinokio/api/hapa-avatar-builder-desktop/app` unless explicitly doing provenance recovery.
- Desktop launch gotcha: `8787` can be API-only. Electron must load a port that serves Hapa Avatar Builder HTML at `/`; current launcher logic probes and may reuse `8789` or another fallback UI/static API port. The known-good Desktop entry points are `/Users/calderwong/Desktop/Launch Hapa Avatar Builder.app` and `/Users/calderwong/Desktop/Launch Hapa Avatar Builder.command`, both backed by `scripts/launch-desktop-dedicated.zsh`.
- Desktop lifecycle boundary: the Electron shell is single-instance. Port `8799` belongs only to its optional operator console and must not be selected as a Builder UI/API fallback. A console-port collision must warn and continue opening the UI; closing the last Builder window must release the shell.
- Preserve the 3D Tarot Draw surface when merging from generated or Pinokio app copies.
- Preserve the Tarot Library management surface when merging from the Pinokio app copy.
- Do not overwrite Avatar IDs when duplicate app copies diverge. If an incoming ID points to a different identity, import it under a provenance-marked replacement ID.
- Keep generated media, backups, subscriber logs, Overwind projections, build output, dependency folders, secrets, and local runtime stores out of Git.
- Before changing stores, create a backup under `data/backups/`.
- Prefer repeatable scripts for data merges and audits. Record merge reports under `data/merge-reports/`.
- Maintain UI/API/CLI parity when adding new cards, tarot, media, song, or world-store behavior.

### Process-spawning proof safety gate

- Never use `node -e`, `node --eval`, or `node --input-type=module -e` to smoke-test a module that calls `child_process.fork()` unless the fork boundary explicitly sets `execArgv: []` and carries a tested recursion sentinel. Node forks inherit the parent's execution arguments by default; an inherited eval program can execute again instead of the intended worker file.
- Run the Card origin transport proof only through `node --test tests/card-origin-announcement-proof.test.mjs`. Do not replace that command with an inline eval shortcut.
- A process-spawning command that stalls must not be retried until its child command lines and process count are inspected. Stop the originating process group before changing timeouts or adding debug retries.
- Every new fork/worker path must have: an explicit execution-argument policy, a recursion/role marker, child creation inside the owner's cleanup boundary, bounded graceful shutdown, `SIGTERM` fallback, `SIGKILL` fallback, and a regression test for the process boundary.
- Treat mass process creation as an incident, not as ordinary cold-load latency. Record the triggering command, owning code path, process count, containment action, and learning delta before resuming feature work.

## Completion Commit Protocol

- A source or documentation task is not complete until its scoped changes have passed the required verification and are recorded in a focused commit.
- Before committing, inspect `git status` and the staged diff. Stage only intended source, documentation, tests, and approved fixtures; never sweep unrelated or pre-existing work into the commit.
- Never commit credentials, runtime state, local databases or logs, generated media or build outputs, private source payloads, or workstation-specific paths.
- Use a commit message that names the completed capability and verification. Preserve the repository's configured identity and never rewrite global Git identity.
- A commit does not authorize a push, merge, deployment, or other external side effect. Those actions still require operator authorization.
- If verification fails or a safe focused commit cannot be created, the task is not done: leave the affected work uncommitted and report the blocker explicitly.

## Verification

```bash
npm test
npm run build
npm run smoke:tarot
node --test tests/overcard-*.test.mjs
```

For the 3D Tarot surface, also run the app and verify the `Tarot Draw` tab renders a nonblank canvas.
