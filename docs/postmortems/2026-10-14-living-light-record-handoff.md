# A Location opens an exact record and returns its editing session

Status: first-pass live-album checkpoint, 2026-10-14. Source: Codex /root chat
01a137cc-de1d-7511-ab65-227c92d5bca0. Human creative acceptance remains pending.

Objective: turn a Location's record declaration into a reversible album visit.
Reused the real Echo catalog/detail endpoints, Director source fingerprints,
project selection, audio preparation, working-copy state, Song Card plan and
Journey draft editor. No new data service or replacement album was introduced.

Evidence changed the next action: opening the direct Echo route in a fresh tab
loaded the canonical album successfully. The earlier stale full-app tab did not
prove that browser control or the service was unavailable. Live verification
could therefore replace a synthetic-only handoff proof.

What worked: resolve and validate before selection, hold the original session,
open the exact cut paused, then restore the original copy and bookmark. A real
round trip restored 11.205453s and a temporary unsaved lyric size change. Journey
Undo/Redo survived through a bounded per-song session cache. The temporary cut
edit was canceled afterward; the named pilot Journey draft remains local.

Corrections: initial source discovery guessed HapaEchos.jsx rather than using
the returned HapaEchosView.jsx path. Those reads failed without mutations. A
read-only health request lacked network permission; it was not treated as a
service failure or a reason to restart. During source review, pausing before the
busy gate could have disrupted a recording: pause now follows admission. The
visit owner is created and disposed inside its effect, avoiding a disposed
controller after React Strict Mode remount. Recipe busy state also gates return.

Verification: 20 affected checks and build pass with cleanup restored. The
initial wider check had 28 passes and one live catalog failure (Hey Sister lacks
scroll-fal-authored-v1), independent of the edited code; retain it as open catalog
evidence instead of generating new cuts or claiming universal regression green.
Native live UI proved exact cut selection, paused audio, original dirty session,
Journey draft/history and explicit return. Original source cuts were not saved.

Reusable Lesson Card candidate: an album visit is a reversible selection
transaction, not an invocation of the ordinary newest-cut selector. Verify the
pin before opening, preserve the caller's working copy, and keep final-render
readiness independent from navigation. This is an attributed candidate, not a
new durable Card or authority to publish.

Remaining: save/reopen the painted real-song Journey and Director cues, finish
the three-Location Card/Hand roundtrip, qualify mixed encoded output and perform
integrated visual/audio/comfort checks. Full goal remains active.
