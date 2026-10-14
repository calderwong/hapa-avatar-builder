# Living Light Director cue foundation — 2026-10-13

Status: implementation checkpoint; integration batch remains in progress.
Source: Codex chat `01a137cc-de1d-7511-ab65-227c92d5bca0`. Owner: current `/root`
instance through board role Executor. No Avatar identity is adopted.

Objective: make saved Journey scenes reusable inside Director cuts without losing
exact source identity or inventing export support. Reused the native Journey
revision owner, existing append-only Director cut path and compiler/editor graph.

Outcome: shared cue contract, save reference validation, variant round trips,
compiled identity and unsupported-export refusal implemented. 39 initial checks
passed, then 106 affected checks after owner resolution and duration refinements.
Production build passed; owned processes returned to baseline. No album-store
mutation or human creative acceptance occurred.

What helped: tracing both the variant patch whitelist and editor graph projection
exposed two places where a new scene could disappear or survive an explicit
removal. Both now derive from the same authoring field. The initial compiler
adapter used the project duration instead of the selected compile duration; this
was caught in inspection and corrected with a regression check before delivery.

Noise and limits: broad source searches produced oversized output; narrower reads
were more useful. Pure reference tests and API syntax checks do not substitute for
a live owner save/reopen proof. No new process path was added; existing bounded
Node test and Vite build ownership was reused. No timing-efficiency claim is made.

Next: LL-912 editing/locks/undo and LL-913 native host with one master clock;
LL-903 encoded execution remains explicit unfinished work. Keep LL-911 open until
its UI/API/CLI use and live round trip are qualified. Decision Card candidate:
separate immutable Journey definitions from their timed Director uses; derive
readiness at the execution boundary. The raw chat remains the source attribution.
