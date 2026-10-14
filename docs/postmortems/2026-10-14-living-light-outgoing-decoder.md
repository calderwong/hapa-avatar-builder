# Living Light full-song outgoing decoder correction

Source: Codex /root chat 01a137cc-de1d-7511-ab65-227c92d5bca0.
Status: verified repair; managed full-song acceptance remains open (LL-903).

Objective: finish the approved saved pilot's full-song export through the existing
Builder/HyperFrames owner. The first run submitted2,664 of4,911 frames before
failing. The owned Electron/encoder processes exited, preserving the partial take
and failed receipts. Sparse49-sample pre-encode checks had passed; they did not
exercise this sequential clip-exit condition. No successful output is claimed.

A single isolated Electron diagnostic, without encoding or attaching to the
acceptance capture, reproduced the failure in32.206s. Clip26 ended at88.74s,
while its selected source time was3.393334s. Unconditional endpoint holding sought
to7.966666s of an8s source even though the clip was invisible. That seek caused a
macOS PIPELINE_ERROR_DECODE. The next load waiter listened for a new error and
missed the already-dispatched one, so the reported failure was a timeout.

Reused the compiler and existing media-frame domain rather than replacing the
renderer or transcoding owner footage. Endpoint holds now apply only inside the
presentation window; incoming visible handles still hold their declared source
start. The readiness helper immediately checks existing errors and accepts
settled seek events. No timeout, output requirement or source file was relaxed.

Verification:44 focused runtime/compiler tests; delivery build;154 real frame
preparations around the failed boundary, including reverse seeks, completed
in7.947s without decoder errors. This diagnostic served only the candidate HTML
and media runtime over the exact failed package assets; it is not a new full-song
render or encoded-pixel acceptance. Test/build/diagnostic processes returned to
baseline.38 prior cuts, pilot child and exact Journey were unchanged.

The fresh read-only readiness check passes45 videos,10 exact shaders,13 audio
references and169 semantic samples. Automatic approval review rejected refreshing
the certificate using apply-stem-repairs, interpreting prior approval as covering
only initial activation. Calder explicitly approved the refresh and local retry;
the same command then passed in8.409s and the existing Retry render UI started
a managed job. Final output remains pending; no workaround was attempted. Existing service reload was supervised
and verified fresh with no active children before reload.

What helped: stepping directly across the exact failure time with event evidence.
What was noise: a generic shader-media timeout hid an ordinary decoder failure.
Reusable Lesson Card candidate: hidden media must not seek unused source tails;
check current failure state before awaiting a future event. Sparse successful
samples cannot replace sequential boundary coverage. Framing, full-song/profile,
prepared audio-bound, Hand and human creative acceptance remain open. No measured
workflow speedup or broader reliability guarantee is claimed.
