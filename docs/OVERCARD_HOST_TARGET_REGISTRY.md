# Builder HostTarget registry

`src/overcard/hostTargets.js` is the only declaration of the sixteen Builder menu hosts. It owns route aliases, label/icon identity, lazy store loads, launch action, renderer and adapter IDs, fallback, context mode, effect explanation, and typed socket role/accepts/capacity/effect/gates.

The main navigation renders from this registry, initial `?view=` aliases resolve through it, view changes normalize the URL, and lazy data hydration reads its `lazyLoad` entries. `/api/overcard/host-targets` projects full attachment registrations; `/api/overcard/capabilities` projects compact host/socket references. The root adapter merges these registrations with host-owned records. `overcard-adapter.json` intentionally keeps `hostTargets` empty so a second static list cannot drift.

Modes are explicit: `view-context` filters/selects without process authority; `process-context` contributes bounded inputs after confirmation; `responsibility` only stages an authority-bearing binding and requires the policy/human-gate path. Hapa Bank is presentation-only. Hell Week is the current responsibility target. Tarot Draw is process context.
