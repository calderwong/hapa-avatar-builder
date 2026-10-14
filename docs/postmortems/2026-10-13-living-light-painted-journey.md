# Painted Journey checkpoint

Source: Calder's integration request and implementation authorization in chat
`01a137cc-de1d-7511-ab65-227c92d5bca0`. Codex implementation; no adopted Avatar.

Objective: make existing Echo videos independently swappable parts of native
Living Light Journeys. Reused the existing exact-cut media declarations, native
WebGL renderer/media shader, shared clock, Journey editor/validator/store and Card
custody. Added a host adapter; retained vendor modules and their hashes unchanged.
See [contract, evidence and outstanding work](../living-light/PAINTED_JOURNEY.md).

What worked: isolated owner persistence tests and real decoded clips in a native
browser fixture separated source/persistence correctness from visual observation.
A depth-writing circular video face composes naturally behind scene geometry.
The modular unit is the placed use, with media independently replaceable.

Corrections retained: the first draft of decoder control did not account for a
pause at an unchanged visual timestamp; the host's frame deduplication now includes
playing/hold state, with a regression. Trim-end hold initially used full-video end;
it now uses the shared source-window terminal sample. An initial wall-side mapping
was reversed relative to the forward camera; visual inspection corrected it.
Duplicate uses now copy their placements or refuse the complete action at capacity.
The native build caused a development-page refresh during the first portal proof;
that inspection was restarted from visible page state, not treated as a failure of
saved authoring. An initial bounded build stopped before child creation because
sandbox process inventory was denied; approved escalation enabled read-only process
monitoring, and the successful run returned to baseline. No timeout retry occurred.

Process graph: existing file-based bounded owner → npm build shell → native wrapper
builder and delivery builder → Vite/esbuild. No inline-eval or new runtime process
path. Inherited NODE_OPTIONS removed by the owner, a child role sentinel prevents
recursive owner entry, one build attempt, 300-second outer bound, 32 simultaneous
observed descendants maximum, owned group TERM/KILL fallback. Actual successful
build completed in under two seconds with zero remaining descendants. Tests use
Node file entries with concurrency one, a 180-second outer bound and the same
cleanup owner; isolated temporary stores are removed in test finally blocks.

Reusable Lesson/Decision Card candidate: a visual frame cache must include control
state when it drives media lifecycles, even when source time is unchanged. A saved
source declaration is not a verified media-byte identity. Keep unresolved sources
visible and require explicit replacement. Source chat remains the attributed record;
this note is a derived implementation checkpoint, not human acceptance or canon.

Remaining: production process reload, actual album-clock acceptance, general Media
Card resolution, Director cues/export, immersive navigation and broader graphics
qualification. Existing lyric-timing edits and their verification state are separate.
No requirement totals, board completion, publication or GitHub state were changed.

The first long-lived development fixture also accumulated React root warnings
after hot updates. The fixture now explicitly unmounts its root during hot-reload
disposal; final browser evidence must come from a fresh page after source/build
changes. Earlier images remain diagnostic evidence rather than a clean-session
lifecycle acceptance claim.

Clean-session closeout: after the final build, a new browser page decoded both
clips, played them muted, paused both at the exact requested two-second source
time, disposed/reopened the preview and rendered the Solar Reliquary face. The
clean page reported zero console errors. Final affected checks passed24/24; the
final build returned to its process baseline. The source-safe operating contract
was indexed through Second Brain's scoped owner CLI and exact freshness/readback
verified. No global corpus refresh or external delivery occurred.
