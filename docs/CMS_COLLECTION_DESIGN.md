# CMS collection workspaces

Owner: Hapa Avatar Builder. User-directed design guidance, October 17, 2026.
Source: Calder’s correction in Codex chat `01a141eb-6f00-7b21-8fd3-98c1c2425f3c`:
show voice styles and recordings together, show completeness as they fill in,
and do not make the operator switch styles through a dropdown.

## Design from the work, not from the schema

When the task is to populate a known collection (voice styles, Avatar poses,
required media, or variants), show the collection as the primary workspace.
Use visible cards or rows with an empty, draft, saved, or attention state and
in-place actions. A single form with a category dropdown conceals coverage and
forces the person to remember what is missing. Do not use that pattern as the
default for a collection-building task.

- Make the set and its gaps visible together. Show a meaningful numerator and
  denominator, with the exact completion rule stated. Availability is not a
  quality score; generated placeholders and unsaved drafts are not completion.
- Put Record/Upload/Add, preview, Re-record/Replace, Delete and recovery beside
  the relevant item. Keep the working context visible during those actions.
- Derive identity and labels from the owning CMS. Preselect the current entity;
  use selectors for identity choices, not retyping names already in the system.
- Scope counts to the actual entity and speaker being edited. Do not mix another
  speaker’s assets into apparent completeness.
- Preserve drafts per item. Changing focus must not silently discard work or
  relabel a recording. Keep old saved versions until replacements succeed.
- Show prompts and next actions in empty slots; keep completed slots useful for
  review and more takes. Avoid separate disconnected entry and management pages.
- Use compact shared settings for permissions, source and automatic generation.
  Put occasional provenance details behind disclosure; keep the core work visible.
- Use responsive grids that become rows on narrow screens. Show text status as
  well as color; label controls uniquely and preserve keyboard access.
- Prefer calm hierarchy, readable spacing, restrained accents, and meaningful
  status over dense outlines, repeated metadata, or decorative progress.

Dropdowns remain appropriate for a genuine single choice from a large set,
including selecting the CMS speaker or a saved take for a script. This guidance
is contextual, not a ban on dropdowns everywhere.

## Review before handoff

Inspect empty, partial, complete, unsaved, replacement-failure, deleted and
restored states. Verify that the person can answer at a glance: what exists,
what is missing, where to add the next item, and whether their last action saved.
Validate counts against real saved records. Check desktop and narrow layout,
local action visibility, draft preservation, and irreversible-action boundaries.
Record any unverified state honestly. Screenshots should demonstrate the working
surface, not just the heading. Use existing owner components/storage; do not
invent a parallel CMS to satisfy the visual design.

## Learning delta

The first voice sampler mirrored storage fields and hid styles behind a selector.
The speaker selector correction fixed identity entry but did not fix the larger
collection workflow. The revised dashboard makes five styles first-class slots,
with local capture and review plus speaker-scoped coverage. Reusable Lesson /
Flow-explainer candidate: collection → visible gaps → in-place contribution →
verified saved coverage. This updates this owner’s future design guidance; it
makes no claim to alter model weights or globally update unrelated agents.
