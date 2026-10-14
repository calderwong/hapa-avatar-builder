# Living Light album destinations and Explore

Status: first-pass source/component checkpoint, October 14, 2026. The complete
album navigation and Director/export integration goal remains active.

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
Returning restores the captured song time and stays paused. There is no automatic
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
Card targets, explicit cross-song/cut handoff and return, real-song Follow Director qualification,
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
