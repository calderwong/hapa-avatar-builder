# Living Light prepared mixed-cut export — October 14

Status: local prototype; bounded technical encode accepted, parent requirement open.
Source: Calder's active integration goal, Codex /root chat01a137cc-de1d-7511-ab65-227c92d5bca0.

Objective: carry real painted Scene/Transition cues through the same final media,
lyric and soundtrack composition, with trustworthy frame preparation and cleanup.
Reused: canonical exact snapshot, native offline adapter, Echo HTML compositor,
pinned timeline, media/ISF seek helpers and installed Electron/FFmpeg. No new world,
replacement UI or node_modules fork. See [protocol](../living-light/DIRECTOR_CUES.md#prepared-mixed-cut-encoding--october-14).

What worked: explicit per-frame readiness plus a synchronous paint receipt;
checks of actual copied bytes; one encoder audio map; real encoded inspection at
scene, gap and tunnel boundaries.660 frames/30fps/22seconds, one48kHz stereo AAC,
zero-offset decoded master correlation0.9987603.50 affected tests and build pass;
parent repair adds three distinct boundary tests (9 focused checks). Successful
parent capture and explicit cancellation both restore their process baselines.
Source preservation covers38 original cuts, the pilot child and its Journey.

Misunderstandings/corrections: upstream HyperFrames does not call the existing
Hapa async preparation hook. Adding that hook alone would not qualify export;
the Hapa-owned prepared renderer now awaits it. Initial new unit fixture omitted
required telemetry; corrected without changing production semantics. The real
saved graph's reference URI and missing shader byte pins failed preflight;
derived inputs now use owner resolution/current verified shader pins, preserving
both refused attempts and the original cut. An empty portable-card assumption
missed legacy visualization.sourceHash; corrected at its actual source field.
A mistyped short-proof input path failed before packaging and was corrected.

Consequential process correction: direct Electron SIGTERM bypassed JavaScript
cleanup on this Mac and left one ffmpeg. The outer bounded owner reaped it,
verified zero remaining processes, and the disposable failed profile was removed
only after that evidence. No unrelated service or owner data was touched. Public
entry now requires a Node parent owning the entire process group, bounded TERM/
KILL/reap and per-run profile cleanup. The repaired cancel has no success receipt,
all helpers exit, and a fresh short native render confirms successful completion.
This incident invalidated direct-Electron lifecycle qualification, not the saved
22-second file's independently measured pictures and audio.

Reusable Lesson Card candidate: an async render hook is useful only when the
actual encoder awaits it; process cleanup must survive the host's native signal
semantics. Test cancellation at the outer owner, not only a JavaScript dispose
method. Record both failed and successful evidence without converting a local
encode into a full UI/export, source-bound, cross-profile or creative claim.

Next: integrate the prepared renderer through the existing job owner, preserve
its progress/cancel contracts and qualify complete saved-cut packaging there.
