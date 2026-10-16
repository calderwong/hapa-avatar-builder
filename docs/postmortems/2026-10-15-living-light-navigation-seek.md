# Living Light moving-seek repair — October 15, 2026

Source: Codex /root chat `01a137cc-de1d-7511-ab65-227c92d5bca0`.
Requirement: LL-916; broader goal remains active. Human review pending.

The saved three-Location pilot reached its first destination, but the painted
tunnel reported a seek failure. Static inspection and a failing regression
showed playback was allowed while a seek awaited completion. The decoder could
advance before the event handler checked its requested timestamp. Pausing until
that event removes the race without relaxing the existing 40 ms wrong-frame
guard. Render ticks between the seeking flag clearing and the event delivery
now remain blocked; expected AbortError from interrupted play is recoverable.
Actual playback denial stays visible.

41 distinct checks pass, including wrong-frame refusal, paused/reverse/hold,
framing, navigation and Director preview; production build passes. The real
canonical app traversed both saved passages and all three Locations, then Back,
Home and Return restored the exact original cut at paused zero. Both painted
clips remained ready. One song audio and one native canvas were present.
38 existing cuts, pilot child and exact Journey payload are unchanged.
All bounded test/build owners returned to their process baselines.

The first pre-repair tab crashed, with cause unknown; browser recovery succeeded
and the repaired run did not crash. An early post-build tab click preceded
cut hydration and was reset to Preview; waiting for the selected cut before
opening Living Light resolved that inspection issue. Neither observation is
claimed as an application crash repair.

Reuse: existing media adapter, native renderer, Journey owner and route controls.
No new service, decoder pool, clock or saved store. Earlier encoded captures use
a separate unchanged export adapter, so a new full render was not justified.
Remaining: persistent Hand roundtrip, full-app modular proposals/save/reopen,
prepared bindings and complete integrated acceptance.

Evidence: `execution/living-light/navigation-seek/` in the source chat.
Lesson candidate: keep seek validation stationary and distinguish expected
play interruption from a real playback denial.
