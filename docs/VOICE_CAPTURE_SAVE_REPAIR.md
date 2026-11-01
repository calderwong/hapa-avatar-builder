# Recording save repair — 2026-11-01

Status: parser repair tested and loaded into the local API; all five existing
Red style drafts recovered through the unchanged desktop sampler.

## Problem and change

Playable MediaRecorder takes failed Save recording with “Upload or record an
audio clip.” FileReader preserves the recorder's MIME parameters, producing
`data:audio/webm;codecs=opus;base64,...`. The server's old character class did
not allow the equals sign in `codecs=opus`, so capture failed before audio
conversion or persistence.

The existing Avatar Voice service now parses audio data URLs with token or
quoted MIME parameters, decodes the exact bytes, validates canonical base64,
and preserves the 44-byte–15-MiB limit. Non-audio types and malformed encodings
remain rejected. ffmpeg still validates and converts the actual audio; a MIME
label alone does not establish a playable or eligible recording.

The existing style dashboard, CMS speaker identity, drafts, consent, private
custody and owner API are reused. No frontend reload or re-recording is needed
for a draft already open when the repaired API is activated.

## Verification

`node --test tests/avatar-voice.test.mjs`: 10 passed. New coverage includes
WebM/Opus, Ogg/Opus, MP4 codec parameters, quoted codec values, invalid inputs,
and a real ffmpeg-created WebM/Opus take. The latter saves as a verified Voice
Card, stays scoped to its Avatar, yields a readable WAV and survives service
recreation. Existing custody, scripts, isolation, replacement, deletion,
coverage, process cancellation and local browser auth tests also pass.

Tests use temporary synthetic fixtures, no user microphone and no real voice
generation. One Node test file, serial bounded ffmpeg/fixture children, no
shell or inherited interpreter hooks in the child helper. Fixture roots are
removed in finally blocks. Runtime deployment reloads only the existing
background API; the desktop renderer and its unsaved Blobs stay open.

## Learning delta

Reused: canonical Voice Card service and style capture UI. Misunderstood in
the original implementation: an audio MIME header can include codec
parameters. WAV-only fixtures hid the browser-recording failure. Changed:
validate the actual MediaRecorder wire format and exercise conversion plus
save/reload. Reusable Lesson candidate: a successful upload test is not
evidence that microphone capture serializes identically. Source: Calder's
November 1 screenshot/report in the active Codex conversation; no message ID
is invented.

Automatic voice-over generation remains a separate bounded queue. Its existing
full-queue message may require waiting or saving with automatic generation
unchecked; this MIME repair does not change queue capacity.

## Live recovery result

Natural, Warm, Excited, Serious and Storytelling saved as verified Voice Cards.
The dashboard reached 5/5 (100%); each stored WAV matched its receipt digest.
The original desktop renderer stayed open throughout, preserving every draft.
Natural/Warm/Excited scheduled six automatic voice-overs. The last two captures
were saved with automatic generation temporarily off to avoid the existing
queue limit, then the original setting was restored. Voice-over completion
is separate from capture durability. No user source audio is in Git.
