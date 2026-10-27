# Echo Album workspace layout

Updated October 25, 2026. Local implementation; browser-verified at 1280 × 720.

The album tools previously occupied substantial fixed space above a workbench
with a 750 px minimum height. The tablet shell could also grow beyond the
viewport. Together these rules pushed the useful editor below the fold.

The existing Echo Album view now groups its hero, health report, Audio Atlas,
import and export controls into a collapsed **Echo Album tools** disclosure.
Opening it provides a bounded scrolling tools area. Children stay mounted so
collapsing the tools does not reset their state. Opening a song in Audio Atlas
also opens this disclosure.

The workbench fills the remaining viewport instead of prescribing a fixed
height. Director sorting sits alongside the song roster. On narrow screens the
album uses a single-column scrolling layout and hides the separate Avatar
sidebar. Viewport rules apply only while Echo Album is visible, preserving the
background-mounted view used by playback.

## Verification and limits

- Production build passed.
- Six focused album navigation checks passed: complete roster, selection during
  hydration, failed-load selection, repeated switching and pinned plan eviction.
- At 1280 × 720, collapsed tools occupy 40 px; the workbench occupies 520 px,
  and the inner Director list/editor occupies 409 px starting at y=277.
- Expanded tools have 618 px of content within a 360 px scrolling region.
- The existing user's editable cut was not reloaded; verification used a separate
  tab. Save existing work before refreshing to load the new layout.
- Phone-specific rules were source-reviewed, not independently browser-tested.
- Repository-wide acceptance remains unpassed from the preceding Song Health
  batch (11 full-suite failures and an idle-preview smoke failure). These layout
  checks do not qualify that batch. Changes remain uncommitted pending the
  repository completion gate.

Reuse decision: adapt the existing album shell and disclosure controls; no new
navigation surface, worker or data store. Learning: flex children need a bounded
ancestor height; removing a fixed child height alone does not repair a shell
whose responsive rules allow it to expand beyond the viewport.
