# Echo accent presentation diagnostic — 2026-09-07

Status: partial implementation, A1 acceptance pending. Source: Codex task `01a072d3-d593-74f2-8c89-2470c2ee1a40`.

Objective: make stem/cue accents distinct, bounded and seekable through the existing native and export owners. Reused Preview's compositor, the shared lyric DOM owner, HyperFrames packaging, and current recipe-window merge. Did not create another player, service or recorder. Reviewed app AGENTS, Hapa Protocol Standards, process boundary safety and the requirement-batch pilot before implementation.

What changed: shared song-time/keyframe gesture geometry and role/address matching; native/export integration code; capped combined overlay area and alpha; merged-window accent admission preserving source/locked events. Total visual-layer/camera budgets remain incomplete. Existing shader/UI edits are preserved; no source cut was written.

What worked:30 focused domain/compiler checks, five-file parser check, and12 synthetic Chromium pixel cases with export's fixed readback setting. Distinct scans/rings/strips/shutters/brackets/flicker were visually inspected. This is not song-level output or native/export parity.

What failed: Electron first aborted under the sandbox. After verified cleanup, the diagnostic incorrectly imported the npm Electron path (a binary-path string) instead of Electron's built-in module. The supervisor terminated that failed launch after40 seconds and confirmed group/profile cleanup. The corrected diagnostic then observed reverse-seek pixel mismatches on default Canvas2D readback for scan/bloom/glitch; selecting the existing export `willReadFrequently` setting produced identical replay. Backend migration is a plausible explanation, not an independently proven Chromium root cause. Both pixel results remain available.

Guardrails: use the Electron built-in import under Electron; retain failed receipts; compare fixed rendering backends before attributing pixel differences to timing; never claim native/export equality from one shared function or synthetic pixels. Do not change the native performance setting solely to make a diagnostic pass. Actual integration and production performance remain batch gates.

Noise: a few searches used the task workspace instead of the app, and the first JSX parser lookup assumed Babel/esbuild despite Vite8 using Rolldown. The existing in-process Rolldown parser resolved syntax verification without a build. Future helpers should carry explicit roots and inspect the installed toolchain once.

Reusable Lesson candidate: planner intent, shared drawing logic, readback behavior, and final-song compositing need distinct evidence. The current workflow remains one active pilot, with no measured speedup or requirement closure.
