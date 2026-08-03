# Echo transition-weighting and Reference-seam correction

Date: 2026-08-02 America/Los_Angeles  
Raw source: Codex Turn `019fc51e-90c2-7320-8269-57c3f91d7299`

## Outcome

Full-Source Motion Bridge V6 corrects the newest Echo Album cuts without
rewriting any prior Director script. It treats near-static adaptive Reference
loops as lineage evidence, not as cheap editorial coverage; gives certified
action transitions first-class reservations; and presents every bridge as:

`exact Reference still A → complete transition video once → exact Reference still B`

The Preview, Record Garden, EditorGraph, and HyperFrames export share the same
physical-frame time map and static centered seam crop. Echo Album now hydrates
and opens the exact newest saved cut on song change. Legacy remains an explicit,
sticky user choice rather than the silent default after every load.

## Diagnosis

The Camera V2 family contained 9,565 shots, of which 6,390 were loop-eligible.
It selected only 29 transition-classified shots from two unique clips and none
of the 41 authored Vibes transitions. Motion Bridge V5 restored 83 authored
placements, but its seam anchors were adaptive Reference loops and transition
coverage remained limited to explicit song assignments. Intrinsic temporal
coherence had been allowed to stand in for editorial motion utility, so a
high-quality near-still could beat the action clip it was supposed to frame.

The catalog itself was not missing the required evidence:

- 11,551 content-addressed videos, 11,549 decoded and 8,847 playable;
- 41 declared Vibes transition jobs with 82 declared Reference endpoints;
- 3,179 directed chain edges; and
- exact Reference catalog images plus separately generated adaptive loops.

The old `.02`-second endpoint probe was also not a physical-first-frame test;
on some containers it decoded frame 1. Metadata labels and filename language
could not repair that truth gap.

## Visual truth boundary

`transition-endpoint-visual-validation.json` decodes physical frame 0 and the
last presentation frame for every declared transition, then compares them with
their declared Reference images using the fixed center-crop luma/SSIM/pHash/
edge contract and wrong-reference controls.

- 30 transition videos / 60 endpoints are certified.
- 11 transition videos are quarantined.
- 71/82 individual endpoints pass.
- 6,068 wrong-reference controls produced zero false passes.
- Receipt result digest:
  `10a99d7be1af9d0dd717fc78d3b4a43a3d9adb9bc111f4d04a9e56f30663323a`.

The independent adaptive-loop proof certifies semantic identity for 74/75
loops and 148/150 terminals, but zero of 150 terminals meets the clean-still
pixel rule. V6 therefore uses the independent catalog image SHA-256 and URI as
the actual bounded A/B holds. The transition-terminal receipt proves a strict
visual match under its thresholds; it does not claim byte-identical pixels.

## Director policy

- Certified authored transitions receive a `1.30` editorial-role multiplier;
  scene motion receives `1.08`; ordinary loops remain `1.00`.
- Adaptive `subtle-reference-loop` candidates are hard-filtered from ordinary
  V6 selection. Their `0.92` value remains counterfactual evidence only.
- Explicit job-to-song assignments are preserved first.
- Songs may receive up to two semantic supplements when the absolute affinity
  floor and the song-relative 70%-of-best cohort both pass.
- Album balancing is pre-seeded with every explicit assignment. Inferred jobs
  are then chosen least-used inside the semantic cohort, with a deterministic
  song/job hash only as a later tie-break.
- The balance-state digest is part of compiler input, lineage, content identity,
  and append-only replay.
- Each transition plays its complete physical source range once. The compiler
  fits that source to the cue at a bounded maximum 5× rate and holds the first/
  last frames outside the logical motion window.
- The global triplet solver maximizes transition-motion share first, near-native
  playback second, then contextual/distribution quality.

## Album-wide audit

The final 157-song compile passed every pre-write gate:

- 157/157 ready cuts and 9,565 total shots;
- 262 atomic transition placements: 62 explicit and 200 semantic supplements;
- 30/30 certified jobs represented, 0/11 quarantined jobs selected, 0 rejected;
- transition reuse balanced to 5–15 uses per job, below the documented cap 18;
- 524 exact Reference-still holds and zero adaptive Reference-loop leakage;
- 8,674 ordinary scene-motion shots and 105 ordinary loop shots;
- 8,936 action-oriented shots, or 93.4239% of the album;
- 1,192.9 seconds of authored transition motion versus 1,499.9 seconds of
  exact seam holds, for 44.2996% motion inside the atomic triplets; and
- playback rates from 0.831044× to 2.224265×, median 1.104015×.

The per-song histogram is 116 songs with two transitions, 20 with one, two with
three, one with four, and 18 with none. Those 18 fail the semantic or three-shot
eligibility gate; they are not missing media, silently rejected jobs, or
fallback-to-loop cases.

The batch fails closed before writes unless the selected job set exactly equals
the certified set, subtle-loop leakage is zero, every transition has exactly two
Reference still holds, explicit plus inferred accounting equals placements, and
maximum reuse stays within the documented cap (or a higher unavoidable explicit
assignment floor).

## Persisted batch and replay

The append-only production set is
`echo-video-enrichment-697c3579027b65af-motion-bridge-v6`, bound to catalog
fingerprint
`sha256:697c3579027b65afd64837678fd16d089060c5e29bc0131b63c1b7fa267a9034`.
The first apply wrote 157 new immutable cuts and expanded the Director index
from 2,690 to 2,847 rows without mutating a base project or existing cut. The
second apply proposed zero new files, matched all 157 persisted files exactly,
and left the index at 2,847 rows. Exact-media preflight resolved all 9,565 of
9,565 declared references, and the catalog/Director audit reported zero
blockers. Production selection resolves V6 as the latest cut for 157/157 songs,
with zero Legacy or stale-family selections.

## Runtime parity correction

The V6 camera contract uses `certified-centered-cover-no-motion`: static,
intensity 0, speed 1, focus center, equal start/end crops, and zoom 1. The
EditorGraph now preserves and validates that exact declared path instead of
replanning it. Per-card provenance carries the full certified framing contract
through hydration and patch replay. A visual or timing edit to any certified
A/transition/B member now fails closed until the complete atomic bridge is
recompiled; an isolated edit can no longer retain a misleading certification.
Static portrait crops with zero intensity no longer receive the legacy 1.18×
extra zoom.

Preview and HyperFrames regression coverage proves the same crop, unity scale,
zero translation, exact still hold, and full-source transition timing at cue
start, midpoint, and final output sample.

The production bundle passed with delivery receipt
`sha256:2365b8a902c8c0327ccf5fab82ce9633fd671ec3c158e9ea874b9b85c366f0fe`.
The final focused transition/runtime review passed 154/154 checks, the complete
repository suite passed 1,624/1,624, and the album hydration test independently
opened every base project plus historical and current saved cuts.

## Turn-to-Lore reflection

- **Objective:** stop near-static loops from crowding action transitions out of
  the newest cuts, while making the declared first/last Reference frames real.
- **Evidence inspected:** all 9,565 selected shots, 11,551 enrichment rows,
  41 declared jobs, 82 endpoints, physical video terminals, independent
  Reference images, adaptive loops, song assignments, Preview, EditorGraph,
  Record Garden, and HyperFrames.
- **What worked:** content identity, exact card lineage, physical PTS decoding,
  append-only variants, and shared runtime contracts were reusable.
- **Noise:** high temporal coherence, a `loop_video` tag, filenames containing
  “transition,” and adaptive-loop derivation are not endpoint identity or action.
- **Misunderstanding:** `playbackMode: once` alone can truncate a source, an
  adaptive loop is not a clean still, and independent per-song hashing is not
  album-level diversity.
- **Change:** exact still A/T/still B reservations, strict terminal receipts,
  semantic supplementation, pre-seeded least-used balancing, full-source time
  maps, camera-contract preservation, and certified newest-cut hydration.
- **Reusable remainder:** physical-terminal validator, still-hold identity,
  atomic planner, album reuse ledger, deterministic balance digest, and shared
  Preview/export framing.
- **Guardrail:** no metadata inference may create endpoint truth; no quarantined
  job, adaptive near-still, incomplete time map, rebuilt certified crop, or
  implicit Legacy fallback can be presented as the newest V6 result.
- **Promotion candidates:** Decision Card “Quality Is Not Editorial Motion,”
  Lesson Card “Adaptive Loops Are Not Endpoint Stills,” and Flow-explainer
  “Exact Reference A → Full-Source Transition → Exact Reference B.”
