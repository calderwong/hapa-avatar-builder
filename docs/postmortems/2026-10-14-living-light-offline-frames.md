# Native Living Light frames at explicit output times

Prototype checkpoint, 2026-10-14. Source: Codex /root chat
01a137cc-de1d-7511-ab65-227c92d5bca0. LL-903 remains in progress.

Objective: remove live playback speed from native Director export rendering.
Reused the completed Director capture owner, its exact recipe lookup, separate
song/visual coordinates, paused media seeks and synchronous WebGL copy. Added a
small frame-addressed staging adapter rather than another renderer or clock.

Evidence: 34 affected tests and production build pass. Real native graphics and
local video produced identical repeated scene/passage pixel hashes in landscape,
portrait and square, including backward seeks and an ordinary-media gap. Final
disposal leaves zero native renderer/retained recipes; decoders stayed muted and
paused. Source-bound prepared inputs, full-song output and final audio encoding
still need integrated qualification. Existing final-export refusal remains intact.

Corrections: review found the preview owner's default neutral input could be
misused for a bound offline Journey; the adapter now refuses that substitution.
Graphics loss now releases an idle host immediately as well as aborting a pending
frame. Browser DOM inspection does not expose canvas.toDataURL; screenshot capture
used the documented browser API. Large fixture receipts initially pushed the
picture out of view; diagnostics now have their own bounded scroll area. None of
these observations establishes human visual approval or cross-device determinism.

Process boundary: the existing file harness owned one Node test/build or Vite
launcher, stripped NODE_OPTIONS, enforced its role marker and bounded descendants,
and supplied timeout plus TERM/KILL cleanup. Tests/build restored their baseline.
The fixture server is finite-lived and receives explicit teardown after proof;
its explicit SIGTERM exit143 is recorded as deliberate teardown, not a passing server exit; baseline restored and zero descendants remain. No new process path is
introduced by the adapter itself.

Reusable Decision Card candidate: “prepare exact frame, then paint exact frame”
separates decoder readiness from picture time and prevents a stale WebGL buffer
from being mistaken for completed export work. The native owner stays shared.

Next: exact export snapshot/media packaging and existing encoder integration,
followed by encoded real-cut evidence. No export completion or task closure yet.
