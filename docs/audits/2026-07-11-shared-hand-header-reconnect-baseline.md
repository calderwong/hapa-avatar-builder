# Shared Hand Header and reconnect baseline

Status: verified source/runtime audit for `builder-shared-hand-header-reconnect-audit-2026-07-11`  
Date: 2026-07-11  
Owners: Hapa Avatar Builder consumer, canonical implementation in `hapa-overcard`

## Durable repair addendum

The Builder consumer now forwards its runtime-derived exact-origin set to the canonical host supervisor for both ensure and probe. Lifecycle responses retain canonical `origin-blocked` status and missing origins through the scoped preload bridge; renderer snapshot failures retain endpoint, renderer origin, and the original HTTP/network cause. Manual reconnect no longer closes a shared host. It registers/reprobes through the canonical supervisor and then asks the package store to reload, so a host owned by another Hapa node is not disrupted. Builder still opens with its local surfaces when host recovery is deferred.

## Executive finding

The reported Tarot obstruction is structural, not a one-off positioning bug. Avatar Builder mounts `OvercardHand` after the complete `<App />`, while the canonical component gives both “docked” and “floating” modes fixed bottom-right positioning. The current Dock button therefore cannot dock into the Builder Header.

The reconnect failure is also structural. Builder creates a client for `http://127.0.0.1:8794` but does not ensure, discover, or supervise a host. Its button only calls `store.stop(); store.start()`. Initial load failure never creates the event subscription whose retry loop handles later stream loss. A host becoming available after Builder starts therefore does not guarantee recovery.

The fix boundary is:

- `hapa-overcard` owns dock/floating presentation, local presentation preferences, layer tokens, connection state, host supervision/discovery, reconnect, pending recovery, accessibility, and tests.
- Avatar Builder owns the Header mount, its route destinations, native entity renderers, exact renderer origins, and lifecycle bridge.
- Dev Proto remains a reference consumer. Its in-flow Header anchor is useful evidence, but its legacy `CardHand` and `HandContext` are not reusable shared source.

## Current UI geometry and layers

| Surface | Verified current behavior | Consequence |
| --- | --- | --- |
| Builder mount | `src/main.jsx` renders `<App />` and then `<OvercardHand ... defaultCompact />` | Hand cannot participate in Header layout or receive Builder navigation callbacks. |
| Builder Header | `.topbar` is a sticky/fixed 78px, three-column grid containing brand, sixteen telemetry chips, and actions | A dock needs an explicit fourth priority region; expanded content must portal outside the clipped Header. |
| Canonical dock | `.hapa-overcard-hand` is always `position: fixed`, right/bottom 16px | “Docked” still covers route content. |
| Canonical float | `.is-floating` only changes `bottom` to `18vh` | It is neither draggable nor persistent and has no return anchor. |
| Canonical compact | Width falls from 720px to 520px and card width falls to 76px | This is not a Header-sized summary. Empty/owner/actions still consume workspace. |
| Builder warning | `.builder-overcard-status` is fixed bottom-left, up to 420px wide, above the Hand layer | It competes with Tarot controls and bottom rails. |
| Normal floating layer | Hand 26, warning 27 | Both are below several consumer overlays and above route content without named tokens. |
| Tarot embed | `?embed=true` creates a full-screen layer at 9999 | The Hand cannot satisfy “above every view” under the current layer values. |
| Pickup status | Builder uses 10000 | Ad hoc values contradict the documented content/overlay/Hand/status/toast/modal order. |

The target layer rule is not “maximum z-index.” Docked Hand uses normal Header flow. Floating Hand sits above route/3D content and below modal focus traps, blocking confirmations, and critical prompts. Fullscreen/embed behavior must be explicit.

## Route coverage matrix

The persistent Header must retain a bounded Shared Hand ingress across all sixteen registered Builder hosts:

| Route | Mode | Critical non-obstruction target |
| --- | --- | --- |
| Builder | view context | media intake, assembly, inspector |
| Mind | view context | Mind loadout and avatar controls |
| Scenes | process context | scene canvas and authoring controls |
| Items | process context | inventory command surface |
| Loops | process context | media routing timeline |
| Look Book | view context | reader mode and presentation |
| Lore Reader | view context | reader content and source controls |
| Hapa Songs | process context | player/director controls |
| Echos Album | process context | embedded playback and gallery |
| Kanban | view context | board lanes and approved-action slot |
| Avatar Card | view context | card/profile presentation |
| Hapa Bank | view context | embedded Bank view and trust boundary |
| Tarot Library | view/process context | card, Deck, Set, and Forge management |
| Hell Week | responsibility | manager/context controls and fallback status |
| Tarot Draw | process context | 3D preview, HUD, control tray, bottom card rail |
| Creator Sets | process context | set assembly and card gallery |

Tarot Draw is the release-critical regression because the current right Hand covers the preview/table while the bottom-left warning covers controls and rails. Bank/Echos embeds, modals, cinematic/fullscreen Tarot, and narrow viewports require separate layer/focus checks.

## Header density constraints

- Desktop Header height stays 78px.
- The minified Hand shows identity, count/capacity, at most three representative faces plus `+N`, connection state, Detach, and Manage.
- Empty Hand renders one compact affordance; it does not render a full “Create Personal Hand” panel in the Header.
- Owner switching, collection selection, creation, full lists, pending details, and recovery rows open in an anchored popover/drawer outside Header layout.
- Brand and primary actions remain available. Lower-priority telemetry scrolls or collapses before Hand controls disappear.
- Explicit layout designs and rendered checks are required at 1920, 1440, 1280, 900, 768, and 390px widths.

## Connection and host lifecycle findings

### Verified lifecycle gaps

1. Builder uses the fixed default `http://127.0.0.1:8794` unless a Vite build-time value overrides it.
2. Builder Electron does not start or ensure Overcard before creating the renderer window.
3. Builder preload exposes no scoped Overcard ensure/status/reconnect operation.
4. “Reconnect host” only stops and restarts the React store against the same endpoint.
5. `OvercardStore.start()` catches initial load failure and remains degraded without subscribing. The sync adapter reconnect timer is entered only after an established subscription fails.
6. Dev Proto contains app-specific `ensureLocalOvercardHost`; shared lifecycle is therefore still owned by the wrong layer.
7. Dev Proto’s allowed-origin list does not include Builder development/static origins. Canonical CORS is exact-origin only.
8. Builder Electron currently uses `webSecurity: false`, which can mask browser-origin defects rather than solving them.
9. The dedicated Builder launcher includes 8794 among UI/API candidate ports even though 8794 is the canonical Overcard default.

### Live endpoint evidence

At audit time, `GET http://127.0.0.1:8794/health` returned protocol `hapa.overcard.v1`, package `0.1.0`, revision `2`, and node id `hapa-dev-proto-overcard-host`. Builder health on 8787 was independently available. This proves the current host exists because another consumer started it; it does not prove Builder can recover or launch independently.

### Required launch-mode matrix

| Launch | Required host behavior |
| --- | --- |
| `npm run dev` | API/dev supervisor ensures or reuses compatible host and registers the exact Vite origin. |
| `npm start` | Static/API server ensures or exposes an honest actionable local-host path. |
| Standard Electron | Ensure/reuse host before provider hydration; close only an owned child. |
| Dedicated launcher | Never allocate 8794 to Builder UI/API; pass discovered endpoint to Electron/renderer. |
| Builder first | Host starts and the Hand reaches Ready without Dev Proto. |
| Dev Proto first | Builder reuses the same compatible host and durable state. |
| Simultaneous start | One writer wins; the other process reprobes and reuses it. |

An incompatible or wrong-service listener must fail with a specific diagnosis. Discovery, origin registration, and lifecycle bridges must not expose credentials, private memory, or general process execution.

## Connection-state and mutation truth

The compact presenter must distinguish:

- Connecting
- Online
- Reconnecting, with current attempt/next retry in details
- Offline: host absent
- Wrong service/port
- Origin/CORS rejected
- Unauthorized
- Incompatible protocol/package
- Pending `N`: local command records are not shared commits
- Conflict `N`: explicit inspect/rebase/discard required

Connectivity and pending synchronization are separate. Reconnect must not silently replay or rebase commands. The current message says shared changes are read-only while mutation controls still dispatch and queue; implementation must either disable shared mutations or label an explicit **Queue locally** action before dispatch. Held entities and source records remain intact on rejection.

## Dev Proto reference boundary

Dev Proto mounts `CardHand` inline in its global status bar and keeps its provider above routed content. Its collapsed preference is local. These are useful patterns.

It does **not** detach the whole Hand. Only individual cards float in the global overlay. The legacy Hand presenter and context are compatibility shims, use app-local state, and must receive no new shared behavior. After the canonical presenter ships, Dev Proto must adopt it through render, snap-zone, and route adapters so Builder and Dev Proto do not diverge again.

## Verification gaps

Current Builder Overcard tests mostly assert source strings. The tranche requires rendered and runtime proof:

- DOM bounding-box non-overlap rather than regex-only presence.
- Dock → float → route navigation → Dock without state loss.
- Header manager and Library route focus/back behavior.
- Host absent → delayed start → automatic/manual recovery without reload.
- Wrong port/service, exact-origin CORS, incompatible protocol, authorization, crash/restart, SSE gap, and simultaneous-start races.
- Pending retry, explicit rebase, discard, and idempotency.
- Keyboard, touch, focus return, screen-reader state, non-color status, reduced motion, and 320px reachability.
- Visual baselines for the six target widths across all sixteen routes.

## Implementation gates

1. Freeze UX and presentation contracts before consumer layout changes.
2. Land host supervision and initial-connect recovery in `hapa-overcard`, not Builder or Dev Proto copies.
3. Land package-owned dock, manager, floating widget, compact recovery, and layer tokens.
4. Integrate Builder Header/lifecycle/routes through thin adapters.
5. Converge Dev Proto on the same presenter.
6. Run rendered, fault-injection, two-consumer, performance, documentation, compatibility, and rollback gates before promotion.
