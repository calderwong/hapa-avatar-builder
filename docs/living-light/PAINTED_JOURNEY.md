# Painted Journey preview

Status: first-pass local prototype, 2026-10-13. Author: Codex in chat
`01a137cc-de1d-7511-ab65-227c92d5bca0`, following Calder's review request and
“Ok take a stab at pursuing that.” Source owner: Hapa Avatar Builder.

## What is available

Echo → Living Light → Journey recipes → select a use → **Paint clips into this
use**. Choose clips from the active Echo cut, Apply a surface, then **Study this
recipe**. Save new Journey / Save new revision uses the existing protected
Journey owner. Edits retain normal Undo/Redo, draft recovery, exact revisions,
conflict protection and Card custody. Choosing a clip never generates media.

The first preview supports two enabled placements across a recipe. All six
continuous Tunnel profiles, Fractal Loom, Silken Current and Media Weave accept
left/right wall panels. Solar Reliquary and Tidal Observatory accept a circular
portal face. Panels are actual depth-writing geometry in the existing native
scene, including its optical finish; they are not projections onto arbitrary
mesh UVs. The wall names describe the forward-facing journey view. Center-cover
cropping, fixed source palette grading and placement brightness are the current
composition controls. Focal-point editing and mesh material painting remain open.

Each use can change video, source in/out seconds, loop/hold, brightness and enabled
state independently. Removing an instance removes its placements. Duplicating
copies placements to a new instance; exceeding two enabled surfaces rejects the
whole action. Locked uses and adjacent protected tour connections reject edits.
Replacing a Thing retains compatible surfaces; remove incompatible placements
before swapping to a Thing with different surface capabilities. Source definitions
and underlying video/Card records remain unchanged.

## Shared data and clock

`hapa.living-light.media-placement.v1` travels inside existing Journey
`mediaSlots`, through UI, API and CLI. Each placement has a surface reference
(instance ID and surface ID), exact media reference (song, cut, shot, media ID,
source-declaration digest), trim in/out microseconds, loop/hold, enabled and
brightness. No arbitrary URLs, filesystem paths, code or actor claims are accepted
in placement records. Existing disabled legacy slots remain readable.

The host resolves candidates from the currently selected Echo cut, including its
existing preview-media contract. URIs stay transient. The SHA-256 pins the source
declaration, including the available content hash; it does not independently
rehash media bytes. A changed cut/source declaration or missing video stays
unresolved until the exact source returns or the operator chooses a replacement.
Titles never supply identity. This is a bounded exact-cut adapter; general Media
Card library resolution and persisted cross-cut lookup are future work.

The existing Echo audio element, source clock and preview driver own time. This
adapter owns at most two muted decoders and textures, with no new audio context
or animation loop. Time is relative to the placement's instance interval, clamped
to that interval and mapped through the existing Echo source-window mapper.
Paused/backward seeks, source-window looping, trim-end hold and reduced-motion
hold use the same clock. Unsettled seeks are not painted. Loading and seek failures
have finite timeouts and readable status. Leaving, hiding, restoring the graphics
context or changing recipe disposes/recreates owned resources. Still capture
requires all enabled placements to be resolved and frame-ready.

## Evidence and limits

- 85 focused Living Light checks passed across 13 suites, including native tours,
  contracts, Journey storage, forks, portable metadata, signals, graphics lifecycle
  and still capture. Later small corrections received a final affected rerun.
- Production build passed with bounded process ownership and return to baseline.
- Real local Echo proxy clips were decoded and painted in the native WebGL2
  renderer on Apple M3 Ultra. The isolated browser fixture uses the production
  controls/runtime and a synthetic clock; paused 2-second target and decoded times
  matched. Tunnel panels and Solar Reliquary portal/Media Weave passage were
  visually inspected. This is not real-song audio synchronization acceptance.
- Owner persistence tests save, revise, reopen and read the old immutable revision
  in isolated stores. No live album project, Journey store or source media was
  rewritten for the proof.
- Running Desktop/API processes are not restarted by this patch. A process still
  serving old source must reload before it can save the new placement schema.
- Director-cut scene/transition integration, final rendering, spatial album/media
  navigation, arbitrary surface painting, mobile performance and full-catalog
  creative acceptance remain open. Portable import intentionally leaves media
  dependencies unresolved; cross-song forks still reset media explicitly.

Local evidence is retained with this chat under
`execution/living-light/painted-journey/` (build/test receipts, screenshots and
runtime evidence). The source-safe browser fixture is
`tests/fixtures/living-light-media-ui.html`; supply existing local video routes.
No test fixture creates owner-store records or requests new media generation.

## Next coherent slice

Give saved Journey revisions a Director cue adapter with explicit in/out ranges
and shared-clock rendering. Then reuse Record Garden's album/media indexing for
Location destinations and tunnel navigation. Keep the reusable Thing, its placed
use, its media choice, and the Journey route as separate editable identities.
This lets both the director and a person swap a scene or clip without rebuilding
the album or changing its source Cards.
