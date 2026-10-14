# Follow Director reuses the painted route

Status: first-pass component checkpoint, 2026-10-14. Source: Codex /root chat
01a137cc-de1d-7511-ab65-227c92d5bca0. Human acceptance remains pending.

Objective: connect saved Director cues and album destination discovery without
introducing another clock, renderer or media owner. Inspected the existing
native Director host, Explore model, Record Garden projection and exact
cross-cut resolver. Reused all four; added an observation after successful
native painting and a shared transient media-reference lookup.

What worked: a read-only route projected from painted visual time keeps held
motion, offsets and Location labels aligned. Clearing on non-ready states
prevents a previously painted destination from appearing current. The existing
protected resolver can serve one visible destination without fetching every
Location or requiring its source cut to be open.

Noise/correction: a couple of scoped reads used the workspace directory for
canonical source, or the canonical directory for chat evidence. They returned
missing-file errors; subsequent reads used the known owner paths. No source
or evidence was replaced. Use explicit owner roots for each operation.

Verification: 36 affected checks and build pass, with bounded cleanup restored.
Native browser fixture showed scene/tunnel/landing and a ready muted local
proxy from a synthetic closed-cut owner response. Actual Workspace retained the
editable study, one canvas, one audio element and paused 7-second bookmark
through Explore → Follow Director → Study. Missing exact Journey clears the
route. No live album write or human review was performed.

Reusable Lesson Card candidate: navigation observers should consume successful
painted frames, not a parallel interpretation of song time. Keep exact recipe
identity, visual time and song signal time separate; do not turn an unloaded
route or metadata prefetch into an apparent arrival. This candidate is an
attributed design lesson, not a newly issued durable Card.

Remaining: real album handoff and return, shared Hand roundtrip, mixed encoded
output, prepared-source recovery, agent proposal parity and integrated creative
qualification. The goal and owner task statuses remain active/in progress.
