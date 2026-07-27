# Echo Director Service Freshness — Turn-to-Lore Audit

## Objective

Make the canonical Avatar Builder launcher recover Echo Director editing after delivery-code changes, and make an actual app relaunch restart the long-lived canonical services.

## Evidence inspected

- The Watermelon Honey, Due variant catalog and one selected non-Legacy cut from the live `8797` API.
- The selected cut hydrated all 106 timeline rows but returned `server_restart_required` with no certified show graph.
- The Director selector intentionally retained its current editable selection when graph preparation failed.
- The API health route returned a fixed liveness-only freshness record, while the Director graph route recomputed the real boot/source signature.
- The dedicated launcher trusted the fixed health record and preserved the launchd service.

## What worked

The existing server-delivery boot identity, fail-closed Director graph gate, launchd owner check, launch lock, and bounded restart loop already owned the required behavior. Extending those surfaces preserves the canonical process boundary.

## What was noise

The saved direction variants, timeline hydration, browser selector, WebRTC warnings, and generated media were not the cause. The selected variant data was complete before the graph gate rejected the stale process.

## What was misunderstood

Reopening the Electron window was treated as equivalent to restarting the Builder. Electron exits when its last window closes, but the canonical launchd API intentionally survives, so the former launcher could reopen a fresh shell on a stale service.

## What changed

- The API captures its delivery build identity at process boot and recomputes source-stat freshness for every health request.
- A fresh app launch restarts the canonical launchd API before opening Electron.
- A repeat launch keeps a healthy running Builder, but restarts an explicitly stale canonical API.
- Restart completion requires launchd to report a new service PID before health may be accepted.
- A merely busy/unresponsive listening service retains the existing preservation behavior.

## What remains reusable

The launchd service, launcher lock, health endpoint, build receipt, single-instance Electron shell, and Director fail-closed graph gate remain the reusable canonical lifecycle.

## New guardrail

A Builder health response must never claim Echo delivery freshness from a static placeholder. App relaunch acceptance requires a changed launchd PID and a new service boot identity, while repeat-launch recovery may restart only an explicitly stale owned service and must not kill a merely busy listener.

## Promotion candidates

- **Decision Card:** distinguish shell lifecycle from service lifecycle.
- **Lesson Card:** a cached liveness result cannot authorize reuse of code-sensitive certified graphs.
- **Flow explainer:** app launch → fresh health signature → bounded launchd restart → certified Director cut hydration.
