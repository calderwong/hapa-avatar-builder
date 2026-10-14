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
  transient. General Media library browsing and cross-cut destination resolution
  beyond the active/painted sources remain unfinished.
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
Card targets, explicit cross-song/cut handoff and return, Follow Director mode,
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
