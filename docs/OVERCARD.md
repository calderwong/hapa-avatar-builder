# Avatar Builder Universal Overcard

## Canonical identity

The canonical Builder checkout is `/Users/calderwong/Desktop/hapa-avatar-builder` (resolved workspace path is recorded in `AGENTS.md`). It is not `hapa-avatar-dashboard`, the deprecated Pinokio desktop copy, or Hapa Dev Proto. Shared Hand/Deck/Placement/Formation/Responsibility behavior belongs only to `/Users/calderwong/Desktop/hapa-overcard`; Builder is a consumer and owns its catalog, native renderers, host/process adapters, and view integrations.

## Operator surface

`src/main.jsx` mounts one shared provider; `src/App.jsx` keeps `BuilderHeaderHand` mounted inside the persistent 78px Header across all sixteen routes. The default dock is minified and in-flow, so it cannot cover Tarot preview, HUD, controls, card rail, sidebar, inspectors, or modals. Manage opens the canonical Hand/Deck/Set manager. Detach creates a movable always-on-top-in-app widget; Move supports pointer/touch and Arrow keys, Shift+Arrow moves farther, Reset restores reachable geometry, and Dock returns to the exact Header anchor without losing held state or collection state.

Hand stays in the canonical manager; Deck and Library route through HostTarget metadata to Tarot Library; Set routes to Creator Sets. Browser back restores the prior view while the provider remains mounted. At narrow widths the Header keeps a count/manage/detach ingress and compact connection trigger while hiding secondary telemetry.

## Sixteen HostTargets

The registry in `src/overcard/hostTargets.js` is the sole menu/attachment truth:

1. Builder
2. Mind
3. Scenes
4. Items
5. Loops
6. Look Book
7. Lore Reader
8. Hapa Songs
9. Echos Album
10. Kanban
11. Avatar Card
12. Hapa Bank
13. Tarot Library
14. Hell Week
15. Tarot Draw
16. Creator Sets

Each declares aliases, accepted entity types, typed sockets, effect (`presentation`, `context`, `authority`, or `output`), process adapter, and deterministic fallback. URL aliases resolve through this registry; do not add hard-coded menu metadata elsewhere.

## Entity adapters and Hand scopes

`entityCatalog.js` emits compact traceable EntityRefs for avatars, items, cards, decks, sets, scenes, songs, media, processes, and other registered Builder families; details remain lazy. `renderers.jsx` keeps native functions local. `pickup.js` and `BuilderPickupDelegator.jsx` add canonical pickup without replacing native select/file drag.

Hands are operator-personal, avatar-private, or workspace collections. `InventoryCollectionBridge.jsx` automatically hydrates only non-empty avatar Hand collections into the shared append-only ledger and preserves their custody/revisions. Deck, Set, Library, training, and equipped catalogs remain source-owned and load lazily through the management API; moving one of those collections into shared context must be an explicit bounded action, not a multi-megabyte startup copy. A Hand may be active on Builder and Dev Proto without duplicating state. Development state is shared through the loopback host; packaged deployment is pinned by `overcard-release.lock.json`.

## Runtime boundaries

- Non-executing views receive only safe selection/filter/shaping context and restore defaults on detach.
- Local, remote, and embedded processes use `processAdapters.js`; context freezes only at run start.
- Avatar visual/source availability is distinct from executable runtime availability.
- Hell Week is the vertical proof: explicit Request authority creates a bounded binding; Prepare next run freezes references; pause/revoke/remove affect the next run according to documented current-run behavior.
- Bank/Echos/Phone/embed messaging is exact-origin, schema/version/session/capability/action checked and receives no React store.
- Visual placement never grants authority; effective rights are the least-privilege policy intersection plus human gates.

## Interface parity

| Surface | Current truth |
| --- | --- |
| UI | Shared Hand, sixteen menu slots, inspectors/deep links/telemetry, Tarot 3D Formation, Hell Week controls are implemented. |
| API | Catalog, HostTargets, process adapters, runtime preview, inventory collections, Hell Week proxy, capabilities/health are implemented in `server/api.mjs`. |
| CLI | Existing avatar/card audit and attach-pack CLI remains source-domain CLI; universal Overcard install/verify CLI is package-owned, not duplicated here. |
| DATA | Avatar/inventory sources remain Builder-owned; shared collection/placement/formation/binding records live in the canonical host; consumer release checksum lives in `overcard-release.lock.json`. |
| EVENT | Host mutations are revisioned append-only events; Builder Card-origin outbox remains a separate source event system. |
| DESKTOP | Electron consumes the same web/provider package; no desktop-only Overcard reducers. |
| PACKAGE | Local iteration may use `file:`; packaging requires exact `0.1.0` plus SHA-256 lock and forbids source links. |
| TESTS | Canonical full suite, Builder focused integration/build, Dev Proto typecheck/focused suite, two-app E2E, security, accessibility, installer, and canary reports are release evidence. |
| DOCS | This guide plus HOST_TARGET, MENU_SLOTS, RUNTIME_CONTEXT, PROCESS_ADAPTERS, VIEW_CONTEXT, RED_HELL_WEEK, TAROT_FORMATIONS, EMBEDDED_BRIDGE, and DEEPLINKS_TELEMETRY documents cover the consumer. |

## Verification

```sh
cd /Users/calderwong/Desktop/hapa-overcard && npm test
cd /Users/calderwong/Desktop/hapa-avatar-builder && npm run build
cd /Users/calderwong/Desktop/hapa-avatar-builder && node --test tests/overcard-*.test.mjs
cd /Users/calderwong/Desktop/hapa-dev-proto && npx tsc -b
```

Rendered UX evidence is in `outputs/shared-hand-header-visual-qa/report.json` with Tarot screenshots for 1920×1080, 1440×960, 1280×800, 900×900, 768×900, and 390×844.

## Host lifecycle and troubleshooting

- `npm run dev`, `npm start`, normal Electron, and the dedicated launcher ensure or reuse the canonical loopback host. Port `8794` belongs only to Overcard and is not a Builder UI/API candidate.
- Electron asks the canonical supervisor to register the complete current Builder origin set before provider hydration, then probes that same set. The active renderer URL is derived at runtime, so recovery is not coupled to one fixed Builder port. `webSecurity` stays enabled, and preload exposes only status/ensure/reconnect; standalone API launch performs the same ensure and browser code has no process authority.
- Normal offline/reconnecting state is a compact Header control. Open it for the exact error, retry attempt/time, revision, and pending/conflict rows. Reconnect host establishes transport; it does not silently retry pending commands.
- Reconnect is non-destructive: it asks the canonical supervisor to register/reprobe the renderer origins and then reloads the canonical store. It never closes a healthy shared host that another Hapa node may own. An origin rejection crosses the scoped Electron bridge as `origin-blocked`, including the host URL, missing exact origins, and canonical reason.
- Initial snapshot failures retain the actual host URL, renderer origin, and underlying HTTP/network cause. Browser transport errors explicitly say that an offline host and exact-origin CORS rejection are the two indistinguishable browser-level possibilities; the Electron supervisor probe resolves that ambiguity for recovery actions.
- Wrong service means another listener owns the discovered port; origin blocked means the exact renderer origin was not registered; unauthorized means credentials differ; Update required means package/protocol compatibility failed.
- Shared Create, Put, Eject, active-Hand switching, and Undo are disabled offline. Catalog browsing and local app work remain available. Retry, explicit Rebase, or Discard are deliberate actions.

Recovery: close only the app-owned child, preserve `~/.hapa/overcard/overcard-events.ndjson` and `overcard-snapshot.json`, relaunch one consumer, use Reconnect once, then inspect the disclosure. Rollback the UI by restoring the previous pinned `@hapa/overcard` artifact and consumer lock; do not delete the event stream or presentation preference before the rollback drill captures both.

The Builder full suite currently includes unrelated media/data gates; Overcard release canaries use the focused suite named by the canonical release report while preserving any unrelated failure as visible baseline evidence.
