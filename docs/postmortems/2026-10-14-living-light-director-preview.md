# Native Director Journey preview — October 14

Status: verified source/component checkpoint; integration batch remains open.
Source: Codex chat `01a137cc-de1d-7511-ab65-227c92d5bca0`, `/root`.

Reused the native Living Light renderer, signal banks, exact registry/client,
preview driver and Echo audio element. Extended the existing Director picture
with one cue-selected surface and bounded current/next recipe reads. The intended
outcome is actual saved Journey playback within a cut; the completed evidence
covers production components and source wiring, not a live album round trip.

37 focused checks, final delivery build and native browser study pass. The browser
used one silent fixture audio element and verified scene/travel/arrival, pause,
seeks, missing revision, explicit retry, leave/return and portrait output. No owner
song/cut/Journey records changed. Process baseline returned after every test/build.

The important correction was separating Journey position from signal time: a moved
cue must not sample audio at its original visual position. A repeated-time test
also verifies that changed signal offsets do not accumulate on native baselines.
A first test expected zero prepared renderers after directly seeking to an already
prefetched cue; that expectation was wrong. Corrected it to require the one target
renderer. An initial phone observation followed hot reload at time zero and showed
an inactive canvas; it was not used as active rendering evidence. Seeking into the
cue supplied the final portrait proof. Source changes invalidated the earlier build,
so the final affected checks/build were rerun once.

LL-913 remains in progress. Next: live owner save/reopen and full album source
resolution, followed by the short encoded mixed-cut pilot. Spatial album navigation
and broader modular parity remain part of the goal. Lesson Card candidate: keep
visual coordinates and measurement coordinates explicit when reusing authored
scenes. Neither a screenshot nor a green test promotes human creative acceptance.
