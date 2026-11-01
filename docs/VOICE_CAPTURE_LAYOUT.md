# Voice capture layout — 2026-11-01

Calder reported that the right-hand Attach Pack/Tag Matrix covered the voice
recording forms in the desktop Builder. This extends the canonical Builder's
existing voice dashboard and media inspector; no replacement CMS or voice store.

## Cause and repair

The media inspector was fixed to the viewport above 1280px while Voice & Scripts
spanned all columns of that same grid. Full-width forms therefore extended
under the floating inspector, hiding completeness, permission controls and the
rightmost recording style.

Voice & Scripts and shared character layers now occupy full-width rows in the
Builder scroll area. Media Intake, Avatar media slots and the existing inspector
share a separate bounded media workspace below them. The inspector keeps its
own scrolling area alongside media and can still be revealed by asset selection;
it no longer overlays unrelated authoring forms. The recording style grid uses
available container width, with a minimum usable card width, rather than assuming
that a wide window always leaves room for three recording cards.

## Verification

- Production frontend build passed using the owner's delivery-runtime build
  command; its delivery receipt was written and build-presence check passed.
  Existing large-chunk warnings remain. No backend restart was needed.
- Browser review at 1440px: voice form right edge 1411px; inspector starts below
  the voice/character sections (1911px versus voice bottom 1741px in the initial
  loaded state). No rectangle overlap. The same relation holds as data loads.
- At 1000px the style cards used two columns and inspector/form overlap was false.
  The viewport override was reset after review.
- Closing/reopening the sampler keeps the inspector in its own media workspace.
  Final ordinary-width screenshot shows all three first-row style forms,
  completeness, speaker and permission controls unobstructed; the local voice
  engine reports ready. No recording, upload, save or delete was performed.
- Source diff whitespace check passed. This layout-only change did not rerun
  generation, Tarot or the full repository suite; it makes no new claims about
  those independent behaviors.
- The existing desktop window still showed its prior loaded layout after menu
  reload attempts. Browser delivery is verified; native-window refresh remains
  a handoff limitation. No shell or owner service was stopped to force it.

One verified pre-change recovery point preserves edited source and the served
compiled code. Existing stores, source media, public assets and unrelated work
remain in place. Aggregate local recovery/build/evidence allowance: 64 MB; no
full-media duplication or new background job. The bounded build completed in
under one second and exited; the existing services remain running.

## Reusable lesson

A full-width authoring section and a viewport-fixed inspector cannot share an
unreserved screen region. Contain an inspector within its owning workspace,
then test the expanded form at both sides of its positioning breakpoint. Checking
only the collection grid missed the overlay introduced by the desktop rule.
This is a Lesson candidate derived from Calder's screenshot correction; design
registry publication and a general narrow-device audit are not claimed.
