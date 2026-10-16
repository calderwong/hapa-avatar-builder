# Living Light render plan snapshot reuse — October 16

Status: targeted persistence repair verified; full pilot release remains pending.
Scope: LL-902/913/918. Source: Codex `/root`, chat
`01a137cc-de1d-7511-ab65-227c92d5bca0`.

The saved Living Light pilot completed 4,911 frames at 1920×1080 and 30 fps.
Eight sampled encoded frames passed the existing spatial occupancy comparison.
The job nevertheless failed at the post-pipeline certificate check: its saved
plan file hash changed after certification. The retained MP4 is failed-attempt
evidence, not an accepted release. Edition 1 remains current.

The preceding `a2383ad` repair preserved semantic identity when a derived graph
receipt changed. Its native reopen proof correctly observed the same plan and
candidate, but did not check the persisted plan bytes. `plan()` still replaced
the file on every request, including a fresh `createdAt`. The observed file was
dated after render start. Reproduction proves even an otherwise identical
replan invalidated a raw-byte certificate. The original certified plan bytes
were not retained separately, so the exact complete historical diff is not
claimed. This corrects the earlier proof's scope without erasing it.

The existing controller now returns the stored plan without rewriting it when
all fields agree except its creation timestamp and the specific derived
`input.project.director_show_graph_receipt` observation. Original evidence stays
in that snapshot; current execution certificates remain separately owned.
Comparison uses full sorted JSON, not the broader semantic mint canonicalizer.
Safety, rights, approvals, paths, source inputs and other receipts remain
material. The existing local file lock serializes concurrent first creation
and replanning across controller instances. Corrupt or linked existing plan
files remain refused by the existing no-follow reader. Raw-byte certificate
validation and release gates are unchanged.

Twenty-seven focused controller, compatibility/rehydration and lock checks pass,
including changed clocks, changed certificate observations, concurrent creation,
preserved candidate approval, and material-input negatives. The first added
path fixture failed correctly because it requested managed import of a missing
video; the corrected fixture explicitly supplies both paths to exercise plan
comparison. The production build and bounded process cleanup pass. No broad
suite was repeated for this isolated persistence correction.

Reuse decision: extend the canonical planner and its existing locking helper.
Do not restore a failed candidate, fabricate a checkpoint, weaken certification,
or treat an encoded file as a release receipt. The renderer deliberately removed
its checkpoint after certificate drift; a fresh owner-controlled retry remains
necessary unless an independently verified reuse route is implemented.

Lesson candidate: stable identity is not immutable storage. When a consumer
certifies file bytes, acceptance must exercise reopening and compare those exact
bytes as well as IDs, approvals and visible UI state. The completed encode and
failed release remain useful evidence, but do not close the integration or
human creative-review requirements.

Native delivery checkpoint: the existing supervised API reloaded with no active
render children. Explicit Retry plan and full browser reload → Tracks both
returned the same saved plan while preserving all 11,228,491 bytes (SHA-256
2437e77993b2b8c0d16cd7d2df7eeea2ba051cfdd13dc6fcf61ebced158db503).
The same saved-cut certificate was refreshed under standing user approval; its
readiness checks pass. A temporary restored working copy was canceled through
the UI, returning to the protected saved source. No source cut was saved over.
The old candidate remains failed until a separately verified retry completes.
