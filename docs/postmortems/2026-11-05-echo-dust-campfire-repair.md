# Dust live capture and album-wide Campfire preview

Date: 2026-11-05. Actor: Codex, current troubleshooting chat. Source: Calder's requests to repair Dust recording and make Campfire available to all songs. Status: scoped behavior verified locally; no whole-song health or album artistic acceptance claimed.

## Outcome and reuse

Director live recording omitted the separately painted Score Dust overlay. It now samples that existing canvas after Living Light and before lyrics, preserving the displayed opacity, cover crop and blend. Missing initial pictures and decoder errors are explicit. No additional Dust decoder or media copy is created. The existing deterministic final-export path is unchanged.

Campfire's checkbox was limited to Thirsty in the Dark and disabled for cuts with Dust. The working-tree repair removes those restrictions, temporarily hides the cut's Dust/Living Light picture while Campfire is selected, and restores it when switched off. Existing matching Campfire direction is retained. Other songs receive a transient direction bound to their own measured score and exact master; nothing is copied from the pilot song or saved into authoring data. Missing prepared spectra are derived on demand from the verified master. Recording stays explicitly unavailable in Campfire mode.

## Verification and preserved failures

- 63 focused tests pass: preview recording, Dust layer/capture, Campfire direction/preview/spectrum. The first sandboxed retry failed only because an existing CLI test could not bind its temporary loopback server; the approved retry passes.
- Production build and build receipt check pass. No full repository suite repeated. Final behavior was checked through the rebuilt local UI in a separate browser; the operator's Electron window and unsaved working cut were not reloaded.
- Luna di Clara: a 9.249-second portrait live take plays back with visible Dust, media and lyrics. Recordings reports nine seconds, 1080x1920, 30 fps, approximately 21 MB, with Download available. Local recording ID: `24c0cd56-f065-49d0-bc7b-e991f563c31d`.
- Luna di Clara and Write Home: Campfire reaches automatic song direction using each song's own master. Write Home visibly renders the fire/smoke stage while its song clock advances; switching off restores the cut. Write Home's pre-existing unrendered Dust layer remains explicitly unrendered.
- The first capture attempt sought exact decoder frames and repeatedly paused live playback. That approach was rejected after native testing. The final implementation samples the same canvas visible in Preview and holds that visible picture through short decoder seeks. This is a live appearance capture, not a deterministic export or a frame-accuracy claim.
- Existing renderer-support and media-buffer warnings were visible on test cuts. They do not establish whole-song health. No source lyrics, saved directions, cuts, master files or existing recordings were changed. Three diagnostic recordings were added through the owner's normal recording route; none were deleted.

## Storage and delivery boundary

Source files, one compact spectrum cache and existing preview canvases are reused. Spectrum preparation is serial across stage replacement; encoded input is capped at 96 MiB (up to twice that during chunk assembly), decoded PCM at 192 MiB, song duration at 20 minutes, prepared JSON at 8 MiB and generated spectra at 12,001 rows of 32 bands. Browser/GPU internal allocations are not fully measured by those caps. No server job, database/WAL, full media mirror, external-store fallback, background worker or album-wide preparation was introduced. Existing media stays in its owner store; test recording bytes use the existing bounded scratch recording route. Timings and peak memory were not benchmarked.

The focused commit contains the Dust repair and this evidence. Campfire was already an untracked, interdependent prototype with overlapping tracked edits when this chat began. Its repaired implementation and new focused tests remain intact and built in the working tree; folding that entire pre-existing prototype into this commit would sweep another change's ownership. The task workspace retains the before snapshots and a compact repair patch. Integrate/commit that prototype as its own coherent change after ownership review. No push performed.

## Learning and next action

Lesson Card candidate: a live recorder must explicitly include every visible layer; sample its existing presentation surface rather than introduce a competing media clock. The first exact-frame attempt and native failure are retained here as evidence. Domain tests alone did not reveal the decoder pause; actual saved playback did.

Save the operator's current working cut before reloading the app. New recordings can include Dust; old recordings cannot acquire missing layers retroactively. Campfire remains preview-only and requires the song's measured Atlas timing and a compatible GPU. No requirement cards close, no board messages are sent, and no pilot-wide acceptance changes. Method remains active-pilot; human aesthetic acceptance and full-song playback remain outside this troubleshooting check.


## Follow-up — Campfire live recording enabled

Calder's follow-up, “Can't record the campfire?”, extends the requested outcome to saved Campfire takes. The prior preview-only boundary did not meet that expectation. This supersedes that limitation for live recording; it does not claim a new deterministic Campfire export path.

The existing Campfire clock adapter already paints an opaque 2D preview canvas. Echo now captures that surface in place of the regular cut, then paints the existing lyric surface and attaches the same playback audio track. It never runs a second stage or samples the transient GPU presentation texture. The capture surface becomes ready only after a presented picture; missing initial pictures wait and rendering failures follow the existing incomplete-take path. Hidden Dust/Living Light and underlying video-buffer checks no longer block a Campfire take. Recordings labels these takes “Campfire · [song]”. The toggle is locked during recording. Live capture includes any visible catch-up holds and upscales the current preview resolution into the chosen output profile; this is not deterministic full-resolution export.

Verification: 66 focused checks pass, production build and receipt check pass. In the rebuilt UI, Luna's Campfire reached readiness, Record + Play captured ten continuous seconds, and the shelf exposed Download. Saved recording `f4520e91-b8b6-47e8-8678-e6d7914cfc7b` contains H.264 1080×1920 video (10.232767 seconds) and non-silent stereo AAC at 48 kHz (10.237458 seconds), 23,693,861 bytes. Native playback showed changing fire/smoke and lyrics through the end. Its owner SHA-256 is `0e3a2f33fad83b822725491930f1c5810fbbdc9a9345ace2ab3649ebc5c9c2f1`. No extra media copy was made for inspection; ffprobe/ffmpeg read the owner's existing file. One diagnostic take was added; existing takes remain intact. The operator's Electron draft was not reloaded.

The test declared one <=15-second take with a 50 MiB target, <=25 MiB code/build scratch and <=2 MiB screenshots. Actual take size fits that target. These are task working-set bounds, not a claim of globally enforced byte quotas in the legacy recording store. No new storage route, background process, model or renderer was introduced. Existing input spectrum/cache limits still apply.

A focused follow-up commit records the independent Campfire capture painter, its failure/composition tests, the extensible Dust wait-code assertion and this evidence. UI wiring remains in the same pre-existing uncommitted Campfire integration. Its overlapping untracked component/vendor ownership prevents a safe isolated integration commit without sweeping the prototype; all working changes and a compact patch are preserved in the current task workspace. Nothing is pushed. The running local build contains the complete tested wiring.

Lesson candidate, revised: treat “make the feature available” in a recording workflow as including its capture path, then test the saved result. Reuse the presented canvas and existing transport rather than add a competing clock. Next operator action: save the current cut, reload Builder, enable Campfire, wait for Record Ready, then use Record + Play. Whole-song/GPU performance and human creative acceptance remain unclaimed.
