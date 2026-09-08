# Echo section certification and preparation progress

Status: verified implementation checkpoint; A1 unaccepted. Source: Codex task `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Requirement owners: ECHO-04/07/08/15/18. Evidence: `$ECHO_REVIEW_WORKSPACE/section-certification-proof/`.

Objective: certify and inspect the actual selected cut after terminal-input/layer-isolation changes. Reuse the existing runtime admission, readiness auditor, ISF pool and editor.

Confirmed cause: readiness expected all active candidates while the runtime intentionally admitted fewer under a quiet-section budget. Source-derived admission now validates identities, ordering, reservations, protected overflow and complete receipts. Unsupported sources remain errors even when suppressed. Sampling includes policy/reservation intervals, and the audit version invalidates older evidence. Actual selected-cut certification passes332 samples with zero blockers.

The first corrected native run reconstructed7751 frames in90.81s, then reverse-seeked in217.7ms. This was slow replay, not a stalled worker. Pool fallback had discarded pending progress, and paused diagnostic deduplication then hid updates. The pool now forwards pending progress without forwarding another layer's canvas/identity; the editor publishes bounded progress updates and a visible preparation percentage.

The original terminal probe incorrectly demanded frame7753 from258.44s while this browser's actual MP3 endpoint is258.6072s. The failure artifact showed correct empty input at frame7758. Corrected validation derives the frame from the actual audio element; no source duration is changed. The difference still needs decoded-output interpretation under ECHO-04/18; this is not evidence of acoustic sync.

Final native run: three direct/reverse/natural-end observations pass with visible preparation progress. Cold preparation93.11s; reverse214.9ms; natural end258.6072s/frame7758. No saved cut or source mutation.100 affected checks and build pass;55 protected/12 authoring hashes unchanged. Native terminal screenshot inspected: the retained Feedback Loop imagery and waveform layers are visible; controls remain dense and this is not human taste acceptance. No broad-suite repeat for this unfinished batch.

Remaining: costly cold reconstruction; short resumed playback in the first run missed timing target (p95 shader/playhead lag257.33ms over71 samples,40 over one frame). This differs from prior long-run windows and is not a whole-song measurement. Improve preparation/resume behavior, then finish composite/physical and global resource acceptance. Native terminal success does not close these requirements.

What helped: explicit expected/admitted/candidate separation, tampered-receipt negatives, existing owned supervisors, and preserved failed logs. Noise: an initial source read used the helper cwd, and a hard-coded endpoint forced an avoidable failed assertion. Do not reinterpret either as a product failure.

Lesson Card candidate: certify declared admission against source candidates; expose pending work at the same boundary that retains the last frame. Measure the actual clock, preserve duration disagreement, and never turn a timing pass at one boundary into general synchronization acceptance.

The final run has91 short resumed-playback samples:143.9997ms p95,173.8667ms maximum,13 over one frame. The verified MP3 source reports258.439979s at48kHz with start_time0.023021 through ffprobe, while the browser after seeking reports258.6072s. Earlier continuous-play observations ended at258.439979s. The reason for the seek-dependent discrepancy is not yet isolated. Next synchronization work must compare decoded sample timelines and playback after seeking before changing authored durations or treating the observed browser clock as the export timebase.
