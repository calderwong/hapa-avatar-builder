# Native Living Light reaches an encoded mixed take

First-pass checkpoint, 2026-10-14. Source: Codex /root chat
01a137cc-de1d-7511-ab65-227c92d5bca0; human creative acceptance is pending.

Objective: move beyond preview-only evidence into actual encoded 2D/3D output.
Reused the existing Director recorder, master audio tap, local recording store
and native Living Light host. Final Song Card export remains explicitly refused.

What worked: a synchronous native-frame copy, atomic staging, and one active
frame scheduler. The real pilot crossed a Location scene, ordinary video and a
complete painted passage. Extracted MP4 frames prove those pictures were encoded;
stream inspection found one stereo audio track with non-silent measured levels.

What changed: rejecting every unsettled video frame would abort at normal loop
seeks. Capture instead pauses MediaRecorder and the master at the same boundary,
waits for the exact decoded picture with a 15-second limit, then resumes. Errors
retain an incomplete label in durable metadata. Keep whole-frame commits atomic
so a loading native layer never leaks its underlying shot into the recording.

Correction: the first successful mixed take did not retain the existing capture
identity because that path was conditional on live signal recording. Living
Light now invokes the same audio-byte/graph hashing path even without a signal
companion; qualification distinguishes that source receipt from measured signals.
A source-bound follow-up exceeded the 128 MiB upload limit while documentation work ran during capture; the existing local-download fallback preserved it. A subsequent take started at the wrong playhead after range fill/Home did not seek as expected. It is retained as a source-receipt-only take, not mixed-scene evidence. The corrected take used verified PageDown seeking to zero, bounded recording and immediate stop/pause. It saved 35.57 seconds with 1,062 monotonic video frames and the exact source identity. Tool round trips extended the intended short wall duration, so future deterministic qualification should use an explicit in-product capture range rather than assume tool-call latency. No upload limit was weakened.

Tests initially used an incorrect filesystem alias/store option in the staged
new test; inspection corrected these before execution. No owner store was affected.

Reusable Flow-explainer candidate: compose at one song time, copy native GPU
pixels before presentation clears them, pause both encoded and audible transport
for bounded source readiness, then validate the saved file rather than relying
on a live preview. Preserve failed or incomplete takes as evidence.

Remaining: source-bound timing/profile acceptance, vertical and broader visual
checks, final release export, prepared binding recovery, persistent Hand and
proposal parity. See the owning Director cue protocol for exact current limits.
