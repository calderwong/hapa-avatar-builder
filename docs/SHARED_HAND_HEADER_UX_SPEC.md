# Shared Hand Header UX specification

Status: implementation contract for `builder-shared-hand-header-ux-spec-2026-07-11`  
Version: `hapa.shared-hand-header-ux.v1`  
Canonical behavior owner: `/Users/calderwong/Desktop/hapa-overcard`

## Outcome

Shared Hand is a resident app-shell utility, not a view overlay. Its default state is a minified, in-flow control inside the persistent Header. Users may detach that same Hand into a movable floating utility that survives route changes and may be returned to the exact Header anchor with one **Dock** action.

Full Hand, Deck, Set, Library, owner, pending-command, and recovery work is progressively disclosed. None of it increases the desktop Header above 78px or occupies Tarot workspace by default.

## State model

| State | Location | Default footprint | Primary actions | Persistence |
| --- | --- | --- | --- | --- |
| `docked-minified` | Consumer Header dock | one 40–52px-high rail | preview, Manage, Detach | default; mode is local preference |
| `docked-manager-open` | rail remains in Header; manager portals below it | rail plus anchored popover or responsive sheet | collection management, Library ingress, Close | open/closed is session UI state, not durable semantic state |
| `floating-compact` | body/root portal | compact movable utility | Expand, Dock, Manage | mode and clamped geometry are local preference |
| `floating-expanded` | body/root portal | full bounded Hand panel | collection actions, Minimize, Dock | mode and clamped geometry are local preference |
| `recovery-open` | anchored to connection indicator or in responsive sheet | on-demand details only | Reconnect, Sync pending, Rebase, Discard, Close | never automatically open for ordinary offline state |

Allowed transitions:

```text
docked-minified ↔ docked-manager-open
       │
     Detach
       ↓
floating-compact ↔ floating-expanded
       │
      Dock
       ↓
docked-minified
```

Connection and recovery are orthogonal to presentation state. Changing online/offline status must not dock, float, close, move, or remount the Hand.

## Minified Header anatomy

Left to right:

1. Stacked-card icon and accessible name **Shared Hand**.
2. Current collection name when space permits; otherwise owner-aware tooltip/accessible description.
3. Count/capacity, for example `4/9`.
4. Up to three 24–30px representative faces; additional members become `+N`. Empty collections show no empty slot row.
5. Compact connection indicator: Online, Connecting, Reconnecting, Offline, Pending N, or Conflict N.
6. **Manage**.
7. **Detach** when docked; **Dock** remains visible at the Header anchor while floating.

The minified rail does not contain owner switching, collection dropdowns, Eject, Undo, Create, pending rows, long errors, or full card labels.

## Header layout priority

The Builder Header has four regions:

```text
┌ Brand ┬ Shared Hand ┬ Telemetry (elastic/overflow) ┬ Primary actions ┐
└───────┴─────────────┴──────────────────────────────┴─────────────────┘
```

Priority order under pressure:

1. Brand identity remains recognizable.
2. Shared Hand count, status, Manage, and Detach/Dock remain reachable.
3. Primary safety/operator actions remain reachable.
4. Secondary telemetry scrolls, groups, or moves into overflow.
5. Preview faces and collection text collapse before control targets disappear.

Desktop Header height remains 78px. Popovers and sheets render in a portal and do not affect Header measurement.

## Responsive contract

| Width | Dock behavior | Manager/recovery behavior | Preview policy |
| --- | --- | --- | --- |
| ≥1920 | full minified rail | anchored popover below dock | 3 faces + `+N` |
| 1440–1919 | bounded rail; telemetry overflow | anchored popover | 2–3 faces + `+N` |
| 1280–1439 | collection label may truncate | anchored popover | 2 faces + `+N` |
| 900–1279 | icon/count/status/Manage/Detach only | right-aligned sheet/popover | 1 face or none |
| 768–899 | compact persistent Header button | modal sheet below Header | no faces; count only |
| ≤767, including 390 and 320 | count/status button in Header action row | bottom sheet respecting safe areas | no faces; count only |

No supported width creates horizontal page overflow. At 200% zoom, all essential actions remain reachable without two-dimensional scrolling.

## Manager information architecture

The canonical manager owns collection interactions and exposes router-neutral callbacks for consumer destinations.

### Tabs

- **Hand**: active Hand, member order, held-card destination, Eject, Undo, create/select owner collection.
- **Deck**: canonical Deck selection and member management.
- **Set**: canonical Set selection and member management.
- **Library**: an ingress action, not a fourth canonical collection kind. Builder routes to its configured Card/Tarot Library surface.

### Progressive disclosure

- Minified Header: current collection summary only.
- Manager opening screen: active collection and bounded member row.
- Owner/collection chooser: explicit second-level control.
- Pending/recovery: separate disclosure anchored to connection state.
- Source detail: consumer callback/deep link; the package does not hydrate app stores.

The Header bootstrap uses compact catalog references. Library browsing remains lazy and consumer-owned.

## Floating utility

- Detach moves the existing controller/view into a root portal. It is not a second Hand instance.
- Drag begins only from the title-bar handle after an intent threshold. Card faces retain pickup/select behavior.
- Touch uses the same handle and threshold. Pointer capture is released on up, cancel, lost capture, blur, and unmount.
- Keyboard alternatives: **Move widget**, arrow-key nudge, coarse Shift+Arrow nudge, **Reset position**, and **Dock**.
- Geometry is stored in CSS pixels relative to the visual viewport with schema/version, viewport size, and safe-area assumptions.
- Hydration and resize clamp the entire title bar and Dock action on screen. Invalid or old preferences reset safely.
- The Header anchor shows `Hand floating · Dock` while detached.
- Dock restores focus to the invoking/header control.
- Floating stays above route content and 3D canvases, below modal focus traps and critical prompts.

## Connection and recovery content

| State | Compact text | Default action | Details |
| --- | --- | --- | --- |
| starting | `Connecting` | none | current endpoint |
| online | `Online` | none | host identity/revision |
| reconnecting | `Reconnecting` | open details | attempt and next retry |
| offline/absent | `Offline` | Reconnect | endpoint and host-start availability |
| wrong service | `Wrong service` | Diagnose | observed versus expected protocol |
| origin rejected | `Origin blocked` | Diagnose | exact required origin, never a wildcard suggestion |
| unauthorized | `Unauthorized` | Inspect | capability/authorization reason, no secret values |
| incompatible | `Update required` | Inspect | package/protocol mismatch |
| pending | `Pending N` | Sync pending | command ids/keys and explicit retry/discard |
| conflict | `Conflict N` | Review | expected/actual revisions and explicit rebase/discard |

Host connected does not mean pending commands synchronized. Reconnect never silently retries, reorders, or rebases pending commands.

Offline mutation policy for v1: shared mutation buttons are disabled while the host is unavailable. The UI may later add an explicit **Queue locally** action, but no shared operation queues merely because the user clicked a normal Create, Put, Eject, or Undo control. Held/source entities remain intact.

## Empty, full, held, and error behavior

- Empty dock: `Hand 0/9`, status, Manage, Detach. No full create panel.
- Empty manager: explanation plus **Create Personal Hand** when online.
- Full: count and text state; Put is disabled with an actionable reason.
- Held entity: minified dock gains a held badge; manager/floating panel provides Put and Cancel.
- Failed mutation: retain held/source state and show an actionable manager/recovery message.
- Undo: available in manager/floating expanded state, not required in the minified Header.
- Missing source: show unavailable reference and source navigation; never synthesize an identity.

## Input and accessibility

- Minimum pointer target: 40×40 CSS px desktop, 44×44 touch layouts.
- Logical tab order follows visual order. The dock is one labeled region; its preview faces use roving focus.
- **Enter/Space** activates controls; arrows navigate preview/list members; **Escape** closes manager/recovery and cancels held state only where already established by canonical semantics.
- Opening a popover/sheet moves focus to its heading or first meaningful control. Closing returns focus to the exact trigger.
- Floating movement has keyboard controls and never requires drag.
- Status uses visible text/icon/pattern; no color-only difference.
- Ordinary connection changes use polite live status and are deduplicated. A new conflict uses alert once.
- Reduced motion disables flying, spring, and animated relocation; state remains immediately legible.
- High-contrast/forced-colors preserves borders, focus, selected state, and status text.
- Screen-reader name includes collection, owner scope, member count/capacity, presentation mode, and connection state without narrating decorative faces.

## Layer contract

Lowest to highest:

1. route content / 3D canvas
2. sticky Header and view HUD
3. route popovers and inspectors
4. floating utility (detached Hand)
5. connection/manager disclosure owned by the active Hand
6. toast/ephemeral confirmation
7. modal/focus trap
8. critical blocking/safety prompt

Docked Hand remains at layer 2 because it is Header content. Fullscreen/embed modes must either retain a compact app-shell affordance or explicitly suppress the Hand with an accessible return path; they may not accidentally cover it using arbitrary z-index values.

## Builder destination adapter

The shared package emits intent only:

```ts
type OpenCollectionManager = {
  kind: 'hand' | 'deck' | 'set';
  collectionId?: string;
};

type OpenLibrary = {
  entity?: EntityRef;
  source?: 'hand-header' | 'collection-manager';
};
```

Builder maps these intents through its HostTarget/view registry:

- Hand → canonical manager Hand tab
- Deck → canonical manager Deck tab
- Set → Creator Sets / canonical Set tab according to intent
- Library → Tarot Library/Card Library hub

No Builder route string enters `hapa-overcard`.

## Visual acceptance

Rendered evidence is required at 1920×1080, 1440×960, 1280×800, 900×900, 768×900, and 390×844 for:

- empty online dock
- populated online dock with overflow
- floating compact and expanded
- manager Hand/Deck/Set tabs and Library ingress
- offline/reconnecting/pending/conflict
- Tarot Draw with docked Hand
- Tarot Draw with floating Hand
- modal and recovery disclosure interaction

DOM checks assert non-overlap with Tarot preview, HUD, control tray, bottom card rail, sidebar, Header actions, and modal focus traps.

## Non-goals

- No redesign of collection semantics, authority, Placement, Formation, or responsibility.
- No raw Avatar memory/settings in the Header.
- No new consumer-owned Hand reducer.
- No global geometry sync across nodes.
- No silent pending-command replay.
- No use of `webSecurity: false` or wildcard CORS as a lifecycle solution.
