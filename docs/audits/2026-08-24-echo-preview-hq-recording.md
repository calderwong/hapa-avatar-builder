# Echo Preview HQ Recording — 2026-08-24

## Objective

Increase the quality of Echo Director **Record + Play** captures without
regressing synchronized playback audio, director-cut switching, Landscape /
Vertical output dimensions, or the one-hour operator safety ceiling.

## Evidence inspected

- `src/domain/echo-preview-recording.js`: 30 fps capture, 8 Mbps video,
  128 kbps audio, and MP4/WebM negotiation.
- `src/components/HapaEchosView.jsx`: full output-profile canvas capture,
  required playback-audio track, synchronized recorder/playback start, and
  visible recording readiness states.
- `tests/echo-preview-recording.test.mjs`: recorder lifecycle, audio routing,
  container selection, UI state, and persistence contracts.

## What worked and remains reusable

- The capture canvas already uses the selected final dimensions: 1920×1080
  Landscape or 1080×1920 Vertical.
- 30 fps correctly matches the Director preview. Raising the number to 60
  would duplicate/interpolate frames rather than recover source detail.
- The required Web Audio track and recorder-before-playback ordering are the
  authoritative sound path and remain unchanged.
- Upload failure still preserves the recording through the existing local
  download fallback.

## What was misunderstood or insufficient

The feature was full-resolution but the old 8 Mbps video target was a preview
grade budget. It was vulnerable to macroblocking and gradient breakup during
fast shader motion. The 128 kbps audio target was also unnecessarily low for a
music-video capture. Preview resolution alone was therefore not evidence of a
high-quality saved encode.

## Change

- Raised requested video bitrate from 8 Mbps to 20 Mbps.
- Raised requested playback-audio bitrate from 128 kbps to 256 kbps.
- Prefer an explicitly supported H.264 High Profile Level 4.0 MP4 target,
  while retaining generic MP4, baseline H.264, VP9, VP8, and browser-default
  fallbacks.
- Added a visible HQ readout with exact dimensions, frame rate, video bitrate,
  and audio bitrate to the recording controls.

MediaRecorder bitrate values remain codec/runtime targets: a browser may
negotiate a nearby actual rate. The UI truthfully labels the configured target,
not a post-encode forensic measurement.

## New guardrail

Recording-quality changes must be tested at the actual MediaRecorder options
boundary. Do not claim a quality increase from CSS preview size, device pixel
ratio, or a higher nominal frame rate alone. Preserve the synchronized audio
track and director-cut selection paths unless the task specifically changes
them.

## Verification

- `node --test tests/echo-preview-recording.test.mjs`: 31/31 passed.
- `node --test tests/echo-direction-variant-ui.test.mjs
  tests/echo-director-detail-bounds.test.mjs`: all 16 selector/editing tests
  passed. The separate Boba Tea Strum detail benchmark reached the API but
  failed its pre-existing runtime-data assertion because the current show-graph
  receipt was neither `ready` nor `preparing`; no quality-path source was
  implicated and the failed command was not retried.
- `npm run build`: passed; delivery receipt
  `sha256:ec6f61999934d30cb5877028436a74c48408eac8b74cb8e42994e1fbf2511c27`.
- A disposable in-memory Electron probe negotiated
  `video/mp4;codecs=avc1.640028,mp4a.40.2`, reported exactly 20,000,000 video
  bits/s and 256,000 audio bits/s, produced one live video track plus one live
  audio track, and emitted a non-empty Blob. It did not add a recording to the
  shelf or touch project data.
- Test/build process baselines were zero before and zero after for the focused
  Node test, delivery wrapper, and Vite child patterns.

The running Echo window was deliberately not reloaded after the build because
its current Rhythmic cut reports unsaved changes. Reloading would have violated
the existing save-or-cancel guard. The new build becomes active when the
operator saves/cancels that edit and reloads or relaunches the Builder.

### Process-boundary record

- Focused test: Node's file-based test runner owns one bounded test-file lane;
  the test has no application child-process path, retry, or recursive worker.
- Build: npm → `scripts/build-echo-delivery-runtime.mjs` → one synchronous Node
  Vite CLI child. Maximum build-wrapper fan-out is one, maximum depth is two
  beneath npm, shell interpretation is disabled by default, and the parent owns
  the complete wait.
- The broader detail benchmark owns one isolated `server/api.mjs` child on a
  fixed test port and terminates/awaits it in `t.after`. That internal boundary
  was inspected only after its data assertion failed, which was later than the
  protocol requires; it returned to zero matching processes and was not
  retried. Future runs must inspect the exact test file before including it in
  a combined command.

## Reuse candidate

This is a compact Lesson Card candidate: **match capture fps to the authored
timeline, then spend encode budget on motion detail and source audio rather
than invented frames**.
