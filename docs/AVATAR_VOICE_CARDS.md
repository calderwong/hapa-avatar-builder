# Avatar Voice Cards and Scripts

Stage: local prototype. Owner: Avatar Builder. Source: Calder’s October 17,
2026 request in the Hapa Avatar Player continuation (Codex thread
`01a141eb-6f00-7b21-8fd3-98c1c2425f3c`).

Open **Builder → Voice & Scripts** on the selected Avatar. The style dashboard
is open by default; **Open voice sampler** restores it if collapsed.
The canonical desktop listener redirects same-machine browsers to its loopback
companion. Voice recordings require that loopback UI or an authenticated agent.

## Workflow

1. All five styles are visible together. In any style card, read its short prompt,
   or upload a recording and enter its exact transcript. Target 6–15 seconds;
   accepted audio is 3–30 seconds, up to 15 MB. Recording stops at 29 seconds.
2. Select the speaker from the CMS (defaults to the selected Avatar), record the source/permission note, and confirm permission
   for generated speech. Preview before saving to the selected Avatar.
3. Save creates a private Voice Card with audio hash, transcript, style, speaker,
   source and permission receipt. Different styles use separate recordings;
   style names do not claim an engine emotion-conditioning feature.
4. Automatic generation creates two short editable starter scripts and queues
   their voice-overs. Disable this option to save only the reference capture.
5. Save custom Scripts (up to 420 characters) and choose a Voice Card to generate.
   Each result pins the exact script snapshot and source-audio hash. Copying a
   script to the editor and saving creates a new record; older clips stay intact.
6. Play or download the WAV. **Download Avatar Player clip** exports the existing
   `hapa.avatar-drive.v1` plan plus embedded WAV for the Red player’s Import
   performance control. Expression/gesture/turn are performance directions;
   this does not render a video or prove visual timing quality.
7. **Re-record** opens the same prompt/style/speaker for a new take. The old
   take remains active until the replacement saves successfully. **Discard take**
   clears an unsaved draft; **Cancel re-recording** leaves the saved take intact.
8. **Delete capture** removes a take from the active library and generation
   selector. **Deleted captures → Restore deleted capture** recovers it. Existing
   generated clips retain their source history and audio; this is reversible
   library deletion, not permanent erasure. Archive/restore also remains available.
   Stop generation cancels queued/current work.

## Existing audio owners inspected

| Owner | Evidence and fit |
|---|---|
| k2-fsa OmniVoice / Hapa wrapper | `omnivoice.cli.infer` supports reference audio + exact transcript. Selected local cloning adapter, 32 diffusion steps, MPS. Upstream owns the model/inference; Builder owns capture/library/queue. |
| Hapa VoiceStudio, adapted from Debpalash/VoiceStudio | `docs/hapa/README.md` documents REST/MCP speech, voice design and jobs. Installed profile documents Kokoro (no cloning) and Qwen3-TTS VoiceDesign; neither is silently substituted for cloning. |
| Existing Builder Voicebox connection | `/api/voicebox/*` exposes health, profiles, captures and transcription. No verified cloning-generation contract was found in this integration. Retained unchanged. |
| Hapa Audio | Owner README describes Stable Audio 3 MLX for music/SFX and a deterministic test stub. Not used as a reference-voice engine. |

OmniVoice source: <https://github.com/k2-fsa/OmniVoice>, Apache-2.0; model terms
remain upstream-owned. VoiceStudio source: <https://github.com/debpalash/VoiceStudio>.
No new ownership, partnership, license, or production-quality claim is implied.

## Local engine configuration

Ignored `data/avatar-voices/provider.json` identifies the existing owner:

```json
{"root":"/absolute/path/to/OmniVoice","model":"k2-fsa/OmniVoice","device":"mps"}
```

Optional `cache` names the Hugging Face hub cache. `HAPA_OMNIVOICE_ROOT` is a
fallback. The environment and model must already be installed. Normal generation
sets `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1`; it never downloads or installs.
Readiness checks the executable and model cache; actual inference still has to
pass. Missing/incomplete weights cause a visible failed clip, never substitute
speech. The configured checkpoint includes the bundled audio tokenizer; empty cache folders do not count as ready. Optional `revision` pins the exact 40-character checkpoint revision.

## UI / API / CLI parity

All API paths begin `/api/avatar-voices/:avatarId`:

| Operation | API | CLI command |
|---|---|---|
| Inspect library/provider/prompts | GET base | `list AVATAR_ID` |
| Save capture + optional starter generation | POST `/capture` | `capture AVATAR_ID input.json` |
| Save script | POST `/scripts` | `script AVATAR_ID input.json` |
| Queue voice-over | POST `/generate` | `generate AVATAR_ID input.json` |
| Cancel work | POST `/cancel` | `cancel AVATAR_ID` |
| Archive/restore | POST `/archive` | `archive AVATAR_ID input.json` |
| Delete/restore capture | POST `/delete` | `delete AVATAR_ID input.json` |
| Read WAV | GET `/audio/:file` | `audio AVATAR_ID FILE OUTPUT.wav` |
| Player bundle | GET `/bundle/:clipId` | authenticated API GET |

CLI: `node cli/avatar-voice.mjs ...`. Supply credentials only through
`HAPA_AVATAR_ADMIN_TOKEN` or `HAPA_AVATAR_TOKEN_FILE`; optional `HAPA_AVATAR_URL`.
Capture JSON requires `style`, `transcript`, `provenance`, `consent:true`,
and `dataUrl` (CLI may use `audioPath`). `speakerAvatarId` selects an editable
CMS Avatar and defaults to the target Avatar; the server resolves its name.
Free-text `speaker` cannot override CMS identity. `inspect` returns `speakers`
with IDs and labels. `autoGenerate` defaults true. Optional
`replacesVoiceCardId` creates a new take and moves the previous take into deleted
captures only after successful conversion and custody. Both preserve lineage.
Script JSON: `title`, `text`, `style`, `expression`, `gesture`, `turn`.
Generation JSON: `scriptId`, `voiceCardId`. Archive JSON: `voiceCardId`, `archived`.
Delete/restore JSON: `voiceCardId`, `deleted` (true/false).
Never put a credential, private voice file, or raw base64 in a prompt or log.

The first-party UI obtains an HttpOnly session with an empty-body POST to
`/api/avatar-voices/session`, exact literal-loopback Host/Origin, same-origin
Fetch Metadata and `X-Hapa-First-Party-Intent: avatar-voice`. LAN listeners,
cross-origin/missing intent and mismatched authorities fail closed. Only a typed
pre-dispatch authentication rejection may cause one bootstrap/retry.

Avatar attach packs include a protected `voiceLibrary` endpoint pointer. Voice
source contents are not added to public Avatar projections.

## Storage, custody and process boundaries

Builder owns the relational attachment by immutable `avatarId` in
`data/avatar-voices/library.json`. Audio/config/job artifacts stay under the same
ignored folder, with backups under `data/backups/avatar-voices`. No external DB
is written. The original Avatar JSON remains owned by the existing authoring
writer; a stale full-Avatar save cannot erase the voice library.

Raw captures save before custody work. A pending capture remains recoverable if
custody creation fails. Verified Voice Cards use the existing per-Card Hypercore
service. A private append-only outbox records the receipt; it is local-only and
is not claimed as Overwind acknowledgement, publication, mint or canon. Scripts
and generated clips are authoring/media records, not separately minted Cards.

At most one conversion and one generation child run in this owner process;
maximum depth one. FFmpeg conversion is capped at 30 seconds wall time; the
OmniVoice Python CLI at 240 seconds. No shell, inherited Node/Python hooks,
model downloads, retry loop or automatic startup queue draining. Children get
an explicit environment and role marker. Cancellation/timeout sends SIGTERM,
then SIGKILL after two seconds and waits for close. Generation uses a local
owner lock; only a known dead owner can be recovered. After interrupted work,
explicit new generation marks the old in-flight job interrupted. Uncertain
locks require inspection. Up to six pending clips are accepted; two are created
per automatic capture. Private files are not committed.

## Verification and learning delta

`node --test tests/avatar-voice.test.mjs` checks real custody creation, source
hash binding, restart persistence, Avatar isolation, automatic scripts/jobs,
player bundles, strict browser context, and child cancellation/cleanup.
Generation in this fixture is explicitly synthetic test output; it is not
voice-cloning quality evidence.

Reuse decision: extend canonical Builder; reuse custody and its session cookie;
integrate the upstream OmniVoice CLI rather than create a new speech model.
Discovery mistake: a desktop app executable was initially read as text, producing
noise; the readable launcher then established the VoiceStudio owner. Guardrail:
inspect bundle metadata/readable launcher resources, never dump binaries.
The initial broad suite encountered sandbox-dependent local-service waits; its
identified test-only descendants were stopped before a single network-enabled
retry. A stalled browser tab was replaced by a fresh tab before UI testing.
Reusable **Flow-explainer candidate**: Avatar → style capture → private Voice
Card → immutable Script snapshot → synthetic voice-over → player bundle.
Open acceptance: speaker capture quality and human
listening/puppeteering review. Second Brain retrieval at its owner endpoint was
unavailable during discovery; indexing remains pending, not claimed complete.

### October 17 verification result

- Six focused voice tests passed, including actual FFmpeg conversion.
- Production build passed; 54 Overcard tests passed; Tarot visual smoke passed
  with a nonblank canvas and clean exit.
- Live loopback session/library API passed. Browser verified Red's sampler,
  style prompt changes, a saved `Red · First hello` script surviving reload,
  and upload preview with save disabled until speaker/permission are supplied.
  The uploaded preview was only a synthetic tone fixture, not a voice clone.
- Full `npm test`: 2,988 tests, 2,977 passed, 10 failed, one skipped. Failures
  concern album hydration/compiled graphs/director cuts/media rankings and
  related Echo checks. They are outside the focused voice tests; a clean
  pre-change reproduction has not been claimed. Full-suite log is retained in
  the local test artifacts. Per the owner completion rule, no completion commit
  is made while required verification is failing.
- After Calder requested a wider search, inspected the standalone OmniVoice
  owner and desktop launchers, VoiceStudio’s model registry/cache, Voicebox’s
  app storage, Pinokio/Ultimate TTS stores, Hapa Drama, AI folders, the shared
  Hugging Face cache, and Spotlight inventory. Found multiple code/runtime
  installs but no usable OmniVoice checkpoint in these stores. VoiceStudio’s
  installed models were Kokoro, Whisper and Qwen VoiceDesign; the shared
  OmniVoice entry was only an empty lock directory. Protected unrelated macOS
  stores were excluded. Search evidence is retained locally.
- Calder then explicitly authorized download if no checkpoint was found. Used
  the existing OmniVoice environment’s `huggingface_hub.snapshot_download` for
  `k2-fsa/OmniVoice`, revision
  `c5fdb5ccb189668d56333f77ba2629f4cd7535f4`, into the owner’s ignored
  `artifacts/model-cache`. The 13-file checkpoint includes the audio tokenizer.
  Runtime generation remains offline and pins that revision.
- Search lesson: a runtime package or an app called OmniVoice does not establish
  installed weights, but inspecting only the default cache is insufficient.
  Follow each owner’s launcher/cache configuration and verify checkpoint files.
- A sandboxed macOS synthetic-voice call returned an empty audio file despite
  exit zero. The capture validator rejected it; rerunning the same fixture with
  system speech access produced a measured 9.95-second reference. No personal
  saved voice was used.

### Live offline inference acceptance

The retained opt-in runner `artifacts/avatar-voice-review/live-fixture/run.mjs`
uses the real capture service, FFmpeg conversion, Card custody, automatic starter
scripts, generation queue, pinned provider, and player bundle exporter. It saves
into an isolated synthetic-demo library, leaving Red’s actual voice library
empty for the operator’s recording. The reference is macOS Reed synthetic
speech, 9.95 seconds, explicitly labeled synthetic with provenance.

- Full run: 25.3 seconds; both automatically generated clips reached `ready`.
- Output durations: 5.64 seconds and 4.70 seconds; mono 24 kHz WAV.
- Peak levels: 0.787 and 0.669 full scale; no clipped samples; nonzero RMS.
- Existing local MLX Whisper recognized the first script exactly after
  punctuation normalization. The second ended “feel” versus scripted “feels.”
  This is model-inferred intelligibility evidence, not human listening review
  or proof of speaker similarity.
- Live Builder after restart showed **Voice engine ready** for Red. Its saved
  first-hello script remained intact. Both fixture clips exported the existing
  Avatar Drive plan with embedded WAV; browser puppeteering with these new
  clips has not been claimed verified.
- Evidence: local `artifacts/avatar-voice-review/live-fixture/result.json`,
  generated WAVs and player bundles under its recorded run directory; model
  discovery receipt in `artifacts/avatar-voice-review/model-discovery.json`.
  These private/generated artifacts remain uncommitted.

### CMS speaker and retake refinement — October 17

Calder corrected the manual speaker field: identity should come from the CMS.
The existing editable Avatar records now supply the selector, default and saved
identity. Capture cards show the current CMS name with their recorded-name
snapshot retained. No new identity store or inferred name joins were introduced.
Delete is reversible; re-record is a replacement with explicit source lineage,
so a failed conversion cannot destroy a good take. Seven focused tests pass,
including cross-Avatar deletion refusal, CMS lookup validation, failed retake
preservation, successful replacement, and restoring a deleted take. Production
build passes. The earlier full-suite failures remain unresolved; this refinement
does not claim a clean broad suite or a completion commit.

### All-styles dashboard — October 17

The capture surface now opens as a dashboard with Natural, Warm, Excited,
Serious and Storytelling visible together. Each style owns its prompt, local
record/upload controls, draft preview/save/discard, and saved takes with
re-record/delete. No style-switching dropdown is required. Drafts stay with
individual styles; the speaker selector is locked until drafts are saved or
discarded so recordings cannot silently change identity. Only one microphone
session may run, and closing the dashboard stops its tracks.

Coverage is scoped to the selected speaker and counts distinct styles with at
least one active, verified saved capture. Deleted, archived, pending and unsaved
takes do not count; additional takes do not increase the denominator. Restore
updates coverage. This is reference availability, not a voice-quality grade.
Scripts and generated clips remain below the capture grid. Existing recordings
and endpoints are reused without migration.

The operator’s design correction is recorded in `CMS_COLLECTION_DESIGN.md` and
linked from the owning `AGENTS.md` for future CMS work. The earlier single-form
layout exposed storage fields instead of the collection-building task; the
new review rule explicitly checks visible gaps, local actions and truthful
coverage before handoff. No global memory or model-training update is claimed.

Dashboard verification: eight focused voice tests and the production build pass.
Live browser review confirmed all five style regions with independent record /
upload controls and no style dropdown. Synthetic local uploads into Natural and
Warm retained both drafts simultaneously; coverage stayed 0/5 and the speaker
selector stayed locked until both drafts were discarded. No test recordings
were saved into Red’s library. Earlier broad-suite failures remain unresolved.
Responsive CSS includes two-column and one-column layouts. A requested browser
viewport override did not change the in-app browser's reported 1280-pixel width;
it was reset. Narrow-screen visual acceptance is therefore not claimed.

### Harbor dialogue continuation — October 17

Local source now exposes `hapa.avatar-utterance.v1`: POST `/speak` with
`{requestId,voiceCardId,script}`, GET `/jobs/:clipId`, and POST `/cancel` with
either `{requestId}` or `{clipId}`. Existing no-selector cancellation retains
its Avatar-wide meaning. CLI adds `speak AVATAR_ID input.json`,
`job AVATAR_ID CLIP_ID`, and optional `cancel AVATAR_ID input.json`.
Script directions now retain `wink` (`none`, `left`, `right`).

Request IDs durably bind exact payloads; identical retries return the same clip
and conflicting retries reject. Cancellation by request ID covers a lost POST
response and cancellation arriving before submission. One cancelled reply does
not stop another clip. Publication checks capture permission/activity and the
reference hash again after generation; deleting/replacing a capture prevents
new output while older generated clips preserve provenance.

The focused existing and new dialogue suites passed **12/12**, latest run
1.486 seconds. Checks include restart/idempotency, wrong-Avatar access, scoped
queued/active cancellation, deletion during generation, preserved prior clips,
HTTP authorization and exact Script/Drive mapping. Synthesis was injected;
these checks do not establish live clone quality. No operator recording/store
was changed. New test: `tests/avatar-voice-dialogue.test.mjs`.

This source is **not yet deployed** to the running Builder. Harbor's new
performer page and consumer have five passing fixture checks, but its private
voice connection is unconfigured. A scoped owner-supported service credential
must be implemented and verified before live connection; do not borrow browser
cookies or simulate first-party headers. Earlier broad-suite failures remain
unresolved, and the existing staged/uncommitted owner work is preserved. No
completion commit or GitHub mutation is claimed.

Reuse/learning delta (source: the same Codex thread above): extend this canonical
voice queue and existing style dashboard rather than introduce a second engine
or capture library. The prior Avatar-wide cancel action was suitable for the
CMS stop button but too broad for a visiting shop client. Reusable **Decision
Card candidate**: consumer cancellation should identify an operation, including
ambiguous dispatch, without changing the meaning of the owner's global stop.
The guardrail is separate UI-stop and utterance-cancel contracts with explicit
provenance checks. Final performer, recording and human acceptance remain open.

### Scoped consumer deployment and real inference — October 17

The preceding deployment gap is now resolved locally. `avatar-voice-consumer.mjs`
owns expiring Avatar-scoped dialogue grants. The corresponding CLI takes
`grant CONSUMER_ID AVATAR_ID ABSOLUTE_TOKEN_FILE` or `revoke CONSUMER_ID`.
It writes a private credential file (0600), stores only its digest at the owner,
refuses overwrite, expires within seven days and checks revocation on every
request. There is no automatic renewal. This is separate from administrator and
first-party browser sessions. No browser cookie or fetch metadata was borrowed.

Scoped clients can list minimal active choices and create/read/export/cancel
their own dialogue jobs. They cannot read capture audio/transcripts or unrelated
clips, modify captures, or invoke Avatar-wide stop. Request IDs are consumer
namespaced before the durable operation lookup. Literal-loopback transport is
required; browser metadata, other Avatars and LAN requests reject. Revocation
stops new API access, not previously delivered audio or an already-running child.

**16/16** focused tests pass, including private-field projection, namespace and
operation isolation, expiry/revocation, loopback policy and existing voice tests.
A real HTTP/consumer/provider proof used the existing OmniVoice checkpoint and
the prior macOS Reed synthetic reference in an isolated library. Two outputs
prepared in 11.253/7.945 seconds and lasted 4.10/3.79 seconds. A third real job
was interrupted and removed; injected provider failure and deleted-source
refusal passed. No Red recording was created. These are generation/provenance
checks, not human listening or voice similarity evidence.

The canonical idle service was refreshed once through its existing supervisor
(40890 → 20687), after confirming no voice jobs, staging mint transactions,
minting plans or unregistered editions. Current health reports a fresh source
signature. Harbor now reads engine-ready and Red's empty five-style library
through its `hapa-harbor` grant, which expires 2026-10-25T05:10:47Z. The global
administrator token remains unconfigured. No GitHub mutation or broad-suite
success is claimed; source remains uncommitted alongside pre-existing owner
work until the earlier required-verification failures are resolved.

Evidence is retained in the Harbor owner's `docs/VOICE_CONNECTION_VERIFICATION.md`
and ignored `artifacts/live-voice-04dff27f-206c-44f6-b869-93406fa836ad/`.
Reusable **Flow-explainer candidate**: scoped voice choices → caller-namespaced
utterance → exact plan/audio verification → operation-only cancellation.
Guardrail: transport authentication alone does not justify access to all of a
speaker's captures or clips; enforce scope and response projection in the owner.
