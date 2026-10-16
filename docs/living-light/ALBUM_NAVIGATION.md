# Living Light album destinations and Explore

Status: prototype; saved real-album route and moving painted decoder verified
October 15, 2026. Persistent Hand and full modular acceptance remain open.
Dated checkpoints below preserve the earlier evidence and limitations.

## Operator flow

In Echo → Living Light, choose **Load album destinations**. This reads the same
summary catalog as Record Garden. Create/open a Location tour, select a Location
use, and choose **What lives at this Location**: an album record declaration, a
clip from the current cut, or an existing Living Light Card. Save through the
normal Journey owner; **Study this recipe** updates the preview route.

**Enter this route** pauses the song and keeps the Director cut and local drafts
in place. Use the named tunnel button to travel its complete authored interval.
The existing native canvas renders travel and arrival. Back, Home, Direct jump,
Stop travel and Return to song are ordinary keyboard-accessible controls.
Returning restores the captured song time and stays paused. Opening a record is an explicit action; there is no automatic
cross-song handoff or playback. Hold visual motion pauses an in-progress passage;
starting travel with that preference on jumps directly to the arrival. Hiding
the workspace/document pauses travel and releases the existing renderer resources.
Changing song, cut, study or audible source ends the exploration session.

At a stop, record metadata comes from Record Garden's normalized declaration,
clips use their exact transient source, and Card inspection/Hand actions reuse
the existing Living Light owner and Overcard controls. A missing source remains
visible as missing. The first component proof uses synthetic record declarations,
a silent fixture audio element and actual native rendering; it is not live album
acceptance or a Card custody/Hand round-trip proof.

## Data and ownership

Optional `instance.destination` is `hapa.living-light.destination.v1` with
`kind` and `ref`. Only destination-capable Location uses accept it:

- `record`: exact Song ID, cut ID and SHA-256 source declaration digest. The digest
  covers Record Garden's declared revision/content hash/cut fingerprint. It does
  not hash media bytes or make mutable cuts immutable. Records without any source
  revision evidence cannot be selected as pinned destinations.
- `media`: the existing exact Song/cut/shot/media/declaration reference. URLs stay
  transient. At a visible stop, an unknown exact clip is resolved through the
  existing protected media owner, including closed cuts. General Media library
  browsing remains unfinished.
- `card`: the existing Living Light `{kind,id,revision}` target. There is no new
  Card store, custody owner, publication or inferred source ownership.

The existing Journey API/CLI save, validate, exact read, history and CAS rules
persist the field. Destination edits use the editor's normal undo/redo; locks
protect them. Swapping a Location retains its destination independently from
its visual settings. Duplication retains the target under a new use; removal
removes that use. Cross-song forks keep explicit destination targets pointing to
their original owners rather than silently retargeting them. Portable export
retains the declarations; import reports unresolved navigation owners and refuses
commit until a qualified dependency resolver exists.

`livingLightNavigationMap` projects the original Journey schedule into Locations
and directed tunnel edges. It does not introduce a second route store. Saved
studies carry their exact Journey reference; an unsaved route stays a draft.
`createLivingLightExplorer` maintains a bounded 50-entry visit history and a
separate silent monotonic clock, sampled by the existing host frame driver. The
song's audio element remains the sole song playback owner. Explore uses authored
neutral motion and labels song signal response inactive. No new frame loop,
audible source, background worker, network service or source media is created.

## Evidence and remaining requirements

47 focused checks pass across destination admission, exact owner declarations,
three Locations/two different passages, hold/stop/Back/Home, bounded history,
unchanged bookmarks/drafts, native route compilation, locks, owner persistence,
old revisions, CAS, forks and portable dependency refusal. The final production
build and bounded process cleanup pass. Browser evidence is recorded alongside
this chat under `execution/living-light/album-navigation/`. The isolated production
Workspace fixture is `tests/fixtures/living-light-navigation-ui.html`.

LL-915/916 remain in progress. Still required: representative real album/media/
Card targets, broader cross-song/cut handoff qualification, real-song Follow Director qualification,
full source/destination recovery, shared Hand roundtrip, desktop delivery and
integrated responsive/comfort qualification. The wider goal also retains painted
real-song acceptance, short encoded mixed output, agent proposal parity and
human creative review. No task closure or final-render support is implied here.

The final native browser pass observed Solar Reliquary → Fractal Loom → Tidal
Observatory → Silken Current → Resonance Vault, Back to Tidal, and Return to song
at exactly 7.000 seconds, paused. Destination Undo restored its original Record
pin. Keyboard Enter operated direct jump and Home. One audio element and one
native canvas remained; no console errors were reported. At the requested 390px
phone breakpoint, the browser reported 375px client/scroll width and a 321×181
canvas, with no horizontal overflow. Screenshots and `browser-proof.json` retain
the distinction from live album/Hand acceptance. Temporary viewport override was
reset, and the isolated fixture tab was closed after the check.


## Follow Director and closed-cut clips — October 14 checkpoint

**Follow Director** in the existing Living Light workspace replaces the study
canvas with the same native cue host used by the album preview. It resolves the
exact saved Journey, follows the song's cue-to-Journey offset, and projects the
painted visual time onto the original route. No extra renderer, animation loop,
audio clock or Journey store runs alongside the study. Entering from Explore
ends travel and restores the captured paused song bookmark. **Study / Explore**
returns to the retained editable study and local draft. Stem audition disables
Follow Director. Capture Card preview remains a study action.

The route is read-only in Follow Director: it identifies the current Location
or traveling destination and offers its existing Card inspection/Hand actions.
Manual travel remains in Explore. Half-open cue and schedule boundaries align
with native painting. Held motion keeps the route at the painted visual time;
loading, unavailable revisions and time outside a cue clear the route instead
of showing a previous Location as current. The workspace only previews Living
Light cues; the album preview owns the complete mixed cut between them.

At the current visible Location, a media destination resolves one exact pin
using the same protected read-only `/media/resolve` route as painted sources.
Current matching sources need no owner lookup. Unknown refs read their original
song/cut, including closed cuts; the five-field declaration must match. One
transient destination video is mounted only at a visible stop, muted by default,
with manual controls and metadata preload. Traveling, hiding or changing the
Location removes it, aborts pending lookup and discards late results. Lookup has
a 30-second bound and visible loading/unavailable/retry states. URLs never enter
the saved Journey. No bulk destination prefetch or source analysis is started.

36 affected checks and the production build pass with owned process cleanup.
Browser fixtures verified scene → tunnel → landing, outside-cue and unavailable
revision clearing, closed-cut clip resolution (704px video, ready state 4,
muted), and Workspace Explore → Follow Director → Study restoration at the same
paused 7-second song bookmark with one canvas and the draft retained. The media
fixture uses an existing local proxy with synthetic owner responses; this is
not a live catalog mutation or final album acceptance. Source fixtures live in
`tests/fixtures/echo-living-light-preview-ui.html` and
`tests/fixtures/living-light-navigation-ui.html`; evidence is under the chat's
`execution/living-light/follow-director/` directory. LL-913/914/916 remain in
progress for real owner workflows and the remaining integrated goal gates.


## Reversible record visits — October 14 live checkpoint

A resolved record destination now offers **Open this record** in Explore and
Follow Director. The album re-reads its existing summary catalog, checks the
saved declaration and loads the exact requested cut. Cut source fingerprints
use the existing Director identity helper, including owner-declared runtime
projections. Changed metadata, a missing cut or mismatched identity refuses;
no latest-cut substitution or graph compilation is requested by the visit.

Opening pauses the song and retains one original editing session in memory:
its detailed project, exact cut, optional unsaved working copy, unsaved flag,
Song Card plan and song time. The destination opens at zero, paused, through
Echo's existing selection and audio preparation path. **Return to [record]**
restores that session and bookmark, including an unsaved original cut. The
existing exact-render certificate gate remains independent. No album script,
cut, source media, custody or publication record is written by navigation.

There is at most one active excursion and one pending 30-second owner lookup.
Nested visits refuse until return. Cancel, unmount and a changed current edit
invalidate late reads. Original snapshots are bounded to 32 MiB. Active saves,
unknown save outcomes, recording, stem audition and pending recipe operations
refuse before handoff. Dirty destination cut changes must be saved or canceled
through the existing album controls before return; both sessions stay retained.
This is an in-tab bookmark, not persisted recovery across browser reloads.

Journey drafts still use their existing per-song browser storage. The editor
now retains Undo/Redo and selection for three recently visited song sessions in
memory, while preserving the existing 50-edit history bound. The original study
is restored on return; a different song cannot accidentally explore its route.
Pending recipe operations also block record return. No new draft database or
Card owner is introduced.

Live canonical album verification used the real records **11:23 Meant to Meet,
Thu?** and **2 a.m. Lights**, their pinned performance cuts, existing master audio
and a new browser-local draft named **Living Light · album visit pilot**. The
round trip restored the original cut and paused time **11.205453 seconds**.
A temporary lyric size edit (100 → 105) survived in the original unsaved working
copy and was canceled afterward, returning to 100 without saving a cut. Journey
title Undo/Redo remained functional across visits. No console errors were
reported during that pass. The source cut and saved Journey stores were not
edited; the pilot draft is retained locally for subsequent saved-route work.

20 affected checks and the production build pass with process cleanup restored.
An earlier wider navigation check reported 28 passes and one existing catalog
failure: Hey Sister lacks `scroll-fal-authored-v1`. That test reads variant file
names directly, and its test/domain files were unchanged. The failure is retained
in `execution/living-light/record-handoff/tests.log`; no cuts were synthesized to
make it pass. This checkpoint does not claim a clean full-album regression,
source-fresh API reload, saved painted pilot, Hand roundtrip, mixed export or
human acceptance. LL-915/916 and the full integration goal remain in progress.


## Saved painted album pilot — October 14

The live canonical Builder now contains **Living Light · painted album journey**
for **11:23 Meant to Meet, Thu?**. Its exact owner identity is
`ll-journey:9292b4c0-1eff-4455-b824-659f4b0d051e`, revision
`ll-journey-r:540c52f02539e25791528bb961a6e7e8`. This is a saved unresolved
neutral study; no prepared audio binding or creative acceptance is implied.

The route uses Solar Reliquary (0–26s), Media Weave (26–34s), Tidal Observatory
(34–120.759985s), Silken Current (120.759985–128.759985s) and Resonance Vault
(to 163.679979s). Two existing clips paint the Solar portal and Media Weave's
left wall. Each retains the original song, cut, shot, media ID and declaration
revision. Destination pins resolve respectively to the exact 2 a.m. Lights
performance cut, Deevid Video 1675562, and the Media Weave Card.

The new child cut
`atlas-pipeline-08e33316-8793-49a4-915d-abf29846769c-43fe360f5cf8-perform-edit-6efbafa69fcc2fec`
saves a Scene at song 2–10s / Journey 0–8s and a Transition at song 12–20s /
Journey 26–34s. Both reference the exact saved Journey revision. Fresh-page
reopening retained both cues. The 38 existing song cuts remained byte-identical
to their before-save backup. The owner created the Journey and its module
custody locally; no publication, mint, analysis or source-media write was requested.

Live verification rendered the actual portal clip and video tunnel wall.
Following Director at song 14s projected travel to Tidal Observatory. After a
fresh page load, the one master audio element played normally (observed 7.817591s,
readyState 4); paused seeking and Explore return retained 14s. Explore traversed
the entire eight-second Media Weave passage and resolved the pinned destination
clip (muted, readyState 4, 1440px source width). Pickup at the Card destination
opened the exact Media Weave revision in the existing shared inspector. No
browser error log entries were reported in the final pass.

**Remaining Hand qualification:** Add to Hand refused before mutation because
no Hand was active for this surface. Manage displayed the existing personal Hand
but selecting it reported that it is not enabled for `hapa-avatar-builder`.
Its six members remain intact. This is an owner configuration gap, not proof of a
successful persistent Hand roundtrip; pickup/inspect alone is qualified here.

One documented source-stale launchd reload was performed after checking no child
processes, render jobs, staging mint transactions or minting plans. Health then
reported a new canonical PID and fresh source. An already-open page retained an
old playback-audio job and initially reported playback failure; the required
fresh-page reopen acquired current audio and played successfully. Do not infer
an ongoing audio defect or restart again from that stale-page observation.

Evidence remains in the originating chat's `execution/living-light/saved-painted-pilot/`
folder, including owner readback, source hashes, reload receipt and two screenshots.
This checkpoint changes runtime pilot data and documentation only; the prior
20 affected checks and production build remain the source verification. Full
mixed encoded output (LL-903) is next. General final export and preview recording
still explicitly refuse Living Light cues. Prepared-signal recovery, persistent
Hand placement, proposal parity, broad visual/comfort acceptance and human
creative review remain open; the full integration goal stays active.


## Moving painted clips during Explore — October 15 repair

A full-app pass found a moving-decoder race during Media Weave travel. The
video continued playing while seeking, so its clock could advance beyond the
requested picture before the queued `seeked` event validated the 40 ms bound.
The existing media adapter now pauses before each seek and waits for its exact
completion event before resuming against the current Journey clock. A cleared
`video.seeking` flag alone cannot restart playback or paint. An intentionally
interrupted play promise can resume; an actual playback denial remains explicit.
The wrong-time/clamped-source guard and five-second seek timeout are retained.

41 distinct affected checks and the production build pass. The new moving-seek
regression fails on the preceding implementation. Canonical full-app verification
reopened the saved pilot and traversed Solar Reliquary → Media Weave → Tidal
Observatory → Silken Current → Resonance Vault with both painted clips ready.
Back returned to Tidal, Home to Solar, and Return to song restored the original
cut at paused 0 seconds. One audio element and one native canvas were present;
38 original cuts, the pilot child and exact Journey payload remain unchanged.
The served bundle matches the rebuilt entry; no API restart or source-store
mutation was needed for this client-only repair.

The first earlier inspection tab crashed; one replacement run recovered, and
the repair verification had no crash. The crash's cause remains unknown.
Native screenshots and readbacks are in the source chat's
`execution/living-light/navigation-seek/`. This is scoped route/decoder evidence,
not persistent Hand roundtrip or complete modular editing acceptance. LL-916
and the full goal remain open; human creative acceptance is pending. Existing
encoded evidence remains applicable to the separate unchanged export adapter.

Lesson candidate: validate a seek while the decoder is stationary; tolerate
ordinary interrupted playback without weakening rejection of a wrong picture.
Source: Codex /root, chat `01a137cc-de1d-7511-ab65-227c92d5bca0`.


## October 16 — LL-915 route and bookmark model accepted

The four original LL-915 criteria are technically accepted. This is the route,
owner-reference and bookmark model. LL-916 still owns the complete interactive
travel/comfort/resource acceptance; the latest embedded-browser Workspace crash
is unresolved and is not relabeled as a successful navigation check.

| Original criterion | Authoritative evidence and scope |
| --- | --- |
| Three Location destinations and two tunnel edges link real album/media/Card targets with versioned metadata. | Read-only owner proof of saved Journey `ll-journey:9292b4c0-1eff-4455-b824-659f4b0d051e`, revision `ll-journey-r:7c9eb9c31cfc30226a62e5a33fe83145`, resolves all three targets: the exact 2 a.m. Lights performance cut, the saved 11:23 shot-3 Deevid clip, and Media Weave revision `ll109-source-r1`. There are three distinct destination uses and two authored edges. The modularly edited current recipe uses Tidal for two stops; earlier saved route evidence above covers Solar, Tidal and Resonance. Instances may reuse a Location definition without merging their target identities. |
| Reuse Record Garden, Living Light identities and Overcard inspect/Hand actions without parallel stores. | Current owner proof reads the existing catalog and exact saved-cut reader; Card resolution uses the existing registry. Production navigation mounts the existing inspector and shared actions. Live saved-pilot pickup/inspection and the later persistent Calder Hand exact-Journey round trip are retained evidence. Current seven shared-Hand checks cover lazy custody, exact refs, duplicate/capacity/offline refusal, historical revisions and protected parity. No new store or media copy. |
| Catch dangling targets, missing revisions and unsupported passages; represent direct jump and return. | Current navigation checks reject missing endpoints/revisions, unsupported bridge capability and durations outside 4–60 seconds. Record checks reject changed/missing/wrong-song targets; media and Card retain their existing owner validation. Explore tests cover explicit direct jumps, Back/Home, stop, held travel and bounded history; the actual saved route was traversed in the earlier full-app proof. |
| Preserve song, cut, time, selection and unsaved draft independently from exploration. | The excursion controller deep-copies the exact original editing snapshot and refuses stale loads/nested visits or a dirty destination return. Journey editor retains selected use and bounded Undo/Redo separately for three visited song sessions; Explore does not change either editor. Actual 11:23 → 2 a.m. Lights → 11:23 restored the exact cut and paused 11.205453s, retained dirty lyric size105 and Journey Undo/Redo, then canceled the temporary edit back to100. Current regression explicitly retains nested selection alongside the dirty draft. Bookmark recovery remains in-tab, not a promise of crash/reload recovery. |

Twenty current navigation, record-visit and shared-Hand checks pass. Added
negative route boundaries and nested selection strengthen the criterion audit;
no runtime implementation changed. Existing build and native evidence are reused
for their unchanged paths. The read-only real-owner proof resolves all targets
now; source preservation still verifies all41 prior cuts and prior Journey
payloads. No new build/restart/render was caused by this test/documentation batch.

Evidence in the source chat: `audio-bound-pilot/navigation-owner-proof.json`,
`navigation-model-final-tests.log` and its cleanup receipt;
`record-handoff/browser-proof.json`, `navigation-seek/browser-proof.json`,
`hand-roundtrip/hand-verification.json`. The current audio-bound encode is still
running and has no finished-output claim. Permanent Hand-creation package
promotion, LL-910/916/917 acceptance and human creative review remain open.

Reuse/learning: the versioned route is a projection of the saved Journey, while
navigation position and editor selection are separate session state. Exact owner
readback completes the metadata proof; an active encoder or successful previous
route does not explain the later browser crash. Preserve that distinction when
closing LL-915 and pursuing LL-916. This is a Decision/Flow-explainer candidate
from Codex `/root`, chat `01a137cc-de1d-7511-ab65-227c92d5bca0`.
