# Builder process adapters

`src/overcard/processAdapters.js` is the single registry for runtime-bearing Builder hosts. It declares canonical `ProcessDefinition` records and keeps process ownership, deployment mode, launch route, capability inspection route, socket roles, accepted entity types, capabilities, permissions, activation gate, interruption policy, and process-owned fallback together.

The current registry distinguishes:

- Builder-local Scene, Item, Loop, Songs, Tarot Draw/Forge, and Creator Set flows;
- remotely owned Hell Week (`hapa-dev-proto`) and approved append-only Kanban actions (`hapa-overwatch-kanban`);
- embedded Echos and read-only Bank context bridges.

`GET /api/overcard/process-adapters` exposes the same registry to operators and agents. Menu attachment popovers state local/remote/embedded mode, owner, fallback, launch route, and capability inspection route. Discovery and visual attachment never grant trust or execution authority.

## Run-start rule

`POST /api/overcard/process-adapters/:adapterId/run-context` accepts only an active canonical `ResponsibilityBinding` with `phase:"run-start"`. It reloads the current Builder stores, compiles least-privilege policy, resolves a canonical `hapa.runtime-context.v1`, records exact source revisions, and deep-freezes the result before an adapter can execute. Preview and staged bindings cannot use this route. Process-owned defaults remain the fallback when policy denies execution or a remote/embedded runtime is unavailable.

Hell Week is remotely owned: Builder may stage, inspect, and freeze a bounded context, but Dev Proto owns execution. Kanban is append-only and human-gated. Bank exposes presentation context only and has no authority socket.

## Maintenance

Add or change shared process semantics in `@hapa/overcard`; update only the Builder registry for native ownership and routes. Every runtime-bearing HostTarget `adapterId` must resolve to this registry, and `overcard-adapter.json` must project the same adapters for capability negotiation.
